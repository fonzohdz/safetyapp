import { useLayoutEffect, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { isIncidentPrintFinal, printedIncidentFingerprint } from './incidentModel';
import {
  IncidentPageShell, Page1Content, Page2Content, Page3Content, Page4Content, Page5Content, Page6Content, ContinuationPage,
} from './IncidentPdf';
import {
  textBlockMeasureStyle, DESCRIPTION_FIRST_HEIGHT_PX, STATEMENT_FIRST_HEIGHT_PX, MIN_NOTE_BOX_HEIGHT_PX, CONTINUATION_BODY_HEIGHT_PX,
} from './incidentPdfLayout';
import { paginateText, measureNaturalHeight } from './textFit';
import { measurePage6NotesBudget } from './incidentPdfMeasure';

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
function paginateNotesField(text, firstMaxHeightPx) {
  return paginateText(text, {
    firstMaxHeightPx,
    firstStyle: textBlockMeasureStyle(),
    continuationMaxHeightPx: CONTINUATION_BODY_HEIGHT_PX,
    continuationStyle: textBlockMeasureStyle(),
  });
}

/* Splits a shared px budget between two competing boxes: if both fit at
   their full natural size, give each exactly that (this is the common case
   that used to force a wasted page 7 -- see MIN_NOTE_BOX_HEIGHT_PX). If not,
   each gets at least `minEach`, and whatever's left is divided in
   proportion to how much more than the floor each one actually needs. */
function allocateSharedHeight(need1, need2, budget, minEach) {
  const safeBudget = Math.max(0, budget);
  if (need1 + need2 <= safeBudget) {
    return { h1: Math.max(need1, Math.min(minEach, safeBudget)), h2: Math.max(need2, Math.min(minEach, safeBudget)) };
  }
  const floor = Math.min(minEach, safeBudget / 2);
  const remaining = Math.max(0, safeBudget - floor * 2);
  const extra1 = Math.max(0, need1 - floor);
  const extra2 = Math.max(0, need2 - floor);
  const totalExtra = extra1 + extra2;
  if (totalExtra <= 0) return { h1: floor, h2: floor };
  const share1 = totalExtra <= remaining ? extra1 : remaining * (extra1 / totalExtra);
  const share2 = totalExtra <= remaining ? extra2 : remaining * (extra2 / totalExtra);
  return { h1: floor + share1, h2: floor + share2 };
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

  // Page 6's two notes boxes share whatever space is actually left after
  // the gray bars and investigation-team table (measured for real -- see
  // incidentPdfMeasure.js) instead of each getting a fixed box regardless
  // of what's really available. Short notes no longer waste page-6 space,
  // and a note that would have overflowed a fixed box now gets the real
  // remaining room before spilling to a continuation page.
  const supervisorText = incident.supervisorNotes;
  const safetyConsultantText = incident.safetyConsultantNotes;
  const notesBudgetPx = measurePage6NotesBudget(incident.investigationTeam);
  const supervisorNeed = measureNaturalHeight(supervisorText, textBlockMeasureStyle());
  const safetyConsultantNeed = measureNaturalHeight(safetyConsultantText, textBlockMeasureStyle());
  const { h1: supervisorBoxHeight, h2: safetyConsultantBoxHeight } = allocateSharedHeight(
    supervisorNeed, safetyConsultantNeed, notesBudgetPx, MIN_NOTE_BOX_HEIGHT_PX,
  );
  const supervisorNotes = paginateNotesField(supervisorText, supervisorBoxHeight);
  const safetyConsultantNotes = paginateNotesField(safetyConsultantText, safetyConsultantBoxHeight);

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

  pages.push({
    key: 'p6',
    type: 'page6',
    props: {
      supervisorNotesChunk: supervisorNotesChunks[0],
      safetyConsultantNotesChunk: safetyConsultantNotesChunks[0],
      supervisorNotesBoxHeight: supervisorBoxHeight,
      safetyConsultantNotesBoxHeight: safetyConsultantBoxHeight,
    },
  });
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
