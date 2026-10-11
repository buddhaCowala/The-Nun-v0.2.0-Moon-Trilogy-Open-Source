/**
 * Dependency-free app.asar extractor with SHA-256 integrity verification.
 * Usage: node extract-asar.js <archive.asar> <outDir> [--verify]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [, , asarPath, outDir, flag] = process.argv;
if (!asarPath || !outDir) {
  console.error('Usage: node extract-asar.js <archive.asar> <outDir> [--verify]');
  process.exit(1);
}
const verify = flag === '--verify';

const buf = fs.readFileSync(asarPath);
// Asar pickle layout: [0..3] pickle hdr size, [4..7] header pickle size, [8..11] string pickle size, [12..15] json length, [16..] json
const jsonLen = buf.readUInt32LE(12);
const header = JSON.parse(buf.slice(16, 16 + jsonLen).toString('utf8'));
const dataBase = 8 + buf.readUInt32LE(4);

let fileCount = 0, dirCount = 0, unpackedCount = 0, linkCount = 0;
const failures = [];
const unpackedFiles = [];

function safeJoin(base, rel) {
  const target = path.join(base, rel);
  if (!target.startsWith(path.resolve(base))) throw new Error('Path traversal: ' + rel);
  return target;
}

function walk(node, rel) {
  if (node.files) {
    dirCount++;
    for (const name of Object.keys(node.files)) {
      walk(node.files[name], rel ? rel + '/' + name : name);
    }
    return;
  }
  if (node.link) {
    linkCount++;
    const target = safeJoin(outDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try { fs.symlinkSync(node.link, target, 'file'); } catch { fs.copyFileSync(node.link, target); }
    return;
  }
  const target = safeJoin(outDir, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (node.unpacked) {
    unpackedCount++;
    unpackedFiles.push(rel);
    return;
  }

  const start = dataBase + Number(node.offset);
  const content = buf.slice(start, start + node.size);
  fs.writeFileSync(target, content);

  if (verify && node.integrity && node.integrity.algorithm === 'SHA256') {
    const actual = crypto.createHash('sha256').update(content).digest('hex');
    if (actual !== node.integrity.hash) {
      failures.push(rel);
    }
  }
  fileCount++;
}

walk(header, '');

console.log(`Extracted: ${fileCount} files, ${dirCount} dirs, ${linkCount} links`);
console.log(`Unpacked entries (on-disk): ${unpackedCount}`);
if (unpackedFiles.length) {
  fs.writeFileSync(path.join(outDir, '.unpacked-files.txt'), unpackedFiles.join('\r\n'));
}
if (verify) {
  if (failures.length) {
    console.error(`INTEGRITY FAILURES: ${failures.length}`);
    failures.slice(0, 20).forEach(f => console.error('  ' + f));
    process.exit(2);
  }
  console.log('Integrity: all SHA-256 hashes match');
}
