# Software Requirements Specification — Management App
## Module 10: Master Reporting

*Written against Domain Model §2.4 (Course, `progressCursor`), §2.6 (Chore — no `expectedDurationMin`), §2.9 (Pacing Profile), §2.10 (Generated Packet), §2.12 (Imported Completion Record), §4.3 (Reconciliation), §5.2 (the "useless column from day one" precedent); Architecture Evaluation §9 (Master Reports — the five named report types); Management SRS Module 03 §2.4 (deleted-source display convention); Management SRS Module 05 FR-8 (single-Instance progress display, and the 15-minute duration fallback); Management SRS Module 08 (`progressCursor` — sole writer; packet generation algorithm); Management SRS Module 09 (Completion Import, Imported Completion Record — sole writer); Roadmap §3/§5 (Master Reporting is Phase 3, immediately after Packet Generation; Completion Import remains Phase 4).*

---

## 1. Purpose

Consolidates documentation-grade CSV exports across every child at once. Six report types, split cleanly across three kinds of data: what's been **planned/paced** (Curriculum Progress, Activity/Chore Roster — available from Management-side data alone), and what's **actually happened** (Activity/Chore History, Grades, Attendance, Instructional Hours — available only once Completion Import has run). This module owns report generation and CSV export only. It never authors or edits Course, Lesson, Activity, Chore, Instance, or Child data, and it never performs CSV-to-record matching itself — that is Module 09's job; this module only ever reads Module 09's output.

## 2. Scope notes

**2.0 — This module is milestone M9.** Its four actual-data report types depend on Imported Completion Records, which do not exist until Completion Import ships at **M10** — so those four correctly return zero-row, correctly-headed results for the whole of M9. That is an accurate answer given the data that exists, not a defect and not a reason to reorder the two milestones (§2.2 below).

**2.1 — Reporting is actual-data-only wherever the report claims to describe what happened.** A decision made deliberately for this module: Activity/Chore History, Grades, Attendance, and Instructional Hours report only what Imported Completion Records (§2.12) confirm actually occurred — never a projection from what was merely planned or paced. A report titled "Instructional Hours" that counted scheduled-but-undone work as hours would misrepresent the record for exactly the audience this module exists to serve (an umbrella school, a state filing) — planned and actual are never blended into the same figure. Curriculum Progress and Activity/Chore Roster are the two exceptions, and both are explicitly labeled as planning data, never presented as if they were completion data (§2.9).

**2.2 — A Phase 3 module with a Phase 4 dependency it doesn't control, and is honest about.** The Roadmap places Master Reporting's build in Phase 3 (M6), immediately after Packet Generation, while Completion Import is Phase 4 (Consolidation). The four actual-data report types (§2.1) are built entirely from Imported Completion Records, which don't exist until Module 09 has actually run at least one import. Rather than treat this as a defect to route around, this module ships in Phase 3 as specified and simply returns a genuinely empty (zero-row) result for those four report types until the first successful import — the same "correct answer given the data that exists" honesty already established for a deleted template's `sourceTemplateId` (Module 03 §2.4) and an unmatched CSV row (Module 09 §2.3). Nothing here is blocked or broken; it's accurately empty. Curriculum Progress and Roster (§2.9) are what make the module genuinely useful from the moment it ships, ahead of Module 09.

**2.3 — Curriculum Progress is the one report type that doesn't depend on Module 09 at all, which is why it's ordered directly after Packet Generation.** It reads `progressCursor` (Domain Model §2.4, written exclusively by Module 08) against each Instance's total Activity count in pacing-walk order — the same "Lessons in `order`, Activities in authored array position" walk already defined for pacing and already surfaced as a single-Instance display in Pacing Configuration (Module 05 FR-8, "12 of 40 Activities paced"). This module's contribution is exporting that same figure, consolidated across every child and every Instance at once, to CSV. It is fully functional from the moment Packet Generation has run once — no Completion Import required.

**2.4 — "Curriculum progress" means paced-so-far, not completed-so-far, and this module doesn't quietly redefine it.** `progressCursor` tracks how far Packet Generation has walked into a Course Instance's content — what's been sent to the child, not what the child has actually done. That's a genuine, always-available metric (a parent can see at a glance whether a course is on pace to finish the semester), but per §2.1 it is never presented as a completion rate.

