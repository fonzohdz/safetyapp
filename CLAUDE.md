# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Safety Documentation Center — a client-only React app (no backend) that builds, previews, and prints Job Safety Analysis (JSA) documents for a construction company (Shackelford Construction and Hauling). It runs entirely in the browser: all data (drafts, templates, settings, quick-add favorites/recents) lives in `localStorage`. "Export PDF" means generating a print-accurate DOM and calling `window.print()` — there is no PDF library and no server.

This app is used in the field by construction safety professionals, often on iPads with unreliable connectivity. Treat it accordingly: a crashed or data-losing app in the field is a real safety-process failure, not just a bug.

## Project priorities

When a change trades one of these off against another, favor the higher one, highest first:

1. Reliability
2. Data integrity
3. Ease of use
4. Printing accuracy
5. Performance
6. Appearance

## Never break

- Printing
- PDF output
- localStorage compatibility (existing keys/shapes must keep working)
- Existing templates
- Existing drafts
- Offline functionality
- Mobile usability
- iPad compatibility

## Required workflow (streamlined, local-first)

Treat a requested change as approval to implement it — do not wait for a second
go-ahead to start routine local work. For each requested change:

1. Briefly explain the implementation plan.
2. Make the smallest necessary code changes; preserve existing behavior unless asked otherwise.
3. Run `npm run build` and any other relevant local checks.
4. Inspect `git status` and the exact diff.
5. Summarize: exactly what changed, every file touched, whether build/checks passed,
   and any risks or manual checks to perform.
6. Stop and ask, verbatim: **"The change is tested and ready. Shall I commit and push it live?"**

No separate approval is needed for: reading/searching files, editing files required
by the request, `npm run dev`/`npm run build`, inspecting `localhost`, restarting the
Vite dev server (ask first if killing a stray process is required), or read-only
git/GitHub checks (`git status`, `git diff`, `git log`, `git fetch`, `git rev-list`,
`git rev-parse`, GitHub Actions status, the live GitHub Pages site).

**Commit and push are gated by conversational approval, not the permission system.**
`git commit` and `git push origin main` are technically pre-authorized (no OS-level
prompt) so that once approval is given, shipping the change completes in one step —
but that authorization must never be exercised until the exact question above has
been asked in this conversation and the user has given an explicit "yes" (or
equivalent unambiguous approval) in that turn. Never commit or push proactively,
speculatively, or as a bundled follow-on to unrelated approved work. If there is any
doubt whether approval was actually given, ask again rather than proceeding.

Approval is still always required — every time, regardless of how routine the
underlying change felt — before: creating, switching, merging, or rebasing branches;
installing or removing packages; deleting files; any other destructive git command;
changing deployment configuration; or pushing to anything other than `origin main`.
Force-pushing is blocked at the permission-system level in addition to never being
requested. Never bypass the permission system.

If a change touches printing, templates, localStorage, or signatures, call that out
explicitly before proceeding — this doesn't require a second approval unless the
change grows beyond what was requested, but it must be flagged.

If an important requirement is unclear, ask rather than guess.

## Command hygiene

Keep commands simple and predictable so routine work doesn't generate redundant
permission prompts:

- Run commands directly from the repository's existing working directory. Never
  prefix an approved command with `cd`, `pushd`, or chain a directory change into it.
- Run one simple command at a time whenever possible, instead of combining steps.
- Do not use shell loops, temporary diff files, command substitution, complex
  pipelines, or compound Bash scripts for routine verification (build checks,
  `git status`, diff review, deployment checks). Use the simplest command that
  answers the question.
- After the user's final conversational approval to ship, run exactly:
  ```
  git commit -m "..."
  git push origin main
  ```
  Nothing more elaborate.
- For deployment verification, use simple read-only commands already on the
  allowlist (`git status`, `git diff`, `git log`, `git fetch`, `git rev-list`,
  `git rev-parse`, checking GitHub Actions status, the live GitHub Pages site)
  instead of constructing new ad-hoc scripts.
