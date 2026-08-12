/* ── Draw-it-directly PDF kit ──────────────────────────────────────────────
   The "stencil kit" for building a Shackelford form straight into a PDF,
   instead of rendering it as a web page and photographing it.

   WHY THIS EXISTS
   The existing pipeline (pdfExportCore.js) renders the form as DOM, screen-
   shots it with html2canvas, and staples the pictures into a PDF. That means
   the finished document is an IMAGE of a form, and whatever the browser did
   while taking the picture is baked in permanently. Every rendering defect
   this project has fought came from that one fact:
     - html2canvas mis-measured the text baseline and painted all text ~8px
       low inside correct boxes;
     - iOS Safari inflated small text in wide blocks before the screenshot,
       so an iPad produced different typography than a laptop;
     - html2canvas ignores object-fit, so a signature stretched to whatever
       box it was given.
   None of those are possible here. We are told exactly how wide and tall a
   piece of text is BEFORE drawing it, so centering is arithmetic rather than
   a calibrated fudge constant, and no browser draws anything.

   COORDINATES
   pdf-lib's origin is the BOTTOM-left corner with y increasing upward, which
   is the opposite of how a form is read and written. Everything in this file
   works in top-down points (y = 0 at the top edge of the page) and converts
   once, in `flip()`, at the moment of drawing. Do not mix the two.

   UNITS
   Points throughout: 72pt = 1 inch. US Letter = 612 x 792pt. The old CSS
   sizes carry over directly because CSS pt and PDF pt are the same unit —
   a 9.5pt gray bar title is still 9.5pt here. */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_IN = 72;
export const PAGE_W = 8.5 * PT_PER_IN;
export const PAGE_H = 11 * PT_PER_IN;
const MARGIN = 0.3 * PT_PER_IN;
export const CONTENT_W = PAGE_W - MARGIN * 2;

/* Helvetica is metric-compatible with Arial and is built into every PDF
   reader, so nothing has to be embedded and the file stays small. These are
   the standard AFM metrics per 1000 units. */
const CAP_HEIGHT = 0.718;
const DESCENDER = 0.207;

const INK = rgb(0, 0, 0);
const RULE = rgb(0.6, 0.6, 0.6);
const RULE_DARK = rgb(0.2, 0.2, 0.2);
const GRAY_FILL = rgb(0.851, 0.851, 0.851);
const TINT_FILL = rgb(0.949, 0.949, 0.949);
const LABEL_FILL = rgb(0.937, 0.937, 0.937);
const RED = rgb(0.757, 0.071, 0.122);
const MUTED = rgb(0.2, 0.2, 0.2);

/* Baseline offset from the TOP of a box, such that the text's ink block sits
   optically centered in it. The ink block runs from the cap height above the
   baseline to the descender below it, so centering that block in a box of
   height h puts the baseline at (h + cap - desc) / 2. This is the whole
   reason this rewrite exists: the old pipeline had to guess this number and
   apply it as a hand-tuned constant per element family. */
function centeredBaseline(h, size) {
  return (h + CAP_HEIGHT * size - DESCENDER * size) / 2;
}

/* Baseline offset from the top of a box for TOP-set text (writing boxes),
   leaving `pad` of clear space above the tallest letter. */
function topBaseline(pad, size) {
  return pad + CAP_HEIGHT * size;
}

