// Objective vertical-centering forensics for generated PDFs.
//
// Works on the *actual embedded raster* (via extract-pdf-images.mjs), never
// the live DOM — see CLAUDE.md Gotchas: html2canvas output diverges from DOM
// geometry in ways DOM measurement cannot predict.
//
//   node tools/testing/analyze-pdf-centering.mjs <pdfPath> <outDir> [--crop-all]
//
// What it does, per page:
//   1. Detects horizontal table border lines (long dark horizontal runs).
//   2. Splits each border-bounded band into cells using vertical border runs.
//   3. For each cell, measures the ink bounding box (text pixels) and
//      reports topGap vs bottomGap in CSS px — i.e. how far the text sits
//      from the borders above/below it.
//   4. Writes a JSON + text report, and 3x zoomed crops of the worst cells
//      (or every cell with --crop-all) for human visual confirmation.
//
// Interpretation notes (not encoded as hard pass/fail):
//   - Descenders (g j p q y) pull inkBottom down ~2-3 CSS px; a cell whose
//     text has descenders will legitimately show bottomGap < topGap.
//   - ALL-CAPS text has no descenders; topGap ≈ bottomGap is expected.
//   - Judge candidates by the zoomed crops, not the numbers alone.

import { extractPageRasters, encodePng } from './extract-pdf-images.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const DARK = 200;       // border luma threshold (#999 borders are luma ~153)
const INK = 170;        // text ink luma threshold (antialiased edges)
const MIN_HLINE_FRAC = 0.55; // fraction of a table's width a horizontal border must span

function toLuma(r) {
  const { pixels, width, height, channels } = r;
  const luma = new Uint8Array(width * height);
  if (channels === 1) { luma.set(pixels.subarray(0, width * height)); return luma; }
  for (let i = 0, p = 0; i < width * height; i += 1, p += 3) {
    luma[i] = (pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114) | 0;
  }
  return luma;
}

// Find maximal horizontal dark runs per row, merge adjacent rows into lines.
function findHorizontalLines(luma, width, height) {
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    let runs = [];
    let start = -1;
    for (let x = 0; x < width; x += 1) {
      const dark = luma[y * width + x] < DARK;
      if (dark && start < 0) start = x;
      else if (!dark && start >= 0) { if (x - start > 200) runs.push([start, x]); start = -1; }
    }
    if (start >= 0 && width - start > 200) runs.push([start, width]);
    if (runs.length) rows.push({ y, runs });
  }
  // merge consecutive rows whose runs overlap into a single "line"
  const lines = [];
  for (const row of rows) {
    for (const [x0, x1] of row.runs) {
      const prev = lines.find(l => Math.abs(l.y1 - row.y) <= 1 && Math.min(l.x1, x1) - Math.max(l.x0, x0) > 100);
      if (prev) { prev.y1 = row.y; prev.x0 = Math.min(prev.x0, x0); prev.x1 = Math.max(prev.x1, x1); }
      else lines.push({ y0: row.y, y1: row.y, x0, x1 });
    }
  }
  return lines;
}

// Vertical border columns inside one band (between two horizontal lines).
function findVerticalBorders(luma, width, band) {
  const { yTop, yBottom, x0, x1 } = band;
  const h = yBottom - yTop;
  if (h <= 4) return [];
  const cols = [];
  for (let x = x0; x < x1; x += 1) {
    let dark = 0;
    for (let y = yTop; y < yBottom; y += 1) if (luma[y * width + x] < DARK) dark += 1;
    if (dark / h > 0.85) cols.push(x);
  }
  // merge adjacent columns
  const borders = [];
  for (const x of cols) {
    const prev = borders[borders.length - 1];
    if (prev && x - prev.x1 <= 1) prev.x1 = x;
    else borders.push({ x0: x, x1: x });
  }
  return borders;
}

function measureInk(luma, width, cell) {
  const { xLeft, xRight, yTop, yBottom } = cell;
  let inkTop = -1, inkBottom = -1, inkLeft = -1, inkRight = -1, inkCount = 0;
  for (let y = yTop; y < yBottom; y += 1) {
    for (let x = xLeft; x < xRight; x += 1) {
      if (luma[y * width + x] < INK) {
        inkCount += 1;
        if (inkTop < 0) inkTop = y;
        inkBottom = y;
        if (inkLeft < 0 || x < inkLeft) inkLeft = x;
        if (x > inkRight) inkRight = x;
      }
    }
  }
  return { inkTop, inkBottom, inkLeft, inkRight, inkCount };
}

export function cropZoom(raster, x, y, w, h, zoom) {
  const { pixels, width, height, channels } = raster;
  x = Math.max(0, x); y = Math.max(0, y);
  w = Math.min(w, width - x); h = Math.min(h, height - y);
  const out = Buffer.alloc(w * zoom * h * zoom * 3);
  for (let yy = 0; yy < h * zoom; yy += 1) {
    const sy = y + (yy / zoom | 0);
    for (let xx = 0; xx < w * zoom; xx += 1) {
      const sx = x + (xx / zoom | 0);
      const si = (sy * width + sx) * channels;
      const di = (yy * w * zoom + xx) * 3;
      if (channels === 3) { out[di] = pixels[si]; out[di + 1] = pixels[si + 1]; out[di + 2] = pixels[si + 2]; }
      else { out[di] = out[di + 1] = out[di + 2] = pixels[si]; }
    }
  }
  return encodePng(out, w * zoom, h * zoom, 3);
}

