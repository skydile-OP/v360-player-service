const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { isValidSku } = require('../utils/sku');

function cloudConfig(env = process.env) {
  const keys = ['V360_BACKUP_ENDPOINT', 'V360_BACKUP_BUCKET', 'V360_BACKUP_ACCESS_KEY_ID', 'V360_BACKUP_SECRET_ACCESS_KEY'];
  return keys.every(k => env[k]) ? {
    endpoint: env.V360_BACKUP_ENDPOINT, bucket: env.V360_BACKUP_BUCKET,
    credentials: { accessKeyId: env.V360_BACKUP_ACCESS_KEY_ID, secretAccessKey: env.V360_BACKUP_SECRET_ACCESS_KEY }
  } : null;
}

function assertDurableStorage(env = process.env) {
  if (env.RAILWAY_ENVIRONMENT || env.V360_REQUIRE_DURABLE_MEDIA === '1') {
    if (!env.RAILWAY_VOLUME_MOUNT_PATH) throw new Error('Persistent media volume is required');
    if (!cloudConfig(env)) throw new Error('Cloud media backup configuration is required');
  }
}

async function digest(stream) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

// Immutable, content-addressed snapshots. A manifest is published only after
// every uploaded object has been downloaded and its content verified.
async function backupFolder(sku, directory, options = {}) {
  if (!isValidSku(sku)) throw new Error('Invalid backup SKU');
  const config = options.config || cloudConfig();
  if (!config) {
    assertDurableStorage();
    return null; // Local development only.
  }
  const client = options.client || new S3Client({ endpoint: config.endpoint, region: 'auto', credentials: config.credentials });
  const files = [];
  for (const name of fs.readdirSync(directory).sort()) {
    const filename = path.join(directory, name);
    const stat = fs.lstatSync(filename);
    if (!stat.isFile()) throw new Error('Backup requires regular files only');
    files.push({ name, bytes: stat.size, sha256: await digest(fs.createReadStream(filename)) });
  }
  if (!files.length) throw new Error('Cannot back up an empty media folder');
  const revision = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  const prefix = `v360-backups/${encodeURIComponent(sku)}/${revision}/`;
  try {
    for (const file of files) {
      const Key = prefix + 'files/' + encodeURIComponent(file.name);
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key,
        Body: fs.createReadStream(path.join(directory, file.name)), ContentLength: file.bytes,
        Metadata: { sha256: file.sha256 } }));
      const saved = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key }));
      if (await digest(saved.Body) !== file.sha256) throw new Error('Cloud copy checksum mismatch');
    }
    const manifest = { sku, revision, objectPrefix: prefix + 'files/', files, verifiedAt: new Date().toISOString() };
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: prefix + 'manifest.json',
      Body: JSON.stringify(manifest), ContentType: 'application/json' }));
    return manifest;
  } catch (_) {
    // Do not expose SDK errors, request details or credentials to clients/logs.
    throw new Error('Cloud media backup failed; upload was not committed. Please retry.');
  }
}

module.exports = { backupFolder, assertDurableStorage, cloudConfig };
