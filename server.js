const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.enable('trust proxy');

app.use(cors());
app.use(express.json());

const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'data', 'media');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const TEMP_UPLOAD_DIR = path.join(__dirname, 'data', 'temp_uploads');
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
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
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------------------------------------------------
// V360 Standalone Player Route
// Serves the exact exported HTML viewer if present in SKU folder
// -------------------------------------------------------------
app.get('/vision360.html', (req, res) => {
  const stoneId = req.query.d;
  if (stoneId) {
    const stoneDir = path.join(MEDIA_DIR, stoneId);
    if (fs.existsSync(stoneDir)) {
      const files = fs.readdirSync(stoneDir);
      // Find standalone HTML exported file (e.g., SE313.html)
      const standaloneHtml = files.find(f => 
        f.toLowerCase() === `${stoneId.toLowerCase()}.html` ||
        (f.toLowerCase().endsWith('.html') && f.toLowerCase() !== 'vision360.html' && f.toLowerCase() !== 'viewer.html')
      );

      if (standaloneHtml) {
        return res.sendFile(path.join(stoneDir, standaloneHtml));
      }
    }
  }
  res.sendFile(path.join(__dirname, 'public', 'vision360.html'));
});

// Modern Responsive HTML5 Viewer Route
app.get('/viewer.html', (req, res) => {
  const stoneId = req.query.d;
  if (stoneId) {
    const stoneDir = path.join(MEDIA_DIR, stoneId);
    if (fs.existsSync(stoneDir)) {
      const files = fs.readdirSync(stoneDir);
      const standaloneHtml = files.find(f => 
        f.toLowerCase() === `${stoneId.toLowerCase()}.html` ||
        (f.toLowerCase().endsWith('.html') && f.toLowerCase() !== 'vision360.html' && f.toLowerCase() !== 'viewer.html')
      );

      if (standaloneHtml) {
        return res.sendFile(path.join(stoneDir, standaloneHtml));
      }
    }
  }
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// V360 Asset Route
app.get('/imaged/:stoneId/:filename', (req, res) => {
  const { stoneId, filename } = req.params;

  if (process.env.STORAGE_CDN_URL) {
    const remoteUrl = `${process.env.STORAGE_CDN_URL.replace(/\/$/, '')}/${stoneId}/${filename}`;
    return res.redirect(302, remoteUrl);
  }

  const filePath = path.join(MEDIA_DIR, stoneId, filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  const samplePath = path.join(MEDIA_DIR, 'sample_item', filename);
  if (fs.existsSync(samplePath)) {
    return res.sendFile(samplePath);
  }

  return res.status(404).json({ error: 'Asset not found', stoneId, filename });
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

  for (let jsonFile of ['1.json', 'sm.json', '2.json', '8.json']) {
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

// API: SKU Library List
app.get('/api/items', (req, res) => {
  try {
    const items = fs.readdirSync(MEDIA_DIR).filter(item => {
      return item !== 'temp_uploads' && fs.statSync(path.join(MEDIA_DIR, item)).isDirectory();
    });
    
    const hostHeader = req.get('host');
    const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${proto}://${hostHeader}`;

    const itemList = items.map(stoneId => {
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

    res.json({ count: itemList.length, items: itemList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Item detail
app.get('/api/items/:stoneId', (req, res) => {
  const { stoneId } = req.params;
  const stoneDir = path.join(MEDIA_DIR, stoneId);

  if (!fs.existsSync(stoneDir)) {
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

app.delete('/api/items/:stoneId', (req, res) => {
  const { stoneId } = req.params;
  const stoneDir = path.join(MEDIA_DIR, stoneId);

  if (fs.existsSync(stoneDir)) {
    fs.rmSync(stoneDir, { recursive: true, force: true });
    return res.json({ success: true, message: `Deleted SKU ${stoneId}` });
  }
  res.status(404).json({ error: 'SKU not found' });
});

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

app.post('/api/upload', upload.array('files'), (req, res) => {
  const stoneId = req.body.stoneId || req.query.stoneId;
  if (!stoneId) {
    return res.status(400).json({ error: 'Missing stoneId/SKU parameter' });
  }

  const hostHeader = req.get('host');
  const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const baseUrl = `${proto}://${hostHeader}`;

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
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` V360 Standalone Player & Dashboard Service Running`);
  console.log(` Listening on port: ${PORT}`);
  console.log(`=================================================`);
});
