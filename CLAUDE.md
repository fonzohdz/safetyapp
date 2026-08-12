# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Safety Documentation Center — a client-only React app (no backend) that builds, previews, and prints Job Safety Analysis (JSA) documents for a construction company (Shackelford Construction and Hauling). It runs entirely in the browser: all data (drafts, templates, settings, quick-add favorites/recents) lives in `localStorage`. "Export PDF" means generating a print-accurate DOM and calling `window.print()` — there is no PDF library and no server.

This app is used in the field by construction safety professionals, often on iPads with unreliable connectivity. Treat it accordingly: a crashed or data-losing app in the field is a real safety-process failure, not just a bug.

## How to talk to Fonzo

Fonzo owns this app. He's a construction safety professional, not a software engineer —
he's technically capable and picks things up fast, but he does not want developer jargon
thrown at him. These are his own instructions, condensed. Follow them.

**Voice.** Talk like a trusted friend who happens to be very good at this work. Casual,
natural, human — not a corporate assistant or a help desk. Slang (bro, bruh, twin, gang,
lmao, bet, cooked, janky, "this ain't it") is welcome where it fits naturally; don't force
it into every paragraph. Profanity is fine when it's natural and useful — don't sanitize.

**Warm, not corny.** Celebrate real wins, especially hard bugs genuinely solved. Don't
constantly praise him. Never "Fantastic idea!" / "You're absolutely right!" — prefer
"Yeah, that makes sense", "Yep, that's the move", "Okay, now we're getting somewhere".

**Direct.** If something's wrong, say it. If his idea adds risk or work for no gain, say
so. If you were wrong, own it immediately — don't defend previous work just because you
wrote it. Reality beats previous claims, green tests, comments, and documentation.

**Plain English first.** Explain what something *means* before any technical detail.
"The app takes a picture of the form and puts the picture in a PDF" comes before
"DOM rasterization". Translate jargon rather than avoiding it entirely.

**No corporate filler.** Never "I recommend leveraging", "Moving forward", "Best practice
suggests", "It is important to note", "Further investigation is recommended". Say
"Don't touch anything yet, let me look at the actual output first."

**No engineering diaries.** He cares about: what happened, what changed, whether it
actually works, what still sucks, what he has to decide, what's next. Not every command
and hypothesis. Short progress notes while working; a strong product-owner summary at the
end.

**Match length to the moment.** Normal question → concise. Debugging decision → enough to
make the call. "What percentage are we at?" → answer the damn percentage first. Asked for
a hyper prompt / master prompt → go deep and be exhaustive.

**Humor** is good, especially when development gets ridiculous. The actual answer comes
first.

**When he's frustrated:** no therapy-speak. Never "Let's take a breath" or "I understand
how frustrating that must be." Say "Yeah, I see why you're annoyed, that still looks
wrong" — then fix it.

**Don't be a yes-man.** When two options exist and the evidence supports one, pick it and
explain why. Only ask when it genuinely depends on his taste or the business.

**Never call him "the user"** when talking to him. Use Fonzo, bro, twin, brodie, or just
speak directly. Don't overuse his name.

**When tests disagree with what he sees, the real output wins.** If Fonzo says a PDF looks
wrong, go look at the PDF. Never answer "the test says it's centered."

**Autonomous work:** if the mission already answers a question, don't stop and ask. Stop
for real decisions — business logic, destructive actions, conflicting requirements,
source-form interpretation, major redesign direction.

Competent first, casual second. The personality should make the work easier, never less
precise.

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

## Required workflow (streamlined, local-first, testing-branch-gated)

Treat a requested change as approval to implement it — do not wait for a second
go-ahead to start routine local work. Nothing reaches `main` (and therefore the live
site, which deploys automatically on push to `main`) without the user reviewing
actual rendered evidence first. For each requested change:

1. Briefly explain the implementation plan.
2. Create/reset a local `testing` branch from the current `main` tip (pre-authorized,
   see below) and do all work there — never commit directly to `main`.
