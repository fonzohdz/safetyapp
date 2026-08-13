# Overnight — morning report, 2026-08-13

**Read this first, then look at the screenshots.** Everything below is on
`testing`. `main` is untouched, the live site is untouched, nothing was
deployed. The field-test freeze holds.

---

## The short version

Four things got done, in the order the last checkpoint said to do them:

1. The paper-form fidelity fixes finally got committed (they were finished
   but sitting uncommitted when we ran out of room last session).
2. The drawn PDFs now get checked for geometry, not just words — and the new
   checks were proven to actually catch defects.
3. **Home was rebuilt.** All six documents are equal now, and every
   in-progress draft shows up on the front page. This is the one you'll
   notice.
4. The screenshot walker went from missing 3 out of 4 phone screens and
   *all* of JSA's Review to capturing all 120 screens with nothing skipped.
   Plus a real bug it exposed: the iPad-portrait nav was four unlabelled
   icons.

Every test suite is green. JSA and Incident page counts unchanged.

---

## 1. Home — the big one

**What was wrong.** JSA and Incident got big hero cards at the top. The
other four — Uncontrolled Event, Medical Event, Disciplinary Notice,
Employee Separation — were small rows under a heading called "More
Documents", below the workspace shortcuts. That was just the order we built
them in, not what matters in the field.

It was worse than "they're lower down", though. If you had a half-finished
**Medical Event**, it showed up as grey subtitle text on a 76px row. If you
had a half-finished **JSA**, it got its own card, its own progress bar and
its own Continue button. Two of your six documents were first-class and four
were not.

**What it does now.** Two questions, in the order you actually ask them:

- **Continue where you left off** — every draft you have going, whatever
  kind of document it is, each with its next step, when it saved, how far
  along it is, and a Continue button. Disappears entirely when you've got
  nothing in progress.
- **Start a document** — one tile per document, all the same size, all the
  same weight, each with its own icon. Which document you need is your call,
  so nothing is shouting louder than anything else.

Then the Workspace shortcuts and the planned-documents list, both unchanged.

**Things I decided, that you can overrule:**

- **JSA's Start still goes straight to a blank form**, like it always has,
  and its tile keeps the separate Templates button. Making it go through the
  picker first would have made the grid perfectly symmetrical and added a tap
  to the thing you do most. Not worth it.
- **Buttons say "Start Medical Event", "Continue Medical Event"** rather than
  just "Start". Slightly repetitive next to the tile heading, but it means
  the button says what it does when read on its own, and it kept Incident's
  existing wording intact.
- **With exactly four drafts going, the continue row is 3 + 1** and there's a
  gap. That's just what four cards in a three-wide grid looks like. Tell me if
  it bugs you.

Everything on Home is generated from the document registry, so document
number seven shows up automatically without touching Home's code.

**Screenshots:** `tools/testing/output/home-before/` and
`tools/testing/output/home/` — same eight shots each (phone / iPad portrait /
iPad landscape / desktop, empty and with work in progress). Regenerate any
time with `node tools/testing/capture-home.mjs`.

---

## 2. The iPad-portrait nav was four unlabelled icons

Between 680 and 900px wide — which is an iPad held upright, your most
important device — the sidebar dropped its labels and left four bare glyphs.
The phone version one size down already puts a small label under each icon.
Now they both do. The rail went 64px → 78px so "Documents" fits.

Found by looking at the walker's screenshots, which is the whole point of
having them.

---

## 3. The screenshot walker was lying by omission

It captured 24 screens at three sizes and exactly **one** — Home — on a
phone, and never said anything was wrong. It also had never once captured
**JSA's Review & Export screen**, because it navigated by hunting for "Next"
buttons and JSA doesn't have them.

Three fixes:

- It drives every document by its step tabs instead of hunting for buttons.
  Every document has them, so one loop reaches every step of all six —
  including JSA's Review.
- The phone walk died because both navigation bars are always in the page and
  only one is visible; it was clicking the hidden one. It now asks which one
  is actually on screen. (My first fix guessed from screen width and broke
  iPad portrait instead — the sidebar goes down to 680px, not 900.)
- **It can't skip quietly any more.** Anything it fails to reach gets named
  at the end and the run fails. That silent skipping is exactly how a phone
  walk that captured one screen went unnoticed.

Now: **30 screens × 4 sizes = 120, nothing missed, no page errors.**
`tools/testing/output/walk/`.

---

## 4. Contract checks on the drawn PDFs

Two real gaps closed:

- The "nothing runs off the page" check only looked at **text**. A table
  column computed too wide, or a signature slot drawn past the edge, prints
  with its right border sliced off by the printer and no letter is out of
  place to give it away. Boxes, rules and images are checked now too.
- **Nothing checked the signature lines at all.** A signing rule and its
  caption are a pair — the line you sign on, and what that line is for.
  Either half missing is a real defect on paper, and two lines for one
  caption is the doubled-line look. All three are checked now.

**I proved these actually work rather than assuming.** I broke the PDF kit on
purpose four different ways, regenerated real PDFs each time, and confirmed
each check failed for the right reason:

