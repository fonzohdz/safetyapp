import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  DocPdfPageShell, GrayBar, InfoTable, TextBlock, CheckboxGrid, SignatureRow,
  label, value, pairRow, fmtDate,
} from '../DocPdfShell';
import { useBlockPagination } from '../useBlockPagination';
import { buildTextBlocks } from '../splitTextBlocks';
import {
  SYMPTOM_ONSET_OPTIONS, RESPONSE_ACTIONS, MEDICAL_EVALUATION_TYPES, WORK_STATUS_OPTIONS, INITIAL_CLASSIFICATIONS,
  MEDICAL_ATTACHMENT_OPTIONS,
  isMedicalEventPrintFinal,
} from './medicalEventModel';

const FORM_TITLE = 'EMPLOYEE MEDICAL EVENT';
const PAGE_BODY_CAPACITY_PX = 900;
const PAGE_BODY_WIDTH_PX = 758;

function optionLabel(options, v) {
  return options.find(o => o.value === v)?.label || '';
}

function InfoBlock({ model }) {
  return (
    <InfoTable rows={[
      pairRow('Employee Name', model.employeeName, 'Date', fmtDate(model.eventDate)),
      pairRow('Supervisor', model.supervisor, 'Position', model.position),
      pairRow('Project / Location', model.projectLocation, 'Time Reported', model.timeReported),
    ]}
    />
  );
}

function ReportedConditionBlock({ model }) {
  return (
    <>
      <GrayBar>Employee-Reported Condition</GrayBar>
      <TextBlock title="Symptoms / Concerns (as reported by the employee)" text={model.reportedSymptoms} minHeightPx={40} />
      <InfoTable rows={[
        [label('When Symptoms First Appeared', '40%'), value(optionLabel(SYMPTOM_ONSET_OPTIONS, model.symptomsOnset))],
        [label('Specific Work Event/Exposure Reported?'), value(model.specificWorkEventReported === 'yes' ? 'Yes' : model.specificWorkEventReported === 'no' ? 'No' : '')],
      ]}
      />
      {model.specificWorkEventReported === 'yes' && (
        <TextBlock title="Work Event / Exposure Reported" text={model.workEventDescription} minHeightPx={30} />
      )}
    </>
  );
}

function ResponseBlock({ model }) {
  return (
    <>
      <GrayBar>Response / Actions Taken</GrayBar>
      <CheckboxGrid options={RESPONSE_ACTIONS} checked={model.responseActions} />
      {(model.responseActions || []).includes('Other') && model.responseActionsOther && (
        <TextBlock title="Other Action" text={model.responseActionsOther} minHeightPx={20} />
      )}
    </>
  );
}

function EvaluationBlock({ model }) {
  const evalLabel = optionLabel(MEDICAL_EVALUATION_TYPES, model.medicalEvaluationType) || (model.medicalEvaluationType === 'other' ? model.medicalEvaluationOther : '');
  const workStatusLabel = model.workStatus === 'offWork' ? `Off Work Until ${fmtDate(model.offWorkUntilDate)}` : optionLabel(WORK_STATUS_OPTIONS, model.workStatus);
  return (
    <>
      <GrayBar>Medical Evaluation / Work Status</GrayBar>
      <InfoTable rows={[
        pairRow('Medical Evaluation', evalLabel, 'Clinic / Provider', model.clinicProvider),
        [label('Work Status', '18%'), value(workStatusLabel)],
      ]}
      />
    </>
  );
}

/* Attachments and Initial Classification side by side — two independent,
   fairly short sections that don't each need the full page width. Pairing
   them (rather than stacking, as an earlier pass did) was the fix for a
   real "janky near-empty continuation page": a busier normal-length report
   (e.g. a specific work event reported, several response actions, a full
   evaluation) had visible blank space left on page 1 while Signatures alone
   spilled to an almost-empty page 2 — this row's saved height keeps
   Signatures on page 1 for that case too. */