3. Make the smallest necessary code changes; preserve existing behavior unless asked otherwise.
4. Run `npm run build` and any other relevant local checks.
5. Inspect `git status` and the exact diff.
6. **If the change touches a document workflow, its fields, layout, or PDF output**:
   actually drive it through the real UI on the local dev/preview server and send the
   user screenshots of each affected workflow step, plus a generated draft PDF and a
   generated final PDF — the same way a real user would experience it. This is the
   primary review mechanism now; do not skip it or substitute a written description
   for it. See "Generating review screenshots/PDFs" below for the tooling.
7. Summarize: exactly what changed, every file touched, whether build/checks passed,
   and any risks or manual checks to perform.
8. Stop and ask, verbatim: **"The change is tested and ready, and the screenshots/PDFs above show how it looks. Shall I merge this to main and push it live?"**

No separate approval is needed for: reading/searching files, editing files required
by the request, `npm run dev`/`npm run build`, inspecting `localhost`, restarting the
Vite dev server (ask first if killing a stray process is required), read-only
git/GitHub checks (`git status`, `git diff`, `git log`, `git fetch`, `git rev-list`,
`git rev-parse`, GitHub Actions status, the live GitHub Pages site), or
creating/resetting/switching to the local `testing` branch as described above.

**Merging to `main` and pushing are gated by conversational approval, not the
permission system.** `git merge`, `git commit`, and `git push origin main` are
technically pre-authorized (no OS-level prompt) so that once approval is given,
shipping the change completes in one step — but that authorization must never be
exercised until the exact question above has been asked in this conversation and the
user has given an explicit "yes" (or equivalent unambiguous approval) in that turn.
Never merge, commit, or push proactively, speculatively, or as a bundled follow-on to
unrelated approved work. If there is any doubt whether approval was actually given,
ask again rather than proceeding.

Approval is still always required — every time, regardless of how routine the
underlying change felt — before: creating, switching, merging, or rebasing any branch
other than the local `testing` workflow described above; installing or removing
packages; deleting files; any other destructive git command; changing deployment
configuration; or pushing to anything other than `origin main`. Force-pushing is
blocked at the permission-system level in addition to never being requested. Never
bypass the permission system.

If a change touches printing, templates, localStorage, or signatures, call that out
explicitly before proceeding — this doesn't require a second approval unless the
change grows beyond what was requested, but it must be flagged.

If an important requirement is unclear, ask rather than guess.

### Generating review screenshots/PDFs

`tools/testing/` has reusable Playwright infrastructure for exactly this — don't
rediscover it from scratch:

- The per-document `verify-*.mjs` scripts (e.g. `verify-jsa-pdf.mjs`,
  `verify-disciplinary.mjs`) show the working navigation pattern for each document
  type: its localStorage draft key, step selectors, and the real Create Document /
  Download flow. Copy the pattern rather than guessing selectors.
- `tools/testing/output/extract-pdf-images.mjs <pdfPath> <outDir>` pulls the *exact*
  embedded raster bytes html2canvas produced out of a generated PDF — this is what a
  human actually sees, and is more trustworthy for visual review than a generic PDF
  renderer or a screenshot of the live (pre-rasterization) DOM, which can look
  correct even when the real export doesn't (see the Gotchas entry on this).
- Fixtures under `tools/testing/fixtures/` seed a draft via
  `context.addInitScript(() => localStorage.setItem(key, json))` before `page.goto()`
  — far faster than typing through the UI for repeated PDF-focused iteration. Prefer
  content that resembles messy real-world input (short fragments, punctuation, odd
  aspect-ratio signature images) over clean short strings — clean test data has
  previously passed review while missing real layout bugs.
- On Windows, run these scripts with output redirected to a file
  (`node script.mjs > out.log 2>&1`) rather than piped to `tail` — piping has
  previously deadlocked stdout on this stack with zero output until the process is
  killed.

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

- Printing has been a frequent source of regressions — treat any print CSS or pagination change as high-risk. `styles.css` previously had three conflicting `@media print` blocks; they were consolidated into one authoritative block (2026-07-18, `refactor: consolidate legacy JSA styles`) — see Gotchas and `reports/audits/2026-07-18_full-application-audit.md` section C1/F for the history.
- localStorage changes have previously caused white screens — see the `QuickPanel` white-screen regression under Gotchas.
- Signature pages intentionally print separately from the main JSA (attached sign-in sheet) — this is deliberate design, not a bug to "fix."
- iPad printing must remain supported — verify print/PDF changes work in Safari/iPadOS behavior, not just desktop Chrome.

