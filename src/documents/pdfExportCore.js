import { PDFDocument } from 'pdf-lib';
import html2canvas from 'html2canvas';

/* ── Generic client-side PDF capture/share/download ──
   Same approach JSA's generateJsaPdf and Incident's generateIncidentPdf
   each already use (html2canvas capture of already-rendered US-Letter DOM
   pages, one at a time, assembled with pdf-lib) — extracted here as the
   ONE shared implementation for the four new documents added in this
   mission, instead of writing a third/fourth/fifth near-identical copy of
   this ~60-line loop. JSA and Incident keep their own existing copies
   untouched (see main.jsx / incidentPdfGenerate.jsx) — not worth the
   regression risk of retrofitting stable, already-shipped export code onto
   a shared helper written after the fact.

   pageRefsRef.current must be an array of { type, el } — `type` is used
   only for error messages. */

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function capturePagesToPdf(pageRefsRef, onProgress) {
  const pages = pageRefsRef.current;
  if (!pages.length) throw new Error('No pages to export — the document plan is empty.');

  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* non-fatal */ }
  }
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const isTouchPrimary = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches;
  const scale = isTouchPrimary ? 2 : 2.5;

  const pdfDoc = await PDFDocument.create();
  const PT_PER_IN = 72;
  const LETTER_WIDTH_PT = 8.5 * PT_PER_IN;
  const LETTER_HEIGHT_PT = 11 * PT_PER_IN;

  for (let i = 0; i < pages.length; i += 1) {
    const { type, el } = pages[i];
    onProgress?.(i + 1, pages.length);
    if (!el) throw new Error(`Page ${i + 1} of ${pages.length} (${type}) did not render — export aborted.`);

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Page ${i + 1} of ${pages.length} (${type}) has no measurable size — export aborted.`);
    }

    let canvas;
    try {
      canvas = await html2canvas(el, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false });
    } catch (err) {
      throw new Error(`Failed to render page ${i + 1} of ${pages.length} (${type}): ${err?.message || err}`);
    }
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error(`Page ${i + 1} of ${pages.length} (${type}) captured empty — export aborted.`);
    }

    const pngBytes = dataUrlToUint8Array(canvas.toDataURL('image/png'));
    const pngImage = await pdfDoc.embedPng(pngBytes);
    const pdfPage = pdfDoc.addPage([LETTER_WIDTH_PT, LETTER_HEIGHT_PT]);
    pdfPage.drawImage(pngImage, { x: 0, y: 0, width: LETTER_WIDTH_PT, height: LETTER_HEIGHT_PT });

    canvas.width = 0;
    canvas.height = 0;
    canvas = null;
  }

  const pdfBytes = await pdfDoc.save();

  const verifyDoc = await PDFDocument.load(pdfBytes);
  const pageCount = verifyDoc.getPageCount();
  if (pageCount !== pages.length) {
    throw new Error(`Generated PDF has ${pageCount} pages but the plan has ${pages.length} — export aborted.`);
  }

  return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), pageCount };
}

/* Identical contract/behavior to main.jsx's shareGeneratedPdf — see that
   function's own comment for why this must be called with no awaited work
   beforehand (transient user activation). */
export function shareGeneratedPdf(file) {
  if (typeof navigator === 'undefined' || !navigator.share) {
    return { ok: false, reason: 'Sharing is not supported on this browser — use Download PDF instead.' };
  }
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
    return { ok: false, reason: 'Sharing this file is not supported on this browser — use Download PDF instead.' };
  }
  const sharePromise = navigator.share({ files: [file], title: file.name });
  return { ok: true, promise: sharePromise };
}

export function downloadGeneratedPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
