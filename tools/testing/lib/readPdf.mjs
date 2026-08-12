/* Read a DRAWN pdf back out as structured content.
 *
 *   const doc = readPdf(readFileSync('whatever.pdf'));
 *   doc.pages[0].texts  -> [{ text, x, y, size, font, color, width }]
 *   doc.pages[0].rects  -> [{ x, y, w, h, filled, stroked }]
 *   doc.pages[0].images -> [{ x, y, w, h, name, srcW, srcH }]
 *
 * WHY THIS EXISTS
 * The four Superintendent forms are now drawn into the PDF by pdfDraw.js
 * rather than screenshotted from the DOM. Their regression suites, however,
 * still measured the hidden DOM export root — which is still mounted and
 * still renders, but no longer produces the printed artifact. Those suites
 * could pass green while the real PDF was wrong.
 *
 * A drawn PDF has no embedded page raster to extract and nothing to compare
 * pixel-wise against, but it does contain the real text with real
 * coordinates. So instead of comparing pictures, we read the document back
 * and assert what it SAYS and WHERE — which catches the whole class of bug
 * that pictures catch (truncation, overflow, missing sections, a signature
 * squashed to the wrong shape) without storing a single golden image.
 *
 * COORDINATES
 * pdf-lib and the PDF format put the origin at the BOTTOM-left. pdfDraw.js
 * works top-down, and so does everything here: `y` is distance from the TOP
 * of the page, matching the source files and matching how a human reads the
 * form. For text, `y` is the BASELINE.
 *
 * SCOPE
 * This parses the subset of PDF that pdf-lib emits for our forms — text
 * runs, rectangles/lines as explicit paths, and image XObjects. It is not a
 * general PDF parser and does not need to be.
 */

import zlib from 'node:zlib';

/* ── text encoding ─────────────────────────────────────────────────────── */

/* The forms use the standard fonts with /WinAnsiEncoding, which matches
   Latin-1 everywhere except 0x80-0x9F. Those bytes are the punctuation this
   app actually writes — em dashes in "Other — Company laptop", curly quotes
   in pasted text — so decoding them as raw Latin-1 turns real content into
   invisible control characters and a search for it silently fails. */
const WIN_ANSI_HIGH = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š',
  0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ',
  0x9E: 'ž', 0x9F: 'Ÿ',
};

function decodeWinAnsi(str) {
  let out = '';
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    out += (code >= 0x80 && code <= 0x9F) ? (WIN_ANSI_HIGH[code] ?? str[i]) : str[i];
  }
  return out;
}

/* ── raw object access ─────────────────────────────────────────────────── */

/* Every indirect object in the file, as { dict, streamStart, streamLen }.
   Objects living inside an /ObjStm are pulled out too — pdf-lib packs the
   page tree in there, and we need it to know the page order. */
function collectObjects(buf) {
  const s = buf.toString('latin1');
  const objects = new Map();
  const streams = [];

  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const streamAt = s.indexOf('stream', bodyStart);
    const endAt = s.indexOf('endobj', bodyStart);
    const hasStream = streamAt !== -1 && (endAt === -1 || streamAt < endAt);
    const dict = s.slice(bodyStart, hasStream ? streamAt : (endAt === -1 ? bodyStart : endAt));
    if (hasStream) {
      // Skip the EOL that must follow the `stream` keyword.
      let p = streamAt + 'stream'.length;
      if (s[p] === '\r') p += 1;
      if (s[p] === '\n') p += 1;
      const len = Number((dict.match(/\/Length\s+(\d+)/) || [])[1] || 0);
      streams.push({ num, dict, start: p, len });
    }
    objects.set(num, { dict, hasStream });
  }

  // Unpack object streams so page dictionaries become visible.
  for (const st of streams) {
    if (!/\/Type\s*\/ObjStm/.test(st.dict)) continue;
    const data = inflateIfNeeded(buf.subarray(st.start, st.start + st.len), st.dict).toString('latin1');
    const n = Number((st.dict.match(/\/N\s+(\d+)/) || [])[1] || 0);
    const first = Number((st.dict.match(/\/First\s+(\d+)/) || [])[1] || 0);
    const header = data.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i += 1) {
      const num = header[i * 2];
      const off = header[i * 2 + 1];
      const end = i + 1 < n ? first + header[(i + 1) * 2 + 1] : data.length;
      objects.set(num, { dict: data.slice(first + off, end), hasStream: false });
    }
  }

  return { objects, streams };
}

