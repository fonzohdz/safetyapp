import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  DocPdfPageShell, GrayBar, InfoTable, TextBlock, CheckboxGrid, SignatureRow,
  label, value, fmtDate,
} from '../DocPdfShell';
import { useBlockPagination } from '../useBlockPagination';
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
        [label('Employee Name', '32%'), value(model.employeeName)],
        [label('Supervisor'), value(model.supervisor)],
        [label('Position'), value(model.position)],
        [label('Date'), value(fmtDate(model.noticeDate))],
      ]}
      />
      <div style={{ marginTop: 6 }}>
        <GrayBar>Warning Level</GrayBar>
        <CheckboxGrid options={WARNING_LEVELS.map(w => w.label)} checked={warningLevelLabel(model.warningLevel)} />
      </div>
    </>
  );
}

function Section({ number, title, text }) {
  return (
    <>
      <GrayBar>{number}. {title}</GrayBar>
      <TextBlock text={text} minHeightPx={40} />
    </>
  );
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
    { id: 'sec1', render: () => <Section number={1} title="What Occurred" text={model.whatOccurred} /> },
    { id: 'sec2', render: () => <Section number={2} title="Earlier Warnings / Discussions" text={model.earlierWarnings} /> },
    { id: 'sec3', render: () => <Section number={3} title="Company Policy States" text={model.companyPolicyStates} /> },
    { id: 'sec4', render: () => <Section number={4} title="Employee Statement" text={model.employeeStatement} /> },
    { id: 'sec5', render: () => <Section number={5} title="Corrective Action Required of Employee" text={model.correctiveActionRequired} /> },
    { id: 'sec6', render: () => <Section number={6} title="The Company Will" text={model.companyWill} /> },
    { id: 'sec7', render: () => <Section number={7} title="If Behavior Is Not Corrected / Performance Does Not Improve" text={model.ifNotCorrected} /> },
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
    <div className="docPdfExportRoot" aria-hidden="true">
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
