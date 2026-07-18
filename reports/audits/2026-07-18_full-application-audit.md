# Safety Documentation Center — Full Application Audit

**Date:** 2026-07-18
**Branch:** `ipad-premium-refactor` (created from `main` @ `53e866838f4b4cecac85d860fee886786ae6089c`)
**Scope:** Full audit only. No application code was modified as part of this report.
**Auditor context:** Static source review only. No physical iPad, no AirPrint hardware, no Safari/iPadOS runtime access. Every claim below is labeled either PROVEN (verifiable by reading source) or HYPOTHESIS (needs real-device confirmation).

---

## A. Executive Summary

The app is a single-file React SPA (`src/main.jsx`, 1,877 lines) with a single stylesheet (`src/styles.css`, 1,686 lines). It is functional and the underlying data model, autosave, and pagination-estimation logic are reasonably sound. The core problems are not "missing features" — they are **accumulated CSS layering conflicts** and a **desktop-first layout that has no breakpoints tuned to real iPad widths**.

The most consequential findings:

1. **`styles.css` contains three separate `@media print` blocks that redeclare `@page` margins (0.22in → 0.22in → 0.5in) and `.printPage` height (auto → 10.56in → 10in).** The last one wins by source order, and it happens to be internally self-consistent with the unconditional `.documentPage` base rule (720×960px = 7.5in×10in, matching a 0.5in margin model). But blocks 1 and 2 are fully dead weight that make the file unreadable and dangerous to touch — any edit to the "wrong" block silently does nothing.
2. **No breakpoint in the entire stylesheet targets the requested iPad widths (768–1180px).** The only large-viewport breakpoint that collapses the editor/preview split is `max-width: 1280px`, which — read literally — *should* already stack the columns on every iPad width. The most likely explanation is a Safari/iPadOS "Desktop site" viewport-width mismatch (HYPOTHESIS, see section G).
3. **`input[type=time]` never receives `min-width: 0`**, while it sits inside a `minmax(0, 1fr)` grid column (`.formGrid2`). Native time-picker controls have an unshrinkable intrinsic width in WebKit; combined with `.card { overflow: hidden }`, this is a concrete, code-provable mechanism for "Time Expired is clipped on the right" (PROVEN as a plausible mechanism; degree needs on-device confirmation).
4. **A large amount of dead CSS survives from at least two earlier print/preview redesigns** — an entire legacy hardcoded preview render (`.previewPaper`, `.previewDocHeader`, `.previewInfoGrid`, `.previewSigGrid`, etc.) and legacy inline-signature print styles (`.signatureGrid`, `.sigLine`, `.summaryBox`, `.printHeader`, `.signInHeader`, `.signInFooter`) that no longer correspond to any JSX in `main.jsx`.
5. **Inputs use `font-size: 15px`**, one pixel under the 16px threshold that prevents iOS Safari from auto-zooming the viewport on focus — a concrete, well-documented mobile usability defect affecting every field in the app on iPhone/iPad.
6. **`npm audit` reports one moderate and one high-severity advisory**, both in `vite`/`esbuild` (dev-server-only, not shipped to the built `dist/` bundle, but the fix requires a semver-major Vite upgrade — not applied here per instructions).
7. Two functions (`chunk()`, `getPrintRows()`) and a whole CSS subsystem are dead code with zero call sites — safe deletion candidates once traced (done in this audit).

None of this requires new architecture. The recommended path is consolidation and CSS/layout correction, not a rewrite — consistent with `CLAUDE.md`'s "prefer simple code over clever abstractions" and "avoid unnecessary refactoring."

---

## B. Current Architecture Map

