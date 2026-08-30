const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { isValidSku, resolveSkuPath } = require('../utils/sku');
const { isAllowedFileExtension, MAX_FILES_PER_SKU } = require('../utils/limits');

/**
 * Creates an isolated staging directory for an SKU upload inside mediaDir/.staging
 * @param {string} mediaDir - Root media directory
 * @param {string} sku - Validated SKU name
 * @returns {string} Staging directory absolute path
 */
function createStagingDir(mediaDir, sku) {
  if (!isValidSku(sku)) {
    throw new Error(`Invalid SKU '${sku}' for staging directory creation.`);
  }

  const stagingBase = path.join(mediaDir, '.staging');
  if (!fs.existsSync(stagingBase)) {
    fs.mkdirSync(stagingBase, { recursive: true });
  }

  const uniqueId = `${sku}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const stagingDir = path.join(stagingBase, uniqueId);
  fs.mkdirSync(stagingDir, { recursive: true });
  return stagingDir;
}

/**
 * Validates files inside a staging directory against file limits and allowed extensions.
 * @param {string} stagingDir 
 * @returns {object} Validation result { valid: boolean, reason?: string, fileCount: number }
 */
function validateStagedFolder(stagingDir) {
  if (!fs.existsSync(stagingDir)) {
    return { valid: false, reason: 'Staging directory does not exist.' };
  }

  const files = fs.readdirSync(stagingDir);
  if (files.length === 0) {
    return { valid: false, reason: 'Uploaded folder is empty.' };
  }

  if (files.length > MAX_FILES_PER_SKU) {
    return { valid: false, reason: `Exceeded maximum file limit of ${MAX_FILES_PER_SKU} files per SKU.` };
  }

  for (const filename of files) {
    const filePath = path.join(stagingDir, filename);
    const stat = fs.statSync(filePath);

    if (!stat.isFile()) {
      return { valid: false, reason: `Subdirectories inside SKU folder are not permitted ('${filename}').` };
    }

    if (!isAllowedFileExtension(filename)) {
      return { valid: false, reason: `File '${filename}' has an unapproved file extension.` };
    }
  }

  return { valid: true, fileCount: files.length };
}

/**
 * Safely purges a staging or temporary directory if it exists.
 * @param {string} dirPath 
 */
function purgeDir(dirPath) {
  if (dirPath && fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (e) {
      console.error(`[Storage] Failed to purge temporary directory '${dirPath}':`, e.message);
    }
  }
}

/**
 * Atomically replaces a live SKU folder with a validated staging directory.
 * Automatically backs up existing folder and performs rollback if any step fails.
 * 
 * @param {string} mediaDir - Root media directory
 * @param {string} sku - Validated target SKU
 * @param {string} stagingDir - Validated staging directory path
 * @param {function} updateDbFn - Optional async callback to update PostgreSQL
 * @returns {Promise<string>} Resolved path to new live directory
 */
async function atomicSwapSku(mediaDir, sku, stagingDir, updateDbFn = null) {
  const targetLiveDir = resolveSkuPath(mediaDir, sku);
  if (!targetLiveDir) {
    purgeDir(stagingDir);
    throw new Error(`Invalid SKU path containment for '${sku}'.`);
  }

  const validation = validateStagedFolder(stagingDir);
  if (!validation.valid) {
    purgeDir(stagingDir);
    throw new Error(validation.reason);
  }

  const backupBase = path.join(mediaDir, '.backups');
  let backupDir = null;

  try {
    // 1. Move existing live folder to temporary backup directory if it exists
    if (fs.existsSync(targetLiveDir)) {
      if (!fs.existsSync(backupBase)) {
        fs.mkdirSync(backupBase, { recursive: true });
      }
      backupDir = path.join(backupBase, `${sku}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
      fs.renameSync(targetLiveDir, backupDir);
    }

    // 2. Atomically rename staging directory to live SKU directory
    fs.renameSync(stagingDir, targetLiveDir);

    // 3. Update database record if callback provided
    if (typeof updateDbFn === 'function') {
      await updateDbFn(targetLiveDir);
    }

    // 4. On success, remove temporary backup directory
    if (backupDir) {
      purgeDir(backupDir);
    }

    return targetLiveDir;
  } catch (err) {
    console.error(`[Atomic Swap Error] Upload swap failed for SKU '${sku}':`, err.message);

    // Rollback: Restore original backup directory if swap or DB update failed
    if (backupDir && fs.existsSync(backupDir)) {
      try {
        if (fs.existsSync(targetLiveDir)) {
          purgeDir(targetLiveDir);
        }
        fs.renameSync(backupDir, targetLiveDir);
        console.log(`[Atomic Swap Rollback] Successfully restored live SKU '${sku}' from backup.`);
      } catch (rollbackErr) {
        console.error(`[Atomic Swap Rollback Error] Failed to restore backup for SKU '${sku}':`, rollbackErr.message);
      }
    }

    // Always clean up staging directory
    purgeDir(stagingDir);
    throw err;
  }
}

module.exports = {
  createStagingDir,
  validateStagedFolder,
  atomicSwapSku,
  purgeDir
};