function inflateIfNeeded(raw, dict) {
  if (!/\/Filter[^\n]*FlateDecode/.test(dict)) return raw;
  try { return zlib.inflateSync(raw); } catch { return Buffer.alloc(0); }
}

/* Page objects in reading order, walking /Catalog -> /Pages -> /Kids. */
function pageOrder(objects) {
  let catalog = null;
  for (const [num, o] of objects) if (/\/Type\s*\/Catalog/.test(o.dict)) { catalog = num; break; }
  const out = [];
  const seen = new Set();

  const walk = num => {
    if (num == null || seen.has(num)) return;
    seen.add(num);
    const o = objects.get(num);
    if (!o) return;
    if (/\/Type\s*\/Page\b/.test(o.dict)) { out.push(num); return; }
    const kids = (o.dict.match(/\/Kids\s*\[([^\]]*)\]/) || [])[1];
    if (!kids) return;
    for (const k of kids.matchAll(/(\d+)\s+\d+\s+R/g)) walk(Number(k[1]));
  };

  if (catalog != null) {
    const pagesRef = (objects.get(catalog).dict.match(/\/Pages\s+(\d+)\s+\d+\s+R/) || [])[1];
    walk(Number(pagesRef));
  }
  if (out.length === 0) {
    // Fallback: any object typed /Page, in numeric order.
    for (const [num, o] of objects) if (/\/Type\s*\/Page\b/.test(o.dict)) out.push(num);
    out.sort((a, b) => a - b);
  }
  return out;
}

/* ── matrices ──────────────────────────────────────────────────────────── */

const IDENTITY = [1, 0, 0, 1, 0, 0];
/* PDF matrices are [a b c d e f] meaning [[a b 0],[c d 0],[e f 1]]. */
function mul(m, n) {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}
function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
/* Uniform scale factor of a matrix — used to turn a nominal /Tf size into
   the size the glyph actually paints at. Our forms never scale text, so this
   is 1 in practice; it exists so a scaled matrix can't silently lie. */
