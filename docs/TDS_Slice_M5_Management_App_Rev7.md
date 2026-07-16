# Technical Design Specification — Slice
## M5 Scope: Management App — Course Template Library, Activity Type Management, Child Management & Instance Editing

*Covers: Activity Type Management (SRS Module 12, FR-1–FR-5), Course Template Library manual path (Module 03, 3 entities / 14 FRs — Courses FR-1/FR-2, Lessons FR-3, Activities FR-4/FR-10, reordering FR-9, resolution rules FR-6–FR-8), and Child Management (Module 04 — Child CRUD FR-1–FR-3, stamping FR-4–FR-8, and instance content editing FR-9–FR-14, per D7). Written against Domain Model §1/§2.1/§2.4/§2.5/§2.8/§2.10 and the Interchange Contract, Architecture Evaluation §7/§10, SRS Modules 03/04/12, and `TDS_Slice_M4_Management_App_Rev3.md`.*

*Still does not cover: bulk CSV import or Lesson content-planning presets (Module 03 FR-5, FR-P1–P6 — M8), Pacing Configuration (SRS Module 05 — M7), Packet Generation itself (Module 08 — M7), Chore/Family Event authoring (M6), reporting (M9), completion import (M10), backup/restore (M8), or archive-as-template (still open, Domain Model §6).*

*Status: buildable as written.*

*Rev 8 (2026-07-16): §4's Activity (FR-4) field list amended to include the optional trio `expectedDurationMin` / `instructions` / `blockHint`. The §2 store shape already declared all three; only Rev 7's FR-4 prose omitted them, so the build shipped them out of the authoring UI. No schema change, no IndexedDB version bump — `expectedDurationMin` is already consumed downstream by Pacing (SRS Module 05 FR-6, `minutesBudget` mode) and Instructional Hours (SRS Module 10 FR-9), and by Packet Generation.*

---

## 1a. `activityTypeKey` seed values

| `activityTypeKey` | `label` | `capturePattern` | `structurePattern` |
|---|---|---|---|
| `quiz` | Quiz | grade-optional | count |
| `test` | Test | grade-optional | count |
| `project` | Project | grade-optional | count |
| `report` | Report | grade-optional | count |
| `pdf` | PDF | grade-optional | page-range |
| `drill` | Drill | grade-optional | count |
| `workbook` | Workbook | grade-optional | count |
| `video` | Video | no-capture | count |
| `practice-level` | Practice Level | no-capture | count |
| `reading-pages` | Reading Pages | no-capture | page-range |

`storage.js`'s `onupgradeneeded` seed writes these 10 rows into `activityTypes` — exact key strings, kebab-case for the two multi-word keys (`practice-level`, `reading-pages`), no other casing accepted anywhere. `label` remains freely parent-renamable with zero effect on any reference (Module 12 FR-2); the table above fixes the ten `activityTypeKey` values permanently, not the ten `label` strings.

---

## 1. Decided here (TDS-level calls, consistent with D1–D8)

- **File list:** `activityTypes.js` (14th Management file, per D1/Roadmap §10a) owns Module 12 FR-1–FR-5 exclusively. `courses.js` owns Module 03's three remaining entities (Course, Lesson, Activity — FR-1–FR-4, FR-6–FR-10). `children.js` (Module 04) owns Child CRUD, stamping, **and** instance editing (FR-1–FR-14) — this is the first place in either app where two module files (`courses.js` and `children.js`) both write the `courses`/`lessons`/`activities` stores, partitioned by `state` (Roadmap §10a's naming of this, carried forward — accepted, not a defect).
- **Internal ID prefixes (D8):** `COU-{token}` (Course), `LSN-{token}` (Lesson), `CHI-{token}` (Child) — same short-random-base36-token minting as `CUR-{token}` (M4 §1). None of these three ever cross the interchange; the prefixes exist for readability and for consistency with the reserved-literal guard below, not because anything parses them.
- **Reserved literals, three, not two:** `CHR`, `EVT` (existing, Interchange Contract §4) and `TPL` (new, D3). `courseCode` and `lessonCode` may never equal any of the three, case-insensitively. A minted `instanceToken` may never equal `chr`, `evt`, or `tpl`, case-insensitively — checked at mint, re-rolled on collision.
- **Activity ID grammar — one grammar, two states, not two grammars (D3):**
  - Template: `{courseCode}-TPL-{lessonCode}-{seq}` — e.g. `SAXMATH5-TPL-L03-02`. Never crosses the interchange; Packet Generation (M7) treats any Activity ID carrying `TPL` in segment 2 as a defect if one ever appears in a packet.
  - Instance: `{courseCode}-{instanceToken}-{lessonCode}-{seq}` — e.g. `SAXMATH5-f3k9-L03-02`. Minted once, either at stamp (every Activity the stamp copies) or when a **new** Activity is later added directly to the Instance (Module 04 FR-10) — never re-minted by an edit.
