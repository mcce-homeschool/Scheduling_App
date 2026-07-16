# Software Requirements Specification — Management App
## Module 6: Chore Authoring
*Written against Domain Model §2.6 (Chore — primary source, including `daysOfWeek[]`), §2.3 (Difficulty Tier & Reward Category), §2.10 (Generated Packet — recurrence expansion and fixed merge order), §3.5a (Chore as received, Child App side, including `daysOfWeek[]`), §4.2 (Completion CSV — chore rows), Architecture Evaluation §4/§5/§8, Documentation Roadmap §3.*

---

## 1. Purpose

Lets the parent author and maintain standalone, per-child recurring Chores — household or outside work that bypasses Course/Lesson/Pacing Profile entirely (Domain Model §2.6). This module owns Chore records only: create, edit, delete, and the recurrence rule the (not-yet-written) Packet Generation module will expand into actual due dates. It does not generate packets, does not touch Activities/Courses, and does not own Family Event authoring (a separate, similarly standalone module).

## 2. Scope notes

**2.1 — `daysOfWeek[]` is a required, non-empty subset of `{Sun, Mon, Tue, Wed, Thu, Fri, Sat}`.** A single generalized field covers every recurrence pattern a household actually wants — a chore done every day, a chore done one specific day, or a chore done on any other combination (e.g., every day except Saturday, for households with a standing no-chores day). One day selected covers what would otherwise be called "weekly"; all seven covers "daily"; nothing else needs a distinct code path — the (future) Packet Generation module expands a Chore's recurrence by checking membership in this one set, regardless of how many days are in it.

**2.2 — No bulk import for Chores; manual CRUD only, an assumption based on volume.** Course Template Library (Module 3) split Course (manual-only) from Lesson/Activity (bulk-eligible) specifically because of a real volume difference — hundreds of Activities per semester versus a handful of Courses. Chores don't have that problem: a household realistically has a handful of recurring chores per child, not hundreds. **Assumption applied: Chore Authoring is manual CRUD only, no CSV path.** Flag if your actual chore list is large enough to want bulk import — nothing here would need to change architecturally, it just isn't built.

