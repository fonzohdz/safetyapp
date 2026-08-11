import {
  DISCIPLINARY_STEPS, disciplinaryStepStatus, WARNING_LEVELS,
  getDisciplinaryReadinessChecks, isDisciplinaryReady, isDisciplinaryPrintFinal,
} from './disciplinaryModel';
import {
  Field, TextAreaField, SegmentedToggle, StepPanel, NumberedSection, StepFooter,
  BuilderHeader, ReviewExportPanel, SignaturePad,
} from '../FormPrimitives';
import { LockedContext } from '../lockedContext';

/* ── Step: Notice Details — employee info, warning level, sections 1-4 ── */
function StepNotice({ model, upd, next }) {
  return (
    <StepPanel title="Notice Details" intro="Basic facts about the employee and what occurred. Enter only what happened — do not decide the outcome here.">
      <div className="formGrid">
        <Field label="Employee Name" value={model.employeeName} onChange={v => upd({ employeeName: v })} />
        <div className="formPairRow">
          <Field label="Supervisor" value={model.supervisor} onChange={v => upd({ supervisor: v })} />
          <Field label="Position" value={model.position} onChange={v => upd({ position: v })} />
        </div>
        <Field label="Date" type="date" value={model.noticeDate} onChange={v => upd({ noticeDate: v })} />
      </div>

      <SegmentedToggle
        label="Warning Level"
        value={model.warningLevel}
        onChange={v => upd({ warningLevel: v })}
        options={WARNING_LEVELS}
      />

      <NumberedSection number={1} title="What Occurred">
        <TextAreaField label="Describe what happened" rows={5} value={model.whatOccurred} onChange={v => upd({ whatOccurred: v })} voice />
      </NumberedSection>

      <NumberedSection number={2} title="Earlier Warnings / Discussions" help="Any earlier verbal or written warnings, or discussions, on this same issue. Leave blank if this is the first occurrence.">
        <TextAreaField label="Prior warnings or discussions" rows={3} value={model.earlierWarnings} onChange={v => upd({ earlierWarnings: v })} voice />
      </NumberedSection>

      <NumberedSection number={3} title="Company Policy States">
        <TextAreaField label="Relevant policy" rows={3} value={model.companyPolicyStates} onChange={v => upd({ companyPolicyStates: v })} voice />
      </NumberedSection>

      <NumberedSection number={4} title="Employee Statement" help="The employee's own account, in their own words.">
        <TextAreaField label="Employee statement" rows={4} value={model.employeeStatement} onChange={v => upd({ employeeStatement: v })} voice />
      </NumberedSection>

      <StepFooter hasNext onNext={next} />
    </StepPanel>
  );
}

/* ── Step: Corrective Action — sections 5-7 + signatures ── */
function StepResponse({ model, upd, prev, next }) {
  return (
    <StepPanel title="Corrective Action" intro="What the employee must do, what the company will do, and the consequence if this is not corrected.">
      <NumberedSection number={5} title="Corrective Action Required of Employee">
        <TextAreaField label="Corrective action" rows={4} value={model.correctiveActionRequired} onChange={v => upd({ correctiveActionRequired: v })} voice />
      </NumberedSection>

      <NumberedSection number={6} title="The Company Will">
        <TextAreaField label="Company action" rows={3} value={model.companyWill} onChange={v => upd({ companyWill: v })} voice />
      </NumberedSection>

      <NumberedSection number={7} title="If Behavior Is Not Corrected / Performance Does Not Improve">
        <TextAreaField label="Consequence" rows={3} value={model.ifNotCorrected} onChange={v => upd({ ifNotCorrected: v })} voice />
      </NumberedSection>

      <div className="formSection">
        <span className="formSectionHeading">Signatures</span>
        <div className="formPairRow">
          <SignaturePad label="Employee Signature" value={model.employeeSignatureData} onChange={data => upd({ employeeSignatureData: data, employeeSignatureDate: data ? new Date().toISOString().slice(0, 10) : model.employeeSignatureDate })} />
          <Field label="Employee Signature Date" type="date" value={model.employeeSignatureDate} onChange={v => upd({ employeeSignatureDate: v })} />
        </div>
        <div className="formPairRow">
          <SignaturePad label="Manager Signature" value={model.managerSignatureData} onChange={data => upd({ managerSignatureData: data, managerSignatureDate: data ? new Date().toISOString().slice(0, 10) : model.managerSignatureDate })} />
          <Field label="Manager Signature Date" type="date" value={model.managerSignatureDate} onChange={v => upd({ managerSignatureDate: v })} />
        </div>
      </div>

      <StepFooter hasBack hasNext onBack={prev} onNext={next} nextLabel="Go to Review" />
    </StepPanel>
  );
}

/* ── Top-level workflow shell ── */
export default function DisciplinaryWorkflow({
  model, upd, step, setStep, goDocs, saveStatus, saveStatusState, onSaveNow,
  pdfExportState, isPdfStale, onGeneratePdf, onDownload, onMarkReady, onStartNew,
}) {
  const idx = DISCIPLINARY_STEPS.findIndex(s => s.id === step);
  function prev() { if (idx > 0) setStep(DISCIPLINARY_STEPS[idx - 1].id); }
  function next() { if (idx < DISCIPLINARY_STEPS.length - 1) setStep(DISCIPLINARY_STEPS[idx + 1].id); }

  const checks = getDisciplinaryReadinessChecks(model);
  const checklistComplete = isDisciplinaryReady(model);
  const locked = isDisciplinaryPrintFinal(model);

  return (
    <>
      <BuilderHeader
        kicker="Employee Disciplinary Notice"
        title={model.employeeName || 'Untitled Disciplinary Notice'}
        statusBadgeLabel={locked ? 'Finished' : 'Draft'}
        statusBadgeClass={model.status === 'draft' ? 'draft' : 'avail'}
        saveStatus={saveStatus}
        saveStatusState={saveStatusState}
        onSaveNow={onSaveNow}
        onBack={goDocs}
        backLabel="Documents"
        steps={DISCIPLINARY_STEPS}
        activeStepId={step}
        getStepStatus={id => disciplinaryStepStatus(model, id)}
        onJumpStep={setStep}
      />

      <LockedContext.Provider value={locked}>
        <div className="workflowShell stacked">
          <div className="workflowLeft">
            {step === 'notice' && <StepNotice model={model} upd={upd} next={next} />}
            {step === 'response' && <StepResponse model={model} upd={upd} prev={prev} next={next} />}
            {step === 'review' && (
              <ReviewExportPanel
                title="Review & Export"
                checks={checks}
                checklistComplete={checklistComplete}
                status={model.status}
                draftExplainText="Complete the checklist below, then finish this document."
                markReadyHintText="Everything required is filled in. Finishing will lock the document from further editing."
                onMarkReady={onMarkReady}
                pdfExportState={pdfExportState}
                isPdfStale={isPdfStale}
                onGeneratePdf={onGeneratePdf}
                onDownload={onDownload}
                onStartNew={onStartNew}
                startNewLabel="Start a new disciplinary notice"
                onBack={prev}
              />
            )}
          </div>
        </div>
      </LockedContext.Provider>
    </>
  );
}
