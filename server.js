const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const db = require('./db');
const { isValidSku, resolveSkuPath } = require('./src/utils/sku');
const { createSession, getSession, revokeSession, safeEqual, parseCookies } = require('./src/auth/session');
const { isAllowedFileExtension, MAX_FILES_PER_SKU, MAX_SINGLE_FILE_BYTES, MAX_ZIP_DECOMPRESSED_BYTES } = require('./src/utils/limits');
const { createStagingDir, validateStagedFolder, atomicSwapSku, purgeDir } = require('./src/storage/atomic');

const app = express();
const PORT = process.env.PORT || 3000;

// Production security assertion
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  console.error('[SECURITY ERROR] ADMIN_PASSWORD environment variable is required in production mode!');
  process.exit(1);
}

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Login Rate Limiter (5 failed attempts per 15 minutes)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Too many login attempts, please try again later.' }
});

// Admin Action Rate Limiter: Strictly scoped to protect against upload spam (120 req/min)
const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: { error: 'Too many administrative requests, please try again later.' }
});

// Media directory configuration (Railway Volume / Persistent Disk Support)
const MEDIA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.MEDIA_DIR || path.join(__dirname, 'data', 'media');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const SEED_DIR = path.join(__dirname, 'data', 'media');

// Auto-seed media directory from repository seed files on startup if needed
function seedMediaFiles() {
  try {
    if (fs.existsSync(SEED_DIR) && SEED_DIR !== MEDIA_DIR) {
      const seedItems = fs.readdirSync(SEED_DIR);
      seedItems.forEach(item => {
        const srcItem = path.join(SEED_DIR, item);
        const destItem = path.join(MEDIA_DIR, item);
        if (fs.statSync(srcItem).isDirectory() && !fs.existsSync(destItem)) {
          fs.cpSync(srcItem, destItem, { recursive: true });
          console.log(`[Seed] Restored SKU '${item}' into persistent volume storage.`);
        }
      });
    }
  } catch (err) {
    console.error(`[Seed Error] Could not auto-seed media directory:`, err.message);
  }
}
seedMediaFiles();

const TEMP_UPLOAD_DIR = path.join(__dirname, 'data', 'temp_uploads');
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

// Authentication Middleware
function adminAuth(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV !== 'production' ? 'v360secure' : null);
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const internalApiKey = process.env.V360_INTERNAL_API_KEY;

  // 1. Check Server-Issued Session Cookie (v360_sid)
  const cookies = parseCookies(req.headers['cookie']);
  const sessionToken = cookies['v360_sid'];
  if (sessionToken) {
    const session = getSession(sessionToken);
    if (session) {
      req.adminUser = session.user;
      return next();
    }
  }

  // 2. Check Dedicated Internal Service API Key (X-V360-Internal-Key) for AIDIA ERP
  const internalKeyHeader = req.headers['x-v360-internal-key'];
  if (internalKeyHeader && internalApiKey) {
    if (safeEqual(internalKeyHeader, internalApiKey)) {
      if (req.path === '/api/debug' || req.path.startsWith('/api/login') || req.path.startsWith('/api/logout')) {
        return res.status(403).json({ error: 'Internal API Key is forbidden from accessing administrative debug/session endpoints.' });
      }
      req.isInternalService = true;
      return next();
    }
  }

  // 3. Check HTTP Basic Authentication
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Basic ') && adminPassword) {
    try {
      const authStr = Buffer.from(authHeader.split(' ')[1] || '', 'base64').toString();
      const colonIdx = authStr.indexOf(':');
      if (colonIdx !== -1) {
        const u = authStr.substring(0, colonIdx);
        const p = authStr.substring(colonIdx + 1);
        if (safeEqual(u, adminUser) && safeEqual(p, adminPassword)) {
          return next();
        }
      }
    } catch (e) {}
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="V360 Admin Portal"');
  return res.status(401).json({ error: 'Authentication required.' });
}

