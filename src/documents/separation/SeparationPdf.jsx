import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  DocPdfPageShell, GrayBar, InfoTable, TextBlock, SignatureRow,
  label, value, fmtDate,
} from '../DocPdfShell';
import { useBlockPagination } from '../useBlockPagination';
import { buildTextBlocks } from '../splitTextBlocks';
import { isSeparationPrintFinal } from './separationModel';

const FORM_TITLE = 'EMPLOYEE SEPARATION';
const PAGE_BODY_CAPACITY_PX = 900;
const PAGE_BODY_WIDTH_PX = 758;

function InfoBlock({ model }) {
  const reason = model.separationReason === 'Other' && model.separationReasonOther
    ? `Other — ${model.separationReasonOther}`
    : model.separationReason;
  return (
    <InfoTable rows={[
      [label('Employee Name', '34%'), value(model.employeeName)],
      [label('Supervisor'), value(model.supervisor)],
      [label('Position'), value(model.position)],
      [label('Separation Date'), value(fmtDate(model.separationDate))],
      [label('Reason for Separation'), value(reason)],
    ]}
    />
  );
}

function DischargeBlock({ model }) {
  if (model.separationReason !== 'Discharge') return null;
  const warningText = model.warningNoticesGiven === 'yes'
    ? `Yes — ${model.warningNoticesCount || 'count not specified'}`
    : model.warningNoticesGiven === 'no' ? 'No' : '';
  return (
    <>
      <GrayBar>Discharge — Warning History</GrayBar>
      <InfoTable rows={[[label('Warning Notices Given?', '40%'), value(warningText)]]} />
    </>
  );
}

function RehireBlock({ model }) {
  return (
    <>
      <GrayBar>Re-hire Eligibility</GrayBar>
      <InfoTable rows={[[label('Would You Re-hire This Employee?', '40%'), value(model.wouldRehire === 'yes' ? 'Yes' : model.wouldRehire === 'no' ? 'No' : '')]]} />
    </>
  );
}

function SignaturesBlock({ model }) {
  return (
    <div style={{ marginTop: 6 }}>
      <GrayBar>Signatures</GrayBar>
      <div style={{ padding: '8px 2px' }}>
        <SignatureRow label="Supervisor Signature" signatureData={model.supervisorSignatureData} dateValue={model.supervisorSignatureDate} />
      </div>
      <div style={{ padding: '8px 2px' }}>
        <SignatureRow label="Employee Signature" signatureData={model.employeeSignatureData} dateValue={model.employeeSignatureDate} />
      </div>
    </div>
  );
}

export function SeparationPdfExportRoot({ model, pageRefsRef }) {
  const pageRefs = useRef({});
  const draft = !isSeparationPrintFinal(model);

  const blocks = useMemo(() => ([
    { id: 'info', render: () => <InfoBlock model={model} /> },
    ...buildTextBlocks('explanation', model.detailedExplanation, (chunk, isFirst) => (
      <>
        {isFirst && <GrayBar>Detailed Explanation</GrayBar>}
        {!isFirst && <GrayBar>Detailed Explanation (continued)</GrayBar>}
        <TextBlock text={chunk} minHeightPx={isFirst ? 60 : 30} />
      </>
    )),
    ...(model.separationReason === 'Discharge' ? [{ id: 'discharge', render: () => <DischargeBlock model={model} /> }] : []),
    { id: 'rehire', render: () => <RehireBlock model={model} /> },
    { id: 'signatures', render: () => <SignaturesBlock model={model} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [
    model.employeeName, model.supervisor, model.position, model.separationDate,
    model.separationReason, model.separationReasonOther, model.detailedExplanation,
    model.warningNoticesGiven, model.warningNoticesCount, model.wouldRehire,
    model.supervisorSignatureData, model.supervisorSignatureDate, model.employeeSignatureData, model.employeeSignatureDate,
  ]);

  const { pages, renderProbe } = useBlockPagination(blocks, PAGE_BODY_CAPACITY_PX, PAGE_BODY_WIDTH_PX, [blocks]);
  const totalPages = pages.length;

  useLayoutEffect(() => {
    pageRefsRef.current = pages.map((_, i) => ({ type: i === 0 ? 'main' : 'continuation', el: pageRefs.current[i] }));
  });

  return (
    <div className="docPdfExportRoot" data-doc-id="separation" aria-hidden="true">
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
