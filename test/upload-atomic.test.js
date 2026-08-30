const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { isAllowedFileExtension } = require('../src/utils/limits');
const { createStagingDir, validateStagedFolder, atomicSwapSku, purgeDir } = require('../src/storage/atomic');

const testMediaDir = path.join(__dirname, 'fixtures_atomic_media');

test.before(() => {
  if (!fs.existsSync(testMediaDir)) {
    fs.mkdirSync(testMediaDir, { recursive: true });
  }
});

test.after(() => {
  purgeDir(testMediaDir);
});

test('Limits - Allowed vs Unapproved File Extensions', () => {
  const allowed = ['image.jpg', 'photo.jpeg', 'still.png', 'frame.webp', 'data.json', 'video.mp4', 'view.html', 'anim.gif', 'icon.svg'];
  allowed.forEach(f => {
    assert.strictEqual(isAllowedFileExtension(f), true, `Expected ${f} to be allowed`);
  });

  const rejected = ['script.js', 'malware.exe', 'shell.php', 'hack.sh', 'payload.bat', 'data.py', 'config.env', '', '   '];
  rejected.forEach(f => {
    assert.strictEqual(isAllowedFileExtension(f), false, `Expected ${f} to be rejected`);
  });
});

test('Atomic Storage - Create staging, validate, and atomic swap', async () => {
  const sku = 'ATOMIC_SKU_1';

  // 1. Create staging directory
  const stagingDir = createStagingDir(testMediaDir, sku);
  assert.ok(fs.existsSync(stagingDir));

  // 2. Add valid files to staging
  fs.writeFileSync(path.join(stagingDir, 'still.jpg'), 'image bytes');
  fs.writeFileSync(path.join(stagingDir, '0.json'), '[{"image":"still.jpg"}]');

  // 3. Validate staged folder
  const val = validateStagedFolder(stagingDir);
  assert.strictEqual(val.valid, true);
  assert.strictEqual(val.fileCount, 2);

  // 4. Perform atomic swap
  let dbUpdated = false;
  const liveDir = await atomicSwapSku(testMediaDir, sku, stagingDir, async () => {
    dbUpdated = true;
  });

  assert.strictEqual(liveDir, path.join(testMediaDir, sku));
  assert.ok(fs.existsSync(liveDir));
  assert.ok(fs.existsSync(path.join(liveDir, 'still.jpg')));
  assert.ok(fs.existsSync(path.join(liveDir, '0.json')));
  assert.strictEqual(dbUpdated, true);
  assert.strictEqual(fs.existsSync(stagingDir), false, 'Staging directory should be cleaned up');
});

test('Atomic Storage - Failed upload rolls back and preserves existing live SKU', async () => {
  const sku = 'ROLLBACK_SKU';

  // 1. Create initial live SKU
  const liveDir = path.join(testMediaDir, sku);
  fs.mkdirSync(liveDir, { recursive: true });
  fs.writeFileSync(path.join(liveDir, 'original.jpg'), 'original good content');

  // 2. Create staging directory with invalid file
  const stagingDir = createStagingDir(testMediaDir, sku);
  fs.writeFileSync(path.join(stagingDir, 'bad_script.js'), 'malicious js');

  // 3. Perform atomic swap expecting rejection
  let errorCaught = false;
  try {
    await atomicSwapSku(testMediaDir, sku, stagingDir);
  } catch (err) {
    errorCaught = true;
    assert.ok(err.message.includes('unapproved file extension'));
  }

  assert.strictEqual(errorCaught, true);
  assert.ok(fs.existsSync(liveDir), 'Live SKU folder must be preserved');
  assert.ok(fs.existsSync(path.join(liveDir, 'original.jpg')), 'Original file must remain intact');
  assert.strictEqual(fs.existsSync(path.join(liveDir, 'bad_script.js')), false, 'Invalid file must not exist in live SKU');
  assert.strictEqual(fs.existsSync(stagingDir), false, 'Staging folder must be purged');
});

test('Atomic Storage - Updating existing SKU replaces stale files', async () => {
  const sku = 'REPLACE_SKU';

  // 1. Create v1 live SKU with old_file.jpg
  const liveDir = path.join(testMediaDir, sku);
  fs.mkdirSync(liveDir, { recursive: true });
  fs.writeFileSync(path.join(liveDir, 'old_file.jpg'), 'v1 content');

  // 2. Stage v2 upload with new_file.jpg
  const stagingDir = createStagingDir(testMediaDir, sku);
  fs.writeFileSync(path.join(stagingDir, 'new_file.jpg'), 'v2 content');

  // 3. Perform atomic swap
  await atomicSwapSku(testMediaDir, sku, stagingDir);

  assert.ok(fs.existsSync(path.join(liveDir, 'new_file.jpg')), 'New file must exist');
  assert.strictEqual(fs.existsSync(path.join(liveDir, 'old_file.jpg')), false, 'Stale old file must be removed');
});
