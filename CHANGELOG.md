# Safety App — Changelog

## v6.0.0 — JSA Pilot Build (June 2026)

This release is the pilot-ready JSA update intended for a one-week field test by the safety team.

### Print and live preview

- The main JSA live preview and printed main JSA now use the same React page component.
- The preview displays a full Letter sheet with visible default-style margin space around the exact document content.
- Print CSS is tuned for Letter portrait with professional 0.5-inch margins while Chrome remains set to **Margins: Default**.
- The main task table expands to use the remaining printable page height instead of stopping halfway down the sheet.
- Long task content moves by complete row to branded continuation sheets.
- Attached sign-in sheets distribute lines evenly and stretch rows to use the full printable height.

### Shackelford document styling

- Retained the official Shackelford logo, charcoal header, red accent rule, coordinated page titles, and matching footers.
- Main JSA, continuation pages, and sign-in sheets export as one consistent document packet.
- Added a continuation notice to the main page when extra task rows are attached.

### Quick task, hazard, and control audit

- Rebuilt the quick-add libraries so each type stays in its correct lane:
  - **Tasks** describe work being performed.
  - **Hazards** describe exposures or harmful conditions.
  - **Controls** describe preventive actions or requirements.
- Removed or rewrote mixed items such as pre-task planning, wet-down controls, rail-clearance controls, and phone/earbud rules from incorrect categories.
- Added clearer civil, earthwork, equipment, delivery, excavation, stabilization, and railroad wording.

### Task-based suggestions

- Selecting a supported quick task opens a review panel with common suggested hazards and controls.
- Users can choose **Task Only**, **Add Selected**, or **Add All Suggestions**.
- Approved hazards and controls are stored as a paired detailed task row so the printed relationship remains clear.
- Suggestions are guidance only and include a reminder to review actual site conditions.

### Duplicate prevention

- Quick adds normalize capitalization, punctuation, spacing, and close wording before insertion.
- Exact and strong near-duplicates are skipped.
- Batch suggestions report skipped duplicates instead of adding repeated language.
- Detailed task-row templates cannot be added twice.
- Manual task, hazard, and control lists are cleaned for duplicates when the field loses focus.
- Custom quick adds cannot be saved when a similar custom item already exists.

### Quick-add menu improvements

- No horizontal scrolling or clipped options.
- Category and search controls respond cleanly to narrow panels.
- Options wrap into readable cards.
- Included items are marked.
- Favorites and recently used items are stored separately for each quick-add section.

### Custom quick adds

- Added a Settings manager for custom tasks, hazards, and controls.
- A type must be selected before saving, preventing custom items from entering the wrong library.
- Custom items appear in dedicated categories inside the JSA builder.

### Review and export

- Added an export quality checklist covering job information, emergency information, meeting details, tasks, hazards, controls, signatures, and page fit.
- Added a page-count summary for the main JSA, continuation sheets, sign-in sheets, and total packet.
- Added a visible suggested PDF filename.
- Printing warns about incomplete review items but allows an intentional override.

### Templates and drafts

- Draft auto-save remains active.
- Template messaging now clearly explains which daily fields reset.
- Loading a template starts a fresh JSA for the current day and clears daily work rows and notes.

### Cache and deployment

- Updated the production service-worker cache to `safety-app-v6-0-0`.
- Local development still unregisters service workers and clears caches to prevent stale builds.
- Vite remains configured with `base: './'` for GitHub Pages project URLs.

### Run locally

```bash
npm install
npm run dev -- --port 5196
```

Open:

```text
http://localhost:5196/
```

### Build check

```bash
npm run build
```

The v6 production build passed before packaging.
