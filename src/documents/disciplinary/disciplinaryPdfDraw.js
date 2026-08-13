/* Employee Disciplinary Notice, drawn straight into the PDF.

   This is the same form as DisciplinaryPdf.jsx describes, expressed as a
   sequence of stencil calls instead of as DOM to be photographed. Read it
   top to bottom and you are reading the printed page top to bottom.

   See pdfDraw.js for why this exists and what it makes impossible. */

import { createFormPdf, loadLogoPngBytes } from '../pdfDraw';
import { fmtDate } from '../DocPdfShell';
import { WARNING_LEVELS, warningLevelLabel, isDisciplinaryPrintFinal } from './disciplinaryModel';

const FORM_TITLE = 'EMPLOYEE DISCIPLINARY NOTICE FORM';

/* Section wording is the paper form's own, verbatim — see the 2026-08-12
   source-fidelity audit. Sections 2 and 5 had been shortened. */
const SECTIONS = [
  [1, 'What occurred', 'whatOccurred'],
  [2, 'Earlier verbal or written warnings, discussions, etc. on this issue', 'earlierWarnings'],
  [3, 'Company policy states', 'companyPolicyStates'],
  [4, 'Employee statement', 'employeeStatement'],
  [5, 'Corrective action that must be taken by the employee', 'correctiveActionRequired'],
  [6, 'The company will', 'companyWill'],
  [7, 'If behavior is not corrected/performance does not improve', 'ifNotCorrected'],
];

export async function drawDisciplinaryPdf(model, onProgress) {
  onProgress?.(1, 1);
  const logoBytes = await loadLogoPngBytes(`${import.meta.env.BASE_URL}icons/shackelford-logo.webp`);
  const doc = await createFormPdf({
    formTitle: FORM_TITLE,
    logoBytes,
    draft: !isDisciplinaryPrintFinal(model),
  });

  // Field order is the paper form's: Name | Supervisor, then Position | Date.
  doc.infoTable([
    ['Employee Name', model.employeeName, 'Supervisor', model.supervisor],
    ['Position', model.position, 'Date', fmtDate(model.noticeDate)],
  ], 0.19);

  doc.space(6);
  // The paper form introduces the boxes with a sentence, not a section label.
  doc.fieldLabel('This notice serves as:', { caps: false });
  doc.checkboxGrid({
    options: WARNING_LEVELS.map(w => w.label),
    checked: warningLevelLabel(model.warningLevel),
    columns: 4,
  });

  for (const [number, title, field] of SECTIONS) {
    doc.space(5);
    doc.numberedBar(number, title);
    // 40pt ~= two written lines plus padding. Sized so a notice with short
    // answers still lands both signature rows on page 1 rather than pushing
    // the manager's signature onto a near-empty second page.
    doc.textBox({ text: model[field], minH: 40 });
  }

  doc.space(8);
  doc.grayBar('Signatures');
  const employeeSig = await doc.embedSignature(model.employeeSignatureData);
  const managerSig = await doc.embedSignature(model.managerSignatureData);
  doc.signatureRow({
    label: 'Employee Signature',
    image: employeeSig,
    dateValue: fmtDate(model.employeeSignatureDate),
  });
  doc.signatureRow({
    label: 'Manager Signature',
    image: managerSig,
    dateValue: fmtDate(model.managerSignatureDate),
  });

  return doc.finish();
}
