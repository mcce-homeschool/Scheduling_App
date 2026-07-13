# Software Requirements Specification — Management App
## Module 3: Course Template Library
*Written against Domain Model §2.4 (Course), §2.5/§2.5a (Activity, Activity Type — ID scheme, canonical enum), §2.8 (Lesson), Management SRS Module 02 (Difficulty Tier reference table), Architecture Evaluation, Documentation Roadmap.*

---

## 1. Purpose

Lets the parent author and maintain the Course Template library: Courses (under a Curriculum), their Lessons, and their Activities. This module owns Course/Lesson/Activity content and structure only — it does not own stamping a Course to a child (Child Management, a separate module), pacing (Pacing Configuration), or packet generation. Two entry paths populate Activity data: manual single-Activity CRUD (aided by Lesson-level content planning defaults) and bulk CSV import.

## 2. Scope notes

**2.0 — This module is split across two milestones by functional requirement.** It is the largest module in either app (19 FRs, four entities), and not all of it is on the critical path to a working packet:

- **Milestone M5 — the manual authoring path.** Activity Types (FR-A1–FR-A5), Courses (FR-1, FR-2), Lessons (FR-3), Activities (FR-4), and the resolution/validation rules (FR-6, FR-7, FR-8). This is everything needed to hand-author a course that can be stamped, paced, and generated into a packet.
- **Milestone M8 — volume and convenience.** Bulk CSV import of Lessons + Activities (FR-5) and the Lesson content-planning presets (FR-P1–FR-P6). These are how a parent enters curriculum **at volume**; they are not how the pipeline is **proved**. Two hand-authored lessons prove the packet, so they are deliberately deferred until after the M7 seam checkpoint (Roadmap §5).

Nothing about the data model differs between the two halves — FR-5 and the FR-P set write the same Lessons and Activities the manual path writes, so building them later requires no migration and no rework of the manual path.

**2.0a — Whether Activity Type should be its own module is an open question with a deadline of "before M5 starts"** (Roadmap §8, Architecture Evaluation §7). If it splits, FR-A1–FR-A5 leave this document. Settle it before building, not during.

**2.1 — Course is manual-only; Lesson and Activity support bulk import.** Given the real volume split (roughly 6 Courses vs. hundreds of Lessons/Activities per semester), Course is never part of the CSV. The parent creates each Course in-app first and gets its `courseCode` back; the CSV then references that `courseCode` to attach Lessons and Activities to an already-existing Course.

**2.2 — Bulk import shape: flat rows, `courseCode` + `lessonCode` repeated, all-or-nothing validation.** One CSV row per Activity. Every row carries the `courseCode` of an existing Course (hard reject if unmatched) and a `lessonCode` (new Lessons are created on the fly, grouped by this code). Within a `lessonCode` group, every Lesson-level field (`title`, `order`) must match exactly across all rows in that group; any mismatch rejects the entire file. This mirrors the all-or-nothing pattern already locked for Packet Import (Child App Module 2), applied one level down since Course itself is out of the CSV.

**2.3 — Activity Type enum: 10 fixed types.** Video, PDF, Practice Level, Quiz, Test, Report, Reading Pages, Workbook, Project, Drill. This is the authoritative list; the Child App's capture-field matrix (Module 4 §2) matches it exactly.

**2.4 — Course template deletion is not reference-guarded, unlike Curriculum and Difficulty Tier.** A stamped Child Course Instance is a full independent copy (Domain Model §2.4 — "an Instance never links back to the template for content"); its `sourceTemplateId` is provenance-only, not a live dependency. Deleting a template therefore cannot break an existing instance. `sourceTemplateId` may end up pointing at a deleted template — that's an inert historical reference, not a data-integrity problem, and the Management App should display it as "template no longer available" rather than treat it as an error.