// API Login Endpoint
app.post('/api/login', loginLimiter, (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV !== 'production' ? 'v360secure' : null);
  if (!adminPassword) {
    return res.status(500).json({ error: 'Server authentication configuration is missing.' });
  }

  const { password } = req.body || {};
  if (password && safeEqual(password, adminPassword)) {
    const token = createSession('admin');
    const isProd = process.env.NODE_ENV === 'production' || req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
    const secureFlag = isProd ? '; Secure' : '';
    res.setHeader('Set-Cookie', `v360_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag}`);
    return res.json({ success: true, message: 'Logged in successfully' });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

// API Session Check Endpoint
app.get('/api/session', (req, res) => {
  const cookies = parseCookies(req.headers['cookie']);
  const sessionToken = cookies['v360_sid'];
  const session = sessionToken ? getSession(sessionToken) : null;

  res.json({
    authenticated: !!session,
    user: session ? session.user : null
  });
});

// API Logout Endpoint
app.post('/api/logout', (req, res) => {
  const cookies = parseCookies(req.headers['cookie']);
  const sessionToken = cookies['v360_sid'];
  if (sessionToken) {
    revokeSession(sessionToken);
  }
  res.setHeader('Set-Cookie', 'v360_sid=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Smart Fail-Safe URL Handler
app.use((req, res, next) => {
  const decodedUrl = decodeURIComponent(req.url);
  if (decodedUrl.includes('<iframe') || decodedUrl.includes('%3Ciframe')) {
    const match = decodedUrl.match(/d=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return res.redirect(302, `/vision360.html?d=${encodeURIComponent(match[1])}`);
    }
  }
  next();
});

// Prevent browser & CDN proxy caching of 404s or stale states
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

function findStoneDir(stoneId) {
  if (!stoneId || !isValidSku(stoneId)) return null;
  const targetPath = resolveSkuPath(MEDIA_DIR, stoneId);
  if (!targetPath) return null;
  if (fs.existsSync(targetPath)) return targetPath;

  try {
    const items = fs.readdirSync(MEDIA_DIR);
    const targetLower = stoneId.trim().toLowerCase();
    const match = items.find(i => i.toLowerCase() === targetLower);
    if (match) {
      const matchPath = resolveSkuPath(MEDIA_DIR, match);
      if (matchPath && fs.existsSync(matchPath)) return matchPath;
    }
  } catch (e) {}
  return null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isZip = file.originalname.toLowerCase().endsWith('.zip');
    if (isZip) {
      return cb(null, TEMP_UPLOAD_DIR);
    }
    const rawStoneId = req.body.stoneId || req.query.stoneId || 'unclassified';
    if (!isValidSku(rawStoneId)) {
      return cb(new Error('Invalid stoneId/SKU parameter'));
    }
    try {
      if (!req.stagingDir) {
        req.stagingDir = createStagingDir(MEDIA_DIR, rawStoneId);
      }
      cb(null, req.stagingDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const safeFilename = path.basename(file.originalname);
    cb(null, safeFilename);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: MAX_SINGLE_FILE_BYTES,
    files: MAX_FILES_PER_SKU 
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.zip') || isAllowedFileExtension(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`File '${file.originalname}' has an unapproved extension.`));
    }
  }
});

// Serve Public Player Assets & Icons
app.use('/css/images', express.static(path.join(__dirname, 'public', 'css', 'images')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/image', express.static(path.join(__dirname, 'public', 'image')));

// PUBLIC 360° Interactive Viewer Pages
app.get('/vision360.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vision360.html'));
});

app.get('/viewer.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vision360.html'));
});

