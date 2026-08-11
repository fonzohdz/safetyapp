# iPad Air (13") UI Audit — Safety Documentation Center

**Date:** 2026-08-11
**Branch:** `main`
**Scope:** UI/UX audit only. No application code was modified as part of this report.
**Method:** Live render via Playwright + WebKit (Safari's engine) at the real iPad Air 13" logical viewport (1366×1024pt landscape, 1024×1366pt portrait — same points as the 12.9" iPad Pro), both light and dark themes, plus computed-style extraction of every interactive element's tap-target size and font size. This is stronger evidence than the static-source-only review in `2026-07-18_full-application-audit.md` — findings below are rendered/measured, not inferred from CSS reading alone.

Context: iPad Air (13") and desktop are the primary target devices going forward; phone support is secondary (previously treated as primary during dev for convenience).

## Summary

Most iPad fundamentals are already right: all five sidebar nav items, all five JSA step tabs, every text input, and every primary button measured at or above Apple's 44pt minimum tap target across both orientations. All inputs render at 16px, which avoids Safari's auto-zoom-on-focus. The JSA workflow's date/time field handling is deliberately touch-aware (see Finding 3). The Review/Export step already demonstrates a genuinely iPad-appropriate multi-column layout.

The gap is inconsistency, not absence of iPad design: some screens (Review/Export, the Client/Muster Point pair) use the 13" width correctly; others (Job Info's other fields, Templates, the general card/list rhythm on Home and Documents) render like a phone layout stretched wide, with content bunched left and large unused space to the right.

## Findings

### 1. Short text fields default to full-width single-column (Fix)

`StepJob` (`src/main.jsx:2680`) wraps every field in `.formGrid`, and `.formGrid` (`src/styles.css:1084`) is `grid-template-columns: 1fr` unconditionally. Only fields explicitly wrapped in `.formPairRow` (`src/styles.css:1148`) get a second column, via a container query at 400px. Currently only three pairs opt in: Date/Job #, Client/Muster Point, Time Issued/Time Expired.

Fields that are plain text with no technical constraint — Location/City, Job Site, Superintendent/Foreman, Emergency/Rescue Phone #, Site Contact Phone #, Nearest Medical Facility, Assigned Mentor/SSE Number — are never paired, so each renders as an ~934pt-wide input on the 1366pt landscape viewport (measured). This is the single biggest contributor to the "phone screen stretched wide" feel on the JSA builder screens.

**Fix candidate:** wrap short plain-text fields in `.formPairRow` (not `forcedStack`) the same way Client/Muster Point already are. Low risk, purely additive to an existing pattern.

### 2. "← Start Options" button is under the 44pt tap-target minimum (Fix)

Measured at 119×**34**pt in both orientations — every other button/input in the app measured ≥44pt tall. This is the one isolated undersized tap target found; not a pattern issue.

### 3. Date/time fields' single-column behavior is deliberate and correct — do not change

`StepJob` explicitly forces `.formPairRow.forcedStack` on touch devices for the Date/Job # and Time Issued/Time Expired pairs, with an in-code explanation: native `input[type=date]`/`input[type=time]` intrinsic width in WebKit can't be reliably measured from source, and a prior audit (`2026-07-18_full-application-audit.md`, finding #3) identified a plausible clipping mechanism for exactly this. This is a real, already-fixed regression risk — confirmed still in place and functioning as intended. No action needed; noted here so it isn't mistaken for the same bug as Finding 1.

### 4. Default theme is dark; Settings copy calls light "the primary experience" (Decision, not a bug)

`main.jsx:1309`: `document.documentElement.dataset.theme = settings.theme || 'dark'` — dark is the hardcoded default for first-time users. The Settings screen's own copy (`main.jsx` Settings view) states: *"Light mode uses a navy-and-off-white workspace and is the primary experience."* Rendered comparison confirms light mode has cleaner card/section separation and reads more "premium" on the 13" canvas. This is a product decision (which should be default) rather than a defect — flagging because the code and the copy currently disagree with each other.

### 5. Templates screen has a large unused area at 13" width (Low priority)

Accurate today (no custom templates saved in a fresh profile) but worth revisiting once real templates exist — the empty state currently has little visual presence relative to the space it's given.

## Not re-litigated here

Printing, PDF export, and pagination were not touched by this audit and were out of scope — see `2026-07-18_full-application-audit.md` for that history and the consolidated `@media print` block.
