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

/* Encode an RGBA (color type 6) PNG from a raw width*height*4 pixel buffer. */
function encodeRgba(width, height, px) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    px.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* Returns a Buffer containing a signature-like PNG: a dark handwritten
   stroke on a TRANSPARENT background, which is what SignaturePad actually
   produces (its canvas is clearRect'd, never filled -- see
   src/incident/SignaturePad.jsx). `seed` varies the squiggle so two
   signatures on one page don't look identical.

   Why this exists: the doc fixtures used to carry a 1x1 black pixel as a
   placeholder signature. Stretched into the signature block that renders as
   a solid black bar, which (a) makes every generated review PDF look broken
   to a human reviewer and (b) can't surface any real aspect-ratio,
   letterboxing, object-fit or alpha-compositing bug -- exactly the "clean
   test data passes review while missing real layout bugs" trap CLAUDE.md
   warns about. Default 600x180 matches the pad's real proportions. */
export function makeSignaturePng(seed = 1, width = 600, height = 180) {
  const px = Buffer.alloc(width * height * 4); // zeroed => fully transparent
  const rnd = (n) => Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453 % 1;

  // A few overlapping strokes: a long baseline-riding squiggle with loops,
  // plus a shorter crossing stroke, so the ink has a realistic ragged bbox.
  const strokes = [];
  const mainPts = [];
  for (let t = 0; t <= 1.0001; t += 0.004) {
    const x = 0.06 + t * 0.86;
    const y = 0.62
      + Math.sin(t * Math.PI * 5.5 + rnd(1) * 2) * 0.20 * (1 - t * 0.35)
      + Math.sin(t * Math.PI * 13 + rnd(2) * 3) * 0.05
      - t * 0.06;
    mainPts.push([x * width, y * height]);
  }
  strokes.push({ pts: mainPts, r: Math.max(1.6, height * 0.016) });

  const crossPts = [];
  for (let t = 0; t <= 1.0001; t += 0.01) {
    crossPts.push([(0.30 + t * 0.45) * width, (0.34 + Math.sin(t * Math.PI) * -0.05 + rnd(3) * 0.04) * height]);
  }
  strokes.push({ pts: crossPts, r: Math.max(1.2, height * 0.011) });

  const stamp = (cx, cy, r) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > r + 0.7) continue;
        // soft edge => antialiased ink, like a real pad stroke
        const a = Math.round(255 * Math.min(1, Math.max(0, (r + 0.7 - d) / 1.4)));
        const i = (y * width + x) * 4;
        if (a > px[i + 3]) { px[i] = 17; px[i + 1] = 24; px[i + 2] = 39; px[i + 3] = a; }
      }
    }
  };
  for (const { pts, r } of strokes) for (const [x, y] of pts) stamp(x, y, r);

  return encodeRgba(width, height, px);
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
