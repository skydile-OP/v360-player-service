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
const upload = multer({ storage });

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
    res.json({ MEDIA_DIR, mediaExists, items, debugData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const WEISS_BRANDING_INJECTION = `
<style>
  #FixedWaterMark img, #watermark img, .watermarkImage {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
  }
  .V360-canvas, canvas, video, img {
    filter: none !important;
    -webkit-filter: none !important;
    mix-blend-mode: normal !important;
  }
</style>
<script>
  (function() {
    function injectWeissLogo() {
      var imgs = document.querySelectorAll('#FixedWaterMark img, #watermark img, .watermarkImage');
      imgs.forEach(function(img){ img.style.display = 'none'; img.style.visibility = 'hidden'; });
      if (!document.getElementById('customWeissWatermark')) {
        var a = document.createElement('a');
        a.id = 'customWeissWatermark';
        a.href = 'https://weissdiamonds.com';
        a.target = '_blank';
        a.innerHTML = 'Weissdiamonds.com';
        a.setAttribute('style', 'position:fixed; bottom:18px; right:24px; font-weight:700; font-size:15px; color:#334155; text-decoration:none; z-index:99999; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; background:rgba(255,255,255,0.92); padding:5px 12px; border-radius:6px; border:1px solid #cbd5e1; box-shadow:0 2px 8px rgba(0,0,0,0.08); cursor:pointer; display:block !important;');
        document.body.appendChild(a);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectWeissLogo);
    } else {
      injectWeissLogo();
    }
    setInterval(injectWeissLogo, 200);
  })();
</script>
</body>`;

// Serve exported standalone V360 HTML page if present (e.g. SE313.html, PR048.html)
app.get('/vision360.html', (req, res) => {
  const stoneId = req.query.d;
  if (stoneId) {
    const stoneDir = findStoneDir(stoneId);
    if (stoneDir) {
      const files = fs.readdirSync(stoneDir);
      const standaloneHtml = files.find(f => f.toLowerCase().endsWith('.html') && f.toLowerCase() !== 'vision360.html' && f.toLowerCase() !== 'viewer.html');
      if (standaloneHtml) {
        let content = fs.readFileSync(path.join(stoneDir, standaloneHtml), 'utf8');
        content = content.replace('</body>', WEISS_BRANDING_INJECTION);
        res.setHeader('Content-Type', 'text/html');
        return res.send(content);
      }
    }
  }
  res.sendFile(path.join(__dirname, 'public', 'vision360.html'));
});

app.get('/viewer.html', (req, res) => {
  const stoneId = req.query.d;
  if (stoneId) {
    const stoneDir = findStoneDir(stoneId);
    if (stoneDir) {
      const files = fs.readdirSync(stoneDir);
      const standaloneHtml = files.find(f => f.toLowerCase().endsWith('.html') && f.toLowerCase() !== 'vision360.html' && f.toLowerCase() !== 'viewer.html');
      if (standaloneHtml) {
        let content = fs.readFileSync(path.join(stoneDir, standaloneHtml), 'utf8');
        content = content.replace('</body>', WEISS_BRANDING_INJECTION);
        res.setHeader('Content-Type', 'text/html');
        return res.send(content);
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

  // 3. Fallback to sample_item folder
  const samplePath = path.join(MEDIA_DIR, 'sample_item', filename);
  if (fs.existsSync(samplePath)) {
    return res.sendFile(samplePath);
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

app.delete('/api/items/:stoneId', (req, res) => {
  const { stoneId } = req.params;
  const stoneDir = findStoneDir(stoneId);

  if (stoneDir) {
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
