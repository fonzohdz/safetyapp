/* Contract checks for a DRAWN pdf.
 *
 *   const doc = readPdf(buf);
 *   const results = checkPdfContract(doc, { label, pages: [1, 2], draft: false,
 *                                           mustContain: ['Marcus Doyle', ...] });
 *   results.forEach(r => check(r.ok, r.label));
 *
 * WHY THIS SHAPE
 * The four Superintendent forms are drawn with pdfDraw.js, so the printed
 * artifact is no longer a photograph of a web page — it is a list of
 * instructions. That means the things worth protecting are checkable exactly,
 * without golden images:
 *
 *   - the page is Letter and the document is the expected length
 *   - every glyph uses a font and size the kit is allowed to use
 *   - nothing is drawn outside the printable area — text, boxes, rules or images
 *   - no two text runs are stacked on top of each other
 *   - every signing rule is labelled, and every caption has exactly one rule
 *   - a signature is drawn at its own aspect ratio, never squashed
 *   - the DRAFT watermark is present exactly when the document is a draft
 *   - every value the user typed is in the document, complete and untruncated
 *
 * That last one is the point of the whole exercise. Truncation is data loss
 * on a document somebody signs, and a picture-based test never caught it.
 *
 * Text width comes from pdf-lib's own Helvetica metrics — the same numbers
 * pdfDraw.js used to lay the text out — so a "runs past the margin" failure
 * means the drawing was actually wrong, not that the ruler disagreed.
 */

import { PDFDocument, StandardFonts } from 'pdf-lib';

const PT_PER_IN = 72;
export const PAGE_W = 8.5 * PT_PER_IN;
export const PAGE_H = 11 * PT_PER_IN;
export const MARGIN = 0.3 * PT_PER_IN;

/* Every size pdfDraw.js is allowed to set, plus the watermark. A size outside
   this set means somebody hard-coded a one-off instead of using the kit. */
export const APPROVED_SIZES = [7.6, 7.8, 8, 8.5, 9.5, 9.7, 10, 12.5];
const WATERMARK_SIZE = 96;
const APPROVED_FONTS = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'];

let fontsPromise = null;
async function metrics() {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const pdf = await PDFDocument.create();
      return {
        'Helvetica': await pdf.embedFont(StandardFonts.Helvetica),
        'Helvetica-Bold': await pdf.embedFont(StandardFonts.HelveticaBold),
        'Helvetica-Oblique': await pdf.embedFont(StandardFonts.HelveticaOblique),
      };
    })();
  }
  return fontsPromise;
}