- Once GitHub Actions reports success for the exact pushed commit, stop. Do not go
  on to parse the live bundle, inspect asset hashes, or fetch and diff deployed
  CSS/JS — tell the user to refresh the live site themselves for final visual
  confirmation instead.
- If a verification command fails mechanically (e.g. a parse error), don't ask for
  approval to fix it — just replace it with a simpler command, or skip the check
  if it's redundant with something already confirmed.

## Coding philosophy

- Prefer simple code over clever abstractions.
- Preserve backwards compatibility whenever possible.
- Minimize the number of touched files.
- Avoid unnecessary refactoring.

## Project roadmap

This is the first module of a planned company-wide safety platform. Expect future work to add, alongside JSAs:

- Equipment Inspections
- Incident Investigations
- Corrective Actions
- Safety Observations
- Training Records
- Employee Management

Keep this in mind when naming things or structuring data — code that assumes "JSA is the only document type" will need to generalize later.

## Historical lessons

- Printing has been a frequent source of regressions — treat any print CSS or pagination change as high-risk (see the three-`@media print`-blocks issue under Gotchas).
- localStorage changes have previously caused white screens — see the `QuickPanel` white-screen regression under Gotchas.
- Signature pages intentionally print separately from the main JSA (attached sign-in sheet) — this is deliberate design, not a bug to "fix."
- iPad printing must remain supported — verify print/PDF changes work in Safari/iPadOS behavior, not just desktop Chrome.

## Commands

```
npm install       # install deps (no lockfile is committed — see Gotchas)
npm run dev        # vite dev server, bound to 0.0.0.0
npm run build       # vite build -> dist/
npm run preview     # serve the built dist/ locally, bound to 0.0.0.0
```

There is no test suite, no lint config, and no type checker configured in this repo. Do not invent npm scripts for these — verify changes manually (`npm run dev`, exercise the flow, check `npm run build` succeeds) since there is no automated safety net.

## Deployment

`.github/workflows/deploy-pages.yml` builds and deploys `dist/` to GitHub Pages on every push to `main` (or manual dispatch). `vite.config.js` sets `base: './'` specifically so built asset paths resolve correctly under the GitHub Pages project URL — do not change this to an absolute base.

Historically this repo has been pushed to by uploading whole-folder zips through the GitHub web UI rather than `git push` (see commit history: "Add files via upload"). If you are committing changes here, prefer normal git commits/PRs, but be aware the deployed app has no branch protection or review gate beyond a successful `npm run build`.

## Architecture

The entire application is two files:
- `src/main.jsx` (~1840 lines) — every component, all state management, all business logic, and large hard-coded content libraries (hazard/control/task-suggestion text), all in one file.
- `src/styles.css` (~1640 lines) — all styling, including three separate `@media print` blocks (see Gotchas).

There is no router, no component/hooks/utils folder structure, and no state management library — everything is `useState`/`useMemo`/`useRef` inside the root `App` component, passed down via props (deep prop-drilling is normal here, e.g. `JsaWorkflow` takes ~24 props).

### Navigation model

Navigation is hand-rolled with three pieces of state in `App`: `tab` (top-level section: home/documents/drafts/templates/settings), `activeDoc` (`null | 'jsa-start' | 'jsa'`, which document workflow is open), and `jsaStep` (which step of the 5-step JSA wizard: `job` → `meeting` → `work` → `signatures` → `review`, defined in the `STEPS` array).

### The JSA data model

`emptyJsa()` defines the canonical shape of a JSA document — a flat object with job-info fields, meeting-info fields, `taskRows` (array of `{step, hazards, controls}`), summary fields (`dailyTasks`/`hazardsSummary`/`controlsSummary` — newline-separated strings, an alternate/legacy way to enter the same content as `taskRows`), and `signatureLineCount`. `getContentRows(jsa)` reconciles the two representations (detailed `taskRows` win; summary lines fill in anything not already covered, using near-duplicate matching) into the rows actually printed.

