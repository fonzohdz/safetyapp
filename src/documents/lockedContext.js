import { createContext, useContext } from 'react';

/* ── Finished-document editing lock ──
   A tiny standalone module (not part of FormPrimitives.jsx itself) so it
   can be imported by SignaturePad.jsx too without creating a circular
   import (FormPrimitives already imports SignaturePad). Field/TextAreaField/
   SegmentedToggle/ChipGroup/SignaturePad all read this via useLocked()
   instead of requiring an explicit `locked` prop at every call site --
   with 50+ field call sites across five workflows, a context is what makes
   "wrap this step's content once" tractable instead of touching every
   field individually. Each workflow's top-level component wraps its step
   content in <LockedContext.Provider value={isXPrintFinal(model)}>. */
export const LockedContext = createContext(false);
export function useLocked() {
  return useContext(LockedContext);
}