```
index.html                    → mounts #root, loads src/main.jsx as module, viewport-fit=cover set but unused (no safe-area CSS)
vite.config.js                → base:'./' for GH Pages, do not change
public/manifest.webmanifest   → PWA manifest, standalone display
public/sw.js                  → network-first SW, cache name pinned to 'safety-app-v1-0-4-safe-upgrade'
public/icons/                 → app icons + Shackelford logo (shackelford-logo.webp referenced from main.jsx)
.github/workflows/deploy-pages.yml → npm install && npm run build && deploy dist/ to Pages, on every push to main

src/main.jsx  (1,877 lines, one file, no imports besides React)
 ├─ Storage keys (KEYS) + helpers (safeJson, dateStr, hasText, splitLines, normalizeEntry, entryTokens,
 │    isNearDuplicate, mergeUniqueEntries, dedupeList, chunk[DEAD])
 ├─ Pagination engine: estimateTextLines → estimateRowUnits → mainRowCapacity/continuationRowCapacity
 │    → paginateRowsByUnits → paginateTaskContent → getSignaturePages → getPagePlan → calcFit
 ├─ emptyJsa() / BUILT_IN_TEMPLATES / makeTodayFromTemplate / templatePayload
 ├─ Hardcoded content libraries: TAILGATE_GROUPS, PREV_DAY_GROUPS, OVERALL_TASK_GROUPS,
 │    DAILY_TASK_GROUPS, HAZARD_GROUPS, CONTROL_GROUPS, TASK_ROW_GROUPS, TASK_SUGGESTIONS (~250 lines of data)
 ├─ STEPS / stepStatus / getReviewChecks
 ├─ App()  — all top-level state (settings, customTemplates, savedDraft, jsa, tab, activeDoc, jsaStep,
 │    templateId, saveName, toast) + autosave effect + service-worker registration effect + all mutator fns
 ├─ View components: HomeView, DocCenterView, JsaStartView, JsaWorkflow, StepJob, StepMeeting, StepWork,
 │    StepSignatures, StepReview, StepFooter, DraftsView, TemplatesView, SettingsView
 ├─ JsaPreview (ResizeObserver-scaled live preview, shares MainJsaDocumentPage with print)
 ├─ QuickPanel / QuickRowTemplateSelector (recent+favorites per-instance, localStorage-backed)
 ├─ Primitive fields: F (input), TA (textarea)
 └─ Print tree: PrintBrandHeader, PrintTaskTable, MainJsaDocumentPage, PrintableJsa (always mounted,
      hidden off-screen), TaskContinuationPage, AttachedSignIn

src/styles.css (1,686 lines, one file)
 ├─ Tokens (:root, [data-theme='dark'])
 ├─ Reset, top bar, nav, page shell, buttons, form fields, badges, toast
 ├─ Home / Document Center / Launcher / Workflow shell / progress strip / step content
 ├─ Quick-add panel styles (redefined 3 times across the file — see F)
 ├─ Task rows, step footer, signatures, review/export, fit badge
 ├─ Drafts/templates/settings lists
 ├─ Legacy hardcoded "live preview" render — DEAD (previewPaper and descendants)
 ├─ @media print block #1 (line 904) — mostly superseded
 ├─ Responsive breakpoints: 1280 / 940 / 680 (generic desktop-shrink breakpoints, not iPad-tuned)
 ├─ "v5 enhancements" — brand logo, quick-add grid rework (duplicate/override of the block above)
 ├─ Live preview page planner (previewPageManager, previewBrandHeader) — used
 ├─ @media print block #2 (line 1171) — "Final printed document system" — mostly superseded
 ├─ "v6 pilot-ready JSA polish" — task suggestion card, quick-add chip rework (2nd override),
 │    review/export summary, custom quick-add manager
 ├─ Shared page component: `.documentPage` base rules (unconditional — used by both screen preview
 │    and print) — this is the one CSS source of truth for page geometry
 ├─ Breakpoints: 840 / 600 (more generic desktop-shrink breakpoints)
 └─ @media print block #3 (line 1638) — "Print at Letter size with intentional default-style margins"
      — this is the one that actually wins in the cascade
```

**Key architectural fact:** `.documentPage` (unconditional, ~line 1555) is the only print-geometry rule set that is *not* wrapped in `@media print`. It renders identically on-screen (scaled via CSS `transform` in `JsaPreview`) and at print time. This is a deliberate, good design ("one markup path" per `CLAUDE.md`) — but it means print geometry bugs are invisible until `Ctrl/Cmd+P`, because the screen preview is scaled down and visually hides small overflow.

---

## C. Critical Issues Ranked by Severity

### Critical (breaks or risks breaking Never-Break requirements)

**C1. Three conflicting `@media print` blocks with contradictory `@page` margins and `.printPage` heights.**
`src/styles.css:904`, `:1171`, `:1638`. Block 3 wins for conflicting declarations by source order, and it is the only one internally consistent with the unconditional `.documentPage` box (720×960px ≈ 7.5in×10in ≈ letter minus 0.5in margins). Blocks 1 and 2 are dead but not obviously so — a future edit to block 1 or 2 (the ones a developer searching top-down would find first) will have **no visible effect**, which is exactly how the historical white-screen-adjacent print regressions likely happened. Confidence: PROVEN by direct reading; effect on real Safari print rendering is HYPOTHESIS (see H).

**C2. `input[type=time]` has no `min-width: 0` while living in a `minmax(0, 1fr)` grid track (`.formGrid2`), inside a `.card` with `overflow: hidden`.**
`src/styles.css:305` (input rule), `:607` (`.formGrid2`), `:204` (`.card { overflow: hidden }`). Native WebKit time-picker controls carry an intrinsic minimum content width that CSS `width: 100%` does not override unless the item's own `min-width` is explicitly zeroed. This is the single most literal, code-traceable explanation for "Time Expired is clipped on the right." PROVEN as a plausible mechanism; exact clipping behavior needs iPad Safari confirmation.

**C3. No layout breakpoint targets the audit's real iPad widths (768/810/1024/1180).**
Breakpoints present: `860` (min-width, Home only), `1280`, `940`, `680`, `1100`, `840`, `600` (all `max-width`, generic desktop-shrink points). All four target iPad widths are below 1280px, so `workflowShell` *should* already collapse to one column and stack Live Preview under the editor. If it isn't stacking in the field, the most likely cause is outside this stylesheet — see G.

### High

**C4. Inputs/selects/textareas use `font-size: 15px` (`src/styles.css:313`), one pixel under iOS Safari's 16px auto-zoom threshold.**
Every text/date/time/number input and every textarea in the app will cause iOS Safari to zoom the viewport on focus. On a field form this means every tap into a field triggers a jarring zoom-and-recenter — a repeated, compounding friction point across the entire JSA workflow, not a one-off bug.

**C5. `getReviewChecks`/`calcFit`/`getPagePlan` re-run `getContentRows` (which does O(n·m) near-duplicate matching via `isNearDuplicate`) on every keystroke.**
`src/main.jsx:1287-1288` (`StepReview`), and `JsaWorkflow:976` (`calcFit(jsa)` computed on every render of the whole workflow, not memoized). For typical JSA sizes (a handful of rows) this is not currently a performance problem, but it re-executes string-normalization/token-Jaccard matching on every parent re-render (e.g., every keystroke in *any* field, because `jsa` state is a single flat object and `upd()` always creates a new object). Flag as a performance risk to watch, not an active bug today (see K/Phase 6).