### Templates vs. drafts

- **Draft**: exactly one active JSA, autosaved (900ms debounce) to a single fixed localStorage key. There is no multi-draft support — loading a template or starting blank replaces the in-memory draft outright.
- **Template**: a named, reusable snapshot of a JSA with day-specific fields wiped (date, times, tailgate topic, previous-day note, notes, signature count reset). Templates are stored in a separate localStorage array. `BUILT_IN_TEMPLATES` has exactly one entry (`blank-jsa`); everything else is user-created via `saveTemplate()`/`updateTemplate()` in the Review step.

### localStorage keys (all under `KEYS` in main.jsx, plus per-panel keys)

- `sdc.jsa.draft.v4` — the single active draft
- `sdc.jsa.templates.v1` — array of custom templates
- `sdc.settings.v2` — theme + custom quick-add lists
- `sdc.quick.recent.<panel-slug>` / `sdc.quick.favorites.<panel-slug>` — per-`QuickPanel` recent/favorite chips (one pair per quick-add picker instance)

All reads go through `safeJson()` (parse-or-fallback) but there is no runtime shape validation beyond that — a validly-parsed but wrong-shaped value (e.g. object instead of array) will throw downstream. If you bump a schema, remember these key suffixes (`.v1`, `.v2`, `.v4`) are the only versioning mechanism, and there is no migration logic — old data is spread onto `emptyJsa()` defaults, not transformed.

### Print/PDF pipeline

`PrintableJsa` is always mounted (hidden off-screen except in print media) and renders the real print DOM: `MainJsaDocumentPage` + N `TaskContinuationPage`s + N `AttachedSignIn` sign-in pages. `JsaPreview` renders the *same* `MainJsaDocumentPage` component scaled down via CSS `transform`, so preview and print share one markup path — when changing print layout, check both the live preview and an actual print (`Ctrl/Cmd+P`) render.

Pagination is computed in JS, not left to the browser: `paginateTaskContent()` / `getSignaturePages()` estimate wrapped line counts per field (`estimateTextLines`, tuned chars-per-line per column) and greedily bin-pack rows into a main page (capacity 22 units) and continuation pages (capacity 32 units each), with signature lines split into pages of ≤40. `calcFit()` turns this into the "Fits on one page / Continuation required / Content needs review" status shown in the UI. If you change fonts, font sizes, column widths, or row heights in the print CSS, the capacity constants (`mainRowCapacity`, `continuationRowCapacity`, and the char-per-line numbers in `estimateRowUnits`) need to stay consistent with what actually fits, or pages will overflow/clip silently (`overflow: hidden` on `.documentPage`/`.printPage`).

`exportPdf()` doesn't generate a PDF file — it validates page-fit and the review checklist, sets `document.title` to a sanitized filename (used as the suggested filename in the browser's "Save as PDF" dialog), and calls `window.print()`.

## Gotchas / known-fragile areas

- **Three `@media print` blocks in `styles.css`** (around L860, L1128, L1594), each redeclaring `@page` margins and `.printPage` dimensions differently. The last one in source order wins for conflicting properties. This is leftover from earlier CSS versions layered on top of each other — treat as needing consolidation, not as three intentional layers. If print output looks wrong, check for a rule further down the file silently overriding the one you just edited.
- **No error boundaries anywhere.** An uncaught render exception (e.g. a wrong-shaped value pulled from `localStorage`) blanks the whole app. `CHANGELOG.md` documents a real prior white-screen regression tied to `QuickPanel` open/add behavior — that interaction (`QuickPanel` component) has since been treated as "don't change casually."
- **Single draft slot, no confirmation on overwrite.** `startBlank()` and `loadTemplate()` silently replace the in-memory `jsa` with no unsaved-changes guard (unlike `clearDraft()`, which does `confirm()`). Keep this in mind if asked to add new entry points that discard the current draft.
- **No lockfile is committed** (`package-lock.json` was intentionally removed) — `npm install` in CI can resolve different transitive versions between builds.
