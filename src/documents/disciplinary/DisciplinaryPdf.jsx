import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  DocPdfPageShell, GrayBar, InfoTable, TextBlock, CheckboxGrid, SignatureRow, NumberedBar,
  label, value, pairRow, fmtDate,
} from '../DocPdfShell';
import { useBlockPagination } from '../useBlockPagination';
import { buildTextBlocks } from '../splitTextBlocks';
import { WARNING_LEVELS, warningLevelLabel, isDisciplinaryPrintFinal } from './disciplinaryModel';

const FORM_TITLE = 'EMPLOYEE DISCIPLINARY NOTICE';
// Usable page body height/width — see docPdf.css's .docPdfPage geometry
// (8.5x11in, 0.3in padding) and useBlockPagination's own comment for why
// this is real-measured per block rather than estimated per character.
const PAGE_BODY_CAPACITY_PX = 900;
const PAGE_BODY_WIDTH_PX = 758;

function InfoBlock({ model }) {
  return (
    <>
      <InfoTable rows={[
        pairRow('Employee Name', model.employeeName, 'Date', fmtDate(model.noticeDate)),
        pairRow('Supervisor', model.supervisor, 'Position', model.position),
      ]}
      />
      <div style={{ marginTop: 6 }}>
        <GrayBar>Warning Level</GrayBar>
        <CheckboxGrid options={WARNING_LEVELS.map(w => w.label)} checked={warningLevelLabel(model.warningLevel)} oneRow />
      </div>
    </>
  );
}

/* Each numbered section becomes 1+ pagination blocks — split so a
   pathologically long single section (see splitTextBlocks.js) can never
   itself be taller than one whole page and silently clip. Uses NumberedBar
   (thin outlined header) rather than GrayBar's full gray fill — with 7
   sections in a row on this document, a heavy gray block per section reads
   much heavier than the source paper form actually is. */
function sectionBlocks(idPrefix, number, title, text) {
  return buildTextBlocks(idPrefix, text, (chunk, isFirst) => (
    <>
      <NumberedBar number={isFirst ? number : undefined}>{isFirst ? title : `${title} (continued)`}</NumberedBar>
      <TextBlock text={chunk} minHeightPx={isFirst ? 40 : 24} />
    </>
  ));
}

function SignaturesBlock({ model }) {
  return (
    <div style={{ marginTop: 6 }}>
      <GrayBar>Signatures</GrayBar>
      <div style={{ padding: '8px 2px' }}>
        <SignatureRow label="Employee Signature" signatureData={model.employeeSignatureData} dateValue={model.employeeSignatureDate} />
      </div>
      <div style={{ padding: '8px 2px' }}>
        <SignatureRow label="Manager Signature" signatureData={model.managerSignatureData} dateValue={model.managerSignatureDate} />
      </div>
    </div>
  );
}

export function DisciplinaryPdfExportRoot({ model, pageRefsRef }) {
  const pageRefs = useRef({});
  const draft = !isDisciplinaryPrintFinal(model);

  const blocks = useMemo(() => ([
    { id: 'info', render: () => <InfoBlock model={model} /> },
    ...sectionBlocks('sec1', 1, 'What Occurred', model.whatOccurred),
    ...sectionBlocks('sec2', 2, 'Earlier Warnings / Discussions', model.earlierWarnings),
    ...sectionBlocks('sec3', 3, 'Company Policy States', model.companyPolicyStates),
    ...sectionBlocks('sec4', 4, 'Employee Statement', model.employeeStatement),
    ...sectionBlocks('sec5', 5, 'Corrective Action Required of Employee', model.correctiveActionRequired),
    ...sectionBlocks('sec6', 6, 'The Company Will', model.companyWill),
    ...sectionBlocks('sec7', 7, 'If Behavior Is Not Corrected / Performance Does Not Improve', model.ifNotCorrected),
    { id: 'signatures', render: () => <SignaturesBlock model={model} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [
    model.employeeName, model.supervisor, model.position, model.noticeDate, model.warningLevel,
    model.whatOccurred, model.earlierWarnings, model.companyPolicyStates, model.employeeStatement,
    model.correctiveActionRequired, model.companyWill, model.ifNotCorrected,
    model.employeeSignatureData, model.employeeSignatureDate, model.managerSignatureData, model.managerSignatureDate,
  ]);

  const { pages, renderProbe } = useBlockPagination(blocks, PAGE_BODY_CAPACITY_PX, PAGE_BODY_WIDTH_PX, [blocks]);
  const totalPages = pages.length;

  useLayoutEffect(() => {
    pageRefsRef.current = pages.map((_, i) => ({ type: i === 0 ? 'main' : 'continuation', el: pageRefs.current[i] }));
  });

  return (
    <div className="docPdfExportRoot" data-doc-id="disciplinary" aria-hidden="true">
      {renderProbe()}
      {pages.map((pageBlocks, i) => (
        <DocPdfPageShell
          key={i}
          pageRef={el => { pageRefs.current[i] = el; }}
          pageNumber={i + 1}
          totalPages={totalPages}
          draft={draft}
          formTitle={FORM_TITLE}
          headerLabel={i === 0 ? undefined : 'CONTINUATION'}
        >
          {pageBlocks.map(b => <div key={b.id}>{b.render()}</div>)}
        </DocPdfPageShell>
      ))}
    </div>
  );
}
