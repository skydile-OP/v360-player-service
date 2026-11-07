const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isValidSku, resolveSkuPath } = require('../utils/sku');
const { createStagingDir, purgeDir } = require('./atomic');
const { withSkuLock } = require('./sku-lock');

// These folders had matching backup checksums. Each SKU keeps its own paths and
// catalog record, including where the same file has a different name.
const reviewedPairs = [
  ['SR1024', 'SR1024A'],
  ['PC0013', 'PC013'],
  ['TJ40116', 'TSS40116A'],
  ['TJ40100F', 'ZADL7401'],
  ['ZADL0015', 'TSH7101'],
  ['TJ4509', 'TSH3701'],
  ['TSS4025', 'TSS5001'],
];

function reviewedPartner(sku) {
  const name = sku.trim().toUpperCase();
  return reviewedPairs.find(pair => pair.includes(name))?.find(item => item !== name);
}

function withMediaUploadLock(sku, action) {
  const partner = reviewedPartner(sku);
  if (!partner) return withSkuLock(sku, action);
  const [first, second] = [sku.trim().toUpperCase(), partner].sort();
  return withSkuLock(first, () => withSkuLock(second, action));
}

function skuDirectories(mediaDir) {
  return new Map(fs.readdirSync(mediaDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && isValidSku(entry.name))
    .map(entry => [entry.name.toLowerCase(), entry.name]));
}

function listFiles(dir) {
  if (!fs.lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return fs.readdirSync(dir).map(name => {
    const file = path.join(dir, name);
    return { file, stat: fs.lstatSync(file) };
  });
}

function inode({ stat }) {
  return `${stat.dev}:${stat.ino}`;
}

async function checksum(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

// Call while both SKU folders are locked. Published media is immutable: uploads
// replace whole directories, so replacing or deleting one SKU leaves the other
// SKU's links intact.
async function shareIdenticalMedia(mediaDir, sourceDir, targetDir) {
  const source = listFiles(sourceDir);
  const target = listFiles(targetDir);
  if (!source.length || source.length !== target.length ||
      [...source, ...target].some(({ stat }) => !stat.isFile())) return 0;
  if (source.map(x => x.stat.size).sort().join() !== target.map(x => x.stat.size).sort().join() ||
      source.map(inode).sort().join() === target.map(inode).sort().join()) return 0;

  const hashes = new Map();
  async function fingerprint(entry) {
    const key = inode(entry);
    if (!hashes.has(key)) hashes.set(key, await checksum(entry.file));
    return `${entry.stat.size}:${hashes.get(key)}`;
  }

  const candidates = new Map();
  for (const entry of source) {
    const key = await fingerprint(entry);
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push(entry);
  }
  const links = [];
  for (const entry of target) {
    const match = candidates.get(await fingerprint(entry))?.pop();
    if (!match) return 0;
    links.push({ match, entry });
  }

  const pending = createStagingDir(mediaDir, 'dedupe');
  let reclaimed = 0;
  try {
    const tempFile = path.join(pending, 'link');
    for (const { match, entry } of links) {
      if (inode(match) === inode(entry)) continue;
      const { nlink, size } = fs.lstatSync(entry.file);
      fs.linkSync(match.file, tempFile);
      fs.renameSync(tempFile, entry.file);
      if (nlink === 1) reclaimed += size;
    }
  } finally {
    purgeDir(pending);
  }
  return reclaimed;
}

async function shareUploadMedia(mediaDir, sku, stagingDir) {
  const name = sku.trim().toLowerCase();
  if (name.startsWith('j-j-')) return;
  const alternate = name.startsWith('j-') ? name.slice(2) : `j-${name}`;
  try {
    const directories = skuDirectories(mediaDir);
    for (const candidate of [alternate, reviewedPartner(sku)?.toLowerCase()]) {
      const existing = directories.get(candidate);
      if (existing && await shareIdenticalMedia(mediaDir, resolveSkuPath(mediaDir, existing), stagingDir)) break;
    }
  } catch (err) {
    console.warn(`[Media Dedupe] Could not share uploaded media for '${sku}': ${err.message}`);
  }
}

async function reconcileDuplicateMedia(mediaDir) {
  const directories = skuDirectories(mediaDir);
  const prefixedPairs = [...directories.keys()]
    .filter(name => name.startsWith('j-') && !name.slice(2).startsWith('j-') && directories.has(name.slice(2)))
    .map(name => [name.slice(2), name]);
  let bytes = 0;
  let pairs = 0;
  let failures = 0;
  for (const [source, target] of [...prefixedPairs, ...reviewedPairs]) {
    const sourceSku = directories.get(source.toLowerCase());
    const targetSku = directories.get(target.toLowerCase());
    if (!sourceSku || !targetSku) continue;
    const share = () => shareIdenticalMedia(mediaDir,
      resolveSkuPath(mediaDir, sourceSku), resolveSkuPath(mediaDir, targetSku));
    try {
      const reclaimed = await withMediaUploadLock(sourceSku, share);
      if (reclaimed) pairs++;
      bytes += reclaimed;
    } catch (err) {
      failures++;
      console.error(`[Media Dedupe] Failed for '${sourceSku}' / '${targetSku}': ${err.message}`);
    }
  }
  console.log(`[Media Dedupe] Shared ${pairs} pairs, reclaimed ${bytes} bytes, ${failures} failed.`);
}

module.exports = { withMediaUploadLock, shareUploadMedia, reconcileDuplicateMedia };
