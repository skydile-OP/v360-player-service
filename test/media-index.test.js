const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mediaDirectoryIndex } = require('../src/storage/media-index');

test('physical index excludes missing catalogue rows and staging; matches case-insensitively', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v360-index-'));
  try {
    for (const dir of ['J-PA001', '.staging', 'temp_uploads']) fs.mkdirSync(path.join(root, dir));
    fs.writeFileSync(path.join(root, 'not-a-folder.jpg'), 'test');
    assert.deepEqual([...mediaDirectoryIndex(root)], ['j-pa001']);
    assert.equal(mediaDirectoryIndex(root).has('old-missing-sku'), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('unavailable storage fails instead of declaring every folder missing', () => {
  assert.throws(() => mediaDirectoryIndex(path.join(os.tmpdir(), 'nonexistent-v360-' + Date.now())));
});
