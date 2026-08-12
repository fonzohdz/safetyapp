/* Employee Medical Event, drawn straight into the PDF. See pdfDraw.js.

   Two-tier headings on this form: a gray bar marks a MAJOR division, the
   bare bold caption above a field marks a prompt beneath one. So
   EMPLOYEE-REPORTED CONDITION is a bar, and Symptoms / Work Event sit under
   it as labels; MEDICAL EVALUATION / WORK STATUS starts the next major
   division. */

import { createFormPdf, loadLogoPngBytes } from '../pdfDraw';
import { fmtDate } from '../DocPdfShell';
import {
  SYMPTOM_ONSET_OPTIONS, RESPONSE_ACTIONS, MEDICAL_EVALUATION_TYPES, WORK_STATUS_OPTIONS,
  INITIAL_CLASSIFICATIONS, MEDICAL_ATTACHMENT_OPTIONS,
  isMedicalEventPrintFinal,
} from './medicalEventModel';

const FORM_TITLE = 'EMPLOYEE MEDICAL EVENT';

function optionLabel(options, v) {
  return options.find(o => o.value === v)?.label || '';
}

export async function drawMedicalEventPdf(model, onProgress) {
  onProgress?.(1, 1);
  const logoBytes = await loadLogoPngBytes(`${import.meta.env.BASE_URL}icons/shackelford-logo.webp`);
  const doc = await createFormPdf({
    formTitle: FORM_TITLE,
    logoBytes,
    draft: !isMedicalEventPrintFinal(model),
  });

  doc.infoTable([
    ['Employee Name', model.employeeName, 'Date', fmtDate(model.eventDate)],
    ['Supervisor', model.supervisor, 'Position', model.position],
    ['Project / Location', model.projectLocation, 'Time Reported', model.timeReported],
  ], 0.19);

  doc.space(6);
  doc.grayBar('Employee-Reported Condition');
  doc.textBox({ title: 'Symptoms / Concerns (as reported by the employee)', text: model.reportedSymptoms, minH: 38 });
  doc.space(4);
  doc.infoTable([
    ['When Symptoms First Appeared', optionLabel(SYMPTOM_ONSET_OPTIONS, model.symptomsOnset)],
    ['Specific Work Event/Exposure Reported?',
      model.specificWorkEventReported === 'yes' ? 'Yes' : model.specificWorkEventReported === 'no' ? 'No' : ''],
  ], 0.4);
  if (model.specificWorkEventReported === 'yes') {
    doc.space(4);
    doc.textBox({ title: 'Work Event / Exposure Reported', text: model.workEventDescription, minH: 30 });
  }

  doc.space(6);
  doc.grayBar('Response / Actions Taken');
  doc.checkboxGrid({ options: RESPONSE_ACTIONS, checked: model.responseActions });
  if ((model.responseActions || []).includes('Other') && model.responseActionsOther) {
    doc.space(4);
    doc.textBox({ title: 'Other Action', text: model.responseActionsOther, minH: 20 });
  }
  doc.space(4);
  doc.textBox({
    title: 'Safety / Supervisor Observations and Actions',
    text: model.safetyObservations,
    minH: 38,
  });

  doc.space(6);
  doc.grayBar('Medical Evaluation / Work Status');
  const evalLabel = optionLabel(MEDICAL_EVALUATION_TYPES, model.medicalEvaluationType)
    || (model.medicalEvaluationType === 'other' ? model.medicalEvaluationOther : '');
  const workStatusLabel = model.workStatus === 'offWork'
    ? `Off Work Until ${fmtDate(model.offWorkUntilDate)}`
    : optionLabel(WORK_STATUS_OPTIONS, model.workStatus);
  doc.infoTable([
    ['Medical Evaluation', evalLabel, 'Clinic / Provider', model.clinicProvider],
  ], 0.19);
  doc.infoTable([['Work Status', workStatusLabel]], 0.19);

  doc.space(6);
  const attachOptions = (model.attachments || []).includes('Other') && model.attachmentOther
    ? MEDICAL_ATTACHMENT_OPTIONS.map(o => (o === 'Other' ? `Other — ${model.attachmentOther}` : o))
    : MEDICAL_ATTACHMENT_OPTIONS;
  const attachChecked = (model.attachments || [])
    .map(o => (o === 'Other' && model.attachmentOther ? `Other — ${model.attachmentOther}` : o));
  doc.twoCol(
    () => {
      doc.grayBar('Attachments');
      doc.infoTable([['Provider Note Attached', model.providerNoteAttached ? 'Yes' : 'No']], 0.55);
      doc.checkboxGrid({ options: attachOptions, checked: attachChecked, columns: 2 });
    },
    () => {
      doc.grayBar('Initial Classification');
      doc.checkboxGrid({
        options: INITIAL_CLASSIFICATIONS.map(c => c.label),
        checked: optionLabel(INITIAL_CLASSIFICATIONS, model.initialClassification),
        columns: 1,
      });
    },
  );

  doc.space(6);
  doc.grayBar('Signatures');
  doc.signatureRow({
    label: 'Employee Signature (if able)',
    image: await doc.embedSignature(model.employeeSignatureData),
    dateValue: fmtDate(model.employeeSignatureDate),
  });
  doc.signatureRow({
    label: 'Supervisor / Safety Signature',
    image: await doc.embedSignature(model.supervisorSignatureData),
    dateValue: fmtDate(model.supervisorSignatureDate),
  });

  return doc.finish();
}
