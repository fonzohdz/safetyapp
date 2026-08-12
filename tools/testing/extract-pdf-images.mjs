// Extract the exact embedded raster images out of a generated PDF.
//
// This app's PDFs are html2canvas rasters embedded one-per-page via
// pdf-lib's embedPng (see src/documents/pdfExportCore.js) — so the image
// XObject inside the PDF *is* the ground truth of what a human sees, more
// trustworthy than a generic PDF renderer or a screenshot of the live
// (pre-rasterization) DOM. See CLAUDE.md "Gotchas" on html2canvas
// divergence.
//
// NOTE: a previous version of this tool lived at
// tools/testing/output/extract-pdf-images.mjs — inside the gitignored
// output/ directory — and was lost. This tracked copy replaces it.
//
//   node tools/testing/extract-pdf-images.mjs <pdfPath> <outDir>
//
// Writes <outDir>/page-1.png, page-2.png, ... (RGB, no alpha — the export
// captures with backgroundColor #ffffff so alpha is meaningless here).
//
// Pure Node implementation: pdf-lib to walk the PDF object graph, zlib to
// inflate the FlateDecode image stream, and a minimal PNG encoder (the
// repo deliberately has no image libraries).

import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import zlib from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// ── minimal PNG encoder (8-bit RGB or grayscale, filter 0) ──
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

export function encodePng(pixels, width, height, channels) {
  // channels: 3 = RGB, 1 = grayscale
  const colorType = channels === 3 ? 2 : 0;
  const stride = width * channels;
  const filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    filtered[y * (stride + 1)] = 0; // filter: None
    pixels.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(filtered, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── minimal PNG decoder (8-bit RGB/RGBA/gray, all 5 filters, no interlace) ──
// Needed to run the same raster analysis on Playwright DOM screenshots.
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG');
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error('Interlaced PNG not supported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`Unsupported bit depth ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported color type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[x] = v & 0xff;
    }
  }
  // normalize to RGB
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const s = i * channels, d = i * 3;
    if (channels >= 3) { rgb[d] = out[s]; rgb[d + 1] = out[s + 1]; rgb[d + 2] = out[s + 2]; }
    else { rgb[d] = rgb[d + 1] = rgb[d + 2] = out[s]; }
  }
  return { pixels: rgb, width, height, channels: 3 };
}

export async function extractPageRasters(pdfPath) {
  const pdfBytes = readFileSync(pdfPath);
  const doc = await PDFDocument.load(pdfBytes);
  const results = [];
  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    const xobjects = resources?.lookup(PDFName.of('XObject'));
    if (!xobjects) { results.push(null); continue; }
    let raster = null;
    for (const [, ref] of xobjects.entries()) {
      const stream = page.doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const dict = stream.dict;
      if (dict.lookup(PDFName.of('Subtype'))?.encodedName !== '/Image') continue;
      const width = dict.lookup(PDFName.of('Width'))?.asNumber();
      const height = dict.lookup(PDFName.of('Height'))?.asNumber();
      const filter = dict.lookup(PDFName.of('Filter'))?.encodedName;
      const colorSpace = dict.lookup(PDFName.of('ColorSpace'))?.encodedName;
      const bpc = dict.lookup(PDFName.of('BitsPerComponent'))?.asNumber();
      if (filter !== '/FlateDecode' || bpc !== 8) {
        throw new Error(`Unsupported image encoding on a page: filter=${filter} bpc=${bpc} — this tool only handles pdf-lib embedPng output.`);
      }
      const channels = colorSpace === '/DeviceRGB' ? 3 : 1;
      const pixels = zlib.inflateSync(Buffer.from(stream.contents));
      const expected = width * height * channels;
      if (pixels.length !== expected) {
        throw new Error(`Inflated image data is ${pixels.length} bytes, expected ${expected} (${width}x${height}x${channels}).`);
      }
      raster = { pixels, width, height, channels };
      break; // one full-page image per page in this app's PDFs
    }
    results.push(raster);
  }
  return results;
}

// ── standalone CLI ──
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const [pdfPath, outDir] = process.argv.slice(2);
  if (!pdfPath || !outDir) {
    console.error('Usage: node tools/testing/extract-pdf-images.mjs <pdfPath> <outDir>');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const rasters = await extractPageRasters(pdfPath);
  rasters.forEach((r, i) => {
    if (!r) { console.log(`page ${i + 1}: no raster image found`); return; }
    const outPath = path.join(outDir, `page-${i + 1}.png`);
    writeFileSync(outPath, encodePng(r.pixels, r.width, r.height, r.channels));
    console.log(`page ${i + 1}: ${r.width}x${r.height} (${r.channels}ch) -> ${outPath}`);
  });
}
