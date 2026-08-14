import { useRef } from 'react';
import {
  DISCIPLINARY_STEPS, WARNING_LEVELS,
  getDisciplinaryReadinessChecks, isDisciplinaryReady, isDisciplinaryPrintFinal, isVerbalWarning,
} from './disciplinaryModel';
import { disciplinaryFacsimileBlocks } from './disciplinaryPdfDraw';
import {
  Field, TextAreaField, SegmentedToggle, StepPanel, NumberedSection, StepFooter,
  BuilderHeader, StepNav, ReviewExportPanel, SignaturePad, DocFacsimile,
  useIsTouchPrimary, useElementWidth,
} from '../FormPrimitives';
import { LockedContext, useLocked } from '../lockedContext';
import { downloadDraftFile, buildDraftFilename } from '../../shared/draftTransfer';

/* Same pattern as Separation's employee-refused-to-sign toggle and Medical
   Event's Provider Note Attached -- a plain Yes/No button for a fact the
   source form has no other way to capture. An employee who is unavailable
   or refuses to sign is a real, common outcome, not a reason the notice
   should be stuck unable to complete (see disciplinaryModel.js). */
function BooleanToggle({ label, value, onChange, onLabel = 'Yes', offLabel = 'No' }) {
  const locked = useLocked();
  return (
    <label className="field">
      <span>{label}</span>
      <div className="yesNoToggle">
        <button
          type="button"
          aria-pressed={value}
          aria-disabled={locked}
          className={`btn${value ? ' active yes' : ''}`}
          onClick={() => { if (!locked) onChange(!value); }}
        >
          {value ? onLabel : offLabel}
        </button>
      </div>
    </label>
  );
}

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
        <TextAreaField label="What happened?" rows={5} value={model.whatOccurred} onChange={v => upd({ whatOccurred: v })} voice />
      </NumberedSection>

      <NumberedSection number={2} title="Earlier Warnings / Discussions" help="Any earlier verbal or written warnings, or discussions, on this same issue. Leave blank if this is the first occurrence.">
        <TextAreaField label="Has this employee been warned or talked to about this before?" rows={3} value={model.earlierWarnings} onChange={v => upd({ earlierWarnings: v })} voice />
      </NumberedSection>

      <NumberedSection number={3} title="Company Policy States">
        <TextAreaField label="What company rule or policy applies?" rows={3} value={model.companyPolicyStates} onChange={v => upd({ companyPolicyStates: v })} voice />
      </NumberedSection>

      {!isVerbalWarning(model) && (
        <NumberedSection number={4} title="Employee Statement" help="Write down what the employee says, in their own words — don't summarize or rephrase it.">
          <TextAreaField label="What does the employee say happened?" rows={4} value={model.employeeStatement} onChange={v => upd({ employeeStatement: v })} voice />
        </NumberedSection>
      )}

      <StepFooter hasNext onNext={next} />
    </StepPanel>
  );
}

