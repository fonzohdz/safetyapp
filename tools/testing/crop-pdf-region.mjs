// Crop + zoom a region of a generated PDF's embedded raster for visual
// inspection. Coordinates are CSS px on the 816x1056 page (scale-agnostic).
//
//   node tools/testing/crop-pdf-region.mjs <pdf> <page> <x> <y> <w> <h> <out.png> [zoom]

import { extractPageRasters } from './extract-pdf-images.mjs';
import { cropZoom } from './analyze-pdf-centering.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [pdfPath, pageStr, xs, ys, ws, hs, outPath, zoomStr] = process.argv.slice(2);
if (!outPath) {
  console.error('Usage: node tools/testing/crop-pdf-region.mjs <pdf> <page> <x> <y> <w> <h> <out.png> [zoom]');
  process.exit(1);
}
const rasters = await extractPageRasters(pdfPath);
const raster = rasters[Number(pageStr) - 1];
if (!raster) { console.error('No raster on that page'); process.exit(1); }
const scale = raster.width / 816;
const zoom = Number(zoomStr || 2);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, cropZoom(raster, Math.round(Number(xs) * scale), Math.round(Number(ys) * scale), Math.round(Number(ws) * scale), Math.round(Number(hs) * scale), zoom));
console.log(`Wrote ${outPath} (${Number(ws)}x${Number(hs)} CSS px at zoom ${zoom}, source scale ${scale.toFixed(2)})`);
