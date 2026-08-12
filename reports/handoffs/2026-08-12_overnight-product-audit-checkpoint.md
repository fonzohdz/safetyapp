# Overnight Product Audit — Mission Checkpoint

**Date:** 2026-08-12
**Mission:** Overnight autonomous product transformation of the Safety Documentation Center.
**Status of this document:** checkpoint written mid-mission, after the corrective/stability
batch and before the heavy workflow/design phases. Written so a fresh session can continue
without reconstructing anything from chat history.

> The mission ran across an interrupted session and a resumed one. This file — not the
> chat log — is the source of truth for what happened.

---

# CURRENT STATE

> ⚠️ **This section was written mid-mission and is now historical. Jump to
> "STATE AS OF END OF DAY 2026-08-12" at the bottom for the real current
> state — three deploys happened after this was written.**

| | (as written mid-mission) |
|---|---|
| Current branch | `testing` |
| Current commit | `ccfb39f` |
| Working tree | clean |
| `main` | `b886e62` — untouched *at that time* |
| Deployed? | Not at that time. **This is no longer true — see end-of-day section.** |

`testing` is 6 commits ahead of `main`:

```
ccfb39f test: real signature images in fixtures, and a review-evidence capture script
4cdb649 test: unhang the remaining six suites (incident, jsa-pdf, signature-pad)
01c9572 fix: make the next action obvious on Review & Export; unhang the test suites
a75498a fix: one name for one action — 'Mark Complete'/'Completed' across all six documents
90ec737 fix: root-cause PDF text-baseline defect — all four Superintendent docs now center
233561a fix: correct PDF cell centering, replace one-way document lock with a toggle
```

`233561a` predates the overnight mission proper (it is what `origin/testing` currently
points at); everything above it is mission work.

---

# WHAT HAS BEEN COMPLETED

## 1. PDF text-centering: root cause found, not just compensated

**The investigation.** The four Superintendent documents (Disciplinary, Separation,
Medical Event, Uncontrolled Event) had text sitting visibly low inside its bordered
cells in real generated PDFs. Prior sessions had treated this as "html2canvas is
unpredictable — apply an empirically-calibrated constant shift," and shipped a blanket
`transform: translateY(-4px)`.

**That diagnosis was wrong.** The actual mechanism:

> html2canvas 1.4.1's `FontMetrics.parseMetrics` appends its measuring probe directly to
> `document.body` **without resetting `line-height`**. It therefore inherits the app
> shell's `body { line-height: 1.5 }` and reports a baseline inflated by the extra
> half-leading (~7px at this document family's 10pt/9.5pt sizes). Every glyph then paints
> that far *below* its true baseline in the raster. Borders, checkbox squares, badges and
> signature images are unaffected — which is exactly why text looked low *relative to its
> boxes*, why DOM measurement found no slack to redistribute, and why a single constant
> only ever half-worked.

**Why this matters:** it explains every previously-unexplained symptom at once, and it
means the correction belongs at capture time rather than as per-element CSS guesswork.
It also explains why the earlier "measure the DOM and redistribute padding" technique
(which genuinely fixed Incident's compact cells) did nothing here.

**Proven two independent ways before any code changed:**
1. An in-browser verbatim re-implementation of html2canvas's probe formula, showing
   per-element-family baseline errors of +3.19 / +2.67 / +2.05 / +1px.
2. A same-page diff of the real extracted PDF raster against a Chrome DOM screenshot
   (`tools/testing/compare-dom-vs-raster.mjs`): all text shifted +7.4 to +8.8px, with
   borders identical.

A clone-divergence probe ruled out a layout race (clone measurements matched the
original) and surfaced `bodyLineHeight: "22.5px"` as the smoking gun.

**The fix** lives in `src/documents/pdfExportCore.js`: the shared capture loop is wrapped
in `try/finally` that sets `document.body.style.lineHeight = 'normal'` for the duration of
capture and restores the prior inline value afterwards.

**The old blanket `-4px` is gone.** `src/documents/docPdf.css` now pins the page's own
`line-height: 1.5` so layout no longer depends on app typography, and carries small
*residual* constants calibrated against real extracted rasters (`-5px` for
`.docPdfCellContent` / `.docPdfTextBlockText`; `-4px` for the caps-context families:
`.docPdfBarText`, `.docPdfCheckboxLabel`, `.docPdfCheckMark`, `.docPdfSigNoteText`,
`.docPdfTextBlockTitle`, `.docPdfTextBlockHelp`, `.docPdfSigDateText`). These are
export-only and nothing user-visible depends on them.

`src/documents/DocPdfShell.jsx` gained inner `<span>`s so those shifts move *glyphs only*
and never a border or fill — `GrayBar`, `NumberedBar`, `CheckboxGrid`, `TextBlock`,
`MultiSignatureRow`, `SignatureRow`.

**Real raster verification was performed** — desktop scale 2.5 and touch/iPad scale 2.0,
with zoomed crops inspected visually, not just analyzer numbers. Results in
*WHAT IS VERIFIED*.

## 2. Completion-state workflow

- **`Mark Complete` / `Mark Incomplete` is a real toggle.** Finishing a document used to
  be one-way ("This cannot be undone"). Field reality showed that was wrong: a generated
  PDF already correctly shows DRAFT for an unfinished document, yet the app locked the
  form with no way back short of losing work. `markIncomplete()` in
  `src/documents/useDraftDocument.js` reverses it.
- **Create Document no longer auto-locks.** Generating a PDF is not a declaration that the
  document is finished. The two concerns are now separate: you can generate a watermarked
  draft any number of times while still editing.
- **Status-aware generated-document fingerprints.** Each document passes
  `` `${printedFingerprint(model)}|${isXPrintFinal(model)}` `` to `usePdfExport`.
  `printedFingerprint()` deliberately excludes bookkeeping fields
  (`id/status/createdAt/lastSavedAt/completedAt/notes`), so the *status* half is appended
  explicitly. **Why it matters:** without it, marking a document complete would silently
  leave a stale watermarked DRAFT sitting in the download slot while the app claimed the
  document was final.
- **Stale-PDF detection after completion-state changes** follows from the above: crossing
  the draft↔complete boundary invalidates a generated PDF and the UI surfaces
  *"Document changed — update it before downloading."*
- **DRAFT vs FINAL filename and watermark behave together.** Unfinished exports get the
  `DRAFT` watermark and a `_DRAFT` filename suffix; a completed document gets neither.

## 3. Terminology consistency

One name for one action, across all six documents. `Finish Document` → **Mark Complete**;
`Finished` badge → **Completed**; the reverse action is **Mark Incomplete** everywhere.
Incident kept its own copy of this vocabulary in `src/incident/incidentCopy.js`, so it was
brought in line rather than left to drift. **Why it matters:** two names for one action is
the single cheapest way to make a field tool feel untrustworthy.

## 4. Review & Export hierarchy

- **Button weight was inverted.** `.btn.secondary` was a hardcoded `#111113` — near-black,
  the heaviest element in the entire light UI, *louder than the red `.primary` it is meant
  to sit beneath*. On Review & Export this meant "Export Draft File" (a utility)
  visually out-shouted "Create Document" (the actual next action), with three identical
  full-width bars stacked below it. There are now three genuine weights: red fill >
  outlined neutral > filled gray.
- **The readiness checklist was backwards.** Completed items got a colored check while
  *outstanding* items got a pale grey dot on a pale grey circle — the one thing the screen
  exists to communicate was its least visible element. Now outstanding items are
  full-strength text with an amber marker and a 34px tap target, they are the only
  clickable rows (each jumps straight to its field), and satisfied items recede.
- The helper text states the actual remaining count and that rows are tappable —
  *"7 items still needed — tap one to go straight to it"* — instead of generic advice
  that made the user count for themselves.

## 5. Test infrastructure

- **Windows/Vite zombie-process discovery.** Every `verify-*.mjs` spawns
  `vite preview` via `spawn('npx', [...], { shell: true })`. On Windows the grandchild
  process keeps Node's event loop alive **even after `server.kill()`**. Consequence: a
  *passing* run would print `ALL CHECKS PASSED` and then hang until the caller's timeout.
  Runs that looked like failures were successes.
- **The teardown fix** — an explicit `process.exit(0)` in the `main().then(...)` tail —
  was applied to all 18 suites.
- **Resulting speed improvement:** Disciplinary went from a 9-minute timeout to **16
  seconds**; the full 18-suite run is now ~3.5 minutes and is affordable to run routinely.
  **Why it matters:** verification was quietly the most expensive thing in the mission,
  and the expense was pure waste.
- **Regression assertions updated for the new completion workflow.** Three suites asserted
  `status === 'completed'` after PDF export — no longer true now that export doesn't
  auto-lock. They now assert that the locked status survives a reload, which is the
  property actually worth protecting.
- **A selector bug the new markup exposed:** `span:last-child` began matching two elements
  once `CheckboxGrid` gained an inner `<span className="docPdfCheckMark">✓</span>`. Fixed
  to the direct-child form `> span:last-child` in both the Medical classification test and
  the CSS.

## 6. Realistic signature test fixtures

**Every signature in every fixture was a 1×1 black-pixel PNG** — 33 fields across 20 files.
Stretched into the signature block, that renders as a **solid black bar in every generated
PDF**. Two consequences: review artifacts looked broken to any human reading them, and the
suite was structurally incapable of catching an aspect-ratio, `object-fit`, or
alpha-compositing bug in signature rendering. This is precisely the *"clean test data
passes review while missing real layout bugs"* trap CLAUDE.md warns about.

`makeSignaturePng()` in `tools/testing/lib/makeTestPng.mjs` now generates a
transparent-background handwritten stroke at the pad's real proportions, matching what
`SignaturePad` actually emits (its canvas is `clearRect`'d, never filled).
`tools/testing/fixtures/refresh-signature-images.mjs` rewrites only the offending data
URLs in raw file text, so every fixture keeps its formatting and the whole diff is 33
lines. It is idempotent and safe to re-run.

## 7. Tooling added for PDF/raster inspection

All under `tools/testing/`, all tracked:

| Script | What it is for |
|---|---|
| `extract-pdf-images.mjs` | Pulls the **exact embedded raster bytes** out of a generated PDF (pdf-lib walk + zlib inflate + minimal PNG codec). This is what a human actually sees. |
| `analyze-pdf-centering.mjs` | Detects table borders/cells and measures ink bounding boxes vs. cell bounds. Exports `analyzeRaster`, `analyzePdf`, `cropZoom`. |
| `crop-pdf-region.mjs` | Crop + zoom any region of a real raster, in page CSS-px coordinates. |
| `compare-dom-vs-raster.mjs` | Same-page diff of Chrome's own paint vs. html2canvas's output. Any delta is html2canvas divergence *by construction*. |
| `generate-doc-pdfs.mjs` | Batch-generates real PDFs for the four Superintendent docs through the real UI. `--touch` exercises the iPad scale-2 capture path. |
| `calibrate-doc-centering.mjs` | Sweeps candidate residual shifts against real rasters. |
| `probe-baseline-math.mjs`, `probe-clone-divergence.mjs` | The two root-cause probes described above. |
| `review-package.mjs` | Drives the real UI to capture the CLAUDE.md-required review evidence: checklist in both states, confirm dialog, locked state, plus a real DRAFT and FINAL pdf, at tablet portrait and desktop. |
| `walk-app-screens.mjs` | Screenshot walk of every screen at four viewports. **Known limitation: does not reach JSA's Review step** (JSA uses `jsaStep` navigation rather than the Next / Go-to-Review pattern the other five share), and the phone walk currently breaks after Home. |

---

# IMPORTANT FINDINGS / LESSONS

Things a future session must not forget or re-learn the hard way.

1. **The final generated PDF raster is the truth — not the live DOM, not the preview, not a
   DOM screenshot, not DOM-measured slack.** html2canvas's real rendered geometry can
   diverge from the live DOM's by more than the DOM itself reveals. Always extract and
   inspect the actual embedded raster before certifying a print/PDF layout change.

2. **A previous "fixed" claim is a hypothesis until independently, visually re-verified.**
   This mission overturned a prior session's root-cause diagnosis of this exact defect.
   Analyzer *numbers* are also not sufficient on their own — see lesson 3.

3. **Analyzer output can produce false positives; look at the pixels.** During this mission
   the centering analyzer flagged two cells at −7.6px and −5.6px. Both were artifacts:
   - the −5.6px "EMPLOYEE SIGNATURE" cell is a caption *deliberately* pinned under a rule
     (`border-top` + `padding-top: 2px`), so it is not centered by design and measuring its
     centering is meaningless;
   - the −7.6px SIGNATURES gray bar was a mis-detected cell region extending past the gray
     band into the rule below, inflating the bottom gap. A tight 4× crop showed the band at
     172 raster px with 68px of ink, 54 above / 50 below — correctly balanced for all-caps.

   **All-caps text has no descenders, so a correctly-centered caps line always measures
   with a larger bottom gap.** Do not "fix" that.

4. **JSA and Incident PDF behavior are protected.** They keep their own capture code and
   their own separately-calibrated compensations (`.pdfSingleLineText`'s `-5px` in
   `styles.css`; Incident's measured-padding + `COMPACT_CELL_SHIFT_PX`), which were
   calibrated *on top of* the polluted-probe error and whose output is user-approved.
   **Do not apply the `pdfExportCore.js` body-line-height fix to their pipelines without
   fully re-calibrating them.** Equally: changing `body { line-height }` in `styles.css`
   would silently shift both of their exports.

5. **Protected page counts.** JSA fixture: main=1 / continuation=0 / sign-in=2.
   Incident fixtures: full=6 / na=6 / userDraft=6 / overflow=11. Any change to these is a
   regression until proven otherwise.

6. **iPhone/iPad SignaturePad touch architecture is protected.** Safari/iOS touch behavior
   in `src/incident/SignaturePad.jsx` is a standing regression target. Do not refactor its
   touch handling casually.

7. **On Windows, test suites leaked Vite child processes — in two separate ways.**
   `spawn('npx', …, { shell: true })` produces the chain
   `cmd.exe -> npx-cli.js -> vite.js`, and the real server is the *grandchild*.
   - Symptom A (fixed first): those live handles kept Node's event loop alive, so a
     **passing** run printed `ALL CHECKS PASSED` and then hung until the caller's
     timeout. Fixed by an explicit `process.exit(0)` in every `verify-*.mjs`.
   - Symptom B (found later, on 2026-08-12): `child.kill()` only signals the head of
     the chain, so **`process.exit(0)` stopped the hang without ever reaping the
     server**. A full suite run left ~19 orphaned preview servers holding ports and
     memory. Fixed by `tools/testing/lib/killTree.mjs` (`taskkill /T /F` on Windows,
     process-group kill on POSIX), wired into all 25 preview-spawning scripts.

   Both guards are load-bearing — do not remove either when editing those scripts, and
   any *new* script that spawns `vite preview` needs both. **Lesson beyond the bug:**
   "the suites are fixed" was true of the symptom being looked at and false of the
   underlying resource leak. Verify the actual end state (here: list the processes),
   not just that the visible complaint went away.

8. **Realistic fixture data matters.** 1×1 black signature PNGs hid all real signature
   rendering behavior for the entire life of the suite. Prefer messy, real-shaped input —
   short fragments, punctuation, odd aspect ratios — over clean or degenerate placeholders.

9. **Windows tooling caveats:** run these scripts with output redirected to a file
   (`node script.mjs > out.log 2>&1`) rather than piped to `tail` — piping has deadlocked
   stdout on this stack. Python is not available on this machine; use `perl -0pi -e` or
   Node for bulk edits. Fixture files are CRLF — patterns must tolerate it.

---

# WHAT IS VERIFIED

Evidence exists for everything in this section. Anything not listed here is *implemented*
but not independently verified.

## Generated PDFs inspected

Fresh PDFs generated through the real UI (Drafts → Open Draft → Review → Create Document →
Download) against a `vite preview` of the production build:

- Disciplinary, Separation, Medical Event, Uncontrolled Event — desktop capture (scale 2.5)
- The same four via `--touch` (iPad path, scale 2.0)
- Disciplinary DRAFT **and** FINAL from the same document, before and after Mark Complete,
  at tablet portrait and desktop

Filenames confirmed correct across the boundary:
`Marcus_Doyle_DisciplinaryNotice_2026-08-06_DRAFT.pdf` → `Marcus_Doyle_DisciplinaryNotice_2026-08-06.pdf`.
DRAFT watermark confirmed present, legible, and not obscuring body text.

## Raster crops inspected

Embedded rasters extracted and inspected visually at zoom, not merely measured:

- Full-page Disciplinary FINAL raster (2040×2640)
- SIGNATURES gray bar at 4× — resolved the suspected over-correction as an analyzer artifact
- Signature block at 2× — confirmed real strokes, transparent-background alpha compositing,
  `object-fit: contain` letterboxing, ink sitting on the line with the caption beneath
- DRAFT watermark region

Measured result: all InfoTable cells within **±3.2px**, which is below descender height.

## Regression suites completed

Full 18-suite run, **all green**, ~3.5 minutes total. Protected counts confirmed unchanged:
JSA main=1 / continuation=0 / sign-in=2; Incident 6 / 6 / 11 / 6. SignaturePad green
(WebKit skipped — not installed in this environment).

## Device sizes already reviewed

Tablet portrait 820×1180 and desktop 1440×900 for the Review & Export flow. Tablet
landscape 1180×820 and phone 390×844 were captured in the earlier screenshot walk but have
**not** been acted on.

## Review artifacts produced

`tools/testing/output/review-package/` — checklist outstanding state, checklist satisfied
state, Mark Complete confirm dialog, Completed/locked state, DRAFT pdf, FINAL pdf, at both
viewports. (`tools/testing/output/` is git-ignored; regenerate with
`node tools/testing/review-package.mjs`.)

## Explicitly NOT verified

- Physical iPad / AirPrint behavior — no real device in this environment.
- Safari/WebKit — browser not installed here; the SignaturePad suite skips it.
- JSA's Review step has no screenshot (walker limitation, noted above).

---

# WHAT IS NOT YET COMPLETE

Nothing in this section should be described as done.

## TONIGHT — HEAVY PRODUCT WORK

| Item | State |
|---|---|
| **Home information hierarchy** | Not started. JSA and Incident occupy large hero cards while Uncontrolled Event, Medical Event, Disciplinary Notice and Separation are demoted to small rows under "More Documents". This is an artifact of build order, not user intent — a superintendent documenting a medical event scrolls past two heroes to find it. |
| **Equal discoverability of all six live document types** | Not started. Follows from the above. |
| **Tablet landscape space utilization** | Not started. Forms sit in an ~820px column on an 1180px screen; the horizontal space is unused. Highest-priority device per the mission's stated hierarchy. |
| **Tablet portrait/landscape refinement** | Partial. Review & Export only. Note the sidebar collapses to unlabelled icons at 820px — unreviewed. |
| **Laptop/desktop space utilization** | Not started. Significant dead space at 1440×900. |
| **Full visual / palette / typography pass** | ~25%. Button system and readiness checklist done. Outstanding: palette and typography audit, ALL-CAPS field labels, the repeated *"Speak clearly for the best results."* helper noise, empty and success states. |
| **Broader workflow transformation** | ~35%. Review & Export done; the rest of the wizard untouched. |
| **Remaining state-transition forensics** | Partial. The completion lifecycle is closed out for all five locking document types (see final-results). **Not** covered: draft transfer in/out, template load, blank-start over an existing draft, and multi-tab/localStorage contention. |
| **Adversarial QA** | Not started. |
| **Complete device walk** | Partial. Phone walk breaks after Home in `walk-app-screens.mjs`; JSA Review unreachable by the walker. |
| **Final all-document PDF re-pass** | The four Superintendent docs are done (today). JSA and Incident not re-passed this mission. |
| **Final morning/review package** | Not produced. The mission specifies an exact section format for the final report — see the original prompt. |
| **Accessibility / performance / code-quality findings** | Not started. Known non-blocking items: no error boundaries anywhere (an uncaught render exception blanks the whole app), and the JS bundle is ~1.08MB / 349KB gzipped with a Vite chunk-size warning. |

## FUTURE / NOT PART OF THIS MISSION

Do **not** build these. Recorded only so they are not lost:

- BBS Observation
- Sign-In Sheet
- Toolbox Talk
- SOP
- Equipment Inspection
- Searchable Safety Manual
- Training Records, Employee Management, Corrective Actions
- Any backend / review / sync system (the app is deliberately client-only, localStorage-backed, offline-capable)

---

# TONIGHT'S RECOMMENDED STARTING POINT

> **Read `CLAUDE.md` and this checkpoint first.**
>
> **Do not redo the completed corrective investigation without new contradictory
> evidence.** The PDF text-baseline root cause is found, fixed at capture time, and
> verified against real extracted rasters at both desktop and iPad capture scales. The
> completion-state workflow, terminology, Review & Export hierarchy, test-suite teardown
> and signature fixtures are done and green.
>
> **Continue from the remaining workflow/design phases**, in this order:
> 1. Home information hierarchy — give all six live document types equal discoverability.
> 2. Tablet landscape space utilization (device priority 1), then desktop.
> 3. Visual pass — palette, typography, ALL-CAPS labels, helper-text noise, empty/success states.
> 4. Adversarial QA, then the complete device walk (fix the phone walker first).
> 5. Final all-document PDF re-pass, then the final review package in the mission's exact
>    mandated section format.
>
> **Constraints that still apply:** all work stays on `testing`; do not merge to `main`; do
> not deploy; do not force-push or rewrite history. Preserve JSA's three-independent-lists
> model and its page counts, Incident's PDF geometry and page counts, and the SignaturePad
> touch architecture. Commit in small logical checkpoints so an interruption leaves a clean
> cut line.

---

# FINAL RESULTS — 2026-08-12 CLOSEOUT

The corrective/stability batch is closed. No heavy product work (Home hierarchy, tablet
landscape, palette) was started — that is deliberately left for tonight.

## Completion-state lifecycle — now covered by a real suite

New `tools/testing/verify-completion-lifecycle.mjs` walks the entire state machine
through the real UI for **all five locking document types** and asserts at every hop:

```
Draft -> Create Document (filename carries _DRAFT) -> STILL EDITABLE
      -> Mark Complete (badge Completed, fields actually disabled)
      -> prior DRAFT document goes STALE
      -> Update Document (filename drops _DRAFT)
      -> Mark Incomplete (badge Draft, fields editable again)
      -> prior FINAL document goes STALE
```

"Editable" is asserted against a real form control on a real content step, not merely
against which buttons the review panel offers. **Result: 77/77 assertions across
Disciplinary, Separation, Medical Event, Uncontrolled Event and Incident.** Incident held
its protected 6 pages through every transition.

The script seeds each fixture with `status: 'draft'` at load time rather than editing the
shared fixtures — `incident-full-fixture.json` ships `status: "ready"` because other
suites need a completed report.

## The one genuine visible defect found, fixed, and covered

**Medical Event — the Work Status row had no right edge.** In `EvaluationBlock`, the first
row is a `pairRow` (4 cells: label,value,label,value) and the second was a bare 2-cell row.
With `border-collapse`, the right half of that row had no cells and therefore drew no
border: the printed document showed one row stopping halfway across the page while every
other row closed. Fixed by giving the value cell `colSpan: 3` in
`src/documents/medicalEvent/MedicalEventPdf.jsx`. `InfoTable` already supported `colSpan`,
so the change is one cell.

An audit of the other three documents found **no other mixed-width table** — every other
InfoTable is internally consistent.

**Regression coverage added, and proven non-vacuous.** The lifecycle suite now asserts a
structural invariant over the off-screen export DOM: every row of every `.docPdfInfoTable`
must span the same number of columns, attributed to the owning `data-doc-id`. Reverting the
`colSpan` and re-running made it fail (`medicalEvent table#8 rows span 4/2`); restoring it
made it pass. It sweeps all six documents' export roots on every run.

## Process-leak defect found and fixed

Step 6 of the closeout ("confirm no stale processes remain") **failed on first check** —
19 orphaned `vite preview` servers were alive. See lesson 7 above for the mechanism and
the fix (`tools/testing/lib/killTree.mjs`, wired into all 25 preview-spawning scripts).
Strays reaped; three subsequent suite runs verified as leaving **zero** leaked processes.

## PDF status — fresh generation and real raster inspection

Fresh PDFs generated through the real UI for all four Superintendent documents (DRAFT and
FINAL each) plus Incident. Full-page rasters extracted from the actual embedded PDF image
streams and inspected visually, plus 3× zoomed crops of every cell family named in the
review request:

| Document | Families inspected | Result |
|---|---|---|
| Disciplinary | employee/supervisor info, position/date, warning level, signatures | centered, no defect |
| Separation | employee info, Discipline/Rehire, Documentation Attached, rehire status, Company Closeout, 3-column signatures + "Refused / Unavailable to Sign" | centered, no defect |
| Medical Event | employee info, Medical Evaluation, Work Status, Attachments, Initial Classification, signatures | **one defect found and fixed** (Work Status right edge); centering itself was correct |
| Uncontrolled Event | Event Classification / Outcome, Immediate Actions / Notifications, Reported By / Supervisor Review, shared short bordered cells | centered, no defect |

Measured centering across all InfoTable cells stays within **±3.2px**, below descender
height. The two largest analyzer deltas are known false positives (all-caps gray-bar bands
and real signature ink) — see lesson 3.

## Full regression

**All 19 suites green** (18 existing + the new lifecycle suite), zero failures, zero
unexpected console/page errors.

- JSA protected counts: `MAIN 1 / CONTINUATION 0 / SIGN-IN 2 / TOTAL 3` — unchanged
- Incident protected counts: `6 / 6 / 11 / 6` — unchanged
- SignaturePad: green (WebKit skipped — not installed in this environment)

## Still open after today

- The screenshot walker cannot reach JSA's Review step (JSA uses `jsaStep` navigation, not
  the shared Next / Go-to-Review pattern), and the phone walk still breaks after Home.
- **Design question for the product owner, deliberately not acted on:** on a blank form
  with 7 items outstanding, "Create Document" is still the loudest element on Review &
  Export. That may well be correct — a watermarked draft is legitimately generatable at any
  time — but it is a decision, not an oversight.
- No physical iPad / AirPrint verification and no Safari/WebKit run is possible in this
  environment.

---

# STATE AS OF END OF DAY 2026-08-12

**Read this section first. Everything above it is historical.**

## Where things actually are

| | |
|---|---|
| `main` / live site | **`dd803e5` — DEPLOYED.** Three deploys happened today. |
| `testing` | `0cbbfa3`, pushed, well ahead of `main` — **not deployed** |
| Working tree | clean |

## What is live right now

The screenshot-based PDF pipeline, with every rendering fix applied:
the html2canvas baseline root-cause fix, the two-tier section hierarchy and
composition pass, iOS Safari text-autosizing pinned off, plain section
numerals, and un-stretched signatures. Fonzo confirmed on a real iPad,
iPhone and desktop that all six documents print correctly.

**Do not deploy anything else without asking.** The agreement is: Fonzo field-
tests the live build for about a week (roughly through 2026-08-19) or until
every document type has been used for real. Work continues on `testing` and
stays there. If the field test comes back clean and the new work holds up, it
ships then.

## The big change sitting on `testing`, undeployed

**The four Superintendent documents are no longer screenshots.** They are drawn
directly into the PDF with pdf-lib via a shared stencil kit:

- `src/documents/pdfDraw.js` — the kit (gray bar, numbered bar, field label,
  info table, writing box, checkbox grid, signature row, multi-signature row,
  two-column). Read its header comment before touching it.
- `src/documents/{disciplinary,separation,medicalEvent,uncontrolledEvent}/*PdfDraw.js`
  — one file per form, each reading top-to-bottom like the printed page.
- `usePdfExport` gained an optional `renderPdf` hook; a document either passes
  it (drawn) or doesn't (screenshotted).

Why it matters: text is real text, output cannot vary by device because no
browser draws anything, and ~28KB per document instead of ~240KB.

**JSA and Incident are untouched and still screenshot-based.** Leave them alone
unless explicitly asked — their output is user-approved.

## ⚠️ KNOWN GAP — the four documents' tests now check the wrong thing

`verify-disciplinary`, `verify-separation`, `verify-medical-event` and
`verify-uncontrolled-event` inspect the hidden DOM export root
(`.docPdfExportRoot[data-doc-id="..."]`). That DOM is still mounted and still
rendered, but **it no longer produces the PDF** for those four documents.

So those suites can pass while the real PDF is wrong. They currently verify
workflow and content correctness, not the printed artifact.

Two things follow:
1. Those four suites' PDF-layout assertions are no longer meaningful. Don't
   trust a green run as evidence the document looks right.
2. The old export roots (`DocPdfShell.jsx`, `docPdf.css`, the `*Pdf.jsx`
   components) are now only kept alive for those tests. They are dead weight
   in the app and a genuine confusion hazard — two systems that look like they
   both build the same form, but only one of them does.

Fixing this is the top technical priority before the drawn PDFs ship. The
approach: point the tests at the generated PDF itself — `render-pdf.mjs`
rasterizes a drawn PDF via pdf.js, so a golden-image comparison per document
is now straightforward and would replace the DOM assertions entirely.

## Tooling added today

- `tools/testing/render-pdf.mjs` — rasterizes a **drawn** PDF for visual review.
  (`extract-pdf-images.mjs` only works on screenshot-built PDFs, which have
  embedded page rasters; drawn PDFs have none by design.)
- `tools/testing/verify-completion-lifecycle.mjs` — 77 assertions across the
  five locking document types.
- `tools/testing/lib/killTree.mjs` — reaps leaked `vite preview` servers.

## Lessons added today

1. **A real device catches what this environment structurally cannot.** Two
   bugs shipped past every automated check because Chrome does not behave like
   Safari: iOS text autosizing inflating small text in wide blocks, and
   html2canvas ignoring `object-fit` and stretching signatures. Neither was
   visible in any extracted raster. A short iPad check before shipping is not
   optional polish — it is the only coverage for that class of defect.
2. **Truncation is data loss.** The drawn-PDF conversion exposed that the info
   table silently chopped text too wide for its cell, printing "Effective
   Separation Date" as "Effective Separation". Wrap, never truncate, on a
   document somebody signs.
3. **Fonzo's forms reportedly do not match the original paper forms exactly.**
   This is unverified — the source documents are not on this machine
   (`reference/` is gitignored and absent). It is content fidelity, not
   rendering, and it outranks further visual work: a perfectly-rendered form
   that asks the wrong questions is still wrong.

## What to do next, in order

1. **Fidelity audit against the original paper forms** — blocked on Fonzo
   sending them. Highest value.
2. **Point the four documents' tests at the real PDF** (golden images via
   `render-pdf.mjs`), then delete the now-dead DOM export roots for those four.
3. Contract checks on the drawn output (font sizes from the approved set, one
   rule per signature block, standard fixture fits one page).
4. Only then resume the wider roadmap: Home information hierarchy, tablet
   landscape, the visual/palette pass, adversarial QA, the device walk.

## Communication

`CLAUDE.md` now carries Fonzo's communication preferences ("How to talk to
Fonzo"). Read them. He is a construction safety professional, not an engineer —
plain English first, no corporate filler, and never answer "the test says it's
centered" when he says the output looks wrong.