**2.5 — Attendance and Instructional Hours are scoped to School Activities only, excluding Chores — for two independent, converging reasons.** First, "instructional" is inherently a School-content concept; a chore isn't instruction. Second, and more mechanically, Chore (Domain Model §2.6) carries no `expectedDurationMin` field at all — there is no duration figure to sum for a Chore-sourced record even setting the framing argument aside. Grades and Activity/Chore History are not scoped this way: Grades excludes Chores on its own, without a special rule, since no Activity Type capture pattern ever applies to a Chore, so a Chore-sourced Imported Completion Record simply never carries a `grade`; and Activity/Chore History is explicitly both, by name and by purpose — a full record of everything that actually happened, not just school.

**2.6 — Instructional Hours is an estimate built on planned per-item duration, applied only to items actually completed, and is labeled as such.** Domain Model §5.2/§6 lock the exclusion of `actualStart`, `actualFinish`, and `durationMin` from both the Activity Record and the Completion CSV — no actual-time-spent data is captured anywhere in either app, by design. This report sums each *actually-completed* Activity's `expectedDurationMin` where present, falling back to the same 15-minute default already used for pacing-budget math (Pacing Configuration Module 05 FR-6) when it's absent — reusing an existing, already-accepted estimate rather than inventing a new one. This differs from computing hours off the Pacing Profile's daily budget (`minutesPerDay`/`activitiesPerDay`) directly: a budget-based figure would report hours for work that may never have happened, which §2.1 rules out for this module. The exported report is titled and column-labeled as an estimate, so it is never presented with false precision about either its duration source or its completion basis.

