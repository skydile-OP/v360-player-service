const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
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

// Multer storage for office PC upload API
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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

// Serve static frontend player assets
app.use(express.static(path.join(__dirname, 'public')));

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
// API Endpoints for Sync Script & Management
// -------------------------------------------------------------

// List all scanned stones
app.get('/api/items', (req, res) => {
  try {
    const items = fs.readdirSync(MEDIA_DIR).filter(item => {
      return fs.statSync(path.join(MEDIA_DIR, item)).isDirectory();
    });
    
    const itemList = items.map(stoneId => ({
      stoneId,
      v360Url: `/vision360.html?d=${stoneId}`,
      modernUrl: `/viewer.html?d=${stoneId}`,
      embedUrl: `/embed/${stoneId}`
    }));

    res.json({ count: itemList.length, items: itemList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Item detail API with natural alphanumeric sorting
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

// Office PC Direct Upload API
app.post('/api/upload', upload.array('files'), (req, res) => {
  const stoneId = req.body.stoneId || req.query.stoneId;
  if (!stoneId) {
    return res.status(400).json({ error: 'Missing stoneId parameter' });
  }

  res.json({
    success: true,
    message: `Successfully uploaded ${req.files ? req.files.length : 0} files for stone ${stoneId}`,
    stoneId,
    viewerUrl: `/viewer.html?d=${stoneId}`,
    v360Url: `/vision360.html?d=${stoneId}`
  });
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` V360 Standalone Player Service Running`);
  console.log(` Listening on port: ${PORT}`);
  console.log(` V360 Iframe Player: http://localhost:${PORT}/vision360.html?d=SAMPLE_ID`);
  console.log(` Modern HTML5 Player: http://localhost:${PORT}/viewer.html?d=SAMPLE_ID`);
  console.log(`=================================================`);
});
