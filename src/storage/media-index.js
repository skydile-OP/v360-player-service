const fs = require('fs');
const { isValidSku } = require('../utils/sku');

// One directory listing per catalogue request, not one HTTP request per SKU.
function mediaDirectoryIndex(mediaDir) {
  return new Set(fs.readdirSync(mediaDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && isValidSku(entry.name) && !entry.name.startsWith('.') && entry.name !== 'temp_uploads')
    .map(entry => entry.name.toLowerCase()));
}

module.exports = { mediaDirectoryIndex };
