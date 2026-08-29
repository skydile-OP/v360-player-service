const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { isValidSku, resolveSkuPath } = require('../src/utils/sku');

test('SKU Validation - Valid SKUs pass regex and traversal checks', () => {
  const validSkus = [
    'PR048',
    'SE313',
    'ZADL0082A',
    'ad-2ring',
    'STONE_123.v2',
    'sku-abc-123_456'
  ];

  validSkus.forEach(sku => {
    assert.strictEqual(isValidSku(sku), true, `Expected SKU '${sku}' to be valid`);
  });
});

test('SKU Validation - Path traversal and invalid inputs are rejected', () => {
  const invalidSkus = [
    '../',
    '..\\',
    '../etc/passwd',
    '..\\Windows\\System32',
    'SKU/../../secret',
    'SKU\\..\\..\\secret',
    '/absolute/path',
    'C:\\Windows',
    'sku with spaces',
    '<script>alert(1)</script>',
    'sku\0nullbyte',
    '',
    '   ',
    null,
    undefined,
    12345,
    {}
  ];

  invalidSkus.forEach(sku => {
    assert.strictEqual(isValidSku(sku), false, `Expected input '${sku}' to be rejected as invalid SKU`);
  });
});

test('Path Containment - resolveSkuPath enforces strict directory boundary', () => {
  const mediaDir = path.join(__dirname, 'fixtures', 'media');

  // Valid SKU resolves inside mediaDir
  const validPath = resolveSkuPath(mediaDir, 'SKU123');
  assert.notStrictEqual(validPath, null);
  assert.strictEqual(validPath, path.resolve(mediaDir, 'SKU123'));

  // Traversal SKUs return null
  assert.strictEqual(resolveSkuPath(mediaDir, '../outside'), null);
  assert.strictEqual(resolveSkuPath(mediaDir, '../../etc/passwd'), null);
  assert.strictEqual(resolveSkuPath(mediaDir, 'SKU/../../etc'), null);
});
