# Source-Form Fidelity Audit — 2026-08-12

**Question asked:** do the app's documents actually match Shackelford's real paper forms?

**What was compared:** the text content of the six Word source forms Fonzo supplied,
against the app's option lists, models, and — critically — the **printed PDF output**,
not just what the on-screen form shows.

| Source file | App document |
|---|---|
| `SCH_Discipline_Form.docx` | Employee Disciplinary Notice |
| `SCH_Employee_Separation_Form.docx` | Employee Separation |
| `Employee_Medical_Event_Form.docx` | Employee Medical Event |
| `Unplanned_report.docx` | Uncontrolled Event Report |
| `SCH_Blank_incident_report.docx` | Incident Report |
| `SCH_Employee_Information_Change_Form.docx` | **— nothing —** |

**Scope limit, stated honestly:** this compares *content* — headings, field names, option
lists, instructions, ordering. It does not compare visual layout of the Word files
(column widths, shading, exact box sizes), because the extraction reads the document
text, not its rendered appearance. Content fidelity was the stated priority: a
perfectly-rendered form that asks the wrong questions is still wrong.

---

## Headline

**Fidelity is high.** No section of any of the five implemented forms is missing, and no
form asks for something the paper version doesn't. The cause-analysis table on the
Incident report — 45 items across three columns — matches the source **word for word and
in order**. Separation's employee-information block, reason list, property/access lists
and rehire statuses match exactly.

The real findings are: one whole form that doesn't exist in the app, two sentences that
carry procedural/legal weight and appear on screen but **not on the printed PDF**, and a
set of smaller wording and ordering differences.

---

## A. Missing entirely

### A1. Employee Information Change Form has no app equivalent
The sixth source form is a complete document the app does not implement: employee info
block, "Change Requested" checkboxes (New Address, New Phone, Emergency Contact, Name
Change, Position / Job Title, Project / Location, Other — and Pay Rate, Benefits, Federal
W/H, State W/H, Insurance, Employee Loan), a Current Information / New Information
comparison block, Description / Notes, an Attachments list (W-4, State Withholding Form,
Benefits / Insurance Form, Supporting Document, Other), and a three-way
Employee / Supervisor / HR-Payroll approval block.

This is real new scope, not a gap to patch. Worth noting that the Separation suite already
guards against Data Change content leaking into the separation form — so the two were
always understood to be separate documents.

**Decision needed from Fonzo.**

---

## B. On screen but not on the printed form

These both exist in the app's workflow UI and are missing from the PDF that gets signed
and filed. The paper forms print them.

### B1. Separation — the acknowledgement sentence is not on the PDF
Source prints, inside the signature section:

> "Employee signature acknowledges receipt and does not necessarily indicate agreement."

The app shows this as helper text in `SeparationWorkflow.jsx`, but `separationPdfDraw.js`
draws a bar reading only **"Approvals"** — the source heading is
**"ACKNOWLEDGEMENT / APPROVALS"**.

This is the sentence that makes the signature safe for the employee to give. Its whole
purpose is to be printed above the signature line on the copy the employee keeps. On
screen it protects nobody.

**Recommend fixing.** Low risk, high value.

### B2. Medical Event — the "go file an incident report" instruction is not on the PDF
Source prints, right beside the Yes/No:

> "Specific work event or exposure reported? ☐ No ☐ Yes
> *(If yes, complete the Incident Reporting and Investigation Form.)*"

The app has an excellent, more careful version of this on screen
(`MedicalEventWorkflow.jsx`) — but the printed form carries no such instruction. The
routing rule that turns a medical event into an incident investigation is exactly the
thing a supervisor reads off the paper later.

**Recommend fixing.** Low risk, high value.

---

## C. Option lists and fields that differ

### C1. Uncontrolled Event — the parenthetical hints were dropped
The source labels carry decision aids that the app's labels don't:

| Source | App |
|---|---|
| Weather / Natural **(wind, lightning, flood, heat/cold)** | Weather / Natural |
| Site Condition Change **(ground, erosion, collapse)** | Site Condition Change |
| Near Miss **(no damage/injury)** | Near Miss |
| Injury / Illness **(record separately)** | Injury / Illness |

Two of those matter more than the others: "(no damage/injury)" defines Near Miss, and
"(record separately)" tells the super this event still needs its own injury record.
"Equipment / Mechanical Failure (not misuse)" and "Medical Event / Illness
(non-occupational)" *did* keep their parentheticals, so this is inconsistent rather than
a deliberate style choice.

**Recommend restoring all four.**

### C2. Medical Event — "Full Duty" has no date field
Source: `☐ Full Duty on: ________` and `☐ Off Work Until: ________` — both carry a date.
The app has `offWorkUntilDate` but no equivalent for Full Duty. A return-to-full-duty date
is a real record.

### C3. Medical Event — attachment list differs
Source: `☐ Provider Note ☐ Photo ☐ Other`.
App: `Photos / Video / Other`, plus a separate "Provider Note Attached? Yes/No" row.

