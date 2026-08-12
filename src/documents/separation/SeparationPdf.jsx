import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  DocPdfPageShell, GrayBar, InfoTable, TextBlock, CheckboxGrid, MultiSignatureRow,
  label, value, pairRow, fmtDate,
} from '../DocPdfShell';
import { useBlockPagination } from '../useBlockPagination';
import { buildTextBlocks } from '../splitTextBlocks';
import {
  SEPARATION_TYPES, SEPARATION_REASONS, REHIRE_STATUSES,
  PROPERTY_RETURNED_OPTIONS, ACCESS_REMOVED_OPTIONS,
  isSeparationPrintFinal,
} from './separationModel';

const FORM_TITLE = 'EMPLOYEE SEPARATION';
const PAGE_BODY_CAPACITY_PX = 900;
const PAGE_BODY_WIDTH_PX = 758;
/* One label-column width for every full-width label/value table on this
   form. These used to be 18% (Reason) and 38% (Discipline / Rehire), so the
   rule separating label from value jumped horizontally between adjacent
   sections and nothing lined up down the page. Paired rows
   (label,value,label,value) keep their own width — that's a different
   structure, not an inconsistency. */
const SEPARATION_LABEL_WIDTH = '32%';

function optionLabel(options, v) {
  return options.find(o => o.value === v)?.label || '';
}

function InfoBlock({ model }) {
  return (
    <InfoTable rows={[
      pairRow('Employee Name', model.employeeName, 'Employee ID', model.employeeId),
      pairRow('Position', model.position, 'Project / Location', model.projectLocation),
      pairRow('Supervisor', model.supervisor, 'Last Day Worked', fmtDate(model.lastDayWorked)),
      pairRow('Effective Separation Date', fmtDate(model.effectiveSeparationDate), 'Date Submitted', fmtDate(model.dateSubmitted)),
    ]}
    />
  );
}

function TypeReasonBlock({ model }) {
  const reasonLabel = model.separationReason === 'Other' && model.separationReasonOther
    ? `Other — ${model.separationReasonOther}`
    : model.separationReason;
  return (
    <>
      <GrayBar>Separation Type / Reason</GrayBar>
      {/* Named sub-groups: the source form asks two distinct questions here
          (which kind of separation, then why), and an unlabelled one-column
          pair sitting above an unlabelled two-column list read as one loose
          run of checkboxes rather than as that two-step structure. */}
      <CheckboxGrid options={SEPARATION_TYPES.map(t => t.label)} checked={optionLabel(SEPARATION_TYPES, model.separationType)} oneColumn />
      <CheckboxGrid options={SEPARATION_REASONS} checked={model.separationReason} />
      <InfoTable rows={[[label('Reason', SEPARATION_LABEL_WIDTH), value(reasonLabel)]]} />
    </>
  );
}

function DisciplineRehireBlock({ model }) {
  const isInvoluntary = model.separationType === 'involuntary';
  const warningText = model.warningNoticesGiven === 'yes'
    ? `Yes — ${model.warningNoticesCount || 'count not specified'}`
    : model.warningNoticesGiven === 'no' ? 'No' : model.warningNoticesGiven === 'na' ? 'N/A' : '';
  const rows = [];
  if (isInvoluntary) rows.push([label('Warning Notices Given?', SEPARATION_LABEL_WIDTH), value(warningText)]);
  rows.push([label('Documentation Attached?', SEPARATION_LABEL_WIDTH), value(model.documentationAttached === 'yes' ? 'Yes' : model.documentationAttached === 'no' ? 'No' : '')]);
  rows.push([label('Eligible for Rehire?', SEPARATION_LABEL_WIDTH), value(optionLabel(REHIRE_STATUSES, model.eligibleForRehire))]);
  if (model.eligibleForRehire === 'no') rows.push([label('Reason Not Eligible', SEPARATION_LABEL_WIDTH), value(model.rehireReasonIfNo)]);
  return (
    <>
      <GrayBar>Discipline / Rehire Status</GrayBar>
      <InfoTable rows={rows} />
    </>
  );
}