export async function createFormPdf({ formTitle, logoBytes, draft, watermarkText = 'DRAFT' }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logo = logoBytes ? await pdf.embedPng(logoBytes).catch(() => null) : null;

  const pages = [];
  let page = null;
  let y = 0; // top-down cursor

  const flip = topY => PAGE_H - topY;
  const widthOf = (text, size, f = font) => f.widthOfTextAtSize(String(text ?? ''), size);

  function drawTextAt(text, x, topBaselineY, size, f = font, color = INK) {
    const str = String(text ?? '');
    if (!str) return;
    page.drawText(str, { x, y: flip(topBaselineY), size, font: f, color });
  }

  function rect(x, topY, w, h, { fill, border, borderWidth = 0.75 } = {}) {
    page.drawRectangle({
      x, y: flip(topY + h), width: w, height: h,
      ...(fill ? { color: fill } : {}),
      ...(border ? { borderColor: border, borderWidth } : {}),
    });
  }

  function line(x1, topY1, x2, topY2, { color = RULE_DARK, thickness = 0.75 } = {}) {
    page.drawLine({ start: { x: x1, y: flip(topY1) }, end: { x: x2, y: flip(topY2) }, color, thickness });
  }

  /* Greedy word wrap. Returns an array of lines that each fit `maxW`. A word
     longer than the line (a pasted URL, an unbroken ID) is hard-split rather
     than allowed to run past the box edge. */
  function wrap(text, maxW, size, f = font) {
    const out = [];
    for (const paragraph of String(text ?? '').split('\n')) {
      if (!paragraph.trim()) { out.push(''); continue; }
      let cur = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = cur ? `${cur} ${word}` : word;
        if (widthOf(next, size, f) <= maxW) { cur = next; continue; }
        if (cur) out.push(cur);
        if (widthOf(word, size, f) <= maxW) { cur = word; continue; }
        let chunk = '';
        for (const ch of word) {
          if (widthOf(chunk + ch, size, f) > maxW) { out.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        cur = chunk;
      }
      if (cur) out.push(cur);
    }
    return out.length ? out : [''];
  }

  const HEADER_H = 46;
  function newPage(continuation) {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    // Watermark first so every later mark sits on top of it.
    if (draft) {
      const size = 96;
      const w = widthOf(watermarkText, size, bold);
      page.drawText(watermarkText, {
        x: PAGE_W / 2 - w / 2 - 40, y: PAGE_H / 2 - 170,
        size, font: bold, color: rgb(0.98, 0.90, 0.91), rotate: { type: 'degrees', angle: 32 },
      });
    }
    if (logo) {
      const h = 30;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: MARGIN, y: flip(MARGIN + h), width: w, height: h });
    }
    const titleSize = 12.5;
    const tw = widthOf(formTitle, titleSize, bold);
    drawTextAt(formTitle, PAGE_W / 2 - tw / 2, MARGIN + 20, titleSize, bold);
    if (continuation) {
      const cw = widthOf('CONTINUATION', 8.5, bold);
      drawTextAt('CONTINUATION', PAGE_W / 2 - cw / 2, MARGIN + 32, 8.5, bold, RED);
    }
    const pageLabel = `Page ${pages.length}`;
    drawTextAt(pageLabel, PAGE_W - MARGIN - widthOf(pageLabel, 8.5), MARGIN + 16, 8.5, font, MUTED);
    rect(MARGIN, MARGIN + HEADER_H - 4, CONTENT_W, 2.2, { fill: RED });
    y = MARGIN + HEADER_H + 6;
  }

  const bottomLimit = () => PAGE_H - MARGIN;
  function ensure(h) {
    if (!page) { newPage(false); return; }
    if (y + h > bottomLimit()) newPage(true);
  }

  const api = {
    get cursor() { return y; },
    space(h) { y += h; },

    /* MAJOR section divider. */
    grayBar(text) {
      const size = 9.5;
      const h = 17;
      ensure(h + 4);
      rect(MARGIN, y, CONTENT_W, h, { fill: GRAY_FILL, border: RULE });
      drawTextAt(String(text).toUpperCase(), MARGIN + 7, y + centeredBaseline(h, size), size, bold);
      y += h;
    },

    /* Numbered subsection caption band — the header OF the box beneath it,
       so it shares that box's border and carries a lighter tint than a major
       gray bar. */
    numberedBar(number, text) {
      const size = 9.5;
      const h = 17;
      ensure(h + 20);
      rect(MARGIN, y, CONTENT_W, h, { fill: TINT_FILL, border: RULE });
      let x = MARGIN + 7;
      if (number != null) {
        drawTextAt(`${number}.`, x, y + centeredBaseline(h, size), size, bold);
        x += 13;
      }
      drawTextAt(String(text).toUpperCase(), x, y + centeredBaseline(h, size), size, bold);
      y += h;
    },

    /* Subsection label — the bare bold caption above a field. */
    fieldLabel(text) {
      const size = 9.5;
      const h = 13;
      ensure(h + 16);
      drawTextAt(String(text).toUpperCase(), MARGIN, y + centeredBaseline(h, size), size, bold);
      y += h;
    },

    /* Rows of [label, value] or [label, value, label, value]. `labelW` is a
       fraction of the content width. */
    infoTable(rows, labelW = 0.32) {
      const labelSize = 9.5;
      const valueSize = 10;
      const rowH = 19;
      for (const row of rows) {
        ensure(rowH);
        const cells = row.length === 4
          ? [
            { w: CONTENT_W * labelW, label: true, text: row[0] },
            { w: CONTENT_W * (0.5 - labelW), label: false, text: row[1] },
            { w: CONTENT_W * labelW, label: true, text: row[2] },
            { w: CONTENT_W * (0.5 - labelW), label: false, text: row[3] },
          ]
          : [
            { w: CONTENT_W * labelW, label: true, text: row[0] },
            { w: CONTENT_W * (1 - labelW), label: false, text: row[1] },
          ];
        let x = MARGIN;
        for (const c of cells) {
          rect(x, y, c.w, rowH, { fill: c.label ? LABEL_FILL : undefined, border: RULE });
          const size = c.label ? labelSize : valueSize;
          const f = c.label ? bold : font;
          const maxW = c.w - 12;
          let text = String(c.text ?? '');
          while (text && widthOf(text, size, f) > maxW) text = text.slice(0, -1);
          drawTextAt(text, x + 6, y + centeredBaseline(rowH, size), size, f);
          x += c.w;
        }
        y += rowH;
      }
    },

    /* A writing box. Text is TOP-set, like every paper form. Grows to fit
       its content, never below minH. */
    textBox({ title, text, minH = 38 }) {
      const size = 9.7;
      const lead = size * 1.32;
      const padX = 7;
      const padY = 6;
      if (title) this.fieldLabel(title);
      const lines = wrap(text, CONTENT_W - padX * 2, size);
      const needed = Math.max(minH, padY * 2 + lines.length * lead);
      ensure(needed);
      rect(MARGIN, y, CONTENT_W, needed, { border: RULE });
      let by = y + topBaseline(padY, size);
      for (const ln of lines) {
        drawTextAt(ln, MARGIN + padX, by, size, font);
        by += lead;
      }
      y += needed;
    },

    /* Check-all-that-apply grid. `columns` defaults to 2. */
    checkboxGrid({ options, checked, columns = 2 }) {
      const list = Array.isArray(checked) ? checked : [checked].filter(Boolean);
      const size = 9.5;
      const rowH = 14;
      const box = 8;
      const colW = CONTENT_W / columns;
      const rows = Math.ceil(options.length / columns);
      ensure(rows * rowH + 4);
      y += 2;
      options.forEach((opt, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const x = MARGIN + col * colW;
        const topY = y + row * rowH;
        const isOn = list.includes(opt);
        const boxTop = topY + (rowH - box) / 2;
        rect(x, boxTop, box, box, { border: RULE_DARK, borderWidth: 0.9 });
        if (isOn) {
          // A drawn tick, not a glyph — no font can decide to render it oddly.
          line(x + 1.6, boxTop + box * 0.55, x + box * 0.42, boxTop + box - 1.6, { color: INK, thickness: 1.1 });
          line(x + box * 0.42, boxTop + box - 1.6, x + box - 1.2, boxTop + 1.4, { color: INK, thickness: 1.1 });
        }
        drawTextAt(opt, x + box + 5, topY + centeredBaseline(rowH, size), size, isOn ? bold : font);
      });
      y += rows * rowH + 2;
    },

    /* One signature + date pair. The slot owns the single signing rule; the
       caption below it draws none. */
    signatureRow({ label: sigLabel, dateLabel = 'Date', image, dateValue, note }) {
      const slotH = 40;
      const capSize = 8;
      const capH = 12;
      ensure(slotH + capH + 8);
      y += 6;
      const gap = 12;
      const sigW = CONTENT_W * 0.64;
      const dateW = CONTENT_W - sigW - gap;
      const dateX = MARGIN + sigW + gap;

      if (note) {
        const nw = widthOf(note, 7.8, italic);
        drawTextAt(note, MARGIN + sigW / 2 - nw / 2, y + slotH - 6, 7.8, italic, rgb(0.47, 0.47, 0.47));
      } else if (image) {
        // Drawn at the image's own aspect ratio — never stretched to the line.
        const h = Math.min(slotH - 2, image.height);
        const scale = h / image.height;
        const w = Math.min(image.width * scale, sigW - 4);
        const hh = w / image.width * image.height;
        page.drawImage(image, { x: MARGIN + 2, y: flip(y + slotH - 1), width: w, height: hh });
      }
      line(MARGIN, y + slotH, MARGIN + sigW, y + slotH);
      drawTextAt(String(sigLabel).toUpperCase(), MARGIN, y + slotH + topBaseline(3, capSize), capSize, font, MUTED);

      if (dateValue) drawTextAt(dateValue, dateX + 2, y + slotH - 4, 10, font);
      line(dateX, y + slotH, MARGIN + CONTENT_W, y + slotH);
      drawTextAt(String(dateLabel).toUpperCase(), dateX, y + slotH + topBaseline(3, capSize), capSize, font, MUTED);
      y += slotH + capH + 4;
    },

    async embedSignature(dataUrl) {
      if (!dataUrl || typeof dataUrl !== 'string') return null;
      try {
        const base64 = dataUrl.split(',')[1] || '';
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        return dataUrl.includes('image/jpeg') ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      } catch { return null; }
    },

    /* Stamps the real total onto every page's "Page N" once the document is
       complete — the count isn't knowable while drawing. */
    async finish() {
      const total = pages.length;
      pages.forEach((p, i) => {
        const label = `Page ${i + 1} of ${total}`;
        const w = widthOf(label, 8.5);
        // Cover the provisional label, then write the full one.
        p.drawRectangle({
          x: PAGE_W - MARGIN - 80, y: PAGE_H - (MARGIN + 20), width: 80, height: 14, color: rgb(1, 1, 1),
        });
        p.drawText(label, {
          x: PAGE_W - MARGIN - w, y: PAGE_H - (MARGIN + 16), size: 8.5, font, color: MUTED,
        });
      });
      const bytes = await pdf.save();
      return { blob: new Blob([bytes], { type: 'application/pdf' }), pageCount: total };
    },
  };

  newPage(false);
  return api;
}

/* The logo ships as .webp, which PDFs cannot embed. Decode it once through a
   canvas and hand back PNG bytes. */
export async function loadLogoPngBytes(url) {
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] || '';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch { return null; }
}