/* ── Step: Corrective Action — sections 5-7 + signatures ── */
function StepResponse({ model, upd, prev, next }) {
  return (
    <StepPanel title="Corrective Action" intro="What the employee must do, what the company will do, and the consequence if this is not corrected.">
      <NumberedSection number={5} title="Corrective Action Required of Employee">
        <TextAreaField label="What must the employee do to correct this?" rows={4} value={model.correctiveActionRequired} onChange={v => upd({ correctiveActionRequired: v })} voice />
      </NumberedSection>

      <NumberedSection number={6} title="The Company Will">
        <TextAreaField label="What will the company do?" rows={3} value={model.companyWill} onChange={v => upd({ companyWill: v })} voice />
      </NumberedSection>

      <NumberedSection number={7} title="If Behavior Is Not Corrected / Performance Does Not Improve">
        <TextAreaField label="What happens if this isn't corrected?" rows={3} value={model.ifNotCorrected} onChange={v => upd({ ifNotCorrected: v })} voice />
      </NumberedSection>

      <div className="formSection">
        <span className="formSectionHeading">Signatures</span>
        {isVerbalWarning(model) ? (
          <p className="helperText">A verbal warning is a coaching conversation, not a signed notice — the employee doesn't sign this. Document what was said above; only the manager signs below.</p>
        ) : (
          <>
            <BooleanToggle label="Employee refused / unavailable to sign" value={model.employeeRefusedToSign} onChange={v => upd({ employeeRefusedToSign: v })} />
            <div className="formPairRow">
              <SignaturePad label="Employee Signature" value={model.employeeSignatureData} disabled={model.employeeRefusedToSign} onChange={data => upd({ employeeSignatureData: data, employeeSignatureDate: data ? new Date().toISOString().slice(0, 10) : model.employeeSignatureDate })} />
              <Field label="Employee Signature Date" type="date" value={model.employeeSignatureDate} onChange={v => upd({ employeeSignatureDate: v })} disabled={model.employeeRefusedToSign} />
            </div>
          </>
        )}
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
  pdfExportState, isPdfStale, onGeneratePdf, onDownload, onMarkReady, onMarkIncomplete, onStartNew,
}) {
  const idx = DISCIPLINARY_STEPS.findIndex(s => s.id === step);
  function prev() { if (idx > 0) setStep(DISCIPLINARY_STEPS[idx - 1].id); }
  function next() { if (idx < DISCIPLINARY_STEPS.length - 1) setStep(DISCIPLINARY_STEPS[idx + 1].id); }

  const checks = getDisciplinaryReadinessChecks(model);
  const checklistComplete = isDisciplinaryReady(model);
  const locked = isDisciplinaryPrintFinal(model);

  const isReviewStep = step === 'review';
  const shellRef = useRef(null);
  const shellWidth = useElementWidth(shellRef);
  const isTouchPrimary = useIsTouchPrimary();
  const showSideBySide = !isTouchPrimary && shellWidth >= 1000 && isReviewStep;
  const previewPanel = (
    <div className="card previewPanel">
      <div className="previewPanelHeader">
        <div>
          <strong>What Will Print</strong>
          <span>A facsimile of the printed notice — not the exact page layout</span>
        </div>
      </div>
      <DocFacsimile formTitle="Employee Disciplinary Notice Form" draft={!locked} blocks={disciplinaryFacsimileBlocks(model)} />
    </div>
  );

  return (
    <>
      <BuilderHeader
        kicker="Employee Disciplinary Notice"
        title={model.employeeName || 'Untitled Disciplinary Notice'}
        statusBadgeLabel={locked ? 'Completed' : 'Draft'}
        statusBadgeClass={model.status === 'draft' ? 'draft' : 'avail'}
        saveStatus={saveStatus}
        saveStatusState={saveStatusState}
        onSaveNow={onSaveNow}
        onBack={goDocs}
        backLabel="Documents"
      />

      <LockedContext.Provider value={locked}>
        <div className={`workflowShell withStepNav${showSideBySide ? ' withPreview' : ''}`} ref={shellRef}>
          <StepNav steps={DISCIPLINARY_STEPS} activeStepId={step} checks={checks} onJump={setStep} />
          <div className="workflowLeft">
            {step === 'notice' && <StepNotice model={model} upd={upd} next={next} />}
            {step === 'response' && <StepResponse model={model} upd={upd} prev={prev} next={next} />}
            {step === 'review' && (
              <ReviewExportPanel
                title="Review & Export"
                checks={checks}
                checklistComplete={checklistComplete}
                status={model.status}
                draftExplainText="Complete the checklist below, then mark this document complete."
                markReadyHintText="Everything required is filled in. Marking it complete locks the document from editing — you can unmark it any time from here."
                onMarkReady={onMarkReady}
                onMarkIncomplete={onMarkIncomplete}
                pdfExportState={pdfExportState}
                isPdfStale={isPdfStale}
                onGeneratePdf={onGeneratePdf}
                onDownload={onDownload}
                onStartNew={onStartNew}
                startNewLabel="Start a new disciplinary notice"
                onExportDraft={() => downloadDraftFile('disciplinary', model, buildDraftFilename(model.employeeName, 'Disciplinary Notice', model.noticeDate))}
                onBack={prev}
                onJumpCheck={chk => setStep(chk.step)}
              />
            )}
            {!showSideBySide && isReviewStep && previewPanel}
          </div>
          {showSideBySide && (
            <div className="workflowRight">
              {previewPanel}
            </div>
          )}
        </div>
      </LockedContext.Provider>
    </>
  );
}
