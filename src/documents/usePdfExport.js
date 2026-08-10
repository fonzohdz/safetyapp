import { useRef, useState } from 'react';
import { capturePagesToPdf, shareGeneratedPdf, downloadGeneratedPdf } from './pdfExportCore';

/* ── Generic PDF export state machine ──
   Same idle -> generating -> ready shape JSA's exportPdf/shareGeneratedPdfClick
   /downloadGeneratedPdfClick and Incident's exportIncidentPdf/share/download
   each hand-write — extracted once for the four new documents. `fingerprint`
   is any string; the caller decides what "the printed content changed"
   means for its own model (see printedIncidentFingerprint for the pattern).

   Returns pageRefsRef — the caller's PDF page-shell component must populate
   pageRefsRef.current = [{ type, el }, ...] in a useLayoutEffect, exactly
   like PdfExportRoot / IncidentPdfExportRoot already do. */
export function usePdfExport({ buildFilename, fingerprint, onGenerated, showToast }) {
  const [pdfExportState, setPdfExportState] = useState(null);
  const pageRefsRef = useRef([]);
  const isPdfStale = pdfExportState?.phase === 'ready' && pdfExportState.fingerprint !== fingerprint;

  async function generate() {
    if (pdfExportState?.phase === 'generating') return;
    const filename = buildFilename();
    try {
      setPdfExportState({ phase: 'generating', status: 'preparing' });
      const { blob, pageCount } = await capturePagesToPdf(pageRefsRef, (pageIndex, totalPages) => {
        setPdfExportState({ phase: 'generating', status: 'rendering', pageIndex, totalPages });
      });
      setPdfExportState({ phase: 'ready', blob, filename, pageCount, fingerprint, shareMessage: null });
      onGenerated?.(pageCount);
    } catch (err) {
      console.error('[pdf export]', err);
      showToast?.(`PDF export failed (${err?.message || 'unknown error'}).`);
      setPdfExportState(null);
    }
  }

  function shareClick() {
    if (!pdfExportState || pdfExportState.phase !== 'ready') return;
    if (isPdfStale) return;
    const file = new File([pdfExportState.blob], pdfExportState.filename, { type: 'application/pdf' });
    const result = shareGeneratedPdf(file);
    if (!result.ok) {
      setPdfExportState(prev => (prev && prev.phase === 'ready' ? { ...prev, shareMessage: result.reason } : prev));
      return;
    }
    result.promise
      .then(() => setPdfExportState(prev => (prev && prev.phase === 'ready' ? { ...prev, shareMessage: null } : prev)))
      .catch(err => {
        if (err && err.name === 'AbortError') return;
        console.error('[pdf share]', err);
        setPdfExportState(prev => (prev && prev.phase === 'ready'
          ? { ...prev, shareMessage: `Sharing failed (${err?.name || err?.message || 'unknown error'}). Try again, or use Download PDF.` }
          : prev));
      });
  }

  function downloadClick() {
    if (!pdfExportState || pdfExportState.phase !== 'ready') return;
    if (isPdfStale) return;
    downloadGeneratedPdf(pdfExportState.blob, pdfExportState.filename);
    showToast?.(`PDF downloaded: ${pdfExportState.filename}`);
  }

  return { pdfExportState, isPdfStale, pageRefsRef, generate, shareClick, downloadClick };
}
