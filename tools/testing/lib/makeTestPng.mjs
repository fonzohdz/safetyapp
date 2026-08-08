// Minimal from-scratch PNG encoder for synthetic test fixtures -- no
// external dependencies (no `canvas`/`sharp` package, no headless-browser
// round trip needed just to produce a solid-color test image). Used by
// verify-incident-photos.mjs to generate portrait/landscape/large images at
// exact known dimensions for upload-through-the-real-UI tests.
//
// Produces an 8-bit RGB (color type 2, no alpha, no filtering per scanline)
// PNG: IHDR + one zlib-compressed IDAT (via Node's built-in zlib) + IEND,
// each with a correct CRC32 -- the smallest correct PNG structure a
// browser's <img>/createImageBitmap decoder will accept.

import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/* Returns a Buffer containing a valid PNG file: solid `rgb` background with
   a contrasting diagonal stripe (so portrait vs. landscape orientation and
   any accidental stretch/crop is visually obvious in a screenshot, not just
   a flat color swatch). */
export function makeTestPng(width, height, rgb = [200, 60, 60]) {
  const stripeRgb = [30, 30, 30];
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height); // +1 filter-type byte per scanline
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < width; x += 1) {
      const onStripe = Math.abs((x / width) - (y / height)) < 0.04;
      const [r, g, b] = onStripe ? stripeRgb : rgb;
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