// PROTECTED Admin Dashboard Root
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// PROTECTED Admin Debug Endpoint
app.get('/api/debug', adminAuth, (req, res) => {
  try {
    const mediaExists = fs.existsSync(MEDIA_DIR);
    const items = mediaExists ? fs.readdirSync(MEDIA_DIR).filter(i => !i.startsWith('.')) : [];
    const debugData = {};
    items.forEach(i => {
      const p = path.join(MEDIA_DIR, i);
      if (fs.statSync(p).isDirectory()) {
        debugData[i] = fs.readdirSync(p);
      }
    });
    res.json({ 
      MEDIA_DIR, 
      mediaExists, 
      items, 
      dbConnected: db.isConnected,
      debugData 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getFallbackIconPath() {
  const candidates = [
    path.join(__dirname, 'public', '360.png'),
    path.join(__dirname, 'public', 'image', '360.png'),
    path.join(__dirname, 'public', 'css', 'images', '360.png'),
    path.join(__dirname, 'public', 'images', '360.png')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(__dirname, 'public', '360.png');
}

// V360 Asset Route
app.get('/imaged/:stoneId/:filename', (req, res) => {
  const { stoneId, filename } = req.params;

  if (!isValidSku(stoneId)) {
    return res.status(400).send('Invalid SKU parameter');
  }

  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || filename.includes('..')) {
    return res.status(400).send('Invalid filename parameter');
  }

  if (process.env.STORAGE_CDN_URL) {
    const remoteUrl = `${process.env.STORAGE_CDN_URL.replace(/\/$/, '')}/${encodeURIComponent(stoneId)}/${encodeURIComponent(safeFilename)}`;
    return res.redirect(302, remoteUrl);
  }

  const fallbackIcon = getFallbackIconPath();

  const stoneDir = findStoneDir(stoneId);
  if (!stoneDir) {
    if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(safeFilename)) {
      return res.sendFile(fallbackIcon);
    }
    if (safeFilename.endsWith('.json')) {
      return res.json([{ image: '/image/360.png' }]);
    }
    if (safeFilename.endsWith('.mp4')) {
      return res.redirect(302, `/vision360.html?d=${encodeURIComponent(stoneId)}`);
    }
    return res.sendFile(fallbackIcon);
  }

  const filePath = path.join(stoneDir, safeFilename);
  if (!fs.existsSync(filePath)) {
    if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(safeFilename)) {
      return res.sendFile(fallbackIcon);
    }
    if (safeFilename.endsWith('.json')) {
      return res.json([{ image: '/image/360.png' }]);
    }
    if (safeFilename.endsWith('.mp4')) {
      return res.redirect(302, `/vision360.html?d=${encodeURIComponent(stoneId)}`);
    }
    return res.sendFile(fallbackIcon);
  }

  res.sendFile(filePath);
});

// Smart Fallback for image requests
app.use((req, res, next) => {
  const reqPath = req.path;
  if (/\.(png|jpg|gif|svg)$/i.test(reqPath)) {
    const filename = decodeURIComponent(path.basename(reqPath));
    const searchName = filename.toLowerCase().replace(/\s+view/g, '').trim();

    const dirsToSearch = [
      path.join(__dirname, 'public'),
      path.join(__dirname, 'public', 'css', 'images'),
      path.join(__dirname, 'public', 'images'),
      path.join(__dirname, 'public', 'image')
    ];

    for (let d of dirsToSearch) {
      if (fs.existsSync(d)) {
        const files = fs.readdirSync(d);
        const match = files.find(f => {
          const fLower = f.toLowerCase();
          return fLower === filename.toLowerCase() || fLower === searchName || fLower.includes(searchName.replace('.png', ''));
        });
        if (match) {
          return res.sendFile(path.join(d, match));
        }
      }
    }

    const defaultIcon = path.join(__dirname, 'public', '360.png');
    if (fs.existsSync(defaultIcon)) {
      return res.sendFile(defaultIcon);
    }
  }
  next();
});

app.get('/embed/:stoneId', (req, res) => {
  const { stoneId } = req.params;
  if (!isValidSku(stoneId)) {
    return res.status(400).send('Invalid SKU parameter');
  }
  return res.redirect(`/vision360.html?d=${encodeURIComponent(stoneId)}`);
});

function getStoneFrameInfo(stoneDir, stoneId) {
  const files = fs.readdirSync(stoneDir);
  const images = files
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  let frameCount = images.length;
  let hasVideo = files.includes('video.mp4');
  let hasHtml = files.some(f => f.toLowerCase().endsWith('.html') && f.toLowerCase() !== 'vision360.html');

  for (let jsonFile of ['1.json', 'sm.json', '2.json', '8.json', '0.json']) {
    const jPath = path.join(stoneDir, jsonFile);
    if (fs.existsSync(jPath)) {
      try {
        const raw = fs.readFileSync(jPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          frameCount = Math.max(frameCount, parsed.length);
          break;
        }
      } catch (e) {}
    }
  }

  let thumbnail = null;
  if (files.includes('still.jpg')) {
    thumbnail = `/imaged/${stoneId}/still.jpg`;
  } else if (images.length > 0) {
    thumbnail = `/imaged/${stoneId}/${images[0]}`;
  } else {
    thumbnail = `/css/images/info.png`;
  }

  return { frameCount, thumbnail, files, images, hasVideo, hasHtml };
}

function scanDiskItems(baseUrl) {
  const items = fs.readdirSync(MEDIA_DIR).filter(item => {
    return !item.startsWith('.') && item !== 'temp_uploads' && item !== 'sample_item' && isValidSku(item) && fs.statSync(path.join(MEDIA_DIR, item)).isDirectory();
  });
  return items.map(stoneId => {
    const stoneDir = path.join(MEDIA_DIR, stoneId);
    const stats = fs.statSync(stoneDir);
    const { frameCount, thumbnail, hasVideo, hasHtml } = getStoneFrameInfo(stoneDir, stoneId);

    return {
      stoneId,
      sku: stoneId,
      frameCount,
      thumbnail,
      hasVideo,
      hasHtml,
      videoUrl: hasVideo ? `/imaged/${stoneId}/video.mp4` : null,
      createdAt: stats.mtime.toISOString(),
      v360Url: `/vision360.html?d=${stoneId}`,
      modernUrl: `/viewer.html?d=${stoneId}`,
      fullV360Url: `${baseUrl}/vision360.html?d=${stoneId}`,
      fullModernUrl: `${baseUrl}/viewer.html?d=${stoneId}`,
      embedCode: `<iframe src="${baseUrl}/vision360.html?d=${stoneId}" width="100%" height="500px" frameborder="0" allowfullscreen></iframe>`
    };
  });
}

async function syncDiskItemsToDb(baseUrl) {
  if (!db.isConnected) return;
  const diskItems = scanDiskItems(baseUrl);
  for (let item of diskItems) {
    await db.upsertSku(item);
  }
  console.log(`[DB] Synced ${diskItems.length} SKU(s) from disk into PostgreSQL.`);
}

// PUBLIC API Items Endpoint
app.get('/api/items', async (req, res) => {
  try {
    const hostHeader = req.get('host');
    const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${proto}://${hostHeader}`;

    if (db.isConnected) {
      const dbRows = await db.getAllSkus();
      if (dbRows && dbRows.length > 0) {
        const itemList = dbRows.map(r => ({
          stoneId: r.sku,
          sku: r.sku,
          frameCount: r.frame_count,
          thumbnail: r.thumbnail_url,
          hasVideo: r.has_video,
          hasHtml: r.has_html,
          videoUrl: r.video_url,
          createdAt: r.created_at,
          v360Url: r.v360_url,
          modernUrl: r.modern_url,
          fullV360Url: `${baseUrl}${r.v360_url}`,
          fullModernUrl: `${baseUrl}${r.modern_url}`,
          embedCode: `<iframe src="${baseUrl}${r.v360_url}" width="100%" height="500px" frameborder="0" allowfullscreen></iframe>`
        }));
        return res.json({ source: 'postgresql', count: itemList.length, items: itemList });
      }
    }

    const diskItems = scanDiskItems(baseUrl);
    res.json({ source: 'filesystem', count: diskItems.length, items: diskItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC Single SKU Detail Endpoint
app.get('/api/items/:stoneId', (req, res) => {
  const { stoneId } = req.params;
  if (!isValidSku(stoneId)) {
    return res.status(400).json({ error: 'Invalid stoneId/SKU parameter' });
  }

  const stoneDir = findStoneDir(stoneId);
  if (!stoneDir) {
    return res.status(404).json({ error: 'Stone not found' });
  }

  const { frameCount, thumbnail, files, images, hasVideo, hasHtml } = getStoneFrameInfo(stoneDir, stoneId);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  res.json({
    stoneId,
    sku: stoneId,
    totalFiles: files.length,
    totalFrames: frameCount,
    images,
    jsonFiles,
    hasVideo,
    hasHtml,
    v360Url: `/vision360.html?d=${stoneId}`,
    modernUrl: `/viewer.html?d=${stoneId}`
  });
});

// PROTECTED Admin Delete Endpoint
app.delete('/api/items/:stoneId', adminAuth, adminLimiter, async (req, res) => {
  const { stoneId } = req.params;
  if (!isValidSku(stoneId)) {
    return res.status(400).json({ error: 'Invalid stoneId/SKU parameter' });
  }

  const stoneDir = findStoneDir(stoneId);

  if (stoneDir) {
    const baseResolved = path.resolve(MEDIA_DIR);
    const stoneResolved = path.resolve(stoneDir);
    if (stoneResolved.startsWith(baseResolved + path.sep)) {
      fs.rmSync(stoneDir, { recursive: true, force: true });
    }
  }
  if (db.isConnected) {
    await db.deleteSku(stoneId);
  }
  res.json({ success: true, message: `Deleted SKU ${stoneId}` });
});

// PROTECTED Admin ZIP Upload Endpoint (Atomic Staging & Unzip)
app.post('/api/upload-zip', adminAuth, adminLimiter, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No ZIP file uploaded' });
  }

  const zipPath = req.file.path;
  const customStoneId = req.body.stoneId ? req.body.stoneId.trim() : null;
  const defaultStoneId = path.basename(req.file.originalname, path.extname(req.file.originalname));
  
  let targetStoneId = customStoneId || defaultStoneId;
  let stagingDir = null;

  try {
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    if (zipEntries.length > MAX_FILES_PER_SKU) {
      throw new Error(`ZIP archive exceeds maximum file count limit of ${MAX_FILES_PER_SKU} files.`);
    }

    const topLevelFolders = new Set();
    let totalUncompressedBytes = 0;

    for (const entry of zipEntries) {
      if (entry.entryName.includes('..') || entry.entryName.startsWith('/') || entry.entryName.startsWith('\\')) {
        throw new Error(`ZIP entry '${entry.entryName}' contains invalid path traversal sequences.`);
      }

      const parts = entry.entryName.split('/').filter(Boolean);
      if (parts.length > 1) {
        topLevelFolders.add(parts[0]);
      }

      if (!entry.isDirectory) {
        const filename = path.basename(entry.entryName);
        if (filename && !filename.startsWith('.')) {
          if (!isAllowedFileExtension(filename)) {
            throw new Error(`ZIP entry '${filename}' has an unapproved file extension.`);
          }
          totalUncompressedBytes += entry.header.size || 0;
        }
      }
    }

    if (totalUncompressedBytes > MAX_ZIP_DECOMPRESSED_BYTES) {
      throw new Error(`Uncompressed ZIP size exceeds limit of 500 MB.`);
    }

    if (!customStoneId && topLevelFolders.size === 1) {
      const detectedFolder = Array.from(topLevelFolders)[0];
      if (isValidSku(detectedFolder)) {
        targetStoneId = detectedFolder;
      }
    }

    if (!isValidSku(targetStoneId)) {
      throw new Error(`Invalid stoneId/SKU parameter '${targetStoneId}'.`);
    }

    stagingDir = createStagingDir(MEDIA_DIR, targetStoneId);

    zipEntries.forEach(entry => {
      if (!entry.isDirectory) {
        const filename = path.basename(entry.entryName);
        if (filename && !filename.startsWith('.')) {
          const destPath = path.join(stagingDir, filename);
          fs.writeFileSync(destPath, entry.getData());
        }
      }
    });

    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    const hostHeader = req.get('host');
    const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${proto}://${hostHeader}`;

    await atomicSwapSku(MEDIA_DIR, targetStoneId, stagingDir, async (newLiveDir) => {
      const { frameCount, thumbnail, hasVideo, hasHtml } = getStoneFrameInfo(newLiveDir, targetStoneId);

      const skuRecord = {
        sku: targetStoneId,
        stoneId: targetStoneId,
        frameCount,
        hasVideo,
        hasHtml,
        thumbnail,
        v360Url: `/vision360.html?d=${targetStoneId}`,
        modernUrl: `/viewer.html?d=${targetStoneId}`,
        videoUrl: hasVideo ? `/imaged/${targetStoneId}/video.mp4` : null,
        createdAt: new Date()
      };

      if (db.isConnected) {
        await db.upsertSku(skuRecord);
      }
    });

    res.json({
      success: true,
      stoneId: targetStoneId,
      sku: targetStoneId,
      message: `Successfully unzipped and created 360° SKU '${targetStoneId}'`,
      v360Url: `${baseUrl}/vision360.html?d=${targetStoneId}`,
      modernUrl: `${baseUrl}/viewer.html?d=${targetStoneId}`,
      embedCode: `<iframe src="${baseUrl}/vision360.html?d=${targetStoneId}" width="100%" height="500px" frameborder="0" allowfullscreen></iframe>`
    });
  } catch (err) {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (stagingDir) purgeDir(stagingDir);
    res.status(400).json({ error: `Failed to process ZIP file: ${err.message}` });
  }
});

// PROTECTED Admin Standard Upload Endpoint (Atomic Staging & Swap)
app.post('/api/upload', adminAuth, adminLimiter, (req, res, next) => {
  upload.array('files')(req, res, (err) => {
    if (err) {
      if (req.stagingDir) purgeDir(req.stagingDir);
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const stoneId = req.body.stoneId || req.query.stoneId;
  if (!stoneId || !isValidSku(stoneId)) {
    if (req.stagingDir) purgeDir(req.stagingDir);
    return res.status(400).json({ error: 'Missing or invalid stoneId/SKU parameter' });
  }

  if (!req.stagingDir || !fs.existsSync(req.stagingDir)) {
    return res.status(400).json({ error: 'No files were uploaded to staging.' });
  }

  try {
    const hostHeader = req.get('host');
    const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${proto}://${hostHeader}`;

    await atomicSwapSku(MEDIA_DIR, stoneId, req.stagingDir, async (newLiveDir) => {
      const { frameCount, thumbnail, hasVideo, hasHtml } = getStoneFrameInfo(newLiveDir, stoneId);
      const skuRecord = {
        sku: stoneId,
        stoneId,
        frameCount,
        hasVideo,
        hasHtml,
        thumbnail,
        v360Url: `/vision360.html?d=${stoneId}`,
        modernUrl: `/viewer.html?d=${stoneId}`,
        videoUrl: hasVideo ? `/imaged/${stoneId}/video.mp4` : null,
        createdAt: new Date()
      };
      if (db.isConnected) {
        await db.upsertSku(skuRecord);
      }
    });

    res.json({
      success: true,
      message: `Successfully uploaded ${req.files ? req.files.length : 0} files for SKU ${stoneId}`,
      stoneId,
      sku: stoneId,
      modernUrl: `${baseUrl}/viewer.html?d=${stoneId}`,
      v360Url: `${baseUrl}/vision360.html?d=${stoneId}`
    });
  } catch (err) {
    if (req.stagingDir) purgeDir(req.stagingDir);
    res.status(400).json({ error: `Upload failed: ${err.message}` });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    dbConnected: db.isConnected,
    timestamp: new Date().toISOString() 
  });
});

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`=================================================`);
    console.log(` V360 Standalone Player & Dashboard Service Running`);
    console.log(` Listening on port: ${PORT}`);
    console.log(`=================================================`);

    const dbOk = await db.init();
    if (dbOk) {
      await syncDiskItemsToDb('https://perpetual-harmony-production-451e.up.railway.app');
    }
  });
}

module.exports = app;
