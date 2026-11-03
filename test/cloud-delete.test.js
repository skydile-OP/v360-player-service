const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteCloudFolder } = require('../src/storage/cloud-backup');
const { withSkuLock } = require('../src/storage/sku-lock');

test('cloud cleanup deletes only the exact SKU prefix across multiple pages', async () => {
  let page = 0; const deleted = [];
  const client = { async send(command) {
    if (command.constructor.name === 'ListObjectsV2Command') {
      assert.equal(command.input.Prefix, 'v360-backups/J-A/');
      return { Contents: page++ < 2 ? [{ Key: `v360-backups/J-A/revision${page}/files/still.jpg` }] : [] };
    }
    deleted.push(...command.input.Delete.Objects); return {};
  } };
  assert.equal(await deleteCloudFolder('J-A', { client, config: { bucket: 'test' } }), 2);
  assert.equal(deleted.length, 2);
});

test('cloud cleanup stops on object errors and rejects invalid paths', async () => {
  const client = { async send(command) { return command.constructor.name === 'ListObjectsV2Command'
    ? { Contents: [{ Key: 'v360-backups/A/file' }] } : { Errors: [{ Code: 'AccessDenied' }] }; } };
  await assert.rejects(deleteCloudFolder('A', { client, config: { bucket: 'test' } }), /incomplete/);
  await assert.rejects(deleteCloudFolder('../A', { client, config: { bucket: 'test' } }), /Invalid/);
});

test('same SKU upload and delete serialize even with different case', async () => {
  const events = [];
  await Promise.all([
    withSkuLock('ABC', async () => { events.push('upload'); await new Promise(r => setTimeout(r, 20)); events.push('saved'); }),
    withSkuLock('abc', async () => { events.push('delete'); }),
  ]);
  assert.deepEqual(events, ['upload', 'saved', 'delete']);
});
