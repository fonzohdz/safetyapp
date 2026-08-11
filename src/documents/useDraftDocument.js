import { useEffect, useRef, useState } from 'react';
import { loadDraft, saveDraft, clearDraft } from './storage';
import { printedFingerprint } from './printedFingerprint';

/* ── Generic single-draft document workflow state ──
   Extracted from the near-identical draft/autosave/status logic that JSA
   and Incident Report each hand-wrote in App() (see main.jsx) — this hook
   is used ONLY by the four new documents added in this mission
   (Disciplinary, Uncontrolled Event, Medical Event, Separation). JSA and
   Incident keep their own existing, unmodified implementations untouched;
   retrofitting them onto this hook is deliberately out of scope (real
   behavior differences — JSA's template system, Incident's photo-blob
   cleanup on discard — aren't worth forcing through one generic path).

   Config:
   - storageKey: one of DOCUMENT_STORAGE_KEYS (see storage.js)
   - emptyModel(): returns a fresh blank document object; must include an
     `id`, `status` ('draft'|'ready'|'completed'), `lastSavedAt`,
     `completedAt`
   - hasMeaningfulContent(model): true once autosave should start caring
   - migrateShape(raw): optional, defaults to identity — same purpose as
     incidentModel.js's migrateIncidentShape
   - firstStepId: the step id to land on when starting/loading a draft
   - active: whether this document's builder is the one currently open
     (autosave only runs while true — mirrors the `activeDoc === 'jsa'`
     gate on JSA's own autosave effect) */
export function useDraftDocument({ storageKey, emptyModel, hasMeaningfulContent, migrateShape = raw => raw, firstStepId, active }) {
  const [model, setModelRaw] = useState(() => emptyModel());
  const [savedDraft, setSavedDraft] = useState(() => {
    const raw = loadDraft(storageKey);
    return raw ? migrateShape(raw) : null;
  });
  const [step, setStep] = useState(firstStepId);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const autoSaveTimer = useRef(null);
  const lastSnapshot = useRef('');

  useEffect(() => {
    if (!active) return undefined;
    if (!hasMeaningfulContent(model)) return undefined;
    const snapshot = JSON.stringify({ ...model, lastSavedAt: '' });
    if (snapshot === lastSnapshot.current) return undefined;
    setSaveStatus('saving');
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const next = { ...model, lastSavedAt: new Date().toISOString() };
      if (saveDraft(storageKey, next)) {
        lastSnapshot.current = snapshot;
        setSavedDraft(next);
        setModelRaw(prev => ({ ...prev, lastSavedAt: next.lastSavedAt }));
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    }, 900);
    return () => clearTimeout(autoSaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, active]);

  /* Editing any field after the document was marked ready/completed
     silently returns it to draft — same rule as Incident's upd() — so a
     stale "final" PDF can never be shared/downloaded without the user
     re-confirming readiness. Callers that need an exemption (bookkeeping
     fields only) should patch `model` directly via the setter's functional
     form instead of calling upd(). */
  function upd(patch) {
    setModelRaw(prev => {
      const next = { ...prev, ...patch };
      if (prev.status !== 'draft' && printedFingerprint(next) !== printedFingerprint(prev)) {
        next.status = 'draft';
        next.completedAt = '';
      }
      return next;
    });
  }

  function saveNow() {
    clearTimeout(autoSaveTimer.current);
    setSaveStatus('saving');
    const next = { ...model, lastSavedAt: new Date().toISOString() };
    if (saveDraft(storageKey, next)) {
      lastSnapshot.current = JSON.stringify({ ...next, lastSavedAt: '' });
      setModelRaw(next);
      setSavedDraft(next);
      setSaveStatus('saved');
      return true;
    }
    setSaveStatus('error');
    return false;
  }

  function markReady(isReadyFn) {
    if (!isReadyFn(model)) return false;
    clearTimeout(autoSaveTimer.current);
    const next = { ...model, status: 'ready', lastSavedAt: new Date().toISOString() };
    if (saveDraft(storageKey, next)) {
      lastSnapshot.current = JSON.stringify({ ...next, lastSavedAt: '' });
      setModelRaw(next);
      setSavedDraft(next);
      setSaveStatus('saved');
      return true;
    }
    setSaveStatus('error');
    return false;
  }

  function markCompleted() {
    const savedAt = new Date().toISOString();
    const next = { ...model, status: 'completed', completedAt: savedAt, lastSavedAt: savedAt };
    saveDraft(storageKey, next);
    lastSnapshot.current = JSON.stringify({ ...next, lastSavedAt: '' });
    setModelRaw(next);
    setSavedDraft(next);
  }

  function resetToBlank() {
    clearDraft(storageKey);
    setSavedDraft(null);
    setModelRaw(emptyModel());
    lastSnapshot.current = '';
    setStep(firstStepId);
  }

  function loadSaved() {
    const raw = loadDraft(storageKey) || savedDraft;
    if (!raw) return false;
    const normalized = { ...emptyModel(), ...migrateShape(raw) };
    setModelRaw(normalized);
    setSavedDraft(normalized);
    setStep(firstStepId);
    return true;
  }

  function hasExistingContent() {
    const persisted = loadDraft(storageKey) || savedDraft;
    return hasMeaningfulContent(persisted) || hasMeaningfulContent(model);
  }

  // Loads externally-sourced data (an imported draft file) as this
  // document's current draft — same normalization loadSaved() applies to
  // this device's own localStorage, and persisted immediately (not left to
  // the autosave debounce) so an import survives even if the tab closes
  // right after.
  function replaceWith(rawData) {
    clearTimeout(autoSaveTimer.current);
    const normalized = { ...emptyModel(), ...migrateShape(rawData) };
    setModelRaw(normalized);
    setSavedDraft(normalized);
    lastSnapshot.current = '';
    setStep(firstStepId);
    saveDraft(storageKey, normalized);
  }

  function discard() {
    clearDraft(storageKey);
    setSavedDraft(null);
  }

  return {
    model, upd, setModel: setModelRaw,
    step, setStep,
    savedDraft, saveStatus,
    saveNow, markReady, markCompleted, resetToBlank, loadSaved, hasExistingContent, discard, replaceWith,
  };
}

/* Same idle/saving/saved/error -> display-string mapping Incident's own
   incidentSaveStatusLabel computes inline in App() — shared here so the
   four new documents don't each repeat the ternary chain. */
export function saveStatusLabel(saveStatus, lastSavedAt) {
  if (saveStatus === 'saving') return 'Saving…';
  if (saveStatus === 'error') return 'Save failed — try Save Now';
  if (saveStatus === 'saved') return 'Saved';
  return lastSavedAt ? 'Saved' : 'Not saved yet';
}