function AttachmentsClassificationRow({ model }) {
  const options = (model.attachments || []).includes('Other') && model.attachmentOther
    ? MEDICAL_ATTACHMENT_OPTIONS.map(o => (o === 'Other' ? `Other — ${model.attachmentOther}` : o))
    : MEDICAL_ATTACHMENT_OPTIONS;
  const checked = (model.attachments || []).map(o => (o === 'Other' && model.attachmentOther ? `Other — ${model.attachmentOther}` : o));
  return (
    <div className="docPdfTwoCol">
      <div>
        <GrayBar>Attachments</GrayBar>
        <InfoTable rows={[[label('Provider Note Attached', '55%'), value(model.providerNoteAttached ? 'Yes' : 'No')]]} />
        <CheckboxGrid options={options} checked={checked} />
      </div>
      <div>
        <GrayBar>Initial Classification</GrayBar>
        <CheckboxGrid options={INITIAL_CLASSIFICATIONS.map(c => c.label)} checked={optionLabel(INITIAL_CLASSIFICATIONS, model.initialClassification)} oneColumn />
      </div>
    </div>
  );
}

function SignaturesBlock({ model }) {
  return (
    <div style={{ marginTop: 6 }}>
      <GrayBar>Signatures</GrayBar>
      <div style={{ padding: '8px 2px' }}>
        <SignatureRow label="Employee Signature (if able)" signatureData={model.employeeSignatureData} dateValue={model.employeeSignatureDate} />
      </div>
      <div style={{ padding: '8px 2px' }}>
        <SignatureRow label="Supervisor / Safety Signature" signatureData={model.supervisorSignatureData} dateValue={model.supervisorSignatureDate} />
      </div>
    </div>
  );
}

export function MedicalEventPdfExportRoot({ model, pageRefsRef }) {
  const pageRefs = useRef({});
  const draft = !isMedicalEventPrintFinal(model);

  const blocks = useMemo(() => ([
    { id: 'info', render: () => <InfoBlock model={model} /> },
    ...buildTextBlocks('reportedSymptoms', model.reportedSymptoms, (chunk, isFirst) => (
      isFirst ? <ReportedConditionBlock model={{ ...model, reportedSymptoms: chunk }} /> : <TextBlock title="Symptoms / Concerns (continued)" text={chunk} minHeightPx={24} />
    )),
    { id: 'response', render: () => <ResponseBlock model={model} /> },
    ...buildTextBlocks('safetyObservations', model.safetyObservations, (chunk, isFirst) => (
      <TextBlock title={isFirst ? 'Safety / Supervisor Observations and Actions' : 'Safety / Supervisor Observations (continued)'} text={chunk} minHeightPx={isFirst ? 40 : 24} />
    )),
    { id: 'evaluation', render: () => <EvaluationBlock model={model} /> },
    { id: 'attachmentsClassification', render: () => <AttachmentsClassificationRow model={model} /> },
    { id: 'signatures', render: () => <SignaturesBlock model={model} /> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [
    model.employeeName, model.supervisor, model.position, model.projectLocation, model.eventDate, model.timeReported,
    model.reportedSymptoms, model.symptomsOnset, model.specificWorkEventReported, model.workEventDescription,
    model.responseActions, model.responseActionsOther, model.safetyObservations,
    model.medicalEvaluationType, model.medicalEvaluationOther, model.clinicProvider, model.workStatus, model.offWorkUntilDate, model.providerNoteAttached,
    model.attachments, model.attachmentOther,
    model.initialClassification,
    model.employeeSignatureData, model.employeeSignatureDate, model.supervisorSignatureData, model.supervisorSignatureDate,
  ]);

  const { pages, renderProbe } = useBlockPagination(blocks, PAGE_BODY_CAPACITY_PX, PAGE_BODY_WIDTH_PX, [blocks]);
  const totalPages = pages.length;

  useLayoutEffect(() => {
    pageRefsRef.current = pages.map((_, i) => ({ type: i === 0 ? 'main' : 'continuation', el: pageRefs.current[i] }));
  });

  return (
    <div className="docPdfExportRoot" data-doc-id="medicalEvent" aria-hidden="true">
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