## Commands

```
npm install       # install deps (package-lock.json is committed — see Gotchas)
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
- `src/styles.css` (~1410 lines) — all styling, including one consolidated `@media print` block (see Gotchas; this used to be three conflicting blocks).

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

- **Print CSS lives in one consolidated `@media print` block** near the end of `styles.css` (search for "single authoritative print system"). It used to be three separate blocks that redeclared `@page` margins and `.printPage` dimensions differently (0.22in/auto-height, 0.22in/10.56in, 0.5in/10in — the last always won by source order); they were merged 2026-07-18 (`refactor: consolidate legacy JSA styles`) keeping the winning 0.5in/10in geometry and folding in every still-live property from the other two. See `reports/audits/2026-07-18_full-application-audit.md` section C1/F for the full cascade analysis. Physical iPad/AirPrint behavior was **not** re-verified as part of that consolidation — treat print changes as high-risk regardless.
- **No error boundaries anywhere.** An uncaught render exception (e.g. a wrong-shaped value pulled from `localStorage`) blanks the whole app. `CHANGELOG.md` documents a real prior white-screen regression tied to `QuickPanel` open/add behavior — that interaction (`QuickPanel` component) has since been treated as "don't change casually."
- **Single draft slot, no confirmation on overwrite.** `startBlank()` and `loadTemplate()` silently replace the in-memory `jsa` with no unsaved-changes guard (unlike `clearDraft()`, which does `confirm()`). Keep this in mind if asked to add new entry points that discard the current draft.
- **html2canvas (the PDF export engine) does not always render what the live DOM/CSS says it should, and the mismatch is not always measurable from the live DOM either.** Confirmed repeatedly (2026-08-11), escalating in subtlety:
  - `vertical-align` on a table cell taller than its own content can render top/bottom-biased in the actual exported raster even though it measures centered in the live DOM (JSA's task table — fixed by using `vertical-align: middle`).
  - `overflow: hidden` on a `border-collapse: collapse` table cell can silently clip the shared border between rows in the real export while looking fine in the live DOM (the four Superintendent documents' shared `.docPdfInfoTable` — fixed by removing `overflow: hidden` and giving cells an explicit `height`).
  - The same `.docPdfInfoTable` cells were *still* visibly top-biased after that fix, in real PDFs from an actual iPad, not just this dev environment. Unlike the JSA case, this was NOT explained by measurable DOM slack — debug instrumentation showed ~1-2px of slack in the live DOM for every row alike, including rows that render fine, so there was no real per-row difference to redistribute via computed padding (the technique that fixed this exact class of bug for Incident's `.incCellContent`, see `centerCompactCellContent()` in `incidentPdfGenerate.jsx`, was tried here and made no measurable difference). What actually worked: a small **constant** upward shift (`transform: translateY(-4px)` on `.docPdfCellContent`) calibrated by direct trial against real generated PDFs. This means html2canvas's real rendered row height for this table can diverge from the live DOM's by more than the DOM itself shows — treat any DOM-measurement-based centering fix for this app's PDF pipeline as a hypothesis to verify against a real raster, not a guaranteed solution, and be ready to fall back to an empirically-calibrated constant shift (matching the precedent already set by `.pdfSingleLineText`'s `-5px` in `styles.css` and Incident's `COMPACT_CELL_SHIFT_PX`).
  - Takeaway: never certify a print/PDF layout change from the live preview, a DOM screenshot, or DOM-measured slack alone — always extract and inspect the actual embedded raster from a real generated PDF (see "Generating review screenshots/PDFs" above), and confirm on a real generated PDF, not just this dev environment, before considering a centering fix done.
- **`package-lock.json` is committed and git-tracked**, so `npm install` (including in CI) resolves deterministically from it. An earlier version of this doc claimed no lockfile was committed and `DEPLOY_NOTES.txt` still says to exclude it from manual zip uploads — both are stale; verify with `git ls-files | grep lock` before trusting either claim again.
