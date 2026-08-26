const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for embedding in external websites & client portals
app.use(cors());
app.use(express.json());

// Media Storage Directory for local deployment / disk backup
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'data', 'media');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const TEMP_UPLOAD_DIR = path.join(__dirname, 'data', 'temp_uploads');
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

// Multer storage for office PC upload & Web ZIP upload API
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
const upload = multer({ storage });

// Serve static frontend player assets & Dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root URL to Dashboard UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------------------------------------------------
// V360 Compatibility Asset Routes
// V360 player requests: /imaged/:stoneId/:filename
// -------------------------------------------------------------
app.get('/imaged/:stoneId/:filename', (req, res) => {
  const { stoneId, filename } = req.params;

  // 1. Check if S3 / Cloudflare R2 CDN base URL is set
  if (process.env.STORAGE_CDN_URL) {
    const remoteUrl = `${process.env.STORAGE_CDN_URL.replace(/\/$/, '')}/${stoneId}/${filename}`;
    return res.redirect(302, remoteUrl);
  }

  // 2. Fallback to local media folder on server
  const filePath = path.join(MEDIA_DIR, stoneId, filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  // 3. Fallback check for demo/sample files if requested
  const samplePath = path.join(MEDIA_DIR, 'sample_item', filename);
  if (fs.existsSync(samplePath)) {
    return res.sendFile(samplePath);
  }

  return res.status(404).json({ error: 'Asset not found', stoneId, filename });
});

// -------------------------------------------------------------
// Embed Helper Routes
// -------------------------------------------------------------
app.get('/embed/:stoneId', (req, res) => {
  const { stoneId } = req.params;
  const playerType = req.query.player || 'modern';
  
  if (playerType === 'v360') {
    return res.redirect(`/vision360.html?d=${encodeURIComponent(stoneId)}`);
  }
  return res.redirect(`/viewer.html?d=${encodeURIComponent(stoneId)}`);
});

// -------------------------------------------------------------
// API Endpoints for Dashboard & Management Portal
// -------------------------------------------------------------

// List all scanned stones with full metadata for Dashboard gallery
app.get('/api/items', (req, res) => {
  try {
    const items = fs.readdirSync(MEDIA_DIR).filter(item => {
      return item !== 'temp_uploads' && fs.statSync(path.join(MEDIA_DIR, item)).isDirectory();
    });
    
    const host = `${req.protocol}://${req.get('host')}`;

    const itemList = items.map(stoneId => {
      const stoneDir = path.join(MEDIA_DIR, stoneId);
      const files = fs.readdirSync(stoneDir);
      const images = files
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      const stats = fs.statSync(stoneDir);
      const thumbnail = images.length > 0 ? `/imaged/${stoneId}/${images[0]}` : null;

      return {
        stoneId,
        frameCount: images.length,
        thumbnail,
        createdAt: stats.mtime.toISOString(),
        v360Url: `${host}/vision360.html?d=${stoneId}`,
        modernUrl: `${host}/viewer.html?d=${stoneId}`,
        embedCode: `<iframe src="${host}/vision360.html?d=${stoneId}" width="100%" height="500px" frameborder="0" allowfullscreen></iframe>`
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ count: itemList.length, items: itemList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Item detail API
app.get('/api/items/:stoneId', (req, res) => {
  const { stoneId } = req.params;
  const stoneDir = path.join(MEDIA_DIR, stoneId);

  if (!fs.existsSync(stoneDir)) {
    return res.status(404).json({ error: 'Stone not found' });
  }

  const files = fs.readdirSync(stoneDir);
  const images = files
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  const jsonFiles = files.filter(f => f.endsWith('.json'));

  res.json({
    stoneId,
    totalFiles: files.length,
    totalFrames: images.length,
    images,
    jsonFiles,
    v360Url: `/vision360.html?d=${stoneId}`,
    modernUrl: `/viewer.html?d=${stoneId}`
  });
});

// Delete item API
app.delete('/api/items/:stoneId', (req, res) => {
  const { stoneId } = req.params;
  const stoneDir = path.join(MEDIA_DIR, stoneId);

  if (fs.existsSync(stoneDir)) {
    fs.rmSync(stoneDir, { recursive: true, force: true });
    return res.json({ success: true, message: `Deleted stone ${stoneId}` });
  }
  res.status(404).json({ error: 'Stone not found' });
});

// Web Drag-and-Drop ZIP Upload API
app.post('/api/upload-zip', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No ZIP file uploaded' });
  }

  const zipPath = req.file.path;
  const customStoneId = req.body.stoneId ? req.body.stoneId.trim() : null;
  const defaultStoneId = path.basename(req.file.originalname, path.extname(req.file.originalname));
  
  try {
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    
    // Check if zip contains a single top-level folder
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

    // Clean up uploaded temp zip file
    fs.unlinkSync(zipPath);

    const host = `${req.protocol}://${req.get('host')}`;

    res.json({
      success: true,
      stoneId: targetStoneId,
      message: `Successfully unzipped and created 360° item '${targetStoneId}'`,
      v360Url: `${host}/vision360.html?d=${targetStoneId}`,
      modernUrl: `${host}/viewer.html?d=${targetStoneId}`,
      embedCode: `<iframe src="${host}/vision360.html?d=${targetStoneId}" width="100%" height="500px" frameborder="0" allowfullscreen></iframe>`
    });
  } catch (err) {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    res.status(500).json({ error: `Failed to process ZIP file: ${err.message}` });
  }
});

// Direct Image Files Upload API (for web or script)
app.post('/api/upload', upload.array('files'), (req, res) => {
  const stoneId = req.body.stoneId || req.query.stoneId;
  if (!stoneId) {
    return res.status(400).json({ error: 'Missing stoneId parameter' });
  }

  const host = `${req.protocol}://${req.get('host')}`;

  res.json({
    success: true,
    message: `Successfully uploaded ${req.files ? req.files.length : 0} files for stone ${stoneId}`,
    stoneId,
    modernUrl: `${host}/viewer.html?d=${stoneId}`,
    v360Url: `${host}/vision360.html?d=${stoneId}`
  });
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` V360 Standalone Player & Dashboard Service Running`);
  console.log(` Listening on port: ${PORT}`);
  console.log(` Dashboard URL: http://localhost:${PORT}/`);
  console.log(`=================================================`);
});
