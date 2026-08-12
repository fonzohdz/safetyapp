// Replace degenerate placeholder signature images in the JSON fixtures with
// realistic ones.
//
//   node tools/testing/fixtures/refresh-signature-images.mjs [--dry]
//
// The fixtures shipped 1x1 black-pixel PNGs as signatures. Stretched into a
// signature block that renders as a solid black bar in every generated
// review PDF -- alarming to a human reviewer, and incapable of surfacing any
// aspect-ratio / object-fit / alpha-compositing bug. This rewrites every
// data:image/png field whose real pixel dimensions are <= 2x2, in place,
// with a transparent-background handwritten stroke (see makeSignaturePng).
//
// Idempotent: already-realistic images are left untouched.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeSignaturePng } from '../lib/makeTestPng.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dry = process.argv.includes('--dry');

// Read width/height straight out of the PNG IHDR.
function pngSize(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null; // 'IHDR'
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Operate on the raw file text, not a parsed-and-re-serialized object, so
// the diff is confined to the data URLs themselves and every fixture keeps
// its existing formatting.
let seed = 0;
let files = 0;
let fields = 0;
for (const name of readdirSync(__dirname).filter(f => f.endsWith('.json')).sort()) {
  const file = path.join(__dirname, name);
  const text = readFileSync(file, 'utf8');
  const changed = [];
  const next = text.replace(/"([A-Za-z0-9_]*)":\s*"(data:image\/png;base64,[A-Za-z0-9+/=]+)"/g,
    (whole, key, dataUrl) => {
      const size = pngSize(dataUrl);
      if (!size || size.width > 2 || size.height > 2) return whole;
      seed += 1;
      changed.push(`${key} (${size.width}x${size.height})`);
      return whole.replace(dataUrl, `data:image/png;base64,${makeSignaturePng(seed).toString('base64')}`);
    });
  if (!changed.length) continue;
  files += 1;
  fields += changed.length;
  console.log(`${name}: ${changed.length} placeholder signature(s)`);
  changed.forEach(c => console.log(`    ${c}`));
  if (!dry) writeFileSync(file, next);
}
console.log(`\n${dry ? '[dry run] would rewrite' : 'rewrote'} ${fields} field(s) across ${files} fixture file(s).`);