**2.3 — No start/end scheduling for a Chore's recurrence; treated as indefinite from creation until deletion.** Domain Model §2.6 doesn't mention a start or end date for a Chore (unlike Pacing Profile's `startDate`, Module 5). **Assumption applied:** once created, a Chore recurs indefinitely on its `daysOfWeek[]` pattern until the parent deletes it (§2.5/FR-3) — there's no "pause" or "end this chore on date X" concept in this module. Flag if you want a scheduled end date; not something inferred here, since no user story has asked for one.

**2.4 — Chore ID scheme is now settled (TDS §3): non-collision with Activity IDs is guaranteed jointly by a reserved prefix and an authoring-time validation rule.** A Chore's stored record identity is `CHR-{choreToken}` — this module mints the token once, at creation. Each occurrence generated from it (one per due date) carries its own deterministic per-occurrence ID, `CHR-{choreToken}-{YYYYMMDD}`, minted by Packet Generation (Management SRS Module 08) at expansion time — not by this module. Non-collision with Activity IDs is guaranteed by the fixed `CHR` prefix together with Module 03's reserved-code validation (`courseCode`/`lessonCode` can never be `CHR` or `EVT`, and are alphanumeric-only) — this module has nothing further to enforce beyond minting the token itself.

**2.5 — Chore deletion cannot recall anything already delivered to the child device — same pattern as Module 4's Instance deletion.** Per the one-way interchange (Architecture Evaluation §5/§6, guardrail 6), a Packet already exported is gone; deleting a Chore here stops **future** recurrence generation only. Any already-delivered due-dates and any Activity Records the child has already produced against this Chore's already-minted occurrence IDs (which share its `choreToken`) are unaffected on the child device, and simply become unmatched-by-source on the Management side going forward (same accepted handling as a deleted Course Template's `sourceTemplateId`, Module 3 §2.4, and unmatched Completion CSV rows generally, Domain Model §4.3).

**2.6 — `choreType` is a closed enum, and a Chore may be reclassified within it at any time.** Two distinct things, previously conflated:

- **The enum itself is closed and shared.** `choreType` is one of eleven canonical chore categories — `Pet Care`, `Car Care`, `Kitchen/Dining`, `Bathroom`, `Living/Main Area`, `Playroom`, `Bedroom`, `Parent's Room`, `Porch`, `Floors`, `Miscellaneous` — the *same* set enforced by `packet_schema.json`'s `choreEntry.choreType` and named in Interchange Contract §1b and Domain Model §2.6. It is **not** a free-text label and **not** parent-extensible. A packet carrying any other value fails whole-packet validation on the child device (Child SRS Module 2 §5), so authoring outside this set would produce chores that silently break every export. Do not add a value, rename one, or reintroduce the superseded two-value `housework`/`outside` pair — that set predates the per-area categories and is dead.
- **A given Chore's classification is freely editable within the enum.** Unlike Activity Type's `capturePattern`/`structurePattern` (immutable once set, Module 3 §2.5/FR-A3), no downstream interpretation depends on a *Chore* keeping the same `choreType` — it is a categorization label, not a behavioral switch. The parent may reclassify a Chore to any other canonical value at any time, with no effect on already-recorded completions.

**2.7 — Every Chore occurrence is required; this module never authors a `required` field.** Domain Model §2.6 and Interchange Contract §1b: `required: true` is stamped by Packet Generation (Management SRS Module 08) on every occurrence it emits, system-set rather than parent-facing. This module's Create/Edit forms (FR-1/FR-2) never expose a requiredness toggle — there is no optional-chore state to author.

## 3. User stories

- As a parent, I want to set up my child's recurring chores once, so I don't have to re-enter "take out trash" every week.
- As a parent, I want to pick exactly which days of the week a chore applies to — including "every day but Saturday" — without fighting a daily-vs-weekly toggle that can't express that.
- As a parent, I want each chore to earn the same kind of reward currency my child's schoolwork does, at whatever difficulty I choose.
- As a parent, I want to stop a chore from recurring without losing the history of what my child already did for it.

## 4. Functional requirements

**FR-1 — Create Chore.** The parent creates a Chore directly against a Child (no Course/Lesson/Curriculum involved) with: `childId`, `title`, `choreType` (**selected from the closed eleven-value enum**, §2.6 — presented as a picker, never a free-text field), `daysOfWeek[]` (a non-empty subset of Sun–Sat, §2.1), and `difficultyTier` (must resolve to an existing Tier, Module 2). Optional: `notes`, `blockHint` (one of the four canonical block labels — `morning`, `afternoon`, `evening`, `night`; anything else is ignored by the child device and displayed under `morning`, Interchange Contract §1d).

**FR-2 — Edit Chore.** Any field — including `choreType` (§2.6), `daysOfWeek[]`, and `difficultyTier` — can be changed at any time. Changing `difficultyTier` affects only future completions' reward category; it never alters the category of a completion already recorded (consistent with the Reward Ledger's own immutable-entry design, Domain Model §3.7). Changing `daysOfWeek[]` affects only future recurrence generation, never anything already delivered (§2.5).

**FR-3 — Delete Chore.** The parent can permanently remove a Chore. Requires an explicit confirmation step (destructive — stops all future recurrence generation). Per §2.5, this has no effect on content already delivered to the child's device or on any Activity Records the child has already produced against it.

**FR-4 — List / browse a Child's Chores.** The parent can view every Chore currently authored for a given Child, showing at minimum `title`, `daysOfWeek[]`, and `choreType`.

**FR-5 — `difficultyTier` must resolve.** Chores from this module require a `difficultyTier` value matching an existing row in Module 2's table. No "create tier on the fly" path — tiers are managed exclusively in Module 2, same rule already established for Activities (Module 3 FR-7).

**FR-6 — No template/instance concept applies.** Unlike Course (Module 3/4), a Chore is authored once, directly, against one Child — there is no stamping, no template library, no propagation question of any kind for Chores. This module has no "assign" action distinct from creation.

**FR-7 — Single-child only.** A Chore belongs to exactly one Child (`childId`) and cannot be shared across multiple children. A household chore two kids both do is two separate Chore records — contrast with Family Event, which explicitly supports multiple `childId`s (Domain Model §2.7, a different module).

## 5. Validation rules

| Rule | Detail |
|---|---|
| `childId` | Required; must reference an existing Child (Module 4). |
| `title` | Non-empty, whitespace-trimmed. |
| `choreType` | Required; one of the eleven canonical values — `Pet Care`, `Car Care`, `Kitchen/Dining`, `Bathroom`, `Living/Main Area`, `Playroom`, `Bedroom`, `Parent's Room`, `Porch`, `Floors`, `Miscellaneous` (Domain Model §2.6 / Interchange Contract §1b / `packet_schema.json`). Closed set, not extensible, not free text. A value outside it would be rejected by the child device's Packet Import. |
| `blockHint` | Optional; if set, one of `morning` \| `afternoon` \| `evening` \| `night`. Any other value is not rejected here but is not honored by the child device — it displays under `morning` (Interchange Contract §1d). |
| `daysOfWeek[]` | Required; non-empty subset of {Sun, Mon, Tue, Wed, Thu, Fri, Sat}; no duplicates. One day selected behaves as "weekly"; all seven behaves as "daily"; any other combination (e.g., six days, excluding Saturday) is equally valid — there is no separate "daily" code path (§2.1). |
| `difficultyTier` | Required; must resolve to an existing row in Module 2's table. |
| Delete | Requires explicit confirmation; irreversible; does not touch already-delivered content or child-side history (§2.5). |
| Bulk import | Not offered — manual CRUD only (§2.2). |

## 6. Permissions

No *additional* per-action PIN. The Management App's `launchPin` (Domain Model §2.11) gates the whole app once per session; this module adds no further gate.

## 7. Inputs / Outputs

**Inputs:** parent-entered form data (Chore create/edit/delete); reads the Child table (Module 4, for `childId` selection) and Module 2's Tier table (for `difficultyTier` validation) — does not write to either.

**Outputs (written to Management App storage):**
- New, updated, or deleted Chore records, each scoped to exactly one Child.
- No change to any Course, Lesson, Activity, Curriculum, Difficulty Tier/Category, or Family Event data — this module touches the Chore table only.

## 8. Acceptance criteria

1. Creating a Chore with all seven days selected in `daysOfWeek[]` succeeds and behaves as an every-day chore; creating one with six days selected (e.g., every day except Saturday) succeeds identically, with no special-casing anywhere in validation or generation.
2. Creating or editing a Chore with a `difficultyTier` value that doesn't match any existing Tier is rejected.
3. Editing a Chore's `choreType` to a **different canonical value** at any time succeeds with no downstream effect on existing Activity Records or Reward Ledger entries. Attempting to author a `choreType` outside the eleven-value enum is rejected at entry — the field is a picker, and there is no path to a free-text value.
4. Deleting a Chore requires an explicit confirmation step and does not alter any Activity Record already produced against it.
5. Creating a Chore with an empty `daysOfWeek[]` is rejected; creating one with a single day succeeds and behaves as a "weekly" chore.
6. No UI path in this module allows assigning one Chore record to more than one Child (§4/FR-7).
7. No UI path in this module offers a bulk/CSV import option (§2.2).
