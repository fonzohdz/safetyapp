# Safety App — Changelog

## v1.0.0 — Official On-Site JSA App

This release promotes the field-tested JSA pilot into the first official working version used on site.

### Print and PDF layout

- Signature lines now always generate on an attached sign-in sheet, regardless of crew size.
- The main JSA always displays a crew sign-in notice instead of placing signature boxes on the main page.
- The main JSA has more room for tasks, hazards, and controls.
- Printed box/table text was increased for better field readability.
- The task/hazard/control grid now fills the page more intentionally with adaptive row counts instead of leaving oversized boxes.
- Continuation pages and attached sign-in sheets remain branded and page-numbered as part of the same packet.

### Templates

- Custom templates now keep saved tasks and detailed task rows.
- Loading a template still resets daily-changing fields including date, times, tailgate topic, previous-day safety status, signatures, notes, and draft status.
- Template messaging was updated to explain that templates carry over recurring tasks, hazards, and controls.

### Quick Add cleanup

- Daily task quick-add wording was simplified into more field-friendly language.
- Similar hazards and controls were consolidated so the standard library stays cleaner and faster to use.
- Specific or unusual language can still be added through custom quick adds.
- Task, hazard, and control lanes remain separated.

### Quick Add toggle behavior

- Quick-add buttons now work as toggles.
- Tapping an unselected quick-add adds it.
- Tapping a selected quick-add removes it.
- Selected quick-adds display a visible selected state.
- Removing a task also removes any paired detailed task row/suggestions added with that task.

### Suggested hazards and controls

- Adding a supported task now asks whether the user wants to review suggested hazards and controls.
- Choosing **No, skip** adds only the task and moves on.
- Choosing **Yes, review suggestions** opens the suggested hazard/control review screen.
- Users can add selected suggestions or all suggestions.
- Suggestions remain review-only and should be checked against actual site conditions.

### Deployment

- The GitHub Actions workflow remains configured for GitHub Pages deployment.
- Source ZIP excludes `node_modules`, `dist`, and `package-lock.json`.
- Production build was verified before packaging.