/* Width of a drawn run in points, using the font it was actually drawn with. */
function runWidth(fonts, t) {
  const f = fonts[t.font] || fonts['Helvetica'];
  try { return f.widthOfTextAtSize(t.text, t.size); } catch { return 0; }
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* Does this horizontal rule belong to this caption? The kit writes the pair
   two ways round. A signature or date slot puts the caption directly under
   its rule, sharing a left edge. A NAME line reads as a sentence instead —
   "NAME ______" — so the caption sits to the LEFT of a rule that starts just
   past it and runs a few points lower. Both are one rule serving one caption;
   anything else is a defect. */
function servesCaption(rule, cap) {
  const below = cap.y - rule.y;
  if (below >= 4 && below <= 14 && near(rule.x, cap.x, 1.5)) return true;
  const above = rule.y - cap.y;
  return above >= 2 && above <= 10 && rule.x >= cap.x && rule.x <= cap.x + 45;
}

/* Collapse whitespace so a value that wrapped across two drawn lines still
   matches the string the user typed, and fold case — the kit prints section
   titles and bar captions in caps, and a content check should be asking
   whether the words are there and complete, not re-stating a presentation
   choice the drawing code already made. */
const normalize = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export async function checkPdfContract(doc, opts = {}) {
  const {
    label = 'pdf',
    pages = null,          // exact count, or [min, max]
    draft = null,          // true = DRAFT watermark required, false = forbidden
    mustContain = [],      // strings that must appear complete in the document
    mustNotContain = [],
    marginTolerance = 1.5,
  } = opts;

  const fonts = await metrics();
  const out = [];
  const add = (ok, text, detail) => out.push({ ok, label: `${label}: ${text}${detail ? ` — ${detail}` : ''}` });

  /* ── length ──────────────────────────────────────────────────────────── */
  if (pages != null) {
    const [min, max] = Array.isArray(pages) ? pages : [pages, pages];
    const n = doc.pages.length;
    add(n >= min && n <= max, `page count in range`, `got ${n}, expected ${min === max ? min : `${min}-${max}`}`);
  }

  /* ── geometry, fonts, sizes, margins, collisions ─────────────────────── */
  const badSizes = new Set();
  const badFonts = new Set();
  const outside = [];
  const collisions = [];
  const squashed = [];
  const unlabelledRules = [];
  const unruledCaptions = [];
  const doubledRules = [];
  let watermarks = 0;

  doc.pages.forEach((p, pi) => {
    const pageNo = pi + 1;
    add(near(p.width, PAGE_W, 0.5) && near(p.height, PAGE_H, 0.5),
      `page ${pageNo} is US Letter`, `${p.width}x${p.height}pt`);

    const body = [];
    for (const t of p.texts) {
      if (!APPROVED_FONTS.includes(t.font)) badFonts.add(`${t.font} (p${pageNo})`);

      const isWatermark = near(t.size, WATERMARK_SIZE, 0.5) && t.rotated;
      if (isWatermark) { watermarks += 1; continue; }

      if (!APPROVED_SIZES.some(s => near(t.size, s, 0.05))) {
        badSizes.add(`${t.size.toFixed(2)}pt "${t.text.slice(0, 30)}" (p${pageNo})`);
      }

      const w = runWidth(fonts, t);
      const right = t.x + w;
      /* `y` is the baseline; ink runs roughly from cap height above it to
         the descender below. */
      const top = t.y - t.size * 0.72;
      const bottom = t.y + t.size * 0.21;
      if (t.x < MARGIN - marginTolerance || right > PAGE_W - MARGIN + marginTolerance
        || top < MARGIN - marginTolerance || bottom > PAGE_H - MARGIN + marginTolerance) {
        outside.push(`p${pageNo} "${t.text.slice(0, 40)}" x ${t.x.toFixed(1)}-${right.toFixed(1)} y ${top.toFixed(1)}-${bottom.toFixed(1)}`);
      }
      body.push({ ...t, right });
    }

    /* Boxes, rules and images have to respect the margin too. Only text was
       ever checked, which left the more obviously wrong failure uncovered:
       a table column computed too wide, or a signature slot drawn past the
       edge, prints with its right-hand border sliced off by the printer's
       unprintable strip — and no glyph is out of place to give it away. */
    const spills = [
      ...p.rects.map(r => ({ kind: 'box', x: r.x, y: r.y, w: r.w, h: r.h })),
      ...p.lines.map(l => ({ kind: 'rule', x: l.x, y: l.y, w: l.w, h: l.h })),
      ...p.images.map(im => ({ kind: `image ${im.name}`, x: im.x, y: im.y, w: im.w, h: im.h })),
    ];
    for (const s of spills) {
      if (s.x >= MARGIN - marginTolerance && s.x + s.w <= PAGE_W - MARGIN + marginTolerance
        && s.y >= MARGIN - marginTolerance && s.y + s.h <= PAGE_H - MARGIN + marginTolerance) continue;
      outside.push(`p${pageNo} ${s.kind} x ${s.x.toFixed(1)}-${(s.x + s.w).toFixed(1)} y ${s.y.toFixed(1)}-${(s.y + s.h).toFixed(1)}`);
    }

    /* Two runs sharing a baseline whose x-ranges overlap are printing on top
       of each other. Runs are grouped into lines FIRST and only then sorted
       left to right — a label and its value sit ~0.2pt apart vertically, so
       sorting the whole page by y interleaves two columns and reports
       neighbours that are nowhere near each other. */
    const lines = [];
    for (const t of [...body].sort((a, b) => a.y - b.y)) {
      const line = lines[lines.length - 1];
      if (line && near(line.y, t.y, 1.5)) line.runs.push(t);
      else lines.push({ y: t.y, runs: [t] });
    }
    for (const line of lines) {
      line.runs.sort((a, b) => a.x - b.x);
      for (let i = 1; i < line.runs.length; i += 1) {
        const a = line.runs[i - 1];
        const b = line.runs[i];
        if (b.x < a.right - 0.5) {
          collisions.push(`p${pageNo} "${a.text.slice(0, 24)}" overlaps "${b.text.slice(0, 24)}"`);
        }
      }
    }

    /* ── one rule per signature block ─────────────────────────────────── */
    /* A signing rule and the caption naming it are a pair: the rule is the
       line you sign on, the caption is what that line is for. Either half
       alone is a defect on paper — an unlabelled rule is a blank line nobody
       knows what to write on, a caption with no rule is a signature block
       with nowhere to sign, and two rules for one caption is the doubled
       line that a hand-drawn underline plus a slot rule used to produce.
       None of that shows up in a text dump, which is why it is checked here.
       Only the kit draws these: horizontal rules come from signatureRow and
       multiSignatureRow, checkbox ticks are diagonal and far too short. */
    const rules = p.lines.filter(l => l.h < 0.5 && l.w > 20);
    const captions = p.texts.filter(t => !t.rotated && t.size <= 8.05
      && t.font === 'Helvetica' && t.color.every(c => near(c, 0.2, 0.02)));
    for (const cap of captions) {
      const served = rules.filter(r => servesCaption(r, cap));
      if (served.length === 0) unruledCaptions.push(`p${pageNo} "${cap.text.slice(0, 32)}" has no rule`);
      else if (served.length > 1) doubledRules.push(`p${pageNo} "${cap.text.slice(0, 32)}" has ${served.length} rules`);
    }
    for (const r of rules) {
      if (!captions.some(cap => servesCaption(r, cap))) {
        unlabelledRules.push(`p${pageNo} rule at y=${r.y.toFixed(0)} x ${r.x.toFixed(0)}-${(r.x + r.w).toFixed(0)}`);
      }
    }

    /* A signature drawn at anything other than its own proportions is the
       stretched-signature defect coming back. The logo is exempt: it is drawn
       from its own intrinsic ratio by the same rule, so it is checked too. */
    for (const im of p.images) {
      if (!im.srcW || !im.srcH || !im.w || !im.h) continue;
      const drawnAR = im.w / im.h;
      const srcAR = im.srcW / im.srcH;
      if (Math.abs(drawnAR - srcAR) / srcAR > 0.02) {
        squashed.push(`p${pageNo} ${im.name} drawn ${drawnAR.toFixed(3)} vs source ${srcAR.toFixed(3)}`);
      }
    }
  });

  /* ── rows must close ─────────────────────────────────────────────────── */
  /* Medical Event once printed a row that stopped halfway across the page,
     because in HTML a table row with fewer cells simply draws no border for
     the missing half. pdfDraw.js can't do that: every box it draws spans the
     current column, and the only legal columns are the full width or one
     half of a twoCol block. So the invariant worth asserting is exactly
     that — a band of boxes that doesn't fill a legal column is a row that
     didn't close.

     Cells within a row are unioned into one band first. Checkbox squares are
     too small to be rows and are excluded; they sit inside a column rather
     than defining one. */
  const half = (PAGE_W - MARGIN * 2 - 12) / 2;
  const legalColumns = [
    [MARGIN, PAGE_W - MARGIN],
    [MARGIN, MARGIN + half],
    [PAGE_W - MARGIN - half, PAGE_W - MARGIN],
  ];
  const shortRows = [];
  doc.pages.forEach((p, pi) => {
    const bands = [];
    for (const r of p.rects.filter(r => r.h >= 12 && r.w >= 60).sort((a, b) => a.y - b.y || a.x - b.x)) {
      const band = bands[bands.length - 1];
      if (band && near(band.y, r.y, 1) && near(band.h, r.h, 1)) {
        band.minX = Math.min(band.minX, r.x);
        band.maxX = Math.max(band.maxX, r.x + r.w);
      } else {
        bands.push({ y: r.y, h: r.h, minX: r.x, maxX: r.x + r.w });
      }
    }
    for (const b of bands) {
      if (legalColumns.some(([l, r]) => near(b.minX, l, 1.5) && near(b.maxX, r, 1.5))) continue;
      shortRows.push(`p${pi + 1} row at y=${b.y.toFixed(0)} spans ${b.minX.toFixed(0)}-${b.maxX.toFixed(0)}pt`);
    }
  });
  add(shortRows.length === 0, 'every row fills its column', shortRows.slice(0, 4).join('; '));

  add(badFonts.size === 0, 'only approved fonts used', badFonts.size ? [...badFonts].join(', ') : '');
  add(badSizes.size === 0, 'all font sizes from the approved set', badSizes.size ? [...badSizes].slice(0, 4).join('; ') : '');
  add(outside.length === 0, 'nothing drawn outside the printable area', outside.slice(0, 4).join('; '));
  add(collisions.length === 0, 'no text printed on top of other text', collisions.slice(0, 4).join('; '));
  add(squashed.length === 0, 'images keep their own aspect ratio', squashed.slice(0, 4).join('; '));
  add(unruledCaptions.length === 0, 'every signature caption has a rule to sign on', unruledCaptions.slice(0, 4).join('; '));
  add(unlabelledRules.length === 0, 'every rule is labelled', unlabelledRules.slice(0, 4).join('; '));
  add(doubledRules.length === 0, 'exactly one rule per signature block', doubledRules.slice(0, 4).join('; '));

  /* ── draft watermark ─────────────────────────────────────────────────── */
  if (draft !== null) {
    if (draft) add(watermarks === doc.pages.length, 'DRAFT watermark on every page', `${watermarks} of ${doc.pages.length}`);
    else add(watermarks === 0, 'no DRAFT watermark on a completed document', `found ${watermarks}`);
  }

  /* ── content completeness ────────────────────────────────────────────── */
  /* Two readings of the same page, because text wraps two different ways.
     Reading order catches a sentence that flowed across lines. But a table
     cell wraps INSIDE its column — "Effective Separation Date" prints as
     "Effective Separation" / "Date" with the value cell's text in between —
     so reading order alone would report that complete label as missing.
     Wrapped lines always share a left edge, so grouping runs by x and
     joining top to bottom reassembles them. A needle found in either
     reading is present. */
  const haystacks = [];
  for (const p of doc.pages) {
    haystacks.push(normalize(p.texts
      .slice()
      .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x))
      .map(t => t.text)
      .join(' ')));

    const columns = new Map();
    for (const t of p.texts) {
      const key = Math.round(t.x * 2) / 2;
      if (!columns.has(key)) columns.set(key, []);
      columns.get(key).push(t);
    }
    for (const runs of columns.values()) {
      haystacks.push(normalize(runs.sort((a, b) => a.y - b.y).map(t => t.text).join(' ')));
    }
  }
  const haystack = haystacks.join('\n');

  for (const needle of mustContain) {
    add(haystack.includes(normalize(needle)), `document contains "${String(needle).slice(0, 48)}"`);
  }
  for (const needle of mustNotContain) {
    add(!haystack.includes(normalize(needle)), `document does not contain "${String(needle).slice(0, 48)}"`);
  }

  return out;
}

/* Which checkboxes are actually ticked in the printed document.
 *
 * checkboxGrid() draws an 8pt square and, when the option is on, two short
 * strokes inside it. Reading the strokes rather than the bold label means
 * this reports what a person would see on paper, which is the point: the
 * Medical Event suite has to prove the app never infers a classification the
 * user didn't choose. The label sits immediately right of its own box on the
 * same line, so proximity identifies it unambiguously. */
export function checkedOptions(doc) {
  const on = [];
  for (const p of doc.pages) {
    for (const box of p.rects.filter(r => near(r.w, 8, 1) && near(r.h, 8, 1))) {
      const ticked = p.lines.some(l =>
        l.x >= box.x - 1 && l.x <= box.x + box.w + 1 && l.y >= box.y - 1 && l.y <= box.y + box.h + 1);
      if (!ticked) continue;
      const label = p.texts.find(t => near(t.x, box.x + 13, 1.5) && t.y > box.y && t.y < box.y + box.h + 4);
      if (label) on.push(label.text);
    }
  }
  return on;
}