- **`seq` is `Lesson.nextActivitySeq` — persisted, per-Lesson, never recomputed, never reused (D4).** Every Lesson — template or instance — carries this counter, seeded to `1` at Lesson creation and advanced by exactly 1 in the same transaction as each Activity mint. Deleting an Activity does not decrement it and does not free its number.
- **`courseCode` — unique across Course *templates* only, case-insensitive; frozen once any Activity exists beneath the Course (D2/D3a).** Uniqueness is scoped to `state: template`; Instances inherit their code by copy and two stamps of one template legitimately share it (their Activity IDs stay apart on `instanceToken` alone). Deleting a Course template frees its code for reuse — safe, since its template Activities (the things whose IDs depended on that code) are gone with it.
- **`lessonCode` — unique within its own Course, frozen once any Activity exists under the Lesson.** Same freeze mechanism and reasoning as `courseCode`.
- **Three numbers live on an Activity. This table is the single most important thing in this document to get right before writing any code that touches an Activity record:**

| Field | Counts | Scope | Mutable? | Visible to child? |
|---|---|---|---|---|
| `order` | Position in the Lesson, across **all** types | Lesson | **Yes** — parent reorders freely (FR-9 template / FR-11 instance) | No — drives pacing walk order only (Mgmt SRS 05 §2.4) |
| `seq` | ID segment (`Lesson.nextActivitySeq`), across **all** types | Lesson | **Never** — minted once at creation, never reused | No — inside an ID nobody parses |
| `sequenceNumber` | Ordinal within one **Activity Type** | Lesson + type | Yes — parent overrides freely, collisions permitted by design | **Yes** — and for Practice Level it *is* the level |

  Reordering an Activity (FR-9/FR-11) changes `order` only. It never touches `seq` or `sequenceNumber`. A build session that wires a reorder action to increment/decrement `seq` has broken the ID scheme's core invariant and will not know it until an ID collides.
- **No `utils.js` addition.**

---

## 2. IndexedDB schema — `managementAppDB`, **version 2**

**Why version 2.** M4 declared every store up front specifically so no future milestone would need to bump the version — that reasoning holds, and **no store is added, removed, or reshaped here.** What it didn't anticipate is that **IndexedDB can only create an index inside `onupgradeneeded`.** M5 introduces real growth in `activities`, the first store in this app that grows without bound, and every read of it — Lesson render, Activity Type delete-guard, Tier delete-guard — would otherwise be a full scan of the largest store in the app. Adding indexes now, before there's data to migrate, costs nothing; adding them later is the same bump against a store that by then holds a family's entire authored curriculum.

**`onupgradeneeded` must handle both entry paths.** A fresh install arrives at v2 with `oldVersion === 0` and needs stores **and** indexes created, plus the one-time seed. A device that already ran M4 arrives with `oldVersion === 1` and needs **indexes only** — its stores exist and its seed has already run and must not run twice (M4 §1: the seed is one-time, not a resettable default; re-running it would resurrect tiers a parent deliberately deleted). Guard on `oldVersion`, not on store existence.

```
if (oldVersion < 1) { /* create all stores; run the seed exactly once — FOUR tiers, meta.nextSeq = 5 */ }
if (oldVersion < 2) { /* create the indexes below; backfill the fourth tier on any device that already ran M4's three-tier seed */ }
```

