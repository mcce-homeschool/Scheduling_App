# Software Requirements Specification — Management App
## Module 8: Packet Generation & Export
*Written against Domain Model §2.10 (Generated Packet — primary source: generation unit, five-step build, merge order, empty-source rule, idempotency), §2.9 (Pacing Profile, including `daysOfWeek[]` and `pacingMode`), §2.4 (Course/Instance, including `progressCursor`), §2.6 (Chore, including `daysOfWeek[]`), §2.7 (Family Event, including `startDate`/`endDate`), §4.1 (the Packet interchange shape), Architecture Evaluation §5/§8/§11, Documentation Roadmap §3.*

---

## 1. Purpose

Turns a Child's paced School content, recurring Chores, and in-range Family Events into one exportable Packet for a given child and date range — the Management App's half of the interchange (Domain Model §4.1). This module owns *aggregation, merge order, and export* only. It does not author Courses/Chores/Family Events (Modules 3/6/7), does not decide pacing rules themselves (Module 5 owns the Pacing Profile's fields), and does not import anything back (Completion Import, a separate, deferred module).

## 2. Scope notes

**2.0 — This module is milestone M7: the seam. Its exit criterion is not met inside this app.**

Packet Generation is the point at which the Management App and the Child App — built by two separate sessions that never see each other's code — meet for the first time. **This module is not "done" when it emits a packet that validates against `packet_schema.json`. It is done when a packet it emitted has been imported, clean and end to end, by the actual Child App** (Child SRS Module 2; Interchange Contract §8, which makes the fixtures normative for exactly this reason).

That is a two-account event and this session cannot observe it. Produce the packet, hand it to Jen, and stop — do not mark M7 complete on a packet that merely looks right. A failure at this checkpoint is the single most valuable finding the two-app design can produce, and it is far cheaper here than at the end of the build.

This module also depends on Chore Authoring (Module 06) and Family Event Authoring (Module 07) already existing — FR-3's chore expansion and FR-4's event fan-out cannot be written against entities that don't exist. Those land in M6, immediately before this one, for that reason (Roadmap §5).

**2.1 — `progressCursor` advances at generation time, on the Management side.** The Child App has no way to write back to Management-side data under the one-way interchange (Architecture Evaluation §5/§11 guardrail 6 — no bidirectional sync, no ledger-visibility channel, and by the same logic, no cursor-visibility channel either). `progressCursor` is written exclusively by this module (Module 5 §2.1), as part of FR-2's pacing walk below — never advanced by child-side import.

**2.2 — Pacing Profile's `daysOfWeek[]` is an explicit weekday set, consulted directly.** School-day determination checks a date's weekday against the Instance's `daysOfWeek[]` and `skipDates[]` — no anchor-day or ordering logic is needed once it's an explicit set (§4/FR-2).

**2.3 — Idempotent regeneration mechanics.** Domain Model §2.10's Rules state generation "is idempotent for a given cursor + date range, so a re-export doesn't double-advance." **Mechanism (FR-9):** re-running generation for a date range already fully covered by a prior run, for a given Instance, reproduces the identical set of Activities on the identical dates and does not advance `progressCursor` any further — the walk simply re-derives the same result because both the cursor's starting position and the calendar/budget inputs are unchanged. Re-running for a range that partially extends past previously-generated content continues the walk only for the previously-uncovered portion. The Generation Log (Domain Model §2.10a, written per FR-12 below) is what lets the engine know what was already generated for a given (Instance, date) pair, not just where the cursor currently sits.

**2.4 — Export destination is a swappable back end, mirroring the same pattern already used for Packet Import (Module 2 §2.1).** Drive integration is itself a Management App capability that doesn't yet exist independently of this module. This module specifies the Packet's *content and structure* (§4's requirements below); *where it's written* — a manual file save, a Drive-backed picker, or both — is a swappable acquisition-style front end, with zero effect on aggregation/merge logic. The manual file-save path is kept permanently, even after Drive integration ships — the same standing offline-guarantee fallback as Packet Import's mirror-image case (Architecture Evaluation §1: neither app depends on a network call to function).

**2.5 — Each Course Instance paces independently against its own Pacing Profile; there is no shared cross-instance daily cap.** Domain Model §2.10 step 1 confirms this reading ("walks *every one* of that child's Child Course Instances through its Pacing Profile"): a child with two active Instances can have both contribute Activities to the same School day, each governed only by its own `daysOfWeek[]`/`pacingMode`/budget, never combined into one shared per-day ceiling.

**2.6 — Chores have no `skipDates[]` equivalent.** `skipDates[]` belongs to Pacing Profile (Domain Model §2.9), which is School-only by definition (§2.9's own Rules: "Chore and Family Event are out of scope"). A Chore's `daysOfWeek[]` recurrence (Module 6) has no analogous exclusion mechanism — worth stating plainly here since it would be an easy, wrong assumption to import `skipDates[]` handling into Chore expansion by analogy.

**2.7 — Generation is manually triggered, per (child, date range); no scheduled/automatic generation exists in this module.** The parent explicitly selects a child and a range each time (FR-1). Nothing here proposes a recurring/background generation job — that would be a distinct, larger decision (touching zero-cost/offline constraints, Architecture Evaluation §1) not asked for by any user story.

## 3. User stories

- As a parent, I want to generate the next stretch of work for one of my kids — paced schoolwork, their chores, and any events coming up — in one action, instead of assembling it by hand.
- As a parent, I want a child with only chores and no active coursework to still get a normal packet, so a light week isn't treated as an error.
- As a parent, I want to re-run generation for a range I already sent without it silently double-assigning work my child already has.
- As a parent, I want each day's list to show schoolwork before chores before events, consistently, so my kid's daily view isn't shuffled differently every packet.

## 4. Functional requirements

**FR-1 — Trigger generation.** The parent selects one Child and a date range (`coversFrom` ≤ `coversTo`, both valid calendar dates). This is the generation unit (Domain Model §2.10) — one child, one range, per invocation. A UI may offer batch-selecting several children in one action for convenience, but each child still receives their own independently-generated packet; nothing about generation is shared or merged across children.

**FR-2 — School Activity pacing walk.** For every Course Instance belonging to the selected Child that has a Pacing Profile (Module 5):
- Determine that Instance's School days within the requested range: any date whose weekday is in the Instance's `daysOfWeek[]` and not in `skipDates[]` (§2.2) — same pattern as Chore expansion (FR-3), no anchor or ordering logic needed once it's an explicit set.
- Starting from the Instance's current `progressCursor` (or the beginning of the pacing-walk order — Lessons in `order`, Activities in `Lesson.activities[]` position — if no cursor exists yet, per Module 5 §2.4), assign Activities to each School day in walk order, up to that day's budget:
  - `pacingMode: activityCount` — up to `activitiesPerDay` Activities.
  - `pacingMode: minutesBudget` — Activities whose `expectedDurationMin` (or the 15-minute fallback for Activities missing it, Module 5 §2.3) sum to no more than `minutesPerDay`.
- Advance `progressCursor` to the last Activity assigned (§2.1 — this module is the sole writer).
- If an Instance's content is exhausted before the requested range ends, that Instance simply contributes nothing further for the remaining days — not an error, and no effect on any other Instance or source.

**FR-3 — Chore expansion.** For every Chore belonging to the selected Child, include one occurrence on every date within the requested range whose weekday is a member of that Chore's `daysOfWeek[]` (Module 6) — indefinitely, with no start/end scheduling and no skip-date mechanism (§2.6). Each included occurrence is emitted under its deterministic per-occurrence ID, `CHR-{choreToken}-{YYYYMMDD}`. Determinism is the idempotency mechanism for chores: regenerating an already-covered range re-mints identical IDs, which the child device resolves as refresh-on-pending or no-op under its existing import rules.

**FR-4 — Family Event filtering and fan-out.** Include every Family Event whose `[startDate, endDate]` range (Module 7) overlaps the requested date range **and** whose `childIds[]` includes the selected Child. "Fan-out" (Domain Model §2.10 step 4) is this same per-child filter, naturally re-applied whenever generation runs for a different named child on the same multi-child event — no separate propagation or copy step exists beyond this filter.

**FR-5 — `blockHint` assignment for paced Activities only.** If a contributing Instance's Pacing Profile has a non-empty `blockLayout[]` (Module 5 FR-4), this module cycles through it in order (round-robin, wrapping) to assign a `blockHint` to each newly-paced Activity from that Instance. This is a default only — never enforced, never validated, and always overridden the moment the child uses the Daily Planner's own move-between-blocks action (Child App Module 3, FR-5). Chores use whatever `blockHint` the parent authored directly on the Chore record (Module 6 FR-1), if any — never engine-assigned. Family Events carry no `blockHint` field at all (Domain Model §2.7).

**FR-5a — Stamp interchange-only fields onto every packet entry.** In addition to copying each item's own authored fields (FR-8's "copy every field as currently authored" rule), this module stamps, at export time:
- On every Activity entry: `payload.kind` (`pageRange` | `reference` | `none` | `freeText`), derived from the Activity Type's `structurePattern` and whether the type is canonical or parent-added (Mgmt SRS 03 §8) — a custom `page-range` type still gets `kind: freeText`, since its payload is free text, not structured start/end fields; `courseName`, copied verbatim from the owning Course's `name`; `rewardCategoryId`, resolved from the Activity's `difficultyTier` against Module 2's Tier table.
- On every Chore occurrence: `required: true` (unconditional — see Module 6 §2.7, no parent-facing toggle exists) and `rewardCategoryId`, resolved from the Chore's `difficultyTier` the same way.
These are Packet-format fields, not authored fields — nothing in Modules 3, 6, or 7 needs a new input to produce them; this module computes all four from data it already reads. See Interchange Contract §1a/§1b for the full field lists.

**FR-6 — Fixed merge order.** Within each day of the output Packet, content is ordered School Activities, then Chores, then Family Events as day-level markers (Domain Model §2.10) — this module never reorders or interleaves that sequence differently, regardless of how many items are in each category.

**FR-7 — Empty-source rule.** A valid Packet is generated whenever at least one of the three sources (paced Activities, Chores, in-range Family Events) produces content for the requested (child, range) — a child with active Chores but zero currently-paced Instances still receives a normal packet, not an error or an empty-packet warning.

**FR-8 — Stable IDs preserved, content copied as-authored.** Every Activity, Chore, and Family Event entry in the output Packet carries its Management-side stable `id` unchanged — for Chores, the per-occurrence ID this run mints per FR-3, whose derivation is fixed and reproducible — and its display/payload fields copied as currently authored at generation time — this module does not re-derive, recompute, or transform any field beyond what FR-2/FR-5 explicitly assign (`progressCursor`-driven inclusion, `blockHint` defaulting).

**FR-9 — Idempotent regeneration (§2.3).** Regenerating for a date range already fully covered by a prior generation run, for a given Instance, reproduces the identical Activities on the identical dates and does not advance `progressCursor` further. Regenerating for a range that extends past previously-generated content continues FR-2's walk only for the previously-uncovered portion.

**FR-10 — Export.** The generated Packet is written out in the shape Domain Model §4.1 defines (`schemaVersion: 1`, `childId`/`childName`, `semesterLabel` passthrough, `generatedAt`, `coversFrom`, `coversTo`, `days[]`) for transport to the child device. Per §2.4, the concrete destination (manual file save, Drive-backed export, or both) is a swappable back end this module doesn't fix. The filename follows the locked convention `packet_{childSlug}_{coversFrom}_{coversTo}.json` (Interchange Contract §7) — device-local, zero-padded, lexically sortable; `childSlug` is the child's `name`, lowercased, non-alphanumerics collapsed to `-`. The filename is a convenience only — this module (and Packet Import on the child side) must never parse it to decide behavior; manual file selection is a permanent fallback.

**FR-11 — No Reward Ledger visibility.** This module never reads or writes Reward Ledger data (Architecture Evaluation §5/§11 guardrail 6) — nothing about aggregation, pacing, or export depends on or reports reward balances.

**FR-12 — Write the Generation Log.** Alongside advancing `progressCursor` (FR-2) and writing the exported Packet (FR-10), this module writes one Generation Log row (Domain Model §2.10a) per Activity and Chore occurrence included in the run: `{ childId, instanceId? (Activity rows only), itemId, assignedDate, generatedAt }` — for Chore rows, `itemId` is the occurrence ID minted per FR-3. This is the record Master Reporting's Activity/Chore Roster report reads — `progressCursor` alone only records a walk position, never the per-item dates a given run assigned.

## 5. Validation rules

| Rule | Detail |
|---|---|
| Date range | `coversFrom` ≤ `coversTo`; both required, valid calendar dates. |
| Child | Must reference an existing Child (Module 4). |
| School day determination | Per-Instance: any date whose weekday is in `daysOfWeek[]` and not in `skipDates[]` — same pattern as Chore inclusion, below. |
| Pacing walk order | Lessons in `order`; within a Lesson, Activities in `Lesson.activities[]` position (Module 5 §2.4) — consulted here, not redefined. |
| Minutes-budget fallback | An Activity missing `expectedDurationMin` counts as 15 minutes for budget purposes only (Module 5 §2.3); never written back onto the Activity. |
| Chore inclusion | Every date in range whose weekday is in the Chore's `daysOfWeek[]`; no skip mechanism exists for Chores (§2.6). |
| Family Event inclusion | `[startDate, endDate]` overlaps the requested range, **and** the requesting Child's `id` is present in `childIds[]`. |
| Merge order | School, then Chores, then Family Events — fixed, never varied. |
| Empty-source | Zero content from all three sources is the only condition that produces no packet; any one non-empty source is sufficient. |
| Regeneration | Must not advance `progressCursor` past content already generated for a prior, overlapping run (§2.3/FR-9). |

## 6. Permissions

No *additional* per-action PIN. The Management App's `launchPin` (Domain Model §2.11) gates the whole app once per session; this module adds no further gate.

## 7. Inputs / Outputs

**Inputs:** the selected Child and date range (parent-entered, FR-1); reads Course Instances + their Pacing Profiles (Modules 4/5), Chores (Module 6), Family Events (Module 7), and each contributing Instance's current `progressCursor` — does not write to any of those source tables except `progressCursor` itself (Outputs, below).

**Outputs (written to Management App storage):**
- Advanced `progressCursor` on every Course Instance that contributed at least one paced Activity to this generation run (FR-2/FR-9) — this module is the sole writer of that field anywhere in the system.
- One exported Packet file per generated child (FR-10), in the shape Domain Model §4.1 defines, written to whatever destination §2.4 resolves to.
- One Generation Log row per assigned Activity/Chore occurrence (FR-12) — this module is the sole writer of the Generation Log anywhere in the system.
- No change to any Course Template, Curriculum, Difficulty Tier/Category, Chore, or Family Event *content* — this module reads and aggregates those, and writes only the Packet output, `progressCursor`, and the Generation Log.

## 8. Acceptance criteria

1. Generating for a Child with two active Course Instances, each with its own Pacing Profile, produces a Packet whose School days can include Activities from both Instances on the same date, each governed only by its own budget.
2. A Chore with `daysOfWeek[]` = every day except Saturday produces an occurrence on every date in the requested range except Saturdays, with no reference to any Pacing Profile's `skipDates[]`, each occurrence carrying its own `CHR-{choreToken}-{YYYYMMDD}` ID.
3. A Family Event with a two-child `childIds[]`, generated once per child, appears in both children's packets when each is generated, and in neither if the requested date range doesn't overlap its `[startDate, endDate]`.
4. A Child with active Chores but zero Course Instances still produces a non-empty Packet (FR-7).
5. Within any generated day, School Activities always precede Chores, which always precede Family Events, regardless of counts in each category.
6. Regenerating the same (Instance, date range) a second time, with nothing having changed in between, produces an identical set of Activities on identical dates and leaves `progressCursor` exactly where it already was.
7. An Instance whose content runs out partway through the requested range contributes no Activities for the remaining days, without blocking or erroring generation for that Child's other sources.
8. A Pacing Profile with `pacingMode: minutesBudget` and an Activity missing `expectedDurationMin` includes that Activity using the 15-minute fallback for budget math, without writing any duration value onto the Activity record itself.
9. A Pacing Profile with a non-empty `blockLayout[]` assigns `blockHint` values to its newly-paced Activities by cycling through that list in order; a Chore in the same packet keeps whatever `blockHint` the parent authored on it directly, unaffected by the Instance's `blockLayout`.
10. Every Activity, Chore, and Family Event `id` in a generated Packet exactly matches its Management-side source record's `id` — or, for Chores, the deterministic occurrence ID derived from it — never regenerated or altered by this module beyond that fixed derivation.
11. No Reward Ledger data of any kind is read, referenced, or written anywhere in this module's generation or export flow.
12. Generating a Packet containing 5 Activities and 2 Chores for a child writes 7 Generation Log rows, each carrying the correct `itemId` and its own `assignedDate` — not one summary row for the whole run.
13. Every Activity entry in a generated Packet carries a `payload.kind` matching its Activity Type (a parent-added custom type — any `structurePattern` — always yields `kind: freeText`), plus `courseName` and `rewardCategoryId`; every Chore occurrence carries `required: true` and `rewardCategoryId` — none of these four values ever appears as `null`/absent on an emitted entry.
