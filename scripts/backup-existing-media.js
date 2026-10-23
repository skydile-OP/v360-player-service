const fs = require('fs');
const path = require('path');
const { backupFolder, cloudConfig } = require('../src/storage/cloud-backup');
const { isValidSku } = require('../src/utils/sku');

async function main() {
  if (!cloudConfig()) throw new Error('Cloud backup credentials required');
  const root = path.resolve(process.argv[2] || process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.MEDIA_DIR || 'data/media');
  let folders = 0;
  let files = 0;
  for (const sku of fs.readdirSync(root)) {
    const dir = path.join(root, sku);
    if (!isValidSku(sku) || !fs.lstatSync(dir).isDirectory()) continue;
    const manifest = await backupFolder(sku, dir);
    folders++;
    files += manifest.files.length;
    console.log(JSON.stringify({ verifiedFolders: folders, verifiedFiles: files }));
  }
}
main().catch(() => { console.error('Media backup failed; no credentials or provider details logged.'); process.exitCode = 1; });