**Seed data is four Difficulty Tiers, not three: Easy/Medium/Hard/Very Hard**, `D01`/`R01` through `D04`/`R04`, `order` 0–3, `meta.nextSeq` seeded to `5`. Very Hard is seeded rather than left parent-addable specifically so it's **install-invariant** — a parent-added tier's number is predictable but not portable across installs (one family's `R05` is "Brutal," another's is "Trivial"), and Architecture Evaluation §10 only allows a theme to key art to a seeded category. Seeding `R04` is what makes it themeable on every install.

**The v2 step must backfill the fourth tier on any device that already ran M4's three-tier seed — this is the only chance it gets**, since the seed itself never runs twice. Guarded on the counter, not on the tier's absence:

- If `meta.nextSeq === 4` and `D04` is absent → insert Very Hard `D04`/`R04` at `order: 3`, set `nextSeq: 5`. Safe: `nextSeq` at 4 proves nothing has ever been minted, so `D04` is unclaimed.
- If `meta.nextSeq > 4` → **do not write anything.** The parent has already minted a custom tier, and `D04` is theirs — some tier they created and named. Overwriting it would silently relabel it and re-point every Activity carrying it. Surface the situation rather than resolve it silently.

If M4's code hasn't actually been built and run yet on any real device, amend the v1 seed to four tiers directly and the v2 backfill branch simply never fires — it's specified either way so the outcome is identical regardless of what's on your machine.

### Indexes