function CloseoutBlock({ model }) {
  const propertyOptions = (model.propertyReturned || []).includes('Other') && model.propertyReturnedOther
    ? PROPERTY_RETURNED_OPTIONS.map(o => (o === 'Other' ? `Other — ${model.propertyReturnedOther}` : o))
    : PROPERTY_RETURNED_OPTIONS;
  const propertyChecked = (model.propertyReturned || []).map(o => (o === 'Other' && model.propertyReturnedOther ? `Other — ${model.propertyReturnedOther}` : o));
  const accessOptions = (model.accessRemoved || []).includes('Other') && model.accessRemovedOther
    ? ACCESS_REMOVED_OPTIONS.map(o => (o === 'Other' ? `Other — ${model.accessRemovedOther}` : o))
    : ACCESS_REMOVED_OPTIONS;
  const accessChecked = (model.accessRemoved || []).map(o => (o === 'Other' && model.accessRemovedOther ? `Other — ${model.accessRemovedOther}` : o));
  return (
    <>
      <GrayBar>Company Closeout</GrayBar>
      <InfoTable rows={[
        pairRow('Final Timesheet Submitted?', model.finalTimesheetSubmitted ? 'Yes' : 'No', 'Expenses / Receipts Resolved?', model.expensesResolved ? 'Yes' : 'No', '30%'),
      ]}
      />
      <CheckboxGrid options={propertyOptions} checked={propertyChecked} />
      <CheckboxGrid options={accessOptions} checked={accessChecked} />
    </>
  );
}

function SignaturesBlock({ model }) {
  const employeeItem = model.employeeRefusedToSign
    ? { label: 'Employee Signature', note: 'Refused / Unavailable to Sign' }
    : { label: 'Employee Signature', signatureData: model.employeeSignatureData, dateValue: model.employeeSignatureDate };
  return (
    <div style={{ marginTop: 6 }}>
      <GrayBar>Approvals</GrayBar>
      <div style={{ padding: '8px 2px' }}>
        <MultiSignatureRow items={[
          employeeItem,
          { label: 'Supervisor Signature', signatureData: model.supervisorSignatureData, dateValue: model.supervisorSignatureDate },
          { label: `HR / Management${model.hrName ? ` — ${model.hrName}` : ''}`, signatureData: model.hrSignatureData, dateValue: model.hrSignatureDate },
        ]}
        />
      </div>
    </div>
  );
}

export function SeparationPdfExportRoot({ model, pageRefsRef }) {
  const pageRefs = useRef({});
  const draft = !isSeparationPrintFinal(model);

  const blocks = useMemo(() => ([
    { id: 'info', render: () => <InfoBlock model={model} /> },
    { id: 'typeReason', render: () => <TypeReasonBlock model={model} /> },
    ...buildTextBlocks('explanation', model.detailedExplanation, (chunk, isFirst) => (
      <>
        {isFirst && <GrayBar>Explanation / Supporting Details</GrayBar>}
        {!isFirst && <GrayBar>Explanation / Supporting Details (continued)</GrayBar>}
        <TextBlock text={chunk} minHeightPx={isFirst ? 50 : 30} />
      </>
    )),
    { id: 'discipline', render: () => <DisciplineRehireBlock model={model} /> },
    { id: 'closeout', render: () => <CloseoutBlock model={model} /> },
    ...buildTextBlocks('outstandingNotes', model.outstandingPropertyNotes, (chunk, isFirst) => (
      <TextBlock title={isFirst ? 'Outstanding Property / Notes' : 'Outstanding Property / Notes (continued)'} text={chunk} minHeightPx={isFirst ? 24 : 20} />
    )),
    { id: 'signatures', render: () => <SignaturesBlock model={model} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [
    model.employeeName, model.employeeId, model.position, model.projectLocation, model.supervisor,
    model.lastDayWorked, model.effectiveSeparationDate, model.dateSubmitted,
    model.separationType, model.separationReason, model.separationReasonOther, model.detailedExplanation,
    model.warningNoticesGiven, model.warningNoticesCount, model.documentationAttached,
    model.eligibleForRehire, model.rehireReasonIfNo,
    model.propertyReturned, model.propertyReturnedOther, model.accessRemoved, model.accessRemovedOther,
    model.finalTimesheetSubmitted, model.expensesResolved, model.outstandingPropertyNotes,
    model.employeeRefusedToSign,
    model.employeeSignatureData, model.employeeSignatureDate,
    model.supervisorSignatureData, model.supervisorSignatureDate,
    model.hrName, model.hrSignatureData, model.hrSignatureDate,
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
