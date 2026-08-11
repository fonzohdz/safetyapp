import {
  MEDICAL_EVENT_STEPS, medicalEventStepStatus,
  SYMPTOM_ONSET_OPTIONS, RESPONSE_ACTIONS, MEDICAL_EVALUATION_TYPES, WORK_STATUS_OPTIONS, INITIAL_CLASSIFICATIONS,
  MEDICAL_ATTACHMENT_OPTIONS,
  getMedicalEventReadinessChecks, isMedicalEventReady, isMedicalEventPrintFinal,
} from './medicalEventModel';
import {
  Field, TextAreaField, SegmentedToggle, ChipGroup, StepPanel, StepFooter,
  BuilderHeader, ReviewExportPanel, SignaturePad,
} from '../FormPrimitives';
import { LockedContext, useLocked } from '../lockedContext';

function toggleInList(list, item) {
  return (list || []).includes(item) ? list.filter(x => x !== item) : [...(list || []), item];
}

/* ── Step: Event & Response ── */
function StepCondition({ model, upd, next }) {
  return (
    <StepPanel title="Event & Response" intro="What the employee reported, and what was done right away. Keep this factual — record what was said and observed, not a diagnosis or cause.">
      <div className="formSection">
        <span className="formSectionHeading">Employee Information</span>
        <div className="formGrid">
          <Field label="Employee Name" value={model.employeeName} onChange={v => upd({ employeeName: v })} />
          <div className="formPairRow">
            <Field label="Supervisor" value={model.supervisor} onChange={v => upd({ supervisor: v })} />
            <Field label="Position" value={model.position} onChange={v => upd({ position: v })} />
          </div>
          <Field label="Project / Location" value={model.projectLocation} onChange={v => upd({ projectLocation: v })} />
          <div className="formPairRow">
            <Field label="Date" type="date" value={model.eventDate} onChange={v => upd({ eventDate: v })} />
            <Field label="Time Reported" type="time" value={model.timeReported} onChange={v => upd({ timeReported: v })} />
          </div>
        </div>
      </div>

      <div className="formSection">
        <span className="formSectionHeading">Employee-Reported Condition</span>
        <TextAreaField label="Symptoms / Concerns (as reported by the employee)" rows={4} value={model.reportedSymptoms} onChange={v => upd({ reportedSymptoms: v })} voice />
        <SegmentedToggle label="When Symptoms First Appeared" value={model.symptomsOnset} onChange={v => upd({ symptomsOnset: v })} options={SYMPTOM_ONSET_OPTIONS} />
        <SegmentedToggle
          label="Specific Work Event or Exposure Reported?"
          value={model.specificWorkEventReported}
          onChange={v => upd({ specificWorkEventReported: v })}
          options={[{ value: 'yes', label: 'Yes', tone: 'yes' }, { value: 'no', label: 'No', tone: 'no' }]}
        />
        {model.specificWorkEventReported === 'yes' && (
          <>
            <TextAreaField label="Describe the work event / exposure reported" rows={3} value={model.workEventDescription} onChange={v => upd({ workEventDescription: v })} voice />
            <div className="pdfStaleWarning">
              <strong>A specific work event/exposure was reported.</strong>
              <p>Complete the Incident Reporting and Investigation Form when a specific work event or exposure is reported. This Medical Event form does not replace it, and this app will not create that report automatically or assume it is required — confirm with Safety/Supervision.</p>
            </div>
          </>
        )}
      </div>

      <div className="formSection">
        <span className="formSectionHeading">Response / Actions Taken</span>
        <ChipGroup label="Actions taken (check all that apply)" options={RESPONSE_ACTIONS} selected={model.responseActions} onToggle={opt => upd({ responseActions: toggleInList(model.responseActions, opt) })} />
        {(model.responseActions || []).includes('Other') && (
          <Field label="Other action — specify" value={model.responseActionsOther} onChange={v => upd({ responseActionsOther: v })} />
        )}
        <TextAreaField label="Safety / Supervisor Observations and Actions" help="What safety/supervision directly observed and did — separate from what the employee reported above." rows={4} value={model.safetyObservations} onChange={v => upd({ safetyObservations: v })} voice />
      </div>

      <StepFooter hasNext onNext={next} />
    </StepPanel>
  );
}

