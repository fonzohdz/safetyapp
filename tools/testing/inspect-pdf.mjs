/* Dump what a DRAWN pdf actually contains — text, sizes, positions, boxes.
 *
 *   node tools/testing/inspect-pdf.mjs <pdf> [--full]
 *
 * render-pdf.mjs shows you what a drawn PDF LOOKS like. This shows you what
 * it SAYS: every text run with its exact string, font, size and position, so
 * a truncation, a wrong font size or a run outside the margins is readable
 * without squinting at an image. Use both.
 */

import { readFileSync } from 'node:fs';
import { readPdf, pageText } from './lib/readPdf.mjs';

const [pdfPath, ...flags] = process.argv.slice(2);
if (!pdfPath) {
  console.error('Usage: node tools/testing/inspect-pdf.mjs <pdf> [--full]');
  process.exit(1);
}
const full = flags.includes('--full');

const doc = readPdf(readFileSync(pdfPath));
console.log(`${pdfPath}: ${doc.pages.length} page(s)`);

doc.pages.forEach((p, i) => {
  console.log(`\n=== PAGE ${i + 1} — ${p.width}x${p.height}pt — ${p.texts.length} text runs, ${p.rects.length} boxes, ${p.lines.length} rules, ${p.images.length} images`);
  console.log(`  font sizes: ${[...new Set(p.texts.map(t => +t.size.toFixed(2)))].sort((a, b) => a - b).join(', ')}`);
  console.log(`  fonts: ${[...new Set(p.texts.map(t => t.font))].join(', ')}`);
  p.images.forEach(im => {
    const drawnAR = im.w / im.h;
    const srcAR = im.srcW && im.srcH ? im.srcW / im.srcH : null;
    console.log(`  image ${im.name}: ${im.w.toFixed(1)}x${im.h.toFixed(1)}pt at (${im.x.toFixed(1)}, ${im.y.toFixed(1)}), source ${im.srcW}x${im.srcH}px`
      + (srcAR ? `, aspect drawn ${drawnAR.toFixed(3)} vs source ${srcAR.toFixed(3)}` : ''));
  });

  if (full) {
    console.log('  --- text runs (top to bottom) ---');
    [...p.texts]
      .sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x))
      .forEach(t => console.log(`    y=${t.y.toFixed(1).padStart(6)} x=${t.x.toFixed(1).padStart(6)} ${String(t.size).padStart(5)}pt ${t.font.padEnd(16)} ${t.rotated ? '[rot] ' : ''}"${t.text}"`));
  } else {
    console.log('  --- reading order ---');
    console.log('  ' + pageText(p));
  }
});
