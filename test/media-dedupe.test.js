const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { reconcileDuplicateMedia } = require('../src/storage/media-dedupe');
const { purgeDir } = require('../src/storage/atomic');

function mediaRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v360-dedupe-'));
  t.after(() => purgeDir(root));
  return root;
}

function inode(root, sku, name = 'video.mp4') {
  return fs.statSync(path.join(root, sku, name), { bigint: true }).ino;
}

test('reconciliation shares reviewed exact copies while preserving filenames and divergent pairs', async t => {
  const root = mediaRoot(t);
  for (const [sku, name, contents] of [
    ['PC0013', 'PC0013.html', 'identical'], ['PC013', 'PC013.html', 'identical'],
    ['PR101', 'video.mp4', 'version A'], ['J-PR101', 'video.mp4', 'version B'],
    ['PR102', 'video.mp4', 'identical'], ['J-PR102', 'video.mp4', 'identical'],
  ]) {
    fs.mkdirSync(path.join(root, sku));
    fs.writeFileSync(path.join(root, sku, name), contents);
  }
  await reconcileDuplicateMedia(root);
  assert.equal(inode(root, 'PC0013', 'PC0013.html'), inode(root, 'PC013', 'PC013.html'));
  assert.notEqual(inode(root, 'PR101'), inode(root, 'J-PR101'));
  assert.equal(inode(root, 'PR102'), inode(root, 'J-PR102'));
  await reconcileDuplicateMedia(root);
  assert.equal(inode(root, 'PR102'), inode(root, 'J-PR102'));
});

test('both upload routes share exact paired media and preserve independent updates and deletion', async t => {
  const root = mediaRoot(t);
  process.env.MEDIA_DIR = root;
  process.env.ADMIN_PASSWORD = 'v360-dedupe-test';
  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: 'Basic ' + Buffer.from('admin:v360-dedupe-test').toString('base64') };
  async function upload(sku, bytes, asZip = false) {
    const form = new FormData();
    form.append('stoneId', sku);
    if (asZip) {
      const zip = new AdmZip();
      zip.addFile('video.mp4', Buffer.from(bytes));
      form.append('file', new Blob([zip.toBuffer()]), 'scan.zip');
    } else {
      form.append('files', new Blob([bytes]), 'video.mp4');
    }
    const response = await fetch(origin + (asZip ? '/api/upload-zip' : '/api/upload'),
      { method: 'POST', headers, body: form });
    assert.equal(response.status, 200, await response.text());
  }
  async function video(sku) {
    const response = await fetch(`${origin}/imaged/${sku}/video.mp4`);
    assert.equal(response.status, 200);
    return response.text();
  }

  await Promise.all([upload('PR116', 'first scan'), upload('J-PR116', 'first scan', true)]);
  assert.equal(inode(root, 'PR116'), inode(root, 'J-PR116'));
  assert.equal(await video('PR116'), 'first scan');
  assert.equal(await video('J-PR116'), 'first scan');

  await upload('J-PR116', 'other scan');
  assert.notEqual(inode(root, 'PR116'), inode(root, 'J-PR116'));
  assert.equal(await video('PR116'), 'first scan');
  assert.equal(await video('J-PR116'), 'other scan');

  await upload('J-PR116', 'first scan');
  assert.equal(inode(root, 'PR116'), inode(root, 'J-PR116'));
  const response = await fetch(origin + '/api/items/PR116', { method: 'DELETE', headers });
  assert.equal(response.status, 200);
  assert.equal(await video('J-PR116'), 'first scan');

  await Promise.all([upload('PC0013', 'reviewed scan'), upload('PC013', 'reviewed scan')]);
  assert.equal(inode(root, 'PC0013'), inode(root, 'PC013'));
});