/* ── Step: Evaluation & Classification ── */
function StepEvaluation({ model, upd, prev, next }) {
  const locked = useLocked();
  return (
    <StepPanel title="Evaluation & Classification" intro="Medical evaluation, current work status, and the initial classification. This app never decides work-relatedness or OSHA recordability — select what applies based on the facts.">
      <div className="formSection">
        <span className="formSectionHeading">Medical Evaluation / Work Status</span>
        <SegmentedToggle label="Medical Evaluation" value={model.medicalEvaluationType} onChange={v => upd({ medicalEvaluationType: v })} options={MEDICAL_EVALUATION_TYPES} />
        {model.medicalEvaluationType === 'other' && (
          <Field label="Other evaluation — specify" value={model.medicalEvaluationOther} onChange={v => upd({ medicalEvaluationOther: v })} />
        )}
        <Field label="Clinic / Provider" value={model.clinicProvider} onChange={v => upd({ clinicProvider: v })} />
        <SegmentedToggle label="Work Status" value={model.workStatus} onChange={v => upd({ workStatus: v })} options={WORK_STATUS_OPTIONS} />
        {model.workStatus === 'offWork' && (
          <Field label="Off Work Until" type="date" value={model.offWorkUntilDate} onChange={v => upd({ offWorkUntilDate: v })} />
        )}
        <label className="field">
          <span>Provider Note Attached</span>
          <div className="yesNoToggle">
            <button
              type="button"
              aria-pressed={model.providerNoteAttached}
              aria-disabled={locked}
              className={`btn${model.providerNoteAttached ? ' active yes' : ''}`}
              onClick={() => { if (!locked) upd({ providerNoteAttached: !model.providerNoteAttached }); }}
            >
              {model.providerNoteAttached ? 'Yes — Attached' : 'No'}
            </button>
          </div>
        </label>
      </div>

      <div className="formSection">
        <span className="formSectionHeading">Attachments</span>
        <ChipGroup label="Attached to this report (check all that apply)" options={MEDICAL_ATTACHMENT_OPTIONS} selected={model.attachments} onToggle={opt => upd({ attachments: toggleInList(model.attachments, opt) })} />
        {(model.attachments || []).includes('Other') && (
          <Field label="Other attachment — specify" value={model.attachmentOther} onChange={v => upd({ attachmentOther: v })} />
        )}
      </div>

      <div className="formSection">
        <span className="formSectionHeading">Initial Classification</span>
        <p className="helperText">Selected based on the facts above — this app does not determine or suggest a classification.</p>
        <SegmentedToggle label="Initial Classification" value={model.initialClassification} onChange={v => upd({ initialClassification: v })} options={INITIAL_CLASSIFICATIONS} />
      </div>

      <div className="formSection">
        <span className="formSectionHeading">Signatures</span>
        <div className="formPairRow">
          <SignaturePad label="Employee Signature (if able)" value={model.employeeSignatureData} onChange={data => upd({ employeeSignatureData: data, employeeSignatureDate: data ? new Date().toISOString().slice(0, 10) : model.employeeSignatureDate })} />
          <Field label="Employee Signature Date" type="date" value={model.employeeSignatureDate} onChange={v => upd({ employeeSignatureDate: v })} />
        </div>
        <div className="formPairRow">
          <SignaturePad label="Supervisor / Safety Signature" value={model.supervisorSignatureData} onChange={data => upd({ supervisorSignatureData: data, supervisorSignatureDate: data ? new Date().toISOString().slice(0, 10) : model.supervisorSignatureDate })} />
          <Field label="Supervisor Signature Date" type="date" value={model.supervisorSignatureDate} onChange={v => upd({ supervisorSignatureDate: v })} />
        </div>
      </div>

      <StepFooter hasBack hasNext onBack={prev} onNext={next} nextLabel="Go to Review" />
    </StepPanel>
  );
}

/* ── Top-level workflow shell ── */
export default function MedicalEventWorkflow({
  model, upd, step, setStep, goDocs, saveStatus, saveStatusState, onSaveNow,
  pdfExportState, isPdfStale, onGeneratePdf, onDownload, onMarkReady, onStartNew,
}) {
  const idx = MEDICAL_EVENT_STEPS.findIndex(s => s.id === step);
  function prev() { if (idx > 0) setStep(MEDICAL_EVENT_STEPS[idx - 1].id); }
  function next() { if (idx < MEDICAL_EVENT_STEPS.length - 1) setStep(MEDICAL_EVENT_STEPS[idx + 1].id); }

  const checks = getMedicalEventReadinessChecks(model);
  const checklistComplete = isMedicalEventReady(model);
  const locked = isMedicalEventPrintFinal(model);

  return (
    <>
      <BuilderHeader
        kicker="Employee Medical Event"
        title={model.employeeName || 'Untitled Medical Event'}
        statusBadgeLabel={locked ? 'Finished' : 'Draft'}
        statusBadgeClass={model.status === 'draft' ? 'draft' : 'avail'}
        saveStatus={saveStatus}
        saveStatusState={saveStatusState}
        onSaveNow={onSaveNow}
        onBack={goDocs}
        backLabel="Documents"
        steps={MEDICAL_EVENT_STEPS}
        activeStepId={step}
        getStepStatus={id => medicalEventStepStatus(model, id)}
        onJumpStep={setStep}
      />

      <LockedContext.Provider value={locked}>
        <div className="workflowShell stacked">
          <div className="workflowLeft">
            {step === 'condition' && <StepCondition model={model} upd={upd} next={next} />}
            {step === 'evaluation' && <StepEvaluation model={model} upd={upd} prev={prev} next={next} />}
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
                startNewLabel="Start a new medical event report"
                onBack={prev}
              />
            )}
          </div>
        </div>
      </LockedContext.Provider>
    </>
  );
}
