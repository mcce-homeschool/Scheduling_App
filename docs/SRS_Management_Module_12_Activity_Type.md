# Software Requirements Specification — Management App
## Module 12: Activity Type Management

*Written against Domain Model §2.5a (Activity Type — the two independent patterns, the 10-row seed set, the extensibility rules), §2.5 (Activity — the `activityType` reference and the `capturesGrade` copy-at-creation rule), §2.8 (Lesson — `activityCountTargets[]`); Management SRS Module 02 (Difficulty Tier — the reference-table pattern this module mirrors exactly); Management SRS Module 03 (Course Template Library — the consumer of this table); Management SRS Module 01 (Curriculum Library — `suggestedActivityTypes[]`, the other consumer); Interchange Contract §1a (the `kind` discriminator, and why the Child App never sees this entity); Architecture Evaluation §7 (file list), Roadmap §8 (the split decision that created this module).*

---

## 0. Why this module exists

Activity Type was inside Module 03 by history, not by design. Module 03 carried 19 functional requirements across four entities and was the one file in either app that Architecture Evaluation §7 conceded arguably breaks guardrail 15 ("understood from one file and one data model") and guardrail 16 ("one module modifiable at a time"). Roadmap §8 held the split open with a hard deadline — *before M5 begins* — because M5 is where Module 03 gets built.

**Settled during M5 planning: it splits.** FR-A1–FR-A5 leave Module 03 and land here; `activityTypes.js` joins the Management file list (13 → 14). Module 03 drops to three entities and 14 FRs.

**What did not change:** the `activityTypes` **store** is already declared and seeded in `storage.js` at M4 (TDS_Slice_M4 Q4), with Domain Model §2.5a's 10 canonical rows. This module adds CRUD on top of an already-populated store. No migration, no schema bump, no rework of M4.

**One FR stayed behind in Module 03 on purpose.** The old FR-A5 — `capturesGrade` is copied off the type and stamped onto the Activity at Activity creation — is a rule about *Activities*, not about types. It remains in Module 03 (renumbered FR-10) and reads this module's table. Splitting it out would have put a rule about writing Activity records in a module that never writes one.

---

## 1. Purpose

Owns the Activity Type table: the parent-extensible set of types an Activity can be, and the two independent behavioral patterns each one carries. This module owns the *type definitions only* — it does not author Activities (Module 03), does not decide which types a Curriculum suggests (Module 01, which merely references this table), and has no knowledge of Lessons, Courses, Children, or packets.

It is deliberately shaped as a near-twin of Module 02 (Difficulty Tier & Reward Category): a small managed reference table, seeded with canonical rows, extensible by the parent, with an immutability rule protecting historical records and a reference-guard on delete.

## 2. Scope notes

**2.1 — This is a reference table, not an enum.** The 10 canonical types are a **seed set**, not a fixed list. A parent can add types indefinitely. Module 03's §2.3 previously described this as "10 fixed types… the authoritative list," which contradicted its own §2.5 and the Domain Model; that wording is corrected as part of the split.

**2.2 — Both patterns are immutable once a type exists.** `capturePattern` and `structurePattern` are chosen at creation from two fixed options each and can never be changed afterward, through any UI path. This is the same integrity reasoning as Module 02 FR-5's tier→category mapping: an Activity Record captured under `grade-optional`, or a Lesson preset written against `count`, becomes ambiguous about what it represents the moment the type beneath it changes meaning. The label is free to change; the behavior is not.

**2.3 — This entity does not exist on the Child App side, and this module is therefore invisible to the interchange.** The Child App reads only the boolean `capturesGrade` already stamped on each packet entry, and renders payloads by the `kind` discriminator Packet Generation stamps — it never inspects `activityType` and holds no type table (Interchange Contract §1a). **Consequence: this table can grow indefinitely with zero Child App impact, and a parent-added type needs no child-side change whatsoever.** That property is what Child SRS 04 AC-8 already claims; this module is where it's earned.