| Deliberate defect | Check that caught it |
|---|---|
| Deleted the signature rule | "every signature caption has a rule to sign on" |
| Drew the date rule twice | "exactly one rule per signature block" |
| Widened an info-table cell 8pt | "nothing drawn outside the printable area" |
| Deleted the signature caption | "every rule is labelled" |

Kit reverted afterwards; the four suites are green on the real code.

The other two items on that list were already covered — page count is
asserted per fixture and every standard fixture is capped at one page.

---

## 5. The fidelity batch got committed

The paper-form fixes from last session were done and verified but never
committed. They're in now (`40d5f53`) — Medical Event's missing "Full Duty
on" date and the printed NAME lines, the Uncontrolled Event parentheticals
with a migration so old drafts don't lose their ticks, the Disciplinary
headings and ordering, and Incident's "Nature of Injury (select all that
apply)".

---

## Test results — everything

All suites run against a production build, in the state the code is in now.

| Suite | Result |
|---|---|
| disciplinary | ALL CHECKS PASSED |
| separation | ALL CHECKS PASSED |
| medical-event | ALL CHECKS PASSED |
| uncontrolled-event | ALL CHECKS PASSED |
| completion-lifecycle | **77/77** across 5 document types |
| jsa-pdf | **MAIN 1 / CONTINUATION 0 / SIGN-IN 2 / TOTAL 3** — unchanged |
| incident-pdf | **6 / 6 / 11 / 6** — unchanged |
| incident-workflow | passed |
| incident-photos | passed |
| incident-superintendent-response | passed |
| conditional-fields | ALL CHECKS PASSED |
| draft-transfer | ALL CHECKS PASSED |
| missing-info-nav | ALL CHECKS PASSED |
| mobile-ux | ALL CHECKS PASSED |
| suite-integration | ALL CHECKS PASSED |
| voice-input | ALL CHECKS PASSED |
| jsa-speech-list | ALL CHECKS PASSED |
| jsa-speech-list-parsing | ALL CHECKS PASSED |
| signature-pad | passed (WebKit skipped — not installed here) |
| walk-app-screens | 120/120 screens, no page errors |

Zero leaked preview servers afterwards (checked, not assumed).

Six test files changed, all because Home changed under them. The one worth
knowing about: `verify-suite-integration` used to assert *"JSA hero card
unchanged on Home"* — the exact thing this work deliberately removed. It now
asserts the opposite and stronger property: exactly six start tiles, one per
document type, each with its own working Start button.

---

## What I looked at and deliberately did NOT change

**Desktop/tablet-landscape form width.** The checkpoint listed this as "forms
sit in an ~820px column on an 1180px screen". Looking at the actual
screenshots, that's no longer true — at iPad landscape the form fills all
888px available. At 1440 there's about 140px of slack because the form is
capped at 1000px on purpose, which is a sane reading width for a form. I
could widen it, but stretching text fields across 1100px to fill space would
make it worse, not better. **Your call if you want it wider.**

---

## Still open, and why

**Needs your approval (deletes files):** the four dead DOM export roots —
`DisciplinaryPdf.jsx`, `SeparationPdf.jsx`, `MedicalEventPdf.jsx`,
`UncontrolledEventPdf.jsx`, and possibly `DocPdfShell.jsx` / `docPdf.css`.
These render a hidden copy of each form that no longer produces anything.
They're pure confusion hazard now. One catch: `verify-completion-lifecycle`
still sweeps `.docPdfExportRoot` for a table-structure invariant, so after
deleting these it would only cover Incident. I'd want to move that check onto
the drawn PDFs first.

**Needs a judgment call from you** (three items from the fidelity audit I
left alone on purpose because the right answer depends on how you actually
use the forms):

- **C3** — Medical Event's attachments list doesn't match the paper form's.
- **C6** — Uncontrolled Event has a "Reported By — Title" field the paper
  form doesn't.
- **D5** — Medical Event groups its sections differently from the paper form.

**Not started, from the roadmap:** the visual/palette/typography pass,
adversarial QA, and the ALL-CAPS-labels / repeated-helper-text cleanup.

**Can't be done here:** no physical iPad or AirPrint check, and Safari/WebKit
isn't installed on this machine. A short real-iPad check before any of this
ships is still the only coverage for that class of bug.

---

## Where things stand

| | |
|---|---|
| `main` / live site | `dd803e5` — **untouched, still what you're field-testing** |
| `testing` | `0c06e14` — 10 commits ahead of `main`, **not deployed** |
| Working tree | clean |
| Build | passing |

Tonight's commits:

```
0c06e14 test: point the last Home-entry selectors at JSA's new tile button
cec7867 fix: label the tablet nav rail, and make the screen walk actually walk
805ebed feat: Home treats all six documents the same, and surfaces every draft
0ddf97a test: check the drawn PDFs' geometry, not just their text
40d5f53 fix: match the six documents to the original paper forms
```

Nothing is going anywhere near `main` until you've looked at the Home
screenshots and said so.
