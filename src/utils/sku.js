const path = require('path');

const SKU_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Validates SKU format against canonical rules to prevent path traversal
 * and invalid character injection.
 * @param {string} sku - The SKU/stoneId to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidSku(sku) {
  if (typeof sku !== 'string') return false;
  const trimmed = sku.trim();
  if (!trimmed) return false;
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0')) {
    return false;
  }
  return SKU_REGEX.test(trimmed);
}

/**
 * Safely resolves an SKU directory path within a media root directory,
 * asserting that the resulting absolute path is contained strictly within mediaDir.
 * @param {string} mediaDir - The base media directory
 * @param {string} sku - The SKU/stoneId
 * @returns {string|null} Resolved absolute path if valid and contained, null otherwise
 */
function resolveSkuPath(mediaDir, sku) {
  if (!isValidSku(sku)) return null;

  const baseResolved = path.resolve(mediaDir);
  const targetResolved = path.resolve(mediaDir, sku.trim());

  // Strict containment check: target must be inside base directory
  if (!targetResolved.startsWith(baseResolved + path.sep) && targetResolved !== baseResolved) {
    return null;
  }

  return targetResolved;
}

module.exports = {
  isValidSku,
  resolveSkuPath,
  SKU_REGEX
};