function scaleOf(m) {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

/* ── content stream tokenizer ──────────────────────────────────────────── */

/* Splits a content stream into tokens. Strings are returned as
   { str: '...' } so a `(` inside text can never be mistaken for syntax. */
function tokenize(src) {
  const toks = [];
  let i = 0;
  const isDelim = c => c === undefined || ' \t\r\n\f\0/[]<>(){}'.includes(c);
  while (i < src.length) {
    const c = src[i];
    if (' \t\r\n\f\0'.includes(c)) { i += 1; continue; }
    if (c === '%') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '(') {
      let depth = 1; i += 1; let out = '';
      while (i < src.length && depth > 0) {
        const ch = src[i];
        if (ch === '\\') {
          const nx = src[i + 1];
          const esc = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
          if (esc[nx] !== undefined) { out += esc[nx]; i += 2; continue; }
          if (nx >= '0' && nx <= '7') {
            let oct = ''; i += 1;
            while (oct.length < 3 && src[i] >= '0' && src[i] <= '7') { oct += src[i]; i += 1; }
            out += String.fromCharCode(parseInt(oct, 8));
            continue;
          }
          out += nx; i += 2; continue;
        }
        if (ch === '(') depth += 1;
        if (ch === ')') { depth -= 1; if (depth === 0) { i += 1; break; } }
        out += ch; i += 1;
      }
      toks.push({ str: out });
      continue;
    }
    if (c === '<' && src[i + 1] !== '<') {
      const end = src.indexOf('>', i);
      const hex = src.slice(i + 1, end === -1 ? src.length : end).replace(/[^0-9A-Fa-f]/g, '');
      let out = '';
      for (let k = 0; k + 1 < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
      if (hex.length % 2) out += String.fromCharCode(parseInt(hex[hex.length - 1] + '0', 16));
      toks.push({ str: out });
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (c === '<' || c === '>') { toks.push(src.slice(i, i + 2)); i += 2; continue; }
    if (c === '[' || c === ']' || c === '{' || c === '}') { toks.push(c); i += 1; continue; }
    let j = i + (c === '/' ? 1 : 0);
    while (!isDelim(src[j])) j += 1;
    toks.push(src.slice(i, j === i ? i + 1 : j));
    i = j === i ? i + 1 : j;
  }
  return toks;
}

/* ── the interpreter ───────────────────────────────────────────────────── */

function runContent(src, pageH, resources) {
  const texts = [];
  const rects = [];
  const lines = [];
  const images = [];

  const toks = tokenize(src);
  let ctm = IDENTITY;
  const stack = [];
  let fill = [0, 0, 0];
  let stroke = [0, 0, 0];
  let lineWidth = 1;

  let tm = IDENTITY;
  let tlm = IDENTITY;
  let fontName = '';
  let fontSize = 0;
  let leading = 0;

  /* Current path, as points in user space, plus whether it was built by the
     rectangle idiom pdfDraw.js emits (m/l/l/l/h). */
  let path = [];

  const nums = [];
  const num = t => (typeof t === 'string' && /^[-+]?[\d.]+$/.test(t) ? Number(t) : null);

  const topY = y => pageH - y;

  const flushPath = (filled, stroked) => {
    if (path.length === 0) return;
    const xs = path.map(p => p[0]);
    const ys = path.map(p => p[1]);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const w = maxX - minX;
    const h = maxY - minY;
    /* Two distinct points is a stroke, more is a box. Classifying by
       dimension alone gets a diagonal wrong: a check mark's two segments each
       have width AND height and would file as tiny boxes. Distinct points,
       because pdf-lib writes a line's starting `m` twice. */
    const distinct = new Set(path.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`)).size;
    if (distinct <= 2 || h < 0.01 || w < 0.01) {
      lines.push({ x: minX, y: topY(maxY), w, h, filled, stroked, thickness: lineWidth, color: stroked ? stroke : fill });
    } else {
      rects.push({ x: minX, y: topY(maxY), w, h, filled, stroked, fillColor: fill.slice(), strokeColor: stroke.slice() });
    }
    path = [];
  };

  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    if (typeof t === 'object') { nums.push(t); continue; }
    const n = num(t);
    if (n !== null) { nums.push(n); continue; }
    if (t[0] === '/') { nums.push(t); continue; }
    if (t === '[' || t === ']') { nums.push(t); continue; }

    const arg = k => nums[nums.length - k];

    switch (t) {
      case 'q': stack.push({ ctm, fill: fill.slice(), stroke: stroke.slice(), lineWidth }); break;
      case 'Q': {
        const s = stack.pop();
        if (s) { ctm = s.ctm; fill = s.fill; stroke = s.stroke; lineWidth = s.lineWidth; }
        break;
      }
      case 'cm': ctm = mul([arg(6), arg(5), arg(4), arg(3), arg(2), arg(1)], ctm); break;
      case 'w': lineWidth = arg(1); break;
      case 'rg': case 'sc': case 'scn': fill = [arg(3), arg(2), arg(1)]; break;
      case 'g': fill = [arg(1), arg(1), arg(1)]; break;
      case 'RG': case 'SC': case 'SCN': stroke = [arg(3), arg(2), arg(1)]; break;
      case 'G': stroke = [arg(1), arg(1), arg(1)]; break;

      case 'm': case 'l': path.push(apply(ctm, arg(2), arg(1))); break;
      case 're': {
        const [x, y, w, h] = [arg(4), arg(3), arg(2), arg(1)];
        path.push(apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h));
        break;
      }
      case 'h': break;
      case 'f': case 'F': case 'f*': flushPath(true, false); break;
      case 'S': case 's': flushPath(false, true); break;
      case 'B': case 'B*': case 'b': case 'b*': flushPath(true, true); break;
      case 'n': path = []; break;

      case 'BT': tm = IDENTITY; tlm = IDENTITY; break;
      case 'ET': break;
      case 'Tf': fontName = String(arg(2) || '').slice(1); fontSize = arg(1); break;
      case 'TL': leading = arg(1); break;
      case 'Td': tlm = mul([1, 0, 0, 1, arg(2), arg(1)], tlm); tm = tlm; break;
      case 'TD': leading = -arg(1); tlm = mul([1, 0, 0, 1, arg(2), arg(1)], tlm); tm = tlm; break;
      case 'Tm': tlm = [arg(6), arg(5), arg(4), arg(3), arg(2), arg(1)]; tm = tlm; break;
      case 'T*': tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;

      case 'Tj': case "'": case '"': {
        const s = nums[nums.length - 1];
        if (s && typeof s === 'object') pushText(s.str);
        break;
      }
      case 'TJ': {
        // Collect the string pieces of the preceding array.
        let k = nums.length - 1;
        let depth = 0;
        const parts = [];
        while (k >= 0) {
          const v = nums[k];
          if (v === ']') depth += 1;
          else if (v === '[') { depth -= 1; if (depth === 0) break; }
          else if (typeof v === 'object' && depth > 0) parts.unshift(v.str);
          k -= 1;
        }
        if (parts.length) pushText(parts.join(''));
        break;
      }

      case 'Do': {
        const name = String(arg(1) || '').slice(1);
        const src2 = resources.images.get(name);
        const [x0, y0] = apply(ctm, 0, 0);
        const [x1, y1] = apply(ctm, 1, 1);
        images.push({
          name,
          x: Math.min(x0, x1),
          y: topY(Math.max(y0, y1)),
          w: Math.abs(x1 - x0),
          h: Math.abs(y1 - y0),
          srcW: src2?.w ?? null,
          srcH: src2?.h ?? null,
        });
        break;
      }
      default: break;
    }

    if (t !== '[' && t !== ']') nums.length = 0;

    function pushText(str) {
      if (!str) return;
      const m2 = mul(tm, ctm);
      const [x, y] = apply(m2, 0, 0);
      texts.push({
        text: decodeWinAnsi(str),
        x,
        y: topY(y),
        size: fontSize * scaleOf(m2),
        font: fontName.replace(/-\d+$/, ''),
        color: fill.slice(),
        rotated: Math.abs(m2[1]) > 0.01 || Math.abs(m2[2]) > 0.01,
      });
    }
  }

  return { texts, rects, lines, images };
}

/* ── entry point ───────────────────────────────────────────────────────── */

export function readPdf(buf) {
  const { objects, streams } = collectObjects(buf);
  const streamByNum = new Map(streams.map(s => [s.num, s]));

  // Image XObjects, by object number, for intrinsic pixel dimensions.
  const imageDims = new Map();
  for (const st of streams) {
    if (!/\/Subtype\s*\/Image/.test(st.dict)) continue;
    imageDims.set(st.num, {
      w: Number((st.dict.match(/\/Width\s+(\d+)/) || [])[1] || 0),
      h: Number((st.dict.match(/\/Height\s+(\d+)/) || [])[1] || 0),
    });
  }

  const pages = pageOrder(objects).map(num => {
    const dict = objects.get(num).dict;
    const box = (dict.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/) || []);
    const width = box.length ? Number(box[3]) - Number(box[1]) : 612;
    const height = box.length ? Number(box[4]) - Number(box[2]) : 792;

    // Map the page's named XObject resources to their intrinsic sizes.
    const resources = { images: new Map() };
    const resBlock = dict.slice(dict.indexOf('/Resources'));
    for (const r of resBlock.matchAll(/\/([A-Za-z0-9#_.-]+)\s+(\d+)\s+\d+\s+R/g)) {
      const dims = imageDims.get(Number(r[2]));
      if (dims) resources.images.set(r[1], dims);
    }

    /* /Contents is either a single reference or an array of them. */
    const contentsRaw = (dict.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/) || [])[1] || '';
    let src = '';
    for (const c of contentsRaw.matchAll(/(\d+)\s+\d+\s+R/g)) {
      const st = streamByNum.get(Number(c[1]));
      if (st) src += inflateIfNeeded(buf.subarray(st.start, st.start + st.len), st.dict).toString('latin1') + '\n';
    }

    const content = runContent(src, height, resources);
    return { width, height, ...content };
  });

  return { pages };
}

/* ── convenience readers ───────────────────────────────────────────────── */

/* All of a page's text as one string, in top-to-bottom / left-to-right
   reading order. Handy for "does the document say X at all" checks. */
export function pageText(page) {
  return [...page.texts]
    .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x))
    .map(t => t.text)
    .join(' ');
}

export function docText(doc) {
  return doc.pages.map(pageText).join('\n');
}

/* Every text run whose string contains `needle`. */
export function findText(doc, needle) {
  const out = [];
  doc.pages.forEach((p, i) => p.texts.forEach(t => {
    if (t.text.includes(needle)) out.push({ ...t, page: i + 1 });
  }));
  return out;
}