**2.5 — Activity Type is parent-extensible via two independent axes, not a hardcoded enum.** The 10 types in §2.3 seed a small managed table (same shape as Module 2's Difficulty Tier). Each type has:
- a `capturePattern` (`grade-optional` | `no-capture`) — governs Child App completion behavior (Module 4).
- a `structurePattern` (`page-range` | `count`) — governs Lesson-level planning behavior (§6).

Both patterns are chosen from a fixed set of two options each when a type is created, and both are **fixed once the type exists** — same integrity reasoning as Difficulty Tier's mapping: changing either later would make existing Activity Records and Lesson presets ambiguous about what they actually represent.

**2.6 — Lesson Content Planning.** A Lesson optionally carries a **content plan** — a shared page-range budget (for `page-range`-structured types, currently PDF and Reading Pages) and/or per-type count targets (for `count`-structured types, currently everything else, including Practice Level). These are **soft planning aids**, not generators or hard limits:
- The **page-range budget** is one shared range per Lesson (e.g. 45–60), drawn from by *both* PDF and Reading Pages Activities together. When the parent manually creates a new Activity of either type under that Lesson, its starting page defaults to the lowest page in the budget not yet covered by an existing PDF or Reading Pages Activity in that Lesson — filling gaps first, then continuing past the budget's end if it's fully covered. The end page is **never defaulted** — pages are personalized per activity/day, so the parent always sets it explicitly.
- A **count target** (e.g. Practice Level: 12, Video: 1) is purely informational — it drives a progress display ("3 of 12 Practice Level Activities added") with no value-defaulting and no enforcement. The parent can add fewer than the target (skip freely) or more, without any block or warning.
- Presets are entered/edited through manual Lesson authoring only (§7/FR-3) — not through the bulk CSV, since the defaulting behavior is inherently an interactive "see a suggestion, override if needed" flow that a static spreadsheet row can't participate in. A bulk-imported Lesson can still receive presets afterward via manual edit.

**2.7 — Platform-hosted payloads are selector references, never links.** Content like Video and Quiz is accessed through the learning platform's own app, which the child already knows how to navigate — the payload only needs to identify *which* item to select there (a title or listing reference), never a link or hosted address. This applies to any Activity Type whose content lives on a platform the child accesses independently of this system, not just Video.

## 3. User stories

- As a parent, I want to create a Course once, by hand, and get back a short code I can reference, so my bulk-imported Lessons and Activities have somewhere to attach.
- As a parent, I want to import a semester's worth of Lessons and Activities from one spreadsheet, so I'm not hand-entering hundreds of rows.
- As a parent, I want to set a page range and expected activity counts when I create a Lesson, so adding each individual Activity afterward doesn't require me to remember what pages or counts are already covered.
- As a parent, I want the page range to just be a starting suggestion, not a rule, so I can freely adjust it day to day without fighting the app.
- As a parent, I want to fix or add a single Activity by hand without re-running a whole CSV, so small corrections don't require a full re-import.
- As a parent, I want a bad import file rejected outright, not partially applied, so I never end up with a half-imported semester I have to debug.

## 4. Entity fields (as authored here)

**Course** — Required: `id`, `name`, `curriculumId` (references Curriculum Library), `courseCode` (short, human-readable, parent-entered or auto-slugified from `name`; need not be globally unique — the Activity ID scheme carries uniqueness), `mainCategory` (fixed to `school` for anything authored here), `lessons[]`, `state` (`template` — instances are created by Child Management, out of scope here). Optional: `coreElective` (`core` | `elective`), `subject`, `description`, `defaultPacingHint`.

**Lesson** — Required: `id`, `courseId` (parent link), `lessonCode` (short, parent-entered or auto-derived from `order`), `order`, `title`, `activities[]`. Optional: `objective`, `estimatedDays`, `pageRangeStart`/`pageRangeEnd` (the shared content-planning budget, §6), `activityCountTargets[]` (list of `{activityTypeKey, targetCount}`, §6).

**Activity** — Required: `id`, `lessonId` (parent link), `activityType` (references the Activity Type table, §5 — not a hardcoded enum), `title`, `required` (bool), `payload` (type-specific — §8), `difficultyTier` (references Module 2's Tier table). For `count`-structured types only (§5), also required: `sequenceNumber` (integer, defaulted and overridable — §6/FR-P6). Optional: `expectedDurationMin`, `instructions`, `blockHint`, `lessonTitle` (copied from the owning Lesson's `title` at Activity creation — manual authoring or bulk import — and stored on the record; same copied-at-creation, stored-on-record pattern already used for `capturesGrade`, FR-A5. **This is the field that makes Packet Generation FR-8's copy-through work — without it here, the child-side display chain (Child App Module 3 FR-8) is inert.**). `capturesGrade` is not authored here — it's copied from the chosen Activity Type's `capturePattern` at the moment the Activity is created, and stored on the Activity record so it survives regardless of later type changes (which can't happen anyway, per §5/FR-A3).

## 5. Activity Type Management

**Fields:** `activityTypeKey` (id), `label`, `capturePattern` (`grade-optional` | `no-capture`), `structurePattern` (`page-range` | `count`).

**Seed data:**

| Type | capturePattern | structurePattern |
|---|---|---|
| Quiz | grade-optional | count |
| Test | grade-optional | count |
| Project | grade-optional | count |
| Report | grade-optional | count |
| PDF | grade-optional | page-range |
| Drill | grade-optional | count |
| Workbook | grade-optional | count |
| Video | no-capture | count |
| Practice Level | no-capture | count |
| Reading Pages | no-capture | page-range |

**FR-A1 — Create Activity Type.** The parent creates a new type by choosing an existing `capturePattern` and an existing `structurePattern` (one of two options each) and supplying a `label`. No new pattern value can be invented from this module.

**FR-A2 — Edit label.** A type's `label` can be renamed freely; renaming has no effect on any existing Activity, Activity Record, or Lesson preset referencing it.

**FR-A3 — `capturePattern` and `structurePattern` are both immutable once created.** No UI path changes either value on an existing type — same integrity reasoning as Difficulty Tier's mapping (Module 2 FR-5).

**FR-A4 — Delete, reference-guarded.** A type can be deleted only if zero Activities (template or instance) reference it. Rejected otherwise, with a count of blocking Activities. (Lesson `activityCountTargets` referencing a since-deleted type are left as inert historical entries, same treatment as a deleted Course template's `sourceTemplateId` — §2.4.)

**FR-A5 — `capturesGrade` is set at Activity creation, not looked up live.** When an Activity is created (manually, FR-4, or via bulk import, FR-5) with a given `activityType`, its `capturesGrade` boolean is copied from that type's current `capturePattern` at that moment and stored on the Activity record. A practical consequence of FR-A3, kept explicit so each Activity Record stays self-contained regardless.

## 6. Lesson Content Planning

See §2.6 for the full rationale. This section specifies the mechanism.

**FR-P1 — Set the Lesson page-range budget.** When creating or editing a Lesson, the parent may optionally set `pageRangeStart`/`pageRangeEnd`. This single range is shared by both PDF and Reading Pages Activities under that Lesson — there is no separate range per type.

**FR-P2 — Set per-type count targets.** When creating or editing a Lesson, the parent may optionally set a `targetCount` for any `count`-structured Activity Type (e.g. Practice Level: 12, Video: 1, Quiz: 1). Multiple targets, one per type, may be set on the same Lesson.

**FR-P3 — Page-range default on manual Activity creation.** When the parent manually creates (FR-4) a new PDF or Reading Pages Activity under a Lesson that has a page-range budget set, the Activity's starting page pre-fills to the lowest page within `[pageRangeStart, pageRangeEnd]` not yet covered by any existing PDF or Reading Pages Activity under that same Lesson — filling gaps before extending past `pageRangeEnd` once the whole budget is covered. The ending page is **never** pre-filled; the parent always sets it. The pre-filled start is a suggestion only — freely editable, never validated against the budget (an Activity may start before, end after, or fall entirely outside the budget with no warning or block).

**FR-P4 — Count target is display-only.** When a Lesson has a `targetCount` set for a given type, the Lesson's authoring view shows current-vs-target progress (e.g. "3 of 12"). This has no effect on validation anywhere — an Activity of that type can be added whether the count is under, at, or over target, and Activities can be skipped entirely with no warning.

**FR-P5 — Presets have no effect on bulk import defaulting.** CSV-imported Activities (FR-5) receive no auto-defaulted values — every field, including `sequenceNumber` where applicable, is explicit in the row if provided, per the existing bulk-import contract. A Lesson created via bulk import simply has no content plan unless the parent adds one afterward via manual edit.

**FR-P6 — `sequenceNumber` default for count-structured types.** When the parent manually creates (FR-4) an Activity whose type has `structurePattern: count`, its `sequenceNumber` pre-fills to one more than the highest `sequenceNumber` already used by Activities of that same `activityType` under that same Lesson (or 1 if none exist yet). Always overridable, never validated against the Lesson's `targetCount` or against uniqueness — two Activities of the same type in the same Lesson could in principle end up with the same `sequenceNumber` if the parent overrides one into collision; this module does not block that. `sequenceNumber` is intended for **child-facing display as a number, separate from the Activity's `title` text** — the parent should not need to hand-type "Video 3" into the title for this to show correctly. (The actual child-facing rendering of this number is a Child App / Daily Planner concern, not specified in this module.) For **Practice Level** specifically, `sequenceNumber` *is* the level indicator — there is no separate "level" payload field; the number the child sees is the number that drives the level.

## 7. Functional requirements

**FR-1 — Create Course (manual only).** The parent creates a Course with `name`, `curriculumId` (selected from Curriculum Library), and `courseCode`. `mainCategory` is fixed to `school` and not parent-facing as a choice. Optional fields per §4.

**FR-2 — Edit / Delete Course.** Any Course field can be edited freely (Domain Model §2.4 — templates are edited freely in the library). Delete is unguarded per §2.4 of this module — proceeds regardless of stamped instances, since instances are independent copies.

**FR-3 — Create / Edit / Delete Lesson (manual).** The parent creates a Lesson under an existing Course with `title`, `order`, `lessonCode`, and optionally its content plan (page-range budget and/or count targets, §6). Deleting a Lesson cascades to delete its own Activities (composition) but has no effect on any already-stamped Child Course Instance (§2.4's independence principle applies at every level of this hierarchy).

**FR-4 — Create / Edit / Delete Activity (manual, single).** The parent creates an Activity under an existing Lesson with `activityType` (selected from the Activity Type table, §5), `title`, `required`, `payload` (type-specific — §8, page-start pre-filled per FR-P3 where applicable), `sequenceNumber` where the type is `count`-structured (pre-filled per FR-P6), and `difficultyTier` (must resolve to an existing Tier from Module 2). On creation, the Activity's `lessonTitle` is copied from its owning Lesson's current `title` and stored on the record (§4) — a one-time copy, not a live reference; a later rename of the Lesson does not update it. Delete removes the Activity only; no cascading effect beyond its own record.

**FR-5 — Bulk import Lessons + Activities via CSV.** The parent selects a CSV file. Each row represents one Activity and carries: `courseCode`, `lessonCode`, `lessonTitle`, `lessonOrder`, `activityType`, `title`, `required`, `payload` fields per type, `difficultyTier`, and optional fields. Processing:
- Every row's `courseCode` must match an existing Course; any unmatched code rejects the entire file (§2.1).
- Rows are grouped by `lessonCode`. New Lessons are created for `lessonCode`s not already present under the matched Course; existing Lessons are appended to (new Activities added) if the code already exists.
- Within a `lessonCode` group, `lessonTitle` and `lessonOrder` must be identical across every row — any mismatch rejects the entire file (§2.2).
- Each Activity created from a row has its `lessonTitle` field (§4) set from that same row's `lessonTitle` column — the column already exists for Lesson-consistency validation (§9, "Bulk: Lesson consistency"); no new CSV column is introduced. Since the column is already enforced identical within a `lessonCode` group, every Activity in that group receives the same `lessonTitle` value.
- Every row is validated per §9 before anything is written — including the `courseCode`/`lessonCode` character and reserved-value rules; a violating `lessonCode` rejects the entire file under the same all-or-nothing rule.
- **All-or-nothing:** any single invalid row anywhere in the file rejects the entire import; nothing is written, existing data is untouched.

**FR-6 — Activity Type drives payload shape.** The fields required in `payload` depend on `activityType` (e.g., a Reading Pages or PDF Activity needs a page range; a Video Activity needs a selector reference — which video to choose within the platform the child already uses, not a link; a Quiz Activity needs the equivalent selector reference for the platform's quiz listing). This applies identically whether the Activity is authored manually (FR-4) or via bulk import (FR-5) — one validation rule set, two entry paths. A parent-added custom Activity Type's payload is always a single free-text field (§8), regardless of its `structurePattern`.

**FR-7 — `difficultyTier` must resolve.** Activities from either entry path require a `difficultyTier` value that matches an existing Tier (Module 2). No "create tier on the fly" path exists — tiers are managed exclusively in Module 2.

**FR-8 — `activityType` must resolve.** Activities from either entry path require an `activityType` value that matches an existing type in the Activity Type table (§5). No on-the-fly type creation exists — types are managed exclusively via FR-A1.

## 8. Payload shape reference

Each Activity Type's payload is validated against that type's own required shape (e.g., Reading Pages/PDF → page range; Video/Quiz/Test → a selector reference identifying which item to pick within the platform the child already accesses it through — **not** a URL or hosted link; nothing in this system needs to route the child anywhere) — but only the **10 seeded canonical types** carry a hand-specified, structured payload shape. **A parent-added custom type's payload is a single generic free-text field** ("reference / instructions"), regardless of which `structurePattern` the parent gave it. A parent has no way to define new field structure beyond picking `capturePattern`/`structurePattern` in the authoring form, so custom types get the simpler, universally-applicable free-text form instead of a per-type structured shape.

**`page-range`-structured types (§5):** PDF and Reading Pages share this structure, and — per §6 — share one Lesson-level page budget between them, drawn from their structured `pageRangeStart`/`pageRangeEnd` payload fields. A parent-added custom type given `structurePattern: page-range` participates in Lesson-level budget bookkeeping the same way, but since its payload is free-text rather than structured start/end fields, it doesn't receive FR-P3's automatic starting-page pre-fill — the parent enters its range information directly in the free-text field instead.

**`count`-structured types:** everything else — Video, Practice Level, Quiz, Test, Report, Workbook, Project, Drill, and any parent-added type given this structure. Each carries a `sequenceNumber` (§6/FR-P6), defaulted and overridable, intended for child-facing ordinal display. For **Practice Level**, `sequenceNumber` *is* the type-specific payload — there's no separate level field. For the other canonical `count`-structured types, `sequenceNumber` sits alongside their normal structured payload (a selector reference for platform-hosted types like Video and Quiz). For a parent-added `count`-structured custom type, `sequenceNumber` sits alongside the free-text payload instead — the sequence number is always a display ordinal, never a substitute for whatever reference the payload carries.

**Interchange note:** this section describes the payload shape as *authored*. At Packet Generation (Mgmt SRS Module 08), each shape is stamped with a `kind` discriminator for transport — `pageRange` for the page-range shape above, `reference` for the platform-selector shape, `none` for Practice Level, `freeText` for every custom type regardless of its `structurePattern`. The Child App reads `kind` and never derives it from `structurePattern` itself (Interchange Contract §1a) — `structurePattern` alone can't predict shape, since a custom `page-range` type is still free text here.

## 9. Validation rules

| Rule | Detail |
|---|---|
| Course required fields | `name`, `curriculumId` (must reference an existing Curriculum), `courseCode` non-empty, **alphanumeric characters only** (the ID scheme's segments must never contain the delimiter), **never the reserved values `CHR` or `EVT`** (case-insensitive) — the Chore and Family Event ID namespaces (TDS §3). |
| Lesson required fields | `title`, `order` (numeric), `lessonCode` non-empty, **alphanumeric characters only**. |
| Code auto-slugify | Auto-slugified `courseCode`/`lessonCode` (FR-1/§4) strips non-alphanumeric characters rather than passing them through. |
| Lesson optional preset fields | `pageRangeStart` ≤ `pageRangeEnd` if both provided; `targetCount` (per type) must be a non-negative integer if provided. Neither is required. |
| Activity required fields | `activityType` (must resolve to an existing type, §5/FR-8), `title`, `required` (bool), `payload` complete for its type (see §8), `difficultyTier` (must reference an existing Tier). |
| Bulk: Course match | Every row's `courseCode` must match an existing Course; any miss ⇒ whole-file reject. |
| Bulk: Lesson consistency | All rows sharing a `lessonCode` (within one Course) must have identical `lessonTitle` and `lessonOrder`; any mismatch ⇒ whole-file reject. |
| Bulk: whole-file | Any single invalid row, anywhere, for any reason above ⇒ entire import rejected, nothing written. |
| Tier reference | `difficultyTier` must resolve to an existing row in Module 2's table; no free-text or on-the-fly creation from this module. |
| Activity Type reference | `activityType` must resolve to an existing row in the Activity Type table (§5); no free-text or on-the-fly creation from either entry path. |
| Activity Type delete guard | Rejected if referenced by any Activity. |
| Activity Type pattern immutability | Neither `capturePattern` nor `structurePattern` can be changed on an existing type through any UI path. |
| Page-range default | Never validated/enforced against the Lesson's budget — a suggestion only (§6/FR-P3). |
| Count target | Never validated/enforced — display-only (§6/FR-P4). |
| `sequenceNumber` | Required for `count`-structured type Activities; integer; defaulted per FR-P6; never validated for uniqueness within a Lesson+type — overrides may collide, by design. |

## 10. Permissions

No *additional* per-action PIN. The Management App requires its own `launchPin` once per session (Domain Model §2.11) — the parent authenticates once at app launch, not per module. This module doesn't add a further gate on top of that.

## 11. Inputs / Outputs

**Inputs:** parent-entered form data (Course/Lesson/Activity manual CRUD; Activity Type CRUD; Lesson content-plan fields); one CSV file for bulk Lesson+Activity import; reads Curriculum Library (for `curriculumId` selection) and Module 2's Tier table (for `difficultyTier` validation) — does not write to either.

**Outputs (written to Management App storage):**
- New, updated, or deleted Course, Lesson, and Activity records (manual paths, FR-1–FR-4), including any Lesson content-plan fields (§6).
- New, renamed, or deleted Activity Type records (§5).
- New Lessons and Activities, and Activities appended to existing Lessons, from a successful bulk import (all-or-nothing, FR-5).
- No change to Curriculum, Difficulty Tier/Category, Child, or any Child Course Instance data — this module touches the Course Template hierarchy (including its own Activity Type table) only.

## 12. Acceptance criteria

1. Creating a Course with `name`, `curriculumId`, and `courseCode` succeeds; the `courseCode` is then usable as a bulk-import join key.
2. Deleting a Course that has been stamped into one or more Child Course Instances succeeds without error, and does not alter or delete those instances.
3. A bulk import file containing one row with an unmatched `courseCode` is rejected in its entirety — no Lessons or Activities from any row in the file are written.
4. A bulk import file where two rows share a `lessonCode` but have different `lessonTitle` values is rejected in its entirety.
5. A bulk import file where all rows are valid creates the correct number of new Lessons and Activities, correctly attached to their matched Course.
6. Re-importing a CSV that adds new Activity rows under an already-existing `lessonCode` (same Course) appends those Activities to the existing Lesson rather than creating a duplicate Lesson.
7. Creating or importing an Activity with a `difficultyTier` value that doesn't match any existing Tier is rejected.
8. Manually adding a single Activity to an existing, previously bulk-imported Lesson succeeds without requiring any CSV re-import.
9. Creating a new Activity Type with `capturePattern: grade-optional` and `structurePattern: count` makes it immediately selectable and behaves correctly wherever Activity Types are used, with no Child App changes required.
10. Attempting to delete an Activity Type referenced by at least one Activity is rejected, with the blocking count shown.
11. No UI path anywhere allows changing an existing Activity Type's `capturePattern` or `structurePattern`.
12. A Lesson with `pageRangeStart: 45`, `pageRangeEnd: 60`, and one existing PDF Activity covering pages 45–47: creating a new Reading Pages Activity under that same Lesson pre-fills its starting page as 48 (the shared budget, gap-filled, crossing type boundaries).
13. If that same Lesson's budget is fully covered by existing Activities up through page 60, creating another page-range-type Activity pre-fills a starting page of 61 — past the original budget, with no warning or block.
14. A Lesson with a Practice Level `targetCount` of 12 and 3 existing Practice Level Activities shows "3 of 12" in its planning view; adding a 4th, or stopping at 3 permanently, both succeed with no warning.
15. A CSV-imported Lesson has no content-plan fields set by default; adding them afterward via manual edit works exactly as it would for a manually-created Lesson.
16. Creating a 4th Video Activity under a Lesson that already has 3 (with `sequenceNumber` 1, 2, 3) pre-fills `sequenceNumber: 4`; the parent can override it to any other integer, including one already in use, without being blocked.
17. Creating a new Practice Level Activity under a Lesson with existing Practice Level Activities numbered 1 and 2 pre-fills `sequenceNumber: 3`, and that number is the Activity's level indicator — no separate level field exists to reconcile against it.