**C6. `package-lock.json` is git-tracked**, contradicting `CLAUDE.md`'s explicit claim ("No lockfile is committed — see Gotchas") and `DEPLOY_NOTES.txt`'s instruction to exclude it from uploads. This is stale documentation, not a code defect, but it means CI (`npm install` in `deploy-pages.yml`) is *actually* deterministic today, and the documented risk ("CI can resolve different transitive versions between builds") is currently not true. Low risk, but should be corrected in docs so future agents don't distrust a lockfile that is in fact present and authoritative.

### Medium

**C7. Large dead CSS surface area** — see section E. Not a runtime bug, but it actively misleads anyone editing print or preview CSS (including future Claude Code sessions bound by `CLAUDE.md`'s "treat any print CSS change as high-risk" instruction — right now that risk is inflated by dead code that looks live).

**C8. `npm audit`: 1 moderate (esbuild, CWE-346, dev-server request forgery) + 1 high (vite, CWE-22/200, path traversal in `server.fs.deny` / dep optimization on Windows) advisory, both dev-only, fix requires a semver-major Vite 5→8 bump.** Not shipped to the production bundle (GitHub Pages serves only `dist/`), so field risk is effectively zero; developer-machine risk (running `npm run dev` on an untrusted network) is real but low-severity. Per instructions, not fixed in this audit.

**C9. Signature-line-count field (`StepSignatures`) allows 1–100 but the printed layout always uses the "attached sign-in sheet" model (`useAttached = true` is hardcoded, `src/main.jsx:1257`) even though the in-app copy still conditionally describes an alternate "signatures print on the main JSA" flow that can never actually trigger.** Dead branch in `StepSignatures`, not dead CSS — see E5.

### Low

**C10. `key={i}` (array index as React key) used for `taskRowList` (`src/main.jsx:1232`) and print task table rows (`PrintTaskTable`, `src/main.jsx:1756`).** Rows can be reordered only by add/remove-from-end today (no drag-reorder), so this is currently safe, but it's a latent bug magnet if row reordering is ever added — worth switching to a stable id when touched.

---

## D. Exact Files, Components, Functions, Selectors Involved

| Area | File:Lines | Symbol |
|---|---|---|
| Pagination engine | `src/main.jsx:112-226` | `estimateTextLines`, `estimateRowUnits`, `mainRowCapacity`, `continuationRowCapacity`, `paginateRowsByUnits`, `paginateTaskContent`, `getSignaturePages`, `getPagePlan`, `calcFit` |
| Dead helper | `src/main.jsx:82-86` | `chunk()` — zero call sites |
| Dead helper | `src/main.jsx:203-205` | `getPrintRows()` — zero call sites (superseded by `getPagePlan(jsa).mainRows` used directly) |
| Job info grid (iPad overlap root cause) | `src/main.jsx:1050-1066` | `StepJob` → `.formGrid` / `.formGrid2` |
| Time field | `src/main.jsx:1058-1059` | `<F label="Time Issued" type="time" .../>`, `<F label="Time Expired" type="time" .../>` |
| Input base style (iOS zoom + missing min-width) | `src/styles.css:305-317` | `input[type=text], input[type=date], input[type=time], input[type=number], select, textarea` |
| Grid causing overlap | `src/styles.css:607-611` | `.formGrid2` |
| Card clipping boundary | `src/styles.css:204-210` | `.card { overflow: hidden }` |
| Editor/preview split breakpoint | `src/styles.css:503-517`, `:1026-1035` | `.workflowShell`, `@media (max-width: 1280px)` |
| Print block #1 (dead-ish) | `src/styles.css:904-1023` | `@media print` — `@page margin:0.22in`, `.printPage{height:auto}` |
| Print block #2 (dead-ish) | `src/styles.css:1171-1329` | `@media print` — `@page margin:0.22in`, `.printPage{height:10.56in}` |
| Print block #3 (winning) | `src/styles.css:1638-1681` | `@media print` — `@page margin:0.5in`, `.printPage,.documentPage.printPage{height:10in}` |
| Shared page geometry (source of truth) | `src/styles.css:1555-1619` | `.documentPage` (unconditional, not media-scoped) |
| Live preview scaling | `src/main.jsx:1564-1604` | `JsaPreview` (`ResizeObserver`, `scale`) |
| Print entry point | `src/main.jsx:726-750` | `App.exportPdf()` |
| Print tree root | `src/main.jsx:1806-1833` | `PrintableJsa` |
| Dead legacy preview CSS | `src/styles.css:843-885` | `.previewPaper`, `.previewDocHeader`, `.previewInfoGrid`, `.previewAck`, `.previewSigGrid`, `.previewSignNotice`, `.previewMeeting`, `.previewEnergy`, `.previewTaskTable` |
| Dead mobile-preview-toggle CSS | `src/styles.css:887-899` | `.previewToggle` |
| Dead legacy inline-signature print CSS | `src/styles.css:949-961`, `:1000-1002`, `:918-920`, `:1004`, `:1022` | `.signatureGrid`, `.sigLine`, `.summaryBox`, `.printHeader`, `.signInHeader`, `.signInFooter` |
| Autosave | `src/main.jsx:573-589` | debounced `useEffect`, 900ms |
| Service worker registration | `src/main.jsx:560-570` | dev-mode unregister / prod register |
| Service worker cache | `public/sw.js:1` | `CACHE_NAME` pinned string, network-first fetch handler |

---

## E. Dead or Redundant Code Candidates

Every item below was traced with a repo-wide search of `src/main.jsx` before being listed; none are removed by this audit (read-only phase).

1. **`chunk(arr, n)`** — `src/main.jsx:82-86`. No call sites anywhere in the file.
2. **`getPrintRows(jsa)`** — `src/main.jsx:203-205`. No call sites; `plan.mainRows` (from `getPagePlan`) is used directly everywhere print rows are needed.
3. **Legacy hardcoded preview CSS** — `src/styles.css:843-899` (`.previewPaper` and 9 descendant selectors, plus `.previewToggle`). Zero matching class names anywhere in `main.jsx`. This is the entire CSS surface of an earlier, non-shared-markup preview implementation that predates the current `JsaPreview`/`MainJsaDocumentPage` shared-markup design.
4. **Legacy inline-signature print CSS** — `.signatureGrid` / `.sigLine` (`styles.css:949-961`, `:1238-1239`, `:1600-1601`), `.summaryBox` (`:1000-1002`), `.printHeader` (`:918-920`), `.signInHeader` (`:1004`), `.signInFooter` (`:1022`). Zero matching class names in `main.jsx`. These predate the "signatures always print on a separate attached sign-in sheet" design documented in `CLAUDE.md`'s Historical Lessons — i.e., they're CSS for a JSA layout where signatures were gridded directly onto the main page, a design that has been deliberately replaced.
5. **`useAttached` hardcoded `true` in `StepSignatures`** — `src/main.jsx:1257`. The component still branches on `useAttached` to choose between two copy strings (`sigRuleBox`), but the `false` branch ("Signatures will print on the main JSA... This works well for smaller crews...") can never render. Not dead CSS, but dead conditional logic describing a feature that no longer exists in the print pipeline. Low risk to simplify (just delete the ternary and the unreachable string), but confirm with product owner first since it touches signature-related copy (flagged per `CLAUDE.md`'s signature-handling caution).
6. **`@media print` blocks #1 and #2 in their entirety** (`styles.css:904-1023`, `:1171-1329`) are functionally superseded by block #3 plus the unconditional `.documentPage` rules, *except* for a small number of selectors that block #3 does not redeclare and that therefore still fall through to block #1 or #2's values (e.g., continuation/sign-in page `.printPage` font-size inherited from block #1's `font-size: 9.6px`, vs. the main page's `.documentPage.printPage` inheriting `9px` from the unconditional base rule — a real, currently-live 0.6px font-size inconsistency between the main JSA page and its continuation/sign-in pages). This means blocks #1/#2 are **not 100% dead** — full removal requires first re-deriving every property they still uniquely supply and moving it into a single consolidated block (Phase 6 work, not this audit).

---

## F. Conflicting CSS and Breakpoint Map

### `@media print` triple-declaration (see C1 for detail)

| Property | Block #1 (`:904`) | Block #2 (`:1171`) | Block #3 (`:1638`, **wins**) |
|---|---|---|---|
| `@page margin` | `0.22in` | `0.22in` | `0.5in` |
| `.printPage` height | `auto` (`overflow: visible`) | `10.56in` fixed, `overflow: hidden` | `10in` fixed (`.printPage, .documentPage.printPage`), `overflow: hidden` |
| `.printPage` font-size | `9.6px` | not set | not set (falls through to block #1's `9.6px` for pages that only carry `.printPage`, or to the unconditional `.documentPage`'s `9px` for the main page, which carries both classes) |
| page-break control | none | `page-break-after: always` + `:last-child` reset | same, redeclared |

**Practical consequence:** the main JSA page (`className="documentPage mainJsaPage printPage"`) and the continuation/sign-in pages (`className="printPage continuationPage"` / `"printPage signInPage"` — **no** `.documentPage` class) resolve to slightly different base font sizes (9px vs 9.6px) because only the main page's compound class `.documentPage.printPage` outranks block #1's single-class `.printPage` selector by specificity. This is a real, live, minor visual inconsistency, not a hypothesis.

### Quick-add panel CSS redefined three times

`.quickPanel`, `.quickPickerInner`, `.quickControls`, `.quickField`, `.chipGroup`, `.chip` are each declared at three separate points in the file: the original block (~`:625-705`), the "v5 enhancements" pass (~`:1077-1107`), and the "v6 pilot-ready JSA polish" pass (~`:1403-1434`, plus `.quickChipWrap`/`.favoriteBtn` net-new). Each later pass changes `grid-template-columns` and sizing for the same selectors. The end result (v6 wins) is coherent, but a developer reading top-down will edit the wrong block and see no effect — same failure mode as the print blocks, smaller blast radius.

### Breakpoint inventory (all of `styles.css`)

| Breakpoint | Type | What it does | iPad-relevant? |
|---|---|---|---|
| `min-width: 860px` | min | Home workspace goes 2-column | No |
| `max-width: 1280px` | max | `workflowShell` collapses editor/preview to 1 column | Should cover all 4 target iPad widths, but see G |
| `max-width: 1100px` | max | Brand logo shrinks, preview page-manager grid 2-col | Covers 1024, not 1180 |
| `max-width: 940px` | max | `fieldWithQuick`, `.formGrid2` (Date/Job#/Client/Muster/Time grid) collapse to 1 column, module/doc grids to 2 | Does **not** cover any of the 4 target widths (all ≥ 940 except none — actually 810 and 768 *are* under 940) |
| `max-width: 840px` | max | Suggestion columns, review checklist, custom quick-add manager collapse to 1 column | Covers 810, 768 |
| `max-width: 680px` | max | Top bar wraps, module/doc grids to 1 column, step footer stacks | Below all 4 target widths |
| `max-width: 600px` | max | Chip grid, export plan grid final collapse | Below all 4 target widths |

**Gap:** widths **1024 and 1180** sit between the `940px` collapse (which would fix the Date/Job#/Client/Muster/Time grid crowding) and `1280px` (which collapses the editor/preview split). At exactly these two iPad landscape widths, `.formGrid2` is still 2-column *and* the workflow is (per the CSS alone) already single-column — meaning the crowded 6-field grid gets the *full* single-column width, which should actually be comfortable. This reinforces that the reported "misaligned/clipped" symptom is more likely the `input[type=time]` intrinsic-width issue (C2) than a raw available-width problem, at least at 1024/1180. At 768/810 (portrait), `.formGrid2` is already collapsed to 1 column by the 940px rule, so the same clipping mechanism (C2) is the more likely explanate there too, just without the 2-column crowding on top.

---

## G. Root-Cause Analysis: iPad Form Overlap

**Requested symptoms:** editor/preview stay side-by-side on iPad; Date/Job#, Client/Muster Point, Time Issued/Time Expired become misaligned; Time Expired clipped on the right; workflow cards wrap awkwardly; labels/inputs don't get equal width; feels like squeezed desktop layout.

**PROVEN from source:**
- `.workflowShell` collapses to 1 column at `max-width: 1280px` (`styles.css:1026`). All four requested iPad widths (768, 810, 1024, 1180) are below 1280. **If Safari reports these widths as `window.innerWidth`/CSS viewport width verbatim, the editor/preview split should already stack on every one of them.** The fact that the reported symptom is "editor and Live Preview remain side-by-side" directly contradicts what this CSS rule alone would produce.
- `input[type=time]` never gets `min-width: 0` (`styles.css:305`), sits in `.formGrid2`'s `minmax(0, 1fr)` tracks (`styles.css:607`), inside `.card { overflow: hidden }` (`styles.css:204`). This is a concrete mechanism for clipping specifically on the *last* field in a row-major 2-column grid — which is exactly Time Expired's position (6 fields, 2 columns → row 3 is Time Issued | Time Expired, with Time Expired in the second/right column).
- `.fieldWithQuick` (task/hazard/control fields) is a 2-column grid (`1fr minmax(260px, 310px)`) that only collapses at `max-width: 940px` (`styles.css:615`, `:1038`). Between 940 and 1280 — which is *not* any of the 4 target widths — this would be tight but not clipped, since `minmax(260px,310px)` is a bounded track. Not implicated at the specific requested widths.

**HYPOTHESIS requiring real-device testing:**
- The most plausible explanation for "editor and Live Preview remain side-by-side on iPad" *despite* the 1280px rule is that **iPadOS Safari's default "Request Desktop Website" behavior** (on by default since iPadOS 13 for many/most sites, and the global default toggle in Safari settings) causes the browser to report a desktop-class viewport width to CSS media queries — commonly in the ~1024–1400px+ effective-CSS-pixel range *regardless of the device's physical/logical point width*, overriding the `<meta name="viewport" content="width=device-width">` hint. If that is happening here, `max-width: 1280px` may simply not be matching on-device even though 768–1180 are the device's actual point widths. **This cannot be confirmed or ruled out without a physical iPad running real Safari** (a desktop browser's device-width emulation in DevTools does not reproduce Safari's own desktop-site heuristics). This is the single highest-value real-device test to run (see M).
- Screen rotation: no `orientation:` media query exists anywhere in the stylesheet, so portrait↔landscape transitions rely entirely on width breakpoints. If iPadOS's desktop-site behavior varies between orientations (it can, since Apple's heuristic partly considers reported screen size), the "sometimes side-by-side, sometimes not" behavior a user might observe on the same device could stem from this, not from CSS.

**Recommendation:** do not "fix" the 1280px breakpoint number before getting one real-device confirmation of what `window.innerWidth` actually reports on the target iPads in the field (Safari's default configuration, not desktop Safari's responsive mode). If desktop-site is confirmed as the cause, the fix is not a CSS breakpoint change — it is either (a) accepting that this app should render correctly *even at desktop-site-reported widths* by using a lower, more conservative breakpoint (e.g., collapse at 1400–1440px instead of relying on 1280 matching the true device width), or (b) instructing field users to disable "Request Desktop Website" for this site (fragile, not a code fix).

---

## H. Root-Cause Analysis: Print Blank-Page and 100%-Scale Problems

**Requested symptoms:** document should be exactly Main JSA + Sign-in sheet but prints as four pages; blank pages appear; iPad printing requires 75–80% scale instead of 100%.

**PROVEN from source:**
- `getPagePlan(jsa).totalPages = 1 (main) + continuationPages.length + signInPages.length`. With default `signatureLineCount: 30` (`emptyJsa()`, `main.jsx:259`) and `getSignaturePages` capping at 40 lines/page (`main.jsx:180-193`), a default/empty-ish JSA produces `continuationPages.length = 0` and `signInPages.length = 1` → **`totalPages = 2`**, matching the intended Main JSA + Sign-in sheet. The JS pagination math itself does not produce 4 pages for a normal document — the extra pages, if real, are being generated by the *browser's print rendering*, not the app's own page-count logic.
- The `.documentPage`/`.printPage` box has a **fixed height** (`960px` unconditional; `10.56in` or `10in` inside the conflicting print blocks, C1) with `overflow: hidden`. The JS pagination capacities (`mainRowCapacity() = 22`, `continuationRowCapacity() = 32`, tuned against `estimateTextLines`'s char-per-line constants) are a **hand-tuned approximation** of how much text fits in that fixed box under one specific font/line-height. Because three different print blocks have historically declared three different heights and font sizes for the same box (C1), it is entirely plausible that the capacity constants were last tuned against a *different* box height/font-size than the one actually winning today (block #3's `10in` + the unconditional `.documentPage`'s `9px`). If the true rendered content is even slightly taller than the box, `overflow: hidden` clips it **visually**, but this does not guarantee the *print engine* won't still reserve a following page for the overflow content — some WebKit/Chromium print-pagination implementations allocate a next physical page for content that logically continues past a fixed-height block's bottom edge even when `overflow: hidden` is set, particularly when `page-break-after: always` is also present on the *same* element (both are set on `.printPage` here). **This is the most likely mechanism for "4 pages instead of 2": each of the 2 intended logical pages silently overflows its fixed box by a small amount, and the printing engine emits a mostly-blank continuation page per overflow, doubling 2 → 4.** This is a strong, code-grounded hypothesis, not a certainty — confirming it requires either (a) a real print preview (`Ctrl/Cmd+P`) with a JSA close to the row-capacity limit, or (b) real iPad AirPrint output.
- **Margin/DPI mismatch as a secondary contributor:** block #3's `@page margin: 0.5in` is the winning declaration, and the unconditional `.documentPage` box (720×960px, i.e., 7.5in×10in at the CSS-standard 96px/in) is dimensionally consistent with an 8.5in×11in sheet minus 0.5in margins on all sides. This internal consistency is good — but it assumes the print engine's px-to-in conversion uses exactly 96 CSS px/in, which is the CSS spec's reference pixel definition and generally holds in Chromium/desktop Safari. **iOS Safari's print/AirPrint pipeline has a documented history of applying its own scaling and unprintable-margin reservations on top of `@page` CSS**, especially for `@page` margin support, which is inconsistently honored across iOS/iPadOS versions. If AirPrint reserves additional hardware margin beyond what `@page: margin 0.5in` declares, the effective printable area shrinks below what `.documentPage`'s 960px/10in box assumes, causing the *same* overflow-and-extra-page mechanism described above — which would also explain why manually scaling to 75–80% in the print dialog "fixes" it (scaling down gives the box enough slack to fit inside AirPrint's smaller-than-expected effective printable area). **This is a hypothesis; it cannot be distinguished from the capacity-constant-mismatch hypothesis above without physical AirPrint testing (M).**

**Not proven, explicitly flagged as unverifiable from source alone:**
- Whether iPadOS Safari's `@page` margin support behaves identically to desktop Safari/Chrome for this specific stylesheet.
- The exact AirPrint unprintable-margin reservation for the printers in use in the field.
- Whether the "4 pages" symptom reproduces with the *current* `main` branch state or was observed against an earlier version of the CSS (the reported symptom predates this audit; the three-block conflict has clearly existed across several "layered" redesigns per the file's own comments — "v4", "v5 enhancements", "v6 pilot-ready").

---

## I. JSA Workflow Friction Points

Walking Start → Job → Meeting → Work → Signatures → Review → Print, all from source inspection (no live browser session performed in this audit, per restrictions):

1. **No unsaved-work guard on `startBlank()` / `loadTemplate()`** (`main.jsx:622-645`), unlike `clearDraft()` which does `confirm()`. A user mid-edit who taps "Start Blank" or loads a different template from `JsaStartView` loses in-memory changes with zero warning. This is explicitly called out as a known-fragile area in `CLAUDE.md` ("Single draft slot, no confirmation on overwrite") — confirmed still true.
2. **Two parallel data-entry paths for the same content** (`taskRows` detailed rows vs. `dailyTasks`/`hazardsSummary`/`controlsSummary` free-text summaries), reconciled at print time by `getContentRows`'s near-duplicate matching (`main.jsx:102-111`). This is powerful but also the single most conceptually complex part of the app for a field user to reason about — the in-app copy ("Standard behavior: Leave detailed rows blank for a normal JSA") is a good mitigation but the underlying model still requires users to trust an invisible fuzzy-matching algorithm to avoid duplicated or dropped content on the printed page.
3. **`exportPdf()`'s missing-checklist confirmation uses the browser's blocking `confirm()`** (`main.jsx:735`) — on iPad Safari this is a modal system dialog, not styled, and interrupts the flow with a plain-text bulleted list. Functionally fine, but not "premium."
4. **All 6 QuickPanel instances default to `open` (`<details ... open>`, `main.jss:1660`)** with `max-height: 380-430px; overflow: auto` inner scroll areas. On an iPad screen with the on-screen keyboard open (common while filling a form), 3 stacked always-open quick-add panels plus their textarea can push the actual "Next" button well off-screen, requiring extra scrolling per field. Not measured directly (no live session), but structurally evident from the JSX.
5. **`StepSignatures`'s copy describes a signature-count-dependent behavior change (1–30 vs 31–100) that no longer exists in the print pipeline** (see E5) — this is a real risk of confusing field users about what will actually print, independent of the dead-code cleanup concern.
6. **No visual "row limit approaching" warning while typing** — `calcFit`'s "Close to full" state only surfaces on the Review step and in the always-visible fit badge in the workflow header, not inline next to the Tasks/Hazards/Controls fields where the user is actually adding content that could push the page over capacity.

---

## J. Recommended Target Architecture

Consistent with `CLAUDE.md`'s explicit preference against "unnecessary refactoring" and for minimizing touched files — **do not split `main.jsx`/`styles.css` into a multi-file component architecture as part of this work**. The recommended target is:

- **One consolidated `@media print` block**, derived by resolving the three current blocks' cascade winners into a single authoritative set of rules, co-located with (or replacing) the unconditional `.documentPage` base rules so there is exactly one place that defines print/preview page geometry.
- **One consolidated quick-add panel CSS section**, replacing the three-times-redefined `.quickPanel`/`.chipGroup`/etc. rule set with the final (v6) values only.
- **A small, explicit "iPad tier" breakpoint set** (see K, Phase 2) added alongside — not replacing — the existing generic breakpoints, specifically covering 768–1180px as a distinct tier from both "phone" (<680) and "desktop" (>1280), so the editor/preview split and the Job Info grid have layouts verified against the four requested widths specifically rather than inherited incidentally from generic desktop-shrink breakpoints.
- **`min-width: 0` added to all native form controls used inside CSS grid/flex tracks** (starting with `input[type=time]`/`input[type=date]`), closing off the clipping mechanism at its source rather than only widening columns.
- **Input font-size raised to ≥16px** app-wide (or specifically for touch/mobile viewports) to eliminate iOS auto-zoom-on-focus.
- **Dead CSS and dead functions removed** only after this audit's findings are confirmed against a live `Ctrl/Cmd+P` print preview and, ideally, one real iPad AirPrint test — per the explicit instruction not to remove code without tracing, which this audit has done, but removal itself is Phase 6, not Phase 1.

No new dependencies, no new build tooling, no router, no state library. The data model, autosave, and pagination-estimation approach are sound and should be preserved as-is.

---

## K. Phased Implementation Plan

**Phase 1 — Stabilize architecture and remove conflicts**
- Diff the three `@media print` blocks property-by-property; identify every property block #3 does *not* redeclare (e.g., the continuation/sign-in page font-size gap noted in C1/F) and fold those into block #3 or the unconditional `.documentPage` rules.
- Consolidate the three quick-add panel CSS passes into one.
- Fix the `input[type=time]`/`min-width: 0` gap and any sibling native controls with the same issue.
- Correct `CLAUDE.md`'s stale claim about `package-lock.json` not being committed (documentation fix, not app code).
- No visual behavior should change in this phase except the two provably-live micro-bugs (font-size inconsistency, time-input clipping mechanism).

**Phase 2 — Rebuild the JSA editor as iPad-first**
- Add an explicit breakpoint tier bracketing 768–1180px for `.workflowShell`, `.formGrid2`, `.fieldWithQuick`, and the progress strip, verified against the four target widths (in a real device lab or, at minimum, Safari Responsive Design Mode as an approximation — explicitly not a substitute for M).
- Raise input font-size to ≥16px.
- Re-evaluate whether `.card { overflow: hidden }` should apply to form-bearing cards at all, vs. only to print/preview-bearing cards — clipping is a reasonable print-safety default but is actively working against the goal of *never* silently hiding a user's data entry.

**Phase 3 — Separate Live Preview and print geometry**
- Keep the shared-markup principle (`MainJsaDocumentPage` used by both), but make the print-time box dimensions the single source of truth and have the on-screen preview reference them (already mostly true via `.documentPage`) rather than risk future edits re-diverging them the way the three print blocks did historically.

**Phase 4 — Fix AirPrint pagination and 100% scaling**
- Requires Phase 1's box-height/font-size consolidation to land first, so there is exactly one height/font-size the pagination JS constants (`mainRowCapacity`, `continuationRowCapacity`, `estimateRowUnits`'s char-per-line numbers) need to be tuned against.
- Re-tune those constants against the *actual* winning CSS values, with a deliberate safety margin (intentionally under-filling the box) rather than the current tight-fit approach, specifically to absorb the AirPrint-margin-mismatch hypothesis in H even if it can't be fully diagnosed without hardware.
- This phase cannot be verified as "fixed" from source alone — real AirPrint testing (M) is required before claiming success.

**Phase 5 — Premium JSA workflow and usability polish**
- Add unsaved-changes guard to `startBlank()`/`loadTemplate()` matching `clearDraft()`'s existing `confirm()` pattern.
- Replace `StepSignatures`'s dead conditional copy (E5) with accurate, single-path copy describing the attached-sign-in-sheet-always behavior.
- Consider collapsing QuickPanels closed by default on narrow/touch viewports only (leave desktop behavior — CLAUDE.md flags this component as "don't change casually" due to the prior white-screen regression tied to QuickPanel open/add behavior; any change here needs extra manual regression testing specifically on this component).
- Inline capacity warning near Tasks/Hazards/Controls fields, not just on Review.

**Phase 6 — Remove verified dead code and consolidate CSS**
- Delete `chunk()`, `getPrintRows()`.
- Delete the legacy preview CSS block (`.previewPaper` and descendants) and legacy inline-signature print CSS (`.signatureGrid`, `.sigLine`, `.summaryBox`, `.printHeader`, `.signInHeader`, `.signInFooter`), only after Phase 1–4 print consolidation is complete and verified, so there is no risk of accidentally deleting a selector that Phase 1's diff determined was still contributing a live property.
- Remove the two now-fully-superseded `@media print` blocks entirely once Phase 1's diff confirms nothing else depends on them.

**Phase 7 — Regression testing and production deployment**
- Full manual walkthrough of every item in `CLAUDE.md`'s "Never break" list.
- Real-device pass against the checklist in section M.
- `npm run build` + GitHub Actions deploy verification per existing `CLAUDE.md` workflow rules.

---

## L. Regression Risks

- **Print CSS consolidation (Phase 1/4) is the highest-risk work in this plan.** `CLAUDE.md` explicitly flags print CSS changes as historically the most frequent source of regressions. Every change must be checked against both the live scaled preview *and* an actual `Ctrl/Cmd+P` render, per existing project instructions.
- **`QuickPanel` open/add behavior (Phase 5) is explicitly flagged in `CLAUDE.md`** as tied to a prior real white-screen regression. Any change here needs to preserve the exact recent/favorites localStorage read/write shape (`sdc.quick.recent.<panel-slug>` / `sdc.quick.favorites.<panel-slug>`) and the open/add interaction pattern currently in place.
- **`min-width: 0` / grid changes could affect desktop layouts** that currently rely on the native control's natural sizing; must be checked at desktop widths too, not just iPad widths.
- **Any capacity-constant re-tuning (Phase 4) risks silently changing where existing long JSAs paginate** — a JSA that currently fits on one page could newly require a continuation page, or vice versa. This is a content-safety-relevant change (page-fit correctness) and should be tested against several real historical drafts/templates, not just synthetic test data.
- **`localStorage` key/shape must not change** in any phase per `CLAUDE.md` — none of the above requires a schema change, but Phase 2's breakpoint work touches `settings.theme`-adjacent UI only visually, not data shape; confirm no phase accidentally touches `KEYS.draft`/`KEYS.templates`/`KEYS.settings` shapes.
- **Signature copy changes (Phase 5, E5/C9)** touch signature-related text — per `CLAUDE.md`'s explicit caution, flag this change out loud before implementing even though it doesn't touch the sign-in-sheet generation logic itself.

---

## M. Real-iPad Testing Checklist

To be run on physical hardware — none of this was performed as part of this audit:

1. **Viewport width reality check**: on each of the 4 target device/orientation combinations (768×1024, 810×1080, 1024×768, 1180×820), with Safari's default "Automatic"/site-default Request-Desktop-Website setting (i.e., *not* manually forced either way unless that's the field default), log `window.innerWidth` / `window.visualViewport.width` and confirm whether it matches the physical point width or reflects a desktop-site override. This single test resolves the G hypothesis.
2. Repeat #1 with "Request Desktop Website" explicitly toggled off, to confirm the CSS behaves as designed once the viewport is reported correctly.
3. **Print output page count**: create a JSA at default/near-empty state and print via AirPrint; confirm exactly 2 pages (Main JSA + Sign-in). Then create a JSA with enough task rows to approach `mainRowCapacity()`'s limit and confirm the transition to a continuation page happens without extra blank pages.
4. **Print scale test**: print the same JSA at browser-default 100% scale and visually confirm no clipped content on any page (header, footer, task table right edge, signature grid).
5. **Time Expired field**: on each target width, tap into "Time Issued" then "Time Expired" in the Job Info step; confirm the native time picker/control does not visually overflow its card, and that both fields remain independently tappable without overlap.
6. **iOS input-zoom test**: tap into any text field on each target width and confirm whether Safari zooms the viewport (expected: yes, until Phase 2's font-size fix lands).
7. **Orientation change**: rotate each device between portrait/landscape mid-workflow (with unsaved field data present) and confirm no data loss and no layout break.
8. **Offline/service-worker behavior**: load the app once online, then enable Airplane Mode and reload; confirm the app still opens and a draft can still be edited and autosaved (service worker cache behavior, `public/sw.js`, is unverified against real Safari SW support nuances in this audit).
9. **AirPrint margin reality check**: if #3/#4 still show clipping or extra pages after Phase 4's constant re-tuning, capture the actual printed output at 100% vs the current field workaround of 75–80% scale side-by-side to quantify the residual gap.

---

## N. Items That Cannot Be Proven Without Physical iPad/AirPrint Testing

Explicitly re-stated from throughout this report, collected here for visibility:

- Whether iPadOS Safari's "Request Desktop Website" default is the actual cause of the editor/preview split not collapsing in the field (section G).
- Whether iOS/iPadOS Safari's `@page` margin CSS support introduces additional unprintable margin beyond the declared `0.5in`, and whether that (vs. a JS pagination-capacity/CSS-box mismatch) is the primary driver of the 4-page/blank-page symptom and the need for 75–80% manual print scaling (section H).
- The actual AirPrint-reserved hardware margin for whatever printers are used in the field.
- Whether `public/sw.js`'s network-first caching strategy behaves as intended under real intermittent-connectivity conditions on iPad (the CLAUDE.md-documented use case), including whether a stale cached `index.html` referencing since-invalidated Vite asset hashes causes a broken offline reload after a deploy (a theoretical risk identified by reading `sw.js` + Vite's content-hashed asset filenames, not something observable from source alone).
- Real-world severity/frequency of the iOS input-zoom behavior and whether field users have already adapted workarounds that mask it.

---

*The full application audit is complete. No application code was changed, committed, or pushed.*