// Analyze one raster (from a PDF page or a DOM screenshot) — returns cell
// centering entries in CSS-px units regardless of capture scale.
export function analyzeRaster(raster, pageNumber = 1) {
  const report = [];
  {
    const p = pageNumber - 1;
    const { width, height } = raster;
    const scale = width / 816; // 8.5in at 96 CSS dpi
    const luma = toLuma(raster);
    const hlines = findHorizontalLines(luma, width, height);

    // group horizontal lines into vertically-adjacent pairs sharing x-extent
    for (let i = 0; i < hlines.length - 1; i += 1) {
      const top = hlines[i];
      // find nearest line below that overlaps horizontally by most of its width
      let best = null;
      for (let j = i + 1; j < hlines.length; j += 1) {
        const bot = hlines[j];
        const overlap = Math.min(top.x1, bot.x1) - Math.max(top.x0, bot.x0);
        const span = Math.min(top.x1 - top.x0, bot.x1 - bot.x0);
        if (overlap / span > MIN_HLINE_FRAC && bot.y0 > top.y1 + 3) { best = bot; break; }
        if (bot.y0 - top.y1 > 60 * scale) break; // too far — not a table row
      }
      if (!best) continue;
      const band = {
        yTop: top.y1 + 1, yBottom: best.y0 - 1,
        x0: Math.max(top.x0, best.x0), x1: Math.min(top.x1, best.x1),
      };
      const bandH = band.yBottom - band.yTop;
      if (bandH < 8 * scale || bandH > 60 * scale) continue; // not a single-line cell row
      const borders = findVerticalBorders(luma, width, band);
      const edges = [band.x0, ...borders.flatMap(b => [b.x0 - 1, b.x1 + 1]), band.x1];
      const cells = [];
      for (let e = 0; e + 1 < edges.length; e += 2) {
        const xLeft = edges[e] + 3, xRight = edges[e + 1] - 3;
        if (xRight - xLeft < 20) continue;
        cells.push({ xLeft, xRight, yTop: band.yTop, yBottom: band.yBottom });
      }
      cells.forEach((cell, ci) => {
        const ink = measureInk(luma, width, cell);
        if (ink.inkCount < 20) return; // empty cell
        const topGap = (ink.inkTop - cell.yTop) / scale;
        const bottomGap = (cell.yBottom - 1 - ink.inkBottom) / scale;
        const entry = {
          page: p + 1,
          bandYCss: +(band.yTop / scale).toFixed(1),
          bandHCss: +(bandH / scale).toFixed(1),
          cell: ci,
          xCss: +(cell.xLeft / scale).toFixed(1),
          topGap: +topGap.toFixed(2),
          bottomGap: +bottomGap.toFixed(2),
          delta: +(topGap - bottomGap).toFixed(2),
          textHCss: +((ink.inkBottom - ink.inkTop + 1) / scale).toFixed(1),
        };
        report.push({ ...entry, _crop: { raster, x: cell.xLeft - 8, y: band.yTop - 12, w: cell.xRight - cell.xLeft + 16, h: bandH + 24 } });
      });
    }
  }
  return report;
}

export async function analyzePdf(pdfPath, outDir, { cropAll = false } = {}) {
  mkdirSync(outDir, { recursive: true });
  const rasters = await extractPageRasters(pdfPath);
  const report = [];
  rasters.forEach((raster, i) => {
    if (!raster) return;
    report.push(...analyzeRaster(raster, i + 1));
  });

  // sort by |delta| descending; write crops
  const sorted = [...report].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const toCrop = cropAll ? sorted : sorted.slice(0, 24);
  toCrop.forEach((e, i) => {
    const name = `crop-p${e.page}-y${Math.round(e.bandYCss)}-c${e.cell}-d${e.delta}.png`;
    writeFileSync(path.join(outDir, name), cropZoom(e._crop.raster, e._crop.x, e._crop.y, Math.min(e._crop.w, 300 * 2.5) | 0, e._crop.h, 3));
    e.cropFile = name;
  });
  const clean = sorted.map(({ _crop, ...rest }) => rest);
  writeFileSync(path.join(outDir, 'centering-report.json'), JSON.stringify(clean, null, 2));
  return clean;
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'analyze-pdf-centering.mjs';
if (isMain) {
  const [pdfPath, outDir] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const cropAll = process.argv.includes('--crop-all');
  if (!pdfPath || !outDir) {
    console.error('Usage: node tools/testing/analyze-pdf-centering.mjs <pdfPath> <outDir> [--crop-all]');
    process.exit(1);
  }
  const clean = await analyzePdf(pdfPath, outDir, { cropAll });
  console.log(`Analyzed ${clean.length} text-bearing cells. Worst 20 by |topGap - bottomGap| (CSS px):`);
  for (const e of clean.slice(0, 20)) {
    console.log(`  p${e.page} y=${e.bandYCss} cell#${e.cell} x=${e.xCss} h=${e.bandHCss}: top ${e.topGap} / bottom ${e.bottomGap} (delta ${e.delta}) textH=${e.textHCss}${e.cropFile ? ' -> ' + e.cropFile : ''}`);
  }
  console.log(`Full report: ${path.join(outDir, 'centering-report.json')}`);
}