**2.4 — A parent-added type's payload is always a single free-text field.** Only the 10 canonical types carry a hand-specified, structured payload shape (a page range; a platform selector reference). A parent creating a type picks a `capturePattern` and a `structurePattern` — they have no mechanism for defining new *field structure* — so custom types get the simpler, universally-applicable free-text form ("reference / instructions") regardless of which `structurePattern` they were given. This crosses the interchange as `kind: freeText` (Interchange Contract §1a). **A custom `page-range` type is still free text**, which is exactly why the Child App reads `kind` and never derives it from `structurePattern`.

**2.5 — A custom `page-range` type participates in Lesson budget bookkeeping but receives no page pre-fill.** It counts toward the Lesson's shared page-range budget (Module 03 §6), but since its payload is free text rather than structured start/end fields, FR-P3's automatic starting-page default has nothing to compute from. The parent types the range into the free-text field themselves. (Module 03 owns that behavior; noted here so a parent-added-type decision made in this module isn't a surprise there.)

**2.6 — Deleting a type leaves inert historical references, and that is accepted.** A Lesson's `activityCountTargets[]` may reference a since-deleted type. That entry is left in place as an inert historical row — the same treatment already established for a deleted Course template's `sourceTemplateId` (Module 03 §2.4) and for unmatched Completion CSV rows generally (Domain Model §4.3). It is not a data-integrity error and must not be "cleaned up" by a cascade.

## 3. User stories

- As a parent, I want to add an Activity Type my curriculum uses that the app didn't ship with, without needing anything changed in my kid's app.
- As a parent, I want to rename a type without breaking any coursework already authored against it.
- As a parent, I want to be stopped from deleting a type that Activities still depend on.
- As a parent, I want to be prevented from changing what a type *means* after I've already authored work against it.

## 4. Entity fields

**Activity Type** — Required: `activityTypeKey` (id), `label`, `capturePattern` (`grade-optional` | `no-capture`), `structurePattern` (`page-range` | `count`). No optional fields.

**Seed data — 10 canonical rows, seeded in `storage.js` at M4, not by this module:**

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

**`activityTypeKey` minting — settled at M5 (TDS_Slice_M5_Management_App_Rev7 §1a).** The 10 canonical rows use **fixed literal keys**, kebab-case for the two multi-word types:

| `activityTypeKey` | `label` |
|---|---|
| `quiz` | Quiz |
| `test` | Test |
| `project` | Project |
| `report` | Report |
| `pdf` | PDF |
| `drill` | Drill |
| `workbook` | Workbook |
| `video` | Video |
| `practice-level` | Practice Level |
| `reading-pages` | Reading Pages |

These are the exact strings `storage.js`'s `onupgradeneeded` seed writes — no other casing accepted anywhere. A parent-added type's key is minted `AT-{token}` (short random base36, same minting pattern as `CUR-{token}`/`COU-{token}`/etc.), never a label-derived slug. Curriculum's `suggestedActivityTypes[]` already stores `activityTypeKey` values, never labels (M4 TDS Q5), and this table is what those values must match.

## 5. Functional requirements

**FR-1 — Create Activity Type.** The parent creates a type by supplying a `label` and choosing one `capturePattern` (of two) and one `structurePattern` (of two). **No new pattern *value* can be invented from this module** — the parent extends the table, never the behavior space. The new type is immediately selectable everywhere Activity Types are used (Module 03's Activity authoring, Module 01's `suggestedActivityTypes[]` picker), with no rewiring and no Child App change.

**FR-2 — Edit label.** A type's `label` can be renamed freely at any time. Renaming has **no effect** on any existing Activity, Activity Record, Lesson preset, or Curriculum suggestion referencing it — every one of those references the `activityTypeKey`, never the label. (The same property Module 02 FR-3 gives tier labels.)

**FR-3 — `capturePattern` and `structurePattern` are immutable.** No UI path changes either value on an existing type. Not an edit form that ignores the change; not a disabled field with a hidden path. There is no such path (§2.2).

**FR-4 — Delete, reference-guarded.** A type can be deleted only if **zero Activities reference it — template *and* instance**. Rejected otherwise, with the count of blocking Activities shown ("Used by 12 Activities"). The guard reads the `activities` store, exactly as Module 02's tier-delete guard does.

**FR-5 — List / browse types.** The parent can view every type with its `label`, `capturePattern`, and `structurePattern`, and can see at a glance which are canonical and which they added. Both patterns display as read-only on every existing row (FR-3).

## 6. Validation rules

| Rule | Detail |
|---|---|
| `label` | Non-empty, whitespace-trimmed. |
| `label` uniqueness | Unique, case-insensitively (`toLocaleLowerCase()`, trimmed), across all types. On edit, exclude the record being edited. A second "Quiz" is a parent authoring against the wrong one within a week. |
| `capturePattern` | Exactly one of `grade-optional`, `no-capture`. Never free-text; never a new value. |
| `structurePattern` | Exactly one of `page-range`, `count`. Never free-text; never a new value. |
| Pattern immutability | Both rejected on any edit of an existing type, through any path (FR-3). |
| Delete guard | Rejected if any Activity — `state: template` or `state: instance` — carries this `activityTypeKey`. |
| Delete cascade | **None.** A Lesson's `activityCountTargets[]` entry referencing the deleted type is left inert (§2.6), never cleaned up. |
| `activityTypeKey` | Minted once, never derived from `label` (which FR-2 lets the parent rename freely), never re-derived on rename. Canonical types use the ten fixed literal keys in §4 (kebab-case for multi-word ones); a parent-added type mints `AT-{token}`. |

## 7. Permissions

No *additional* per-action PIN. The Management App requires its own `launchPin` once per session (Domain Model §2.11) — the parent authenticates once at app launch, not per module. This module adds no further gate. The delete-guard *is* the safety mechanism; do not add a confirmation-PIN to a delete (M4 TDS §3).

## 8. Inputs / Outputs

**Inputs:** parent-entered form data (label, the two pattern choices). Reads the `activities` store — read-only — for FR-4's delete guard.

**Outputs (written to Management App storage):**
- New, renamed, or deleted rows in the `activityTypes` store. **Nothing else.**
- No change to any Activity, Lesson, Course, Curriculum, Child, or Tier. In particular: renaming a type writes **only** the type row (FR-2), and deleting one writes only a deletion (§2.6 — no cascade).

## 9. Acceptance criteria

1. Creating a type with `capturePattern: grade-optional` and `structurePattern: count` makes it immediately selectable in Module 03's Activity authoring form and Module 01's suggestion picker, with no rewiring and **no Child App change of any kind**.
2. An Activity created against that new type receives `capturesGrade: true`, copied and stored on the Activity record at creation (Module 03 FR-10) — not looked up live thereafter.
3. Renaming a type leaves its `activityTypeKey` byte-identical, and leaves every Activity, Lesson preset, and Curriculum suggestion referencing it completely unchanged.
4. No UI path anywhere — form, keyboard shortcut, or URL — changes an existing type's `capturePattern` or `structurePattern`.
5. Attempting to delete a type referenced by at least one Activity is rejected, with the blocking count shown. The guard counts **instance** Activities as well as template ones.
6. Deleting a type referenced by zero Activities but named in some Lesson's `activityCountTargets[]` **succeeds**, and that Lesson's entry is left in place, inert — not deleted, not erroring.
7. Creating a type whose label differs from an existing one only in case or surrounding whitespace ("quiz " vs "Quiz") is rejected.
8. Deleting all 10 canonical types and reloading the app does **not** resurrect them — the seed ran once, in M4's `onupgradeneeded`, and never runs again (M4 TDS §1).
9. `activityTypes.js` renders its own UI inline. There is no `ui.js` (Architecture Evaluation §7).
