---
name: review-evidence
description: Generate the real screenshots + real PDFs required by CLAUDE.md's review workflow (step 6) for any change touching a document workflow, its fields, layout, or PDF output. Use before asking for merge approval.
---

# Review evidence (screenshots + real PDFs)

CLAUDE.md's required workflow says: for any change touching a document
workflow, its fields, layout, or PDF output, drive it through the real UI
and send screenshots of each affected step plus a generated **draft** PDF
and a generated **final** PDF — the same way a real user would experience
it. This skill is that recipe, distilled from the existing scripts in
`tools/testing/` so it doesn't have to be re-derived from scratch each time.

Don't reinvent this from raw Playwright docs. Two existing scripts are the
reference patterns — read the one that's the closer match before writing
anything new:

- `tools/testing/review-package.mjs` — the fuller pattern: multiple
  viewports (tablet 820x1180 touch, desktop 1440x900), multiple doc types
  in one run, seeds a fixture via `addInitScript`, walks Review via
  `gotoReview()`, captures the readiness-checklist states, downloads a
  DRAFT pdf, triggers Mark Complete, downloads a FINAL pdf.
- `tools/testing/verify-jsa-pdf.mjs` — the single-document deep-dive
  pattern: seeds one fixture, drives to Review, reads the app's own
  pre-generation page-count estimate (`.exportPlanGrid`), triggers the
  real `exportPdf()` pipeline, downloads the PDF, then reveals the
  off-screen `.pdfExportRoot .printPage` nodes to screenshot each real
  export page directly (the exact DOM html2canvas rasterizes).

## The recipe

1. **Build first.** `npm run build` — these scripts serve `dist/` via
   `vite preview`, not the dev server, so they exercise the real
   production bundle.
2. **Pick or write fixture JSON**, not by hand-typing through the UI.
   Fixtures live in `tools/testing/fixtures/*.json`, one per doc type/
   scenario (e.g. `disciplinary-normal.json`,
   `jsa-stress-messy-continuation.json`). If none fits the change, write a
   new one modeled on an existing file for the same doc type. Prefer
   **messy real-world content** — short fragments, odd punctuation,
   unusual aspect-ratio signature images — over clean short strings.
   Clean test data has previously passed review while hiding real layout
   bugs (see CLAUDE.md).
3. **Seed localStorage** with `context.addInitScript(([k, j]) =>
   window.localStorage.setItem(k, j), [storageKey, json])` *before*
   `page.goto()` — this runs before React's first render, so the lazy
   localStorage read on mount already sees it. Storage key names per doc
   type are listed in CLAUDE.md's "localStorage keys" section (e.g.
   `sdc.jsa.draft.v4`, `sdc.discipline.draft.v1`).
4. **Drive the real flow**, not a shortcut: open/continue the draft →
   walk to the Review/Export step → **Create Document** (the actual
   `exportPdf()` → PDF-generation pipeline, not a stub) → **Download
   Document**. `review-package.mjs`'s `gotoReview()` /
   `openDraft()` / `startBlank()` / `download()` helpers already handle
   the common navigation shapes — reuse them rather than re-deriving
   selectors.
5. **Capture both a draft and a final PDF** where the change is relevant
   — a draft is watermarked, a final (post "Mark Complete" / status
   change, forcing "Update Document") is not. Both are named artifacts
   Fonzo is shown, not just one.
6. **Extract the real embedded raster**, don't trust a generic PDF
   viewer or a live-DOM screenshot for the final visual call:
   `node tools/testing/extract-pdf-images.mjs <pdfPath> <outDir>` pulls
   the exact html2canvas-rasterized PNG per page straight out of the PDF
   object graph. This is what a human actually sees when they open the
   PDF. See CLAUDE.md's html2canvas gotcha entry — the live DOM has
   previously measured "correct" while the real export was wrong.
7. **On Windows, redirect output to a file**: `node script.mjs >
   out.log 2>&1` — never pipe to `tail`, it has deadlocked stdout on this
   stack before with zero output until killed.
8. **Send the result**: screenshots of every affected step (both a
   tablet/iPad viewport and desktop if the change touches responsive
   layout or the C2 redesign) + the draft PDF + the final PDF, per
   CLAUDE.md step 6. This is the primary review mechanism — a written
   description of the change does not substitute for it.

## When a new verify-*.mjs is warranted vs. reusing one

If an existing `verify-*.mjs` already exercises the doc type and workflow
step touched by the change, prefer running it as-is (or with a small,
obviously-scoped edit) over writing a new script. Only write a new one
when the change touches a flow or doc type none of the existing scripts
cover. Existing scripts (non-exhaustive — check `tools/testing/` for the
current list): `verify-jsa-pdf.mjs`, `verify-disciplinary.mjs`,
`verify-incident-pdf.mjs`, `verify-medical-event.mjs`,
`verify-separation.mjs`, `verify-uncontrolled-event.mjs`,
`verify-crew-signin-kiosk.mjs`, `verify-review-facsimile.mjs`,
`verify-mobile-ux.mjs`, `verify-superintendent-facsimile.mjs`, and
`review-package.mjs` for the multi-doc-type sweep.

## Never skip

- Printing/PDF output is highest-risk in this codebase (see CLAUDE.md
  "Historical lessons"). Never certify a print/PDF layout change from the
  live preview or DOM measurement alone.
- This is evidence-gathering only. It does not grant merge approval —
  CLAUDE.md's exact verbatim question still has to be asked and answered
  before `git merge`/`git commit`/`git push origin main`.
