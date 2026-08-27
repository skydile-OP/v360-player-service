const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');
require('dotenv').config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.enable('trust proxy');

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

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

// Prevent browser caching of 404s or stale image states
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'data', 'media');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const TEMP_UPLOAD_DIR = path.join(__dirname, 'data', 'temp_uploads');
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

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
  limits: { fileSize: 150 * 1024 * 1024 } // 150MB per file limit
});

// Serve static frontend assets & icon directories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css/images', express.static(path.join(__dirname, 'public', 'css', 'images')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/image', express.static(path.join(__dirname, 'public', 'image')));

app.get('/api/debug', (req, res) => {
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve calibrated official V360 interactive viewer
app.get('/vision360.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vision360.html'));
});

app.get('/viewer.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vision360.html'));
});

// V360 Asset Route
app.get('/imaged/:stoneId/:filename', (req, res) => {
  const { stoneId, filename } = req.params;

  if (process.env.STORAGE_CDN_URL) {
    const remoteUrl = `${process.env.STORAGE_CDN_URL.replace(/\/$/, '')}/${stoneId}/${filename}`;
    return res.redirect(302, remoteUrl);
  }

  // 1. Check if specific file exists inside SKU media folder
  const stoneDir = findStoneDir(stoneId);
  if (stoneDir) {
    const filePath = path.join(stoneDir, filename);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }

  // 2. Automatic fallback for V360 toolbar icon requests
  const dirsToSearch = [
    path.join(__dirname, 'public'),
    path.join(__dirname, 'public', 'css', 'images'),
    path.join(__dirname, 'public', 'images'),
    path.join(__dirname, 'public', 'image')
  ];

  const searchName = filename.toLowerCase().replace(/%20/g, ' ').replace(/\s+view/g, '').trim();

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

  return res.status(404).json({ error: 'Asset not found', stoneId, filename });
});

// Wildcard Icon Fallback Middleware for Root & Nested Image Requests
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

    // Default icon fallback so NO broken image box ever renders!
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

app.get('/api/items', async (req, res) => {
  try {
    const hostHeader = req.get('host');
    const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${proto}://${hostHeader}`;

    // 1. Try PostgreSQL Database
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
          v360Url: r.v360_url || `/vision360.html?d=${r.sku}`,
          modernUrl: r.modern_url || `/viewer.html?d=${r.sku}`,
          fullV360Url: `${baseUrl}/vision360.html?d=${r.sku}`,
          fullModernUrl: `${baseUrl}/viewer.html?d=${r.sku}`,
          embedCode: `<iframe src="${baseUrl}/vision360.html?d=${r.sku}" width="100%" height="500px" frameborder="0" allowfullscreen></iframe>`
        }));
        return res.json({ count: itemList.length, source: 'postgresql', items: itemList });
      }
    }

    // 2. Filesystem Fallback Mode
    const itemList = scanDiskItems(baseUrl);
    res.json({ count: itemList.length, source: 'filesystem', items: itemList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/items/:stoneId', async (req, res) => {
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

app.delete('/api/items/:stoneId', async (req, res) => {
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

app.post('/api/upload-zip', upload.single('file'), async (req, res) => {
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

app.post('/api/upload', upload.array('files'), async (req, res) => {
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