The app *adds* Video and promotes Provider Note to its own row. Defensible — arguably
better — but it is a divergence, and the app also uses the plural "Photos".

### C4. Incident — Nature of Injury is multi-select; source says "circle one"
Source: `Nature of Injury (circle one): sprain/strain, fracture, ...`
App: `injuryNature: []` — any number selectable.

Real injuries are often two things at once (a laceration *and* a burn), so the app's
behaviour may well be the better record. But it does not match the form, and which one is
correct is a records/business question, not a code question. **Fonzo's call.**

### C5. Incident — investigation team is not pre-filled
The paper form ships with two rows already printed:

| Name | Title |
|---|---|
| Alfonso Hernandez Jr | Safety Coordinator |
| Alfonso Hernandez Sr | Safety Manager |

The app starts the team table empty (max 4 members). Pre-filling would save typing on
every single incident report.

### C6. Uncontrolled Event — app adds a field the source lacks
App prints "Reported By — Title"; the source has only Name / Signature / Date under
REPORTED BY. This is an addition, not a loss — flagged for completeness.

---

## D. Wording and ordering (cosmetic, but it's what people recognise)

### D1. All four titles drop the word "FORM"

| Source | App |
|---|---|
| EMPLOYEE DISCIPLINARY NOTICE **FORM** | EMPLOYEE DISCIPLINARY NOTICE |
| EMPLOYEE SEPARATION **FORM** | EMPLOYEE SEPARATION |
| EMPLOYEE MEDICAL EVENT **FORM** | EMPLOYEE MEDICAL EVENT |
| UNCONTROLLED EVENT REPORT | UNCONTROLLED EVENT REPORT ✓ |

### D2. Information-block field order differs on two forms

**Disciplinary** — source: `Employee Name | Supervisor` then `Position | Date`.
App: `Employee Name | Date` then `Supervisor | Position`.

**Medical Event** — source: `Employee Name | Supervisor`, `Position | Project / Location`,
`Date | Time Reported`.
App: `Employee Name | Date`, `Supervisor | Position`, `Project / Location | Time Reported`.

Same fields, different cells. Anyone who knows the paper form reads these positionally.

### D3. Disciplinary — two section headings were shortened

| # | Source | App |
|---|---|---|
| 2 | Earlier verbal or written warnings, discussions, etc. on this issue | Earlier Warnings / Discussions |
| 5 | Corrective action that must be taken by the employee | Corrective Action Required of Employee |

Sections 1, 3, 4, 6 and 7 match.

### D4. Disciplinary — the lead-in line was replaced
Source reads "This notice serves as:" above the four warning-level boxes. The app draws a
grey bar reading "WARNING LEVEL". The app's version is clearer as a form label; the
source's is a sentence the notice actually makes. Cheap to restore either way.

### D5. Medical Event — section grouping differs
Source groups "INITIAL CLASSIFICATION / ATTACHMENTS" as one section. The app splits them
into two side-by-side blocks. Purely presentational; no content lost.

### D6. Medical / Incident signature blocks have no Name field
Source signature blocks print `Name:` above `Signature:` and `Date:`. The app's Medical
Event signature rows carry signature + date only. (Separation's three-column block does
carry names.)

---

## E. Confirmed exact matches

Worth recording so nobody "fixes" these later:

- **Incident cause analysis** — all three columns, 15 items + Other each, wording and order
  identical to the source table.
- **Incident injury-nature list** — identical, in order.
- **Incident property-damage fields** — List Property/Material Damaged, Nature of Damage,
  Object(s)/Machine(s)/Tool(s)/Substance(s) Inflicting Damage, Approximate Cost — identical.
- **Incident primary-cause marking** — the source's "put an asterisk by the primary root
  cause" is implemented as `primaryCause`.
- **Separation employee-information block** — all eight fields, in the source's order and
  cell positions, including "Effective Separation Date".
- **Separation reason list** — all ten reasons plus Other, in the source's grouping.
- **Separation rehire statuses** — Yes / No / Pending HR Review.
- **Separation property-returned and access-removed lists** — identical.
- **Uncontrolled Event** — structure, both notification and attachment lists, estimated
  cost, witnesses.
- **Medical Event response actions** — all seven, in order.
- **Medical Event initial classifications** — all three, exact wording.
- **Disciplinary warning levels** — all four, exact wording.

---

## Recommended order of work

1. **B1 and B2** — print the two missing sentences. Small, and they're the ones with
   procedural weight on a signed document.
2. **C1** — restore the four dropped parentheticals.
3. **D1, D2, D3, D4** — title suffix, field order, heading wording. All cosmetic, all
   cheap, all make the app read like the form people already know.
4. **C2, C5** — Full Duty date; pre-filled investigation team.
5. **C3, C4, C6, D5, D6** — decide whether the app's version or the form's version is
   right. These are business/records judgements, not defects.
6. **A1** — Employee Information Change Form, if wanted. New document type, real scope.

Nothing in this audit is a rendering defect. The drawn PDF pipeline is doing what it was
told to do; this is about what it's being told.
