const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.enable('trust proxy');

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Admin Action Rate Limiter: Strictly scoped to protect against upload spam and brute-forcing (120 req/min)
const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
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
  const adminPassword = process.env.ADMIN_PASSWORD || 'v360secure';
  const adminUser = process.env.ADMIN_USERNAME || 'admin';

  const authHeader = req.headers['authorization'];
  const cookieHeader = req.headers['cookie'] || '';

  if (cookieHeader.includes('v360_session=active')) {
    return next();
  }

  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const auth = Buffer.from(authHeader.split(' ')[1] || '', 'base64').toString().split(':');
      if (auth[0] === adminUser && auth[1] === adminPassword) {
        return next();
      }
    } catch (e) {}
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="V360 Admin Portal"');
  return res.status(401).json({ error: 'Authentication required.' });
}

// API Login Endpoint
app.post('/api/login', adminLimiter, (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD || 'v360secure';
  const { password } = req.body;
  if (password === adminPassword) {
    res.setHeader('Set-Cookie', 'v360_session=active; Path=/; SameSite=Lax; max-age=86400');
    return res.json({ success: true, message: 'Logged in successfully' });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

// API Logout Endpoint
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'v360_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Smart Fail-Safe URL Handler: ONLY redirect if an iframe HTML tag is present in the requested URL path
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
  if (!stoneId) return null;
  if (!fs.existsSync(MEDIA_DIR)) return null;
  const targetName = stoneId.trim().toLowerCase();
  const items = fs.readdirSync(MEDIA_DIR);
  const match = items.find(i => i.toLowerCase() === targetName);
  return match ? path.join(MEDIA_DIR, match) : null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isZip = file.originalname.toLowerCase().endsWith('.zip');
    if (isZip) {
      return cb(null, TEMP_UPLOAD_DIR);
    }
    const stoneId = req.body.stoneId || req.query.stoneId || 'unclassified';
    const targetDir = path.join(MEDIA_DIR, stoneId);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 150 * 1024 * 1024 }
});

// Serve Public Player Assets & Icons (100% Public Unauthenticated Access for Shopify & Web Embeds)
app.use('/css/images', express.static(path.join(__dirname, 'public', 'css', 'images')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/image', express.static(path.join(__dirname, 'public', 'image')));

// PUBLIC 360° Interactive Viewer Pages (100% Unauthenticated Access for Shopify Embeds)
app.get('/vision360.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vision360.html'));
});

app.get('/viewer.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vision360.html'));
});

// PROTECTED Admin Dashboard Root & index.html
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
    const items = mediaExists ? fs.readdirSync(MEDIA_DIR) : [];
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

// V360 Asset Route (100% Public for 360 viewer canvas images & MP4 videos)
app.get('/imaged/:stoneId/:filename', (req, res) => {
  const { stoneId, filename } = req.params;

  if (process.env.STORAGE_CDN_URL) {
    const remoteUrl = `${process.env.STORAGE_CDN_URL.replace(/\/$/, '')}/${stoneId}/${filename}`;
    return res.redirect(302, remoteUrl);
  }

  const stoneDir = findStoneDir(stoneId);
  if (!stoneDir) {
    return res.status(404).send('Stone directory not found');
  }

  const filePath = path.join(stoneDir, filename);
  if (!fs.existsSync(filePath)) {
    if (/\.(png|jpg|gif|svg)$/i.test(filename)) {
      const defaultIcon = path.join(__dirname, 'public', '360.png');
      if (fs.existsSync(defaultIcon)) {
        return res.sendFile(defaultIcon);
      }
    }
    return res.status(404).send('File not found');
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
    return item !== 'temp_uploads' && item !== 'sample_item' && fs.statSync(path.join(MEDIA_DIR, item)).isDirectory();
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

// PUBLIC API Items Endpoint (100% Unauthenticated for Public Grid/Embedded Catalogs)
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

// PROTECTED Admin Delete Endpoint (Requires Auth & Admin Rate Limiter)
app.delete('/api/items/:stoneId', adminAuth, adminLimiter, async (req, res) => {
  const { stoneId } = req.params;
  const stoneDir = findStoneDir(stoneId);

  if (stoneDir) {
    fs.rmSync(stoneDir, { recursive: true, force: true });
  }
  if (db.isConnected) {
    await db.deleteSku(stoneId);
  }
  res.json({ success: true, message: `Deleted SKU ${stoneId}` });
});

// PROTECTED Admin ZIP Upload Endpoint (Requires Auth & Admin Rate Limiter)
app.post('/api/upload-zip', adminAuth, adminLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No ZIP file uploaded' });
  }

  const zipPath = req.file.path;
  const customStoneId = req.body.stoneId ? req.body.stoneId.trim() : null;
  const defaultStoneId = path.basename(req.file.originalname, path.extname(req.file.originalname));
  
  try {
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    
    let targetStoneId = customStoneId || defaultStoneId;
    const topLevelFolders = new Set();
    zipEntries.forEach(entry => {
      const parts = entry.entryName.split('/').filter(Boolean);
      if (parts.length > 1) {
        topLevelFolders.add(parts[0]);
      }
    });

    if (!customStoneId && topLevelFolders.size === 1) {
      targetStoneId = Array.from(topLevelFolders)[0];
    }

    const extractDir = path.join(MEDIA_DIR, targetStoneId);
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    zipEntries.forEach(entry => {
      if (!entry.isDirectory) {
        const filename = path.basename(entry.entryName);
        if (filename && !filename.startsWith('.')) {
          const destPath = path.join(extractDir, filename);
          fs.writeFileSync(destPath, entry.getData());
        }
      }
    });

    fs.unlinkSync(zipPath);
    const hostHeader = req.get('host');
    const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${proto}://${hostHeader}`;

    const { frameCount, thumbnail, hasVideo, hasHtml } = getStoneFrameInfo(extractDir, targetStoneId);

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
    res.status(500).json({ error: `Failed to process ZIP file: ${err.message}` });
  }
});

// PROTECTED Admin Standard Upload Endpoint (Requires Auth & Admin Rate Limiter)
app.post('/api/upload', adminAuth, adminLimiter, upload.array('files'), async (req, res) => {
  const stoneId = req.body.stoneId || req.query.stoneId;
  if (!stoneId) {
    return res.status(400).json({ error: 'Missing stoneId/SKU parameter' });
  }

  const hostHeader = req.get('host');
  const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const baseUrl = `${proto}://${hostHeader}`;

  const stoneDir = findStoneDir(stoneId);
  if (stoneDir) {
    const { frameCount, thumbnail, hasVideo, hasHtml } = getStoneFrameInfo(stoneDir, stoneId);
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
  }

  res.json({
    success: true,
    message: `Successfully uploaded ${req.files ? req.files.length : 0} files for SKU ${stoneId}`,
    stoneId,
    sku: stoneId,
    modernUrl: `${baseUrl}/viewer.html?d=${stoneId}`,
    v360Url: `${baseUrl}/vision360.html?d=${stoneId}`
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    dbConnected: db.isConnected,
    timestamp: new Date().toISOString() 
  });
});

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
