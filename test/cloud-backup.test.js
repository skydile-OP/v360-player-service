const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { backupFolder, assertDurableStorage } = require('../src/storage/cloud-backup');

test('production refuses temporary storage or missing cloud backup credentials', () => {
  assert.throws(() => assertDurableStorage({ RAILWAY_ENVIRONMENT: 'production' }), /volume/);
  assert.throws(() => assertDurableStorage({ RAILWAY_ENVIRONMENT: 'production', RAILWAY_VOLUME_MOUNT_PATH: '/data/media' }), /backup/);
  assert.doesNotThrow(() => assertDurableStorage({}));
});

for (const corrupt of [false, true]) {
  test(`cloud snapshot verifies actual downloaded bytes (corrupt=${corrupt})`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v360-backup-'));
    fs.writeFileSync(path.join(dir, 'video.mp4'), 'original media');
    const objects = new Map();
    const client = { async send(command) {
      const { Key, Body } = command.input;
      if (command.constructor.name === 'PutObjectCommand') {
        const chunks = [];
        if (typeof Body === 'string') chunks.push(Buffer.from(Body));
        else for await (const chunk of Body) chunks.push(chunk);
        objects.set(Key, Buffer.concat(chunks));
        return {};
      }
      return { Body: Readable.from([corrupt ? Buffer.from('damaged') : objects.get(Key)]) };
    } };
    try {
      const action = backupFolder('TEST', dir, { client, config: { bucket: 'test' } });
      if (corrupt) {
        await assert.rejects(action, /not committed/);
        assert.equal([...objects.keys()].some(k => k.endsWith('manifest.json')), false);
      } else {
        const result = await action;
        assert.equal(result.files.length, 1);
        assert.equal([...objects.keys()].some(k => k.endsWith('manifest.json')), true);
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}