**2.7 — History, Grades, and Hours resolve display fields by looking up the *current* live record, not a frozen copy — and handle deletion the same way Module 03 already does.** An Imported Completion Record (§2.12) itself stores only `activityId`, `date`, `status`, `resolvedChildId`, and optionally `grade`/`plannedBlock`/`resolvedInstanceId` — no course name, activity title, or duration. To render a human-readable row, this module looks up the source Activity (via `resolvedInstanceId` + `activityId`) or Chore (via the `activityId`'s `CHR-{choreToken}` stem, when `resolvedInstanceId` is absent) against current Management data. If that source has since been deleted — a Course Instance removed, a Chore deleted — the row still exports, with descriptive columns showing a fixed "no longer available" label instead of blanking the row or failing the export, matching the convention already established for a deleted template's `sourceTemplateId` (Module 03 §2.4). The immutable, always-present columns (`activityId`, `date`, `status`, child, `grade` if present) are unaffected either way.

**2.8 — Activity vs. Chore is decided by `resolvedInstanceId`'s presence, not by re-deriving it from the ID's shape.** Domain Model §2.12 already draws this line: `resolvedInstanceId` is populated for Activity rows and absent for Chore rows. This module reuses that flag rather than re-parsing `activityId`'s structure to guess the source type a second time.

**2.9 — Activity/Chore Roster is a sixth report type, added deliberately alongside the actual-data set, and never merged into it.** Roster answers "what has been assigned so far" — the planning-side counterpart to History's "what actually happened." It is scoped, labeled, and validated (§4/§5) as planning data throughout, exactly like Curriculum Progress, so a parent can never mistake a Roster row for a completion record. Roster reads the **Generation Log** (Domain Model §2.10a) — a per-item record of which Activity/Chore occurrences were sent to a child on which dates, written by Packet Generation (Module 08 FR-12) at the same time it advances `progressCursor` and writes the exported Packet file. Reconstructing a dated Roster from `progressCursor` alone wouldn't be possible, since `progressCursor` records only a walk *position*, never the per-item dates a given generation run assigned — the Generation Log is what supplies that.

## 3. User stories

- As a parent, I want one CSV I can hand to an umbrella school or state reporting requirement showing instructional hours, grades, and attendance — based on what my kid actually did, not what was merely scheduled.
- As a parent, I want to see how far each child's courses have been paced, and what's already been assigned to them, across every kid at once, without opening each Instance individually.
- As a parent, I want a full activity/chore history I can filter by child and date range, for my own records.
- As a parent, I want these reports to just be empty — not broken — before I've ever imported a completion CSV, so I'm not confused by something that looks like an error but isn't one.

## 4. Functional requirements

**FR-1 — Report type selection.** The parent selects one report type per generation run, from six types: Curriculum Progress, Activity/Chore Roster, Activity/Chore History, Grades, Attendance, Instructional Hours. Each produces its own CSV file — no combined multi-report file, and no report ever mixes planning-side rows (Progress, Roster) with actual-data rows (History, Grades, Attendance, Hours) in the same file.

**FR-2 — Child scope.** Every report supports "all children" or one specific child. "All children" is the default, consistent with this module's purpose of consolidating across the whole family in one place.

**FR-3 — Date range scope, where applicable.** Activity/Chore Roster, Activity/Chore History, Grades, Attendance, and Instructional Hours each require a `[startDate, endDate]` filter (inclusive both ends, matching Family Event's existing range convention, Domain Model §2.7). Curriculum Progress takes no date range — it's a point-in-time structural snapshot, not a dated record set (§2.3).

**FR-4 — Curriculum Progress Report.** For every in-scope Child Course Instance, one row: child name, course name, `courseCode`, paced count (Activities up to and including `progressCursor` in pacing-walk order), total count (all Activities in the Instance), and percentage. An Instance with no `progressCursor` yet (never packeted, Domain Model §2.4) reports a paced count of 0 — not an error, not an omitted row. Clearly labeled as a *paced*, not completed, figure (§2.4).

**FR-5 — Activity/Chore Roster Report.** One row per Activity or Chore occurrence sent to a child in a past generation run within scope, sourced from the Generation Log (§2.9): child name, source type (Activity | Chore), course/title/activity type or chore type, difficulty tier, assigned date. Clearly labeled as planning data — no status or grade column exists on this report at all, so it can never be mistaken for a completion record.

**FR-6 — Activity/Chore History Report.** One row per in-scope Imported Completion Record: child name, date, source type (Activity | Chore, from §2.8's flag), course/title/activity type (current lookup, §2.7, with the fixed fallback label if the source has been deleted), status (`complete` | `waived`), grade (if present), planned block (if present). Zero rows before any Completion Import has run (§2.2).

**FR-7 — Grades Report.** A filtered view of FR-6's same source data, restricted to rows carrying a `grade` value — which, by construction (§2.5), can only ever be Activity rows of `grade-optional` Activity Types that actually captured one. Columns: child name, date, course, activity title, grade. Zero rows before any Completion Import has run.

**FR-8 — Attendance Report.** One row per distinct (child, date) pair with at least one `status: complete` Imported Completion Record carrying a `resolvedInstanceId` (School Activities only, §2.5) in the date range. Columns: child name, date, count of completed School Activities that date. `waived` records never count toward attendance — waived means the work was excused, not done (§2.5). Zero rows before any Completion Import has run.

**FR-9 — Instructional Hours Report.** Per child (and, within a child, per date), the sum of `expectedDurationMin` across that scope's `status: complete`, School-Activity-sourced (`resolvedInstanceId` present) Imported Completion Records, using the 15-minute fallback (§2.6) wherever the source Activity has no `expectedDurationMin`. Reported in both raw minutes and a derived hours figure, with a column/report label identifying it as an estimate over actual completions, never a planned-budget figure (§2.1/§2.6). Zero rows before any Completion Import has run.

**FR-10 — Read-only, always.** No report generation writes, edits, or deletes any Course, Lesson, Activity, Chore, Course Instance, Curriculum, Difficulty Tier/Category, Child, Imported Completion Record, or Generation Log entry. This module's only output is the CSV file itself.

**FR-11 — CSV format.** Every report exports as UTF-8, RFC 4180 CSV — matching the Completion CSV's own format convention (Domain Model §4.2) — Excel/Sheets-friendly, consistent with "no PDF, ever" (Architecture Evaluation §9 / principle 14).

## 5. Validation rules

| Rule | Detail |
|---|---|
| Report type | Required; exactly one of the six named types (FR-1). |
| Child filter | Optional; if provided, must resolve to an existing Child; default is all children (FR-2). |
| Date range | Required for Roster, History, Grades, Attendance, Hours; `startDate ≤ endDate`. Not applicable to Curriculum Progress, which accepts none (FR-3). |
| Curriculum Progress source | Reads `progressCursor` and each Instance's Activity set only; never reads Imported Completion Records or the Generation Log (§2.3). |
| Roster source | Reads the Generation Log only (§2.9/FR-5); never reads Imported Completion Records — a Roster row's existence never implies completion. |
| History/Grades/Attendance/Hours source | Read Imported Completion Records only; genuinely empty (zero rows), not an error, whenever none exist yet (§2.2). |
| Attendance/Hours scope | Only `status: complete` rows with `resolvedInstanceId` present count; Chore rows and `waived` rows are excluded from both (§2.5/FR-8/FR-9). |
| Deleted-source display | A row whose looked-up Activity or Chore no longer exists still exports, with the fixed "no longer available" label in descriptive columns, never a blank row or a failed export (§2.7). |
| Duration fallback | `expectedDurationMin`, or the 15-minute default when absent, applied only to actually-completed Activities — never written back onto the Activity record, and never applied to un-completed, merely-paced items (§2.1/§2.6). |
| Report blending | No file ever contains rows from both a planning-side report (Progress, Roster) and an actual-data report (History, Grades, Attendance, Hours) (FR-1). |
| Write access | Never — this module writes only the exported CSV file (FR-10). |

## 6. Permissions

No *additional* per-action PIN. The Management App's `launchPin` (Domain Model §2.11) gates the whole app once per session; this module adds no further gate.

## 7. Inputs / Outputs

**Inputs:** parent-selected report type, child scope, and date range (where applicable) (FR-1–FR-3); reads Child, Course Instance, Activity, and Chore records (Curriculum Progress, Roster, and for current-lookup display fields on the four actual-data reports); the Generation Log (Roster only, §2.9); and Imported Completion Records (History, Grades, Attendance, Hours) — writes to none of them.

**Outputs:**
- One CSV file per generation run, shaped per the selected report type (§4).
- No change of any kind to any Course, Lesson, Activity, Chore, Course Instance, Curriculum, Difficulty Tier/Category, Child, Generation Log entry, or Imported Completion Record — this module is read-only across the entire Management data set.

## 8. Acceptance criteria

1. Generating a Curriculum Progress report immediately after Packet Generation's first run, with zero Completion Imports ever performed, produces non-empty, correct rows.
2. Generating any of Activity/Chore History, Grades, Attendance, or Instructional Hours before any Completion Import has run produces a zero-row CSV with correct headers — not an error message, not a missing file.
3. A Course Instance with no `progressCursor` yet appears in the Curriculum Progress report with a paced count of 0 and the correct total count, not omitted.
4. Generating Activity/Chore History for "all children" after two children's completion CSVs have both been imported returns rows for both children, correctly attributed.
5. A Chore-sourced Imported Completion Record never appears in the Grades report, regardless of what value currently occupies any placeholder field.
6. A Chore-sourced Imported Completion Record never appears in the Attendance or Instructional Hours report, even when its status is `complete`.
7. A `waived` Imported Completion Record appears in the Activity/Chore History report but is excluded from the Attendance and Instructional Hours reports.
8. An Activity whose `expectedDurationMin` was never set contributes exactly 15 minutes to the Instructional Hours report *only if it was actually completed*; an identical but un-completed Activity contributes nothing to that report, regardless of its Pacing Profile's budget.
9. An Activity that has been paced and packeted, but has no matching Imported Completion Record, appears in the Activity/Chore Roster report and does not appear in Instructional Hours, Attendance, Grades, or History.
10. No single exported CSV, under any report type selection, ever contains both a Roster/Progress-sourced row and a History/Grades/Attendance/Hours-sourced row.
11. Deleting a Course Instance after its completions were already imported, then generating a History report covering those dates, still produces a row for each of those completions, with the course/title columns showing the fixed "no longer available" label instead of a blank or a failed row.
12. Re-generating any report immediately after a fresh Completion Import correctly reflects the newly-imported rows, with no manual refresh step beyond re-running the report.
13. No report generation, under any report type or filter combination, results in any change to any Course, Lesson, Activity, Chore, Course Instance, Curriculum, Difficulty Tier/Category, Child, Generation Log entry, or Imported Completion Record.
14. Requesting a report with `startDate > endDate` is rejected before any data is read, for every report type that takes a date range.
15. Requesting Curriculum Progress with a date range parameter supplied is either ignored or rejected with a clear message — it never silently filters Instances by a date range that doesn't apply to structural data.
16. Every exported CSV opens correctly in a standard spreadsheet application (UTF-8, RFC 4180), matching the Completion CSV's own format guarantee.

---

## Management App SRS — complete

With Master Reporting and Settings & Backup both written, all eleven Management modules are done: Curriculum Library, Difficulty Tier & Reward Category, Course Template Library, Child Management, Pacing Configuration, Chore Authoring, Family Event Authoring, Packet Generation & Export, Completion Import, Master Reporting, Settings & Backup. Combined with the Child App's eleven modules, the SRS layer for both apps is complete. Per the Roadmap, the next document in sequence is the Technical Design Specification.
