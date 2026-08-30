const path = require('path');

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.json',
  '.mp4',
  '.html',
  '.gif',
  '.svg'
]);

const MAX_FILES_PER_SKU = 500;
const MAX_SINGLE_FILE_BYTES = 150 * 1024 * 1024; // 150 MB
const MAX_TOTAL_REQUEST_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_ZIP_DECOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Checks if a filename has an approved media file extension.
 * @param {string} filename 
 * @returns {boolean}
 */
function isAllowedFileExtension(filename) {
  if (typeof filename !== 'string' || !filename.trim()) return false;
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_FILES_PER_SKU,
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_REQUEST_BYTES,
  MAX_ZIP_DECOMPRESSED_BYTES,
  isAllowedFileExtension
};