| Store | Index | On | Serves |
|---|---|---|---|
| `activities` | `by_lessonId` | `lessonId` | Every Lesson render. The hot path. |
| `activities` | `by_activityType` | `activityType` | Module 12 FR-4's delete-guard (§3) — otherwise a full scan. |
| `activities` | `by_difficultyTier` | `difficultyTier` | M4's Tier delete-guard — a full scan that only got expensive once this slice gave it rows to find. |
| `lessons` | `by_courseId` | `courseId` | Every Course render; and the `lessonCode`-uniqueness-within-Course check (§4). |
| `courses` | `by_curriculumId` | `curriculumId` | M4's Curriculum delete-guard. Same story as the Tier guard. |
| `courses` | `by_childId` | `childId` | Module 04 FR-5 (list a Child's Instances) and FR-8's Tier-1 delete-guard. |
| `courses` | `by_courseCode` | `courseCode` | D2's uniqueness check. **See the warning below — this one is a trap.** |

**Every index is non-unique. `by_courseCode` in particular MUST NOT be declared `unique: true`.** `courseCode` uniqueness is scoped to `state: "template"` only — Instances inherit their code by copy, and two stamps of one template *legitimately* share it (D2; their Activity IDs stay disjoint on `instanceToken` alone). A unique index would enforce the rule IndexedDB can express instead of the rule the design actually has, and the failure would surface as **the second stamp of any template throwing on write** — a bug that looks like a stamping bug and is nothing of the kind. The uniqueness check is: read `by_courseCode`, **filter to `state: "template"`**, exclude the record being edited, compare `toLocaleUpperCase()`.

---

### Store table

| Store | Key path | Shape | Written by |
|---|---|---|---|
| `activityTypes` | `activityTypeKey` | `{ activityTypeKey, label, capturePattern, structurePattern }`. Seeded at M4 with the 10 rows in §1a. | `activityTypes.js` (Module 12, this slice) |
| `courses` | `id` (`COU-{token}`) | `{ id, name, curriculumId, courseCode, mainCategory: "school", state: "template" \| "instance", coreElective?, subject?, description?, defaultPacingHint? }` — **instance rows only:** `sourceTemplateId`, `childId`, `instanceToken` (no pacing cursor — pacing progress is derived from the Generation Log at M7, Domain Model §2.4/§2.10a). No `lessons[]` array field — a `lessons` query filtered by `courseId`, sorted by `order`, replaces it (IndexedDB doesn't preserve insertion order for an embedded array to rely on). | `courses.js` (template CRUD); `children.js` (instance creation at stamp) |
| `lessons` | `id` (`LSN-{token}`) | `{ id, courseId, lessonCode, order, title, nextActivitySeq, objective?, estimatedDays?, pageRangeStart?, pageRangeEnd?, activityCountTargets? }`. No `activities[]` array, same reasoning. Content-plan fields declared, unwritten at M5 (Module 03 §2.0 scopes FR-P1–P6 to M8). | `courses.js` (template CRUD); `children.js` (instance copy at stamp, and FR-9 instance Lesson CRUD) |
| `activities` | `id` (composite, grammar per §1) | `{ id, lessonId, activityType, title, required, payload, difficultyTier, capturesGrade, order, sequenceNumber?, expectedDurationMin?, instructions?, blockHint?, lessonTitle?, excludeFromGeneration? }`. `excludeFromGeneration` is Instance-rows-only (bool, default `false`) — never present on a `state: template` row. | `courses.js` (template CRUD, FR-4/FR-9/FR-10); `children.js` (copy at stamp, and FR-10/FR-11/FR-14 instance Activity CRUD) |
| `children` | `id` (`CHI-{token}`) | `{ id, name, gradeLabel?, notes?, themeHint? }`. | `children.js` (Module 04) |

Unchanged, still empty after M5: `pacingProfiles`, `chores`, `familyEvents`, `generationLog`, `importedCompletions`, `unmatchedRows`.

**Notes**

- **`courses`, `lessons`, `activities` each hold template and instance rows in the same store**, distinguished by walking up to the owning Course's `state` — load-bearing for Module 12 FR-4's "the guard reads the `activities` store, template and instance alike."
- **`children.js` and `courses.js` both write `courses`/`lessons`/`activities`, partitioned by `state`.** The first place in either app where two module files share stores — accepted, not a defect, since the alternative (one module owning both template and instance rules) was rejected as the worse option.
- **Indexing: seven indexes, all non-unique** — see the table above.

---

## 3. Activity Type Management (Module 12, FR-1–FR-5)

Owned entirely by `activityTypes.js`. Create (`label` + one `capturePattern` + one `structurePattern` from the fixed two-option sets each — FR-1), rename `label` freely with zero effect on any reference (FR-2), both patterns immutable post-creation through any path (FR-3), delete guarded by a full scan of `activities` for any row — template or instance — carrying the `activityTypeKey` (FR-4), list/browse showing both patterns read-only on every row (FR-5). `label` uniqueness is case-insensitive, trimmed, exclude-self-on-edit. Deleting a type referenced only in some Lesson's (unused-at-M5) `activityCountTargets[]` succeeds and leaves that entry inert, never cascaded.

`courses.js` **reads** this store (for Activity authoring's type picker and payload-shape branching, §4 below) and **writes nothing to it**.

---

## 4. Course Template Library — manual path (Module 03, FR-1–FR-4, FR-6–FR-10)

**Course (FR-1, FR-2).** Create with `name`, `curriculumId` (read-only reference select), `courseCode` (parent-entered or auto-slugified from `name`, stripping non-alphanumerics; validated non-empty, alphanumeric-only, never `CHR`/`EVT`/`TPL` case-insensitive, and **unique across existing Course templates, case-insensitive**; an auto-slugify collision is rejected outright, no silent auto-suffixing). `mainCategory` hardcoded `"school"`. Edit is unrestricted **except `courseCode`, which the form disables (with a stated reason) the moment any Activity exists beneath the Course, in any Lesson**. Delete remains unguarded (Module 03 §2.4) and frees the `courseCode` for reuse.

**Lesson (FR-3).** Create under an existing Course with `title`, `order`, `lessonCode` (non-empty, alphanumeric, auto-derivable from `order`, **unique within its own Course**, reserved-literal-guarded same as `courseCode`). `nextActivitySeq` seeded to `1` at Lesson creation, invisible to the parent. `lessonCode` **freezes** once any Activity exists under the Lesson. Delete cascades to the Lesson's own Activities; never touches a stamped Instance.

**Activity (FR-4).** Create under an existing Lesson with `activityType` (select against Module 12's table — FR-8), `title`, `required`, `payload` (shape per §8 of Module 03, branching on canonical-vs-custom type), `difficultyTier` (select against `tiers` — FR-7), `sequenceNumber` where the type is `count`-structured (entered directly; FR-P6's auto-fill default is still M8-scope), and the three **optional** Activity fields **`expectedDurationMin`, `instructions`, and `blockHint`** (SRS Module 03 §4). All three are **absent-when-blank**: a blank entry stores no property at all — never `""`, `0`, `null`, or a default. In particular the 15-minute fallback for a missing `expectedDurationMin` is generation-time math only (SRS Module 05 §2.3) and is **never persisted** onto an Activity. `expectedDurationMin` is a positive integer or absent; `instructions` is free text or absent; `blockHint` is one of the four canonical labels `morning` / `afternoon` / `evening` / `night` (Interchange Contract §1d) or absent. On creation: `id` is minted from the **current** `Lesson.nextActivitySeq` value (read it, format the `TPL`-form composite, write the Activity **and** the Lesson's incremented counter in one transaction); `order` is set to one past the highest existing `order` in that Lesson; `capturesGrade` copied from the Activity Type's current `capturePattern` and frozen (Module 03's FR-10, reading Module 12's table); `lessonTitle` copied from the Lesson's current `title` and frozen. Edit/delete affects only the single record — no cascade, no re-mint of `id` on edit, and no change to `seq`, `order`, or `sequenceNumber` when editing the optional trio; clearing a previously-set optional value in the edit form deletes that property from the record. These three fields are authored identically on the template Activity form (this FR) and the instance Activity form (Module 04 FR-10, §5).

**Reorder (FR-9).** The parent moves an Activity up or down within its Lesson; the action swaps `order` between the Activity and its neighbor. **Touches `order` only.** `id` and `sequenceNumber` are byte-identical before and after.

**Reference resolution (FR-6, FR-7, FR-8).** `difficultyTier` and `activityType` must each resolve against their own managed table; neither entry path offers on-the-fly creation of either.

---

## 5. Child Management, Stamping, and Instance Editing (Module 04, FR-1–FR-14)

**Child CRUD (FR-1–FR-3).** `id` is `CHI-{token}`, Management-internal only, never baked into any `instanceToken`, never parsed to recover a child from a completion row — that recovery path is `activityId → Activity → Instance → childId`, a lookup, not a parse.

**Stamping (FR-4).**

1. Mint one `instanceToken` — random base36, uniqueness-checked against every `instanceToken` already in use, re-rolled if it collides with an existing one or equals `chr`/`evt`/`tpl` case-insensitively.
2. Copy the Course: new `id` (`COU-{token}`), same `name`/`curriculumId`/`courseCode`/optional fields, `state: "instance"`, `sourceTemplateId` = template's `id`, `childId` = selected Child's `id`, `instanceToken` stored on the record. The fresh Instance has no generation history — nothing sent yet.
3. For each template Lesson, in `order`: copy with a new `id` (`LSN-{token}`), same `lessonCode`/`order`/`title`/optional and content-plan fields, `courseId` = the new Instance's `id`. **`nextActivitySeq` is copied from the template Lesson's current value at the moment of stamping** — not reset to `1` — so the Instance's own counter continues from where the template's stood.
4. For each template Activity under that Lesson: mint the composite `id` = `{courseCode}-{instanceToken}-{lessonCode}-{seq}`, reusing **the same `seq` value the template Activity already carried** (only the token segment changes). Copy every other field verbatim, including `order`, `capturesGrade`, `sequenceNumber`, `lessonTitle`. `excludeFromGeneration` is absent on the copy — a template Activity never carries the field, and neither does its fresh instance copy until a parent sets it.
5. Write the new Course, its Lessons, and its Activities in one transaction.
6. Surface Pacing Configuration (M7) as the required next step.

**Instance editing (FR-9–FR-14, D7).**

- **FR-9 — Create/edit/delete a Lesson on an Instance.** A new instance Lesson mints `LSN-{token}` and its own `nextActivitySeq` starting at `1`. `lessonCode` uniqueness-within-Course and freeze-once-Activities-exist rules apply identically to the template path. Delete cascades to the Lesson's Activities. **The source template is never touched, ever, by any action in this FR.**
- **FR-10 — Create/edit/delete an Activity on an Instance.** A **new** Activity mints its `id` from **that specific Instance's existing `instanceToken`** and its Lesson's current `nextActivitySeq` (never `max(existing)+1`, never a number a deleted Activity once held). Editing an existing Activity's fields — on a template or an instance — never re-mints its `id`. `capturesGrade` copied from the Activity Type at creation.
- **FR-11 — Reorder within an Instance's Lesson.** Identical mechanism to Module 03's FR-9; changes `order` only.
- **FR-12 — Divergence warnings, never blocks.** Editing or deleting an Activity the child has **already received** changes nothing on their device (one-way interchange). Deleting an Activity the child has **already completed** means their eventual Completion CSV row arrives with an `activityId` matching nothing, landing as an unmatched row at import — not lost, just unattributable. This module cannot check either condition without importing completion data, which it must not do to answer a UI question — so both are warned unconditionally on edit/delete of any Instance Activity.
- **FR-13 — Edit an Instance's Course-level fields.** `name` and every optional field are freely editable, exactly as an Instance Lesson's `title` is under FR-9. **`courseCode` is frozen — with no new rule and no new code.** The template freeze (Mgmt SRS 03 FR-2: frozen once any Activity exists beneath the Course) already produces this, because a stamped Instance has Activities beneath it from its first instant. Do not write an instance-specific guard; the existing one is the guard. `mainCategory`, `sourceTemplateId`, `childId`, and `instanceToken` are never editable by any path — `instanceToken` above all, since it is baked into every Activity ID beneath it. The source template is never touched.
  - **Warned, not blocked:** a packet entry's `courseName` is resolved by Packet Generation **at export time**, so a rename changes what the child sees on every packet generated *afterward* while already-delivered items keep the name they shipped with. The child ends up seeing both. Same one-way-interchange consequence as FR-12, warned the same way.
- **FR-14 — Set/clear `excludeFromGeneration` on an Instance Activity.** A boolean toggle, default `false`, exposed only on Instance Activities — never on a template row. Writable here at any time, independent of Packet Generation's Propose/Review/Commit cycle (M7) — the same field is also writable from inside Packet Generation's Review stage, which reads and writes the identical record; there's no separate flag, no sync step between the two entry points. Setting the flag removes the Activity from the pending remainder, so every future Propose skips it; clearing it before it has been sent restores ordinary pacing; clearing it after it was already sent does nothing, since a sent Activity is never re-proposed. There is no cursor in play (Domain Model §2.4/§2.10a).

**List/un-assign/delete-Child (FR-5–FR-8).** Internal IDs carry the `CHI-`/`COU-`/`LSN-` prefixes; the un-assign guard (FR-6) removes the Instance's own Lessons/Activities (which may now include parent-added ones from FR-9/FR-10, not just stamp-copied ones) alongside its (still M7-only, still a no-op in practice at M5) Pacing Profile.

---

## 6. What this slice deliberately leaves open

- **Bulk CSV import (Module 03 FR-5) and Lesson content-planning presets (FR-P1–P6).** Still M8.
- **Pacing Configuration (SRS Module 05), Packet Generation itself (Module 08), Chore/Family Event authoring, reporting, completion import, backup/restore.** Still M7/M7/M6/M9/M10/M8 respectively.
- **Reordering an Instance's Activities after some have been sent is a non-issue.** With generation progress derived from the Generation Log by item `id` rather than a stored position (Domain Model §2.4/§2.10a), reorder cannot strand a pointer: sent Activities stay sent, pending ones stay pending, and `order` just re-sequences the pending remainder for the next run. (Open while a cursor existed; closed by retiring it at M7.)
- **Archive-as-template.** Still open (Domain Model §6), still no capability anywhere in this slice.

---

## 7. Acceptance checklist for this slice

1. Creating an Activity Type with a combination not among the 10 seeded rows succeeds and is immediately selectable in `courses.js`'s Activity form, with zero Child App implication.
2. `storage.js`'s seeded `activityTypes` rows exactly match §1a's table — 10 rows, these exact `activityTypeKey` strings (including the hyphens in `practice-level` and `reading-pages`), no more, no fewer.
3. Attempting to delete an Activity Type referenced by at least one Activity — template or instance — is rejected with a count.
4. No path anywhere changes an existing type's `capturePattern`/`structurePattern`.
5. Creating a second Course template whose `courseCode` differs from an existing one only in case ("saxmath5" vs "SAXMATH5") is rejected.
6. A Course with at least one Activity beneath it cannot have its `courseCode` edited by any UI path; the same Course before any Activity exists under it, can.
7. Creating three Activities in one Lesson, deleting the second, then creating a fourth: the new Activity's `seq` continues from the counter (its ID's fourth segment is `04`, not `02` or `03`), verified across a reload between each step.
8. Two Lessons under the same Course cannot share a `lessonCode`; the same code under two *different* Courses is fine.
9. Stamping a Course Template with 2 Lessons (3 and 2 Activities) to a Child produces 5 Instance Activities whose `seq` values (ID segment 4) exactly match their template originals, all 5 sharing one new `instanceToken` distinct from the template's literal `TPL`.
10. Stamping the same template a second time (same or different Child) produces a fully disjoint set of Activity IDs, differing only in `instanceToken` from the first stamp and from each other.
11. Adding a brand-new Activity directly to a stamped Instance (FR-10) mints an ID carrying that Instance's original `instanceToken` and a `seq` value one higher than any `seq` that Instance's Lesson has ever issued — including seq values that belonged to Activities since deleted from that Instance.
12. Reordering an Activity (template, via FR-9, or instance, via FR-11) changes only its `order`; its `id` and `sequenceNumber` are byte-identical before and after.
13. Editing the `title` of an Instance Activity leaves its `id` byte-identical; no instance-editing action of any kind writes to a `state: template` row.
14. Deleting an Activity from an Instance surfaces the FR-12 warning every time, regardless of whether that Activity has actually been received or completed by the child.
15. Both of M4's delete-guards (Curriculum → `courses`; Tier → `activities`/`chores`) still correctly fire now that this slice has given them real template *and* instance rows to find.
16. `activityTypes.js` contains no Course/Lesson/Activity code; `courses.js` contains no Activity Type create/edit/delete code.
17. **The database opens at version 2 with all seven indexes present, on both entry paths:** a fresh install (`oldVersion 0`) creates stores, runs the M4 seed exactly once, and creates the indexes; a device that already ran M4 (`oldVersion 1`) gains the indexes and **does not re-run the seed** — verified by deleting all three seeded tiers on a v1 device, upgrading to v2, and confirming they stay deleted.
18. **No index is declared `unique`.** Specifically: stamping the same Course Template a second time succeeds. (If `by_courseCode` were declared unique, this is the acceptance check that would catch it — the write would throw on the second stamp.)
19. Renaming a stamped Instance's Course `name` (FR-13) succeeds, warns, and leaves the source template's `name` byte-identical.
20. A stamped Instance's `courseCode` is uneditable from the first instant it exists, and no instance-specific guard was written to achieve it.
21. Toggling `excludeFromGeneration` on an Instance Activity persists across a reload; no equivalent toggle appears anywhere in the template Activity form.
22. **A fresh install seeds exactly four tiers** — Easy/Medium/Hard/Very Hard, `order` 0–3, `D01`/`R01` through `D04`/`R04` — and `meta.nextSeq` is `5`. The next tier the parent creates is `D05`/`R05`.
23. **A device that already ran M4's three-tier seed, upgraded to v2, ends with four tiers and `nextSeq: 5`.** Verify on a v1 database with untouched seed data.
24. **The same upgrade on a v1 device where the parent had already minted a custom tier (`nextSeq: 5`, `D04` = their own tier) writes nothing** — their `D04` keeps its label, its `order`, and every Activity pointing at it. The upgrade surfaces the situation rather than resolving it silently.
25. Deleting all four seeded tiers and reloading leaves the table empty — the seed does not resurrect them, and neither does the v2 branch.

---

## Still owed — Child App side

Two things only the Child App session can carry across, not makeable from Management:

- **`TDS_Slice_M1_Child_App.md`'s sample JSON** needs the corrected per-domain tier/category values. A Child session writing its packet validator against the stale sample will build the economy M4's Q1 rejected. Confirm it went across.
- **The Child App's Theming SRS module** needs to mirror AE §10's `R01`–`R04` themeable range. A theme built against the old `R01`–`R03` rule will render Very Hard as the generic default on every device.
