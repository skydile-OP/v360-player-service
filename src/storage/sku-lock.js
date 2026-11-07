const locks = new Map();
async function withSkuLock(sku, action) {
  const key = sku.trim().toLowerCase().replace(/^j-(?!j-)(?=[a-z0-9])/, '');
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  locks.set(key, current);
  await previous;
  try { return await action(); }
  finally { release(); if (locks.get(key) === current) locks.delete(key); }
}
module.exports = { withSkuLock };
