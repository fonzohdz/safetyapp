import { useLayoutEffect, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { isIncidentPrintFinal, printedIncidentFingerprint } from './incidentModel';
import {
  IncidentPageShell, Page1Content, Page2Content, Page3Content, Page4Content, Page5Content, Page6Content, ContinuationPage,
} from './IncidentPdf';
import {
  textBlockMeasureStyle, DESCRIPTION_FIRST_HEIGHT_PX, STATEMENT_FIRST_HEIGHT_PX, NOTES_FIRST_HEIGHT_PX, CONTINUATION_BODY_HEIGHT_PX,
} from './incidentPdfLayout';
import { paginateText } from './textFit';

function paginateField(text) {
  return paginateText(text, {
    firstMaxHeightPx: DESCRIPTION_FIRST_HEIGHT_PX,
    firstStyle: textBlockMeasureStyle(),
    continuationMaxHeightPx: CONTINUATION_BODY_HEIGHT_PX,
    continuationStyle: textBlockMeasureStyle(),
  });
}
function paginateStatement(text) {
  return paginateText(text, {
    firstMaxHeightPx: STATEMENT_FIRST_HEIGHT_PX,
    firstStyle: textBlockMeasureStyle(),
    continuationMaxHeightPx: CONTINUATION_BODY_HEIGHT_PX,
    continuationStyle: textBlockMeasureStyle(),
  });
}
function paginateNotes(text) {
  return paginateText(text, {
    firstMaxHeightPx: NOTES_FIRST_HEIGHT_PX,
    firstStyle: textBlockMeasureStyle(),
    continuationMaxHeightPx: CONTINUATION_BODY_HEIGHT_PX,
    continuationStyle: textBlockMeasureStyle(),
  });
}

/* Builds the ordered list of logical pages (base pages + any continuation
   pages needed for overflowing long-text fields), plus the list of any
   field labels whose text could not be confirmed to fit (see textFit.js).
   Pure function of the incident's text content -- used both to render the
   (always-mounted, off-screen) export DOM on every relevant keystroke and,
   via getIncidentPdfOverflowFields(), as an export preflight check. */
export function buildIncidentPagePlan(incident) {
  const description = paginateField(incident.detailedIncidentDescription);
  const witnesses = incident.witnesses || [];
  const statements = witnesses.map(w => paginateStatement(w.statement));
  const supervisorNotes = paginateNotes(incident.supervisorNotes);
  const safetyConsultantNotes = paginateNotes(incident.safetyConsultantNotes);

  const overflowFields = [];
  if (description.overflow) overflowFields.push('Detailed Description of the Incident');
  statements.forEach((s, i) => { if (s.overflow) overflowFields.push(`Witness ${i + 1} Statement`); });
  if (supervisorNotes.overflow) overflowFields.push('Superintendent/Supervisor Notes & Summary');
  if (safetyConsultantNotes.overflow) overflowFields.push('Safety Consultant Notes & Summary');

  const descriptionChunks = description.chunks;
  const statementChunks = statements.map(s => s.chunks);
  const supervisorNotesChunks = supervisorNotes.chunks;
  const safetyConsultantNotesChunks = safetyConsultantNotes.chunks;

  const pages = [];
  pages.push({ key: 'p1', type: 'page1', props: { descriptionText: descriptionChunks[0] } });
  descriptionChunks.slice(1).forEach((chunk, i) => {
    pages.push({ key: `p1c${i}`, type: 'continuation', props: { sectionLabel: 'Detailed Description of the Incident', text: chunk } });
  });

  pages.push({ key: 'p2', type: 'page2', props: {} });

  pages.push({ key: 'p3', type: 'page3', props: { statementChunks } });
  [0, 1].forEach(wIdx => {
    (statementChunks[wIdx] || []).slice(1).forEach((chunk, i) => {
      pages.push({ key: `p3c${wIdx}_${i}`, type: 'continuation', props: { sectionLabel: `Witness ${wIdx + 1} Statement`, text: chunk } });
    });
  });

  pages.push({ key: 'p4', type: 'page4', props: { statementChunks } });
  (statementChunks[2] || []).slice(1).forEach((chunk, i) => {
    pages.push({ key: `p4c${i}`, type: 'continuation', props: { sectionLabel: 'Witness 3 Statement', text: chunk } });
  });

  pages.push({ key: 'p5', type: 'page5', props: {} });

  pages.push({ key: 'p6', type: 'page6', props: { supervisorNotesChunk: supervisorNotesChunks[0], safetyConsultantNotesChunk: safetyConsultantNotesChunks[0] } });
  supervisorNotesChunks.slice(1).forEach((chunk, i) => {
    pages.push({ key: `p6sc${i}`, type: 'continuation', props: { sectionLabel: 'Superintendent/Supervisor Notes & Summary', text: chunk } });
  });
  safetyConsultantNotesChunks.slice(1).forEach((chunk, i) => {
    pages.push({ key: `p6cc${i}`, type: 'continuation', props: { sectionLabel: 'Safety Consultant Notes & Summary', text: chunk } });
  });

  return { pages, overflowFields };
}

/* Export preflight check: which (if any) long-text fields could not be
   confirmed to fit within their base box + continuation pages. Call this
   before generateIncidentPdf() and abort with a clear message if it
   returns anything -- never generate (or silently accept) a PDF that may
   have clipped content. */
export function getIncidentPdfOverflowFields(incident) {
  return buildIncidentPagePlan(incident).overflowFields;
}

const PAGE_COMPONENTS = {
  page1: Page1Content,
  page2: Page2Content,
  page3: Page3Content,
  page4: Page4Content,
  page5: Page5Content,
  page6: Page6Content,
};

export function IncidentPdfExportRoot({ incident, pageRefsRef }) {
  const elRefs = useRef({});
  const draft = !isIncidentPrintFinal(incident);

  const { pages } = useMemo(() => buildIncidentPagePlan(incident), [
    incident.detailedIncidentDescription,
    incident.witnesses,
    incident.supervisorNotes,
    incident.safetyConsultantNotes,
    incident.workplaceLocation,
    incident.incidentDate,
    incident.incidentTime,
    incident.writtenReportDateTime,
    incident.reportedToSupervisorDateTime,
    incident.investigatorName,
    incident.investigatorTitle,
    incident.investigatorPhone,
    incident.investigatorEmail,
    incident.incidentSpecificLocation,
    incident.injuryOccurred,
    incident.injuredPartyName,
    incident.injuredPartyTitle,
    incident.injuredPartyYearsWithCompany,
    incident.injuredPartyCurrentTrade,
    incident.injuredPartyPhone,
    incident.injuredPartyEmail,
    incident.injuryNature,
    incident.injuryNatureOther,
    incident.bodyPartsAffectedText,
    incident.treatmentLevel,
    incident.treatingPhysicianOrClinic,
    incident.injuryRemarks,
    incident.bodyDiagramMarks,
    incident.propertyDamageOccurred,
    incident.propertyOrMaterialDamaged,
    incident.natureOfDamage,
    incident.objectMachineToolOrSubstance,
    incident.approximateDamageCost,
    incident.selectedCauses,
    incident.primaryCause,
    incident.unsafeActsOther,
    incident.unsafeConditionsOther,
    incident.managementDeficienciesOther,
    incident.investigationTeam,
  ]);
  const totalPages = pages.length;

  useLayoutEffect(() => {
    pageRefsRef.current = pages.map(p => ({ type: p.type, el: elRefs.current[p.key] }));
  });

  return (
    <div className="incidentPdfExportRoot" aria-hidden="true">
      {pages.map((p, i) => {
        const pageNumber = i + 1;
        const setRef = el => { elRefs.current[p.key] = el; };
        if (p.type === 'continuation') {
          return (
            <ContinuationPage
              key={p.key}
              incident={incident}
              pageNumber={pageNumber}
              totalPages={totalPages}
              draft={draft}
              pageRef={setRef}
              {...p.props}
            />
          );
        }
        const Content = PAGE_COMPONENTS[p.type];
        return (
          <IncidentPageShell key={p.key} pageRef={setRef} pageNumber={pageNumber} totalPages={totalPages} draft={draft}>
            <Content incident={incident} {...p.props} />
          </IncidentPageShell>
        );
      })}
    </div>
  );
}

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* Deterministic client-side PDF assembly -- same approach as the JSA's
   generateJsaPdf: capture each already-rendered logical page with
   html2canvas, one at a time, and assemble with pdf-lib. No browser print
   pagination involved. */
export async function generateIncidentPdf(pageRefsRef, onProgress) {
  const pages = pageRefsRef.current;
  if (!pages.length) throw new Error('No pages to export -- the document plan is empty.');

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
    if (!el) throw new Error(`Page ${i + 1} of ${pages.length} (${type}) did not render -- export aborted.`);

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Page ${i + 1} of ${pages.length} (${type}) has no measurable size -- export aborted.`);
    }

    let canvas;
    try {
      canvas = await html2canvas(el, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false });
    } catch (err) {
      throw new Error(`Failed to render page ${i + 1} of ${pages.length} (${type}): ${err?.message || err}`);
    }
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error(`Page ${i + 1} of ${pages.length} (${type}) captured empty -- export aborted.`);
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
    throw new Error(`Generated PDF has ${pageCount} pages but the plan has ${pages.length} -- export aborted.`);
  }

  return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), pageCount };
}

/* Combines the printed-content fingerprint with whether the report would
   currently print as a final (no watermark) or draft (watermarked) document.
   Deliberately does NOT use the raw status string here: "ready" and
   "completed" print identically (isIncidentPrintFinal is true for both), so
   using status directly would falsely mark an already-generated final PDF
   as stale the instant exportIncidentPdf() flips ready -> completed after a
   successful export, even though nothing the PDF actually shows changed.
   Mirrors the JSA's fingerprintPaginationInput, which excludes the same
   category of non-printed fields for the same reason. */
export function incidentPdfFingerprint(incident) {
  return JSON.stringify({ printed: printedIncidentFingerprint(incident), final: isIncidentPrintFinal(incident) });
}

export function buildIncidentExportName(incident) {
  const draft = !isIncidentPrintFinal(incident);
  const raw = [incident.workplaceLocation || 'Shackelford', 'IncidentReport', incident.incidentDate || ''].filter(Boolean).join('_');
  const clean = raw.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return draft ? `${clean}_DRAFT` : clean;
}
