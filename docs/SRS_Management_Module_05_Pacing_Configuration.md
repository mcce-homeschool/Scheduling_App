# Software Requirements Specification — Management App
## Module 5: Pacing Configuration
*Written against Domain Model §2.9 (Pacing Profile — primary source, including `daysOfWeek[]` and `pacingMode`), §2.10 (Generated Packet — the consumer of pacing output), §2.4 (Child Course Instance, including `progressCursor`), §2.5 (Activity — `expectedDurationMin`, `sequenceNumber`), §2.8 (Lesson — `order`, and the distinct Content Planning fields), Architecture Evaluation §4/§8/§12, Documentation Roadmap §3/§4/§8, and SRS Management Module 04 (Child Management — the stamping action this module's setup step follows).*

---

## 1. Purpose

Lets the parent configure how one Child Course Instance's Activities get distributed across days — the input the (not-yet-written) Packet Generation module consults on every run. This module owns the Pacing Profile itself: its fields, validation, and edit lifecycle. It does not perform generation, does not touch Chores or Family Events (out of scope for pacing entirely — Domain Model §2.9), and does not decide *what* Activities exist (Course Template Library, Module 3) or *which* Instance they belong to (Child Management, Module 4).

## 2. Scope notes

**2.1 — `progressCursor` (Child Course Instance, Domain Model §2.4).** A pointer to the last Activity (by stable `id`) included in a Generated Packet for this Instance, in pacing-walk order (§2.4 below). A fresh Instance starts with no cursor (nothing paced yet). **This module reads `progressCursor` for display only (FR-8) — it is written exclusively by Packet Generation (Management SRS Module 08), never by this one.**

**2.2 — `pacingMode` (Pacing Profile, Domain Model §2.9).** Every Pacing Profile has exactly one `pacingMode` — `activityCount` or `minutesBudget` — chosen at setup, changeable later (§2.9's "adjustable through the semester" already covers this).

**2.2a — `daysOfWeek[]`.** A Pacing Profile carries a required, non-empty subset of `{Sun, Mon, Tue, Wed, Thu, Fri, Sat}`, no duplicates — the same shape and validation already established for Chore (Management SRS Module 06 §2.1). This is what tells the (future) generation engine which specific weekdays a Profile's days fall on, rather than leaving it to infer an anchor day from a bare count.

**2.3 — Minutes-budget fallback duration, a working assumption.** Under `minutesBudget` mode, the (future) generation engine needs a duration per Activity to know when a day's budget is spent — but `expectedDurationMin` is optional on Activity (§2.5) and may be absent. **Assumption applied:** an Activity missing `expectedDurationMin` is treated as **15 minutes** for budget-consumption purposes only; this never writes a value back onto the Activity itself, it's a generation-time fallback. Flag if you'd rather use a different default, or block `minutesBudget` mode entirely until every Activity in the Instance has a real duration set.

**2.4 — Pacing walk order, a working assumption (not specified anywhere in the Domain Model).** Nothing in §2.4/§2.5/§2.8 states the order Activities get consulted for pacing. **Assumption applied:** Lessons are walked in `order` (Course §2.8), and within each Lesson, Activities are walked in their authored array position (`Lesson.activities[]`, i.e. creation/import order) — no separate per-Activity order field exists to consult instead. This governs pacing consumption order only; it has no effect on the Daily Planner's own child-facing reorder capability (Child App Module 3, cosmetic and independent).

**2.5 — `weighting` remains an unspecified, open field — this module does not implement it.** Domain Model §2.9 lists `weighting` as an optional field with no defined shape, and no user story anywhere has asked for one yet. Same treatment as the still-open custom Activity Type payload shape (Domain Model §6 item 4): the field name is reserved, but this module builds no mechanics around it. Flag if you want this scoped now instead of left open.

**2.6 — Pacing Profile setup is the natural companion step to Module 4's stamping action.** Domain Model §2.9 states a Pacing Profile is "set at instance creation" — meaning a freshly-stamped Instance (Module 4 FR-4) isn't really usable by generation until this module's setup also runs. Module 4's FR-4 flags pacing setup as the required next step. This module treats "Instance exists with no Pacing Profile yet" as a valid, expected transient state (not an error) — the parent completes pacing setup as the very next step in the same flow, but nothing here assumes it happens atomically.

**2.7 — Deleting an Instance (Module 4 FR-6) implicitly deletes its Pacing Profile too.** A Pacing Profile is 1:1 with its Instance and has no independent existence; this module offers no separate "delete Pacing Profile" action. Module 4's FR-6 and §7 Outputs state the cascade explicitly.

## 3. User stories

- As a parent, I want to tell the app how many days a week and how much work per day my child should get, so their daily plan feels appropriately paced, not overwhelming.
- As a parent, I want to exclude specific dates (holidays, trips) from pacing without having to touch `daysOfWeek[]` itself.
- As a parent, I want to adjust the pace mid-semester without it silently rewriting work my child has already been assigned.
- As a parent, I want to see at a glance how far along an Instance's content has already been paced.

## 4. Functional requirements

**FR-1 — Create Pacing Profile.** Set up immediately after (or as part of the same flow as) stamping a Course to a Child (Module 4 FR-4, §2.6). Required: `daysOfWeek[]` (§2.2a — a non-empty subset of Sun–Sat, same shape as Chore's field), `pacingMode` (§2.2) with its corresponding budget value (`activitiesPerDay` if `activityCount`, `minutesPerDay` if `minutesBudget`), `startDate`.

**FR-2 — Edit Pacing Profile.** Any field can be changed at any time through the semester. Per Domain Model §2.9's own rule, an edit affects only *future* generation — everything already paced into a Generated Packet up to the current `progressCursor` (§2.1) is untouched; this module does not attempt to retroactively re-pace or recall anything already generated.

**FR-3 — Skip dates.** The parent may add or remove specific calendar dates (`skipDates[]`) excluded from generation for this Instance, independent of the `daysOfWeek[]` pattern (e.g., a holiday that happens to fall on an otherwise-scheduled day).

**FR-4 — Block layout (optional, advisory).** The parent may optionally set an ordered list of block labels (`blockLayout`) that the future generation engine can cycle through when assigning a generated Activity's `blockHint`. Purely a default-assignment convenience — never enforced, never validated against anything the child later does with it (the Daily Planner's own move-between-blocks action, Child App Module 3, always wins). **`blockLayout` should use only the four canonical block labels** — `morning`, `afternoon`, `evening`, `night` (Interchange Contract §1d). On the child device the block **is** the outer grouping axis of the Today view (Domain Model §3.4), so a label outside the four is not rejected but is not honored either: the child displays that item under `morning`. (This supersedes the earlier note that `blockHint` was "unused for ordering anywhere in the system" — that was true of the Packet's array order, and remains so, but is not true of the child's display.)

**FR-5 — Weighting field reserved, not implemented (§2.5).** The Pacing Profile form may show a placeholder/reserved spot for `weighting`, but no behavior is built around it in this module.

**FR-6 — Mode-specific validation.** `activityCount` mode requires a positive-integer `activitiesPerDay`. `minutesBudget` mode requires a positive-integer `minutesPerDay`; Activities without their own `expectedDurationMin` fall back to the 15-minute assumption (§2.3) for budget purposes only, never writing that value onto the Activity.

**FR-7 — One Profile per Instance, no independent delete.** A Pacing Profile is created once per Instance (FR-1) and edited thereafter (FR-2) — this module has no "delete Pacing Profile" action separate from deleting the Instance itself (Module 4 FR-6/FR-7, which cascades the Profile — §2.7).

**FR-8 — Progress display (read-only).** The parent can view, for a given Instance, how far pacing has progressed — e.g., "12 of 40 Activities paced" — derived from `progressCursor` (§2.1) against the Instance's total Activity count in pacing-walk order (§2.4). This module never writes `progressCursor`; it is advanced exclusively by the future Packet Generation module.

## 5. Validation rules

| Rule | Detail |
|---|---|
| `daysOfWeek[]` | Required; non-empty subset of {Sun, Mon, Tue, Wed, Thu, Fri, Sat}; no duplicates. Same shape and validation language as Chore's field (§2.6). |
| `pacingMode` | Required; exactly one of `activityCount` \| `minutesBudget` (§2.2). |
| `activitiesPerDay` | Required if `pacingMode: activityCount`; positive integer. |
| `minutesPerDay` | Required if `pacingMode: minutesBudget`; positive integer. |
| `startDate` | Required; valid calendar date. |
| `skipDates[]` | Each entry a valid calendar date; duplicates ignored, not rejected. |
| `blockLayout` | Optional; if provided, a non-empty ordered list of labels — never validated against anything the child does downstream. |
| `weighting` | No validation — field not implemented (§2.5). |
| `progressCursor` | Never written or validated by this module — read-only display dependency (§2.1/FR-8). |

## 6. Permissions

No *additional* per-action PIN. The Management App's `launchPin` (Domain Model §2.11) gates the whole app once per session; this module adds no further gate.

## 7. Inputs / Outputs

**Inputs:** parent-entered Pacing Profile fields (create/edit); reads the target Instance's Activity set and `progressCursor` (for FR-8's display) — does not write to either.

**Outputs (written to Management App storage):**
- New or updated Pacing Profile fields, scoped to one Instance.
- No change to any Course, Lesson, Activity, Curriculum, Chore, Family Event, or Child data. No write to `progressCursor` under any circumstance — that remains the future Packet Generation module's responsibility alone.

## 8. Acceptance criteria

1. Creating a Pacing Profile with `pacingMode: activityCount` succeeds when `activitiesPerDay`, `daysOfWeek[]`, and `startDate` are all provided; omitting `minutesPerDay` in this mode is not an error.
2. Creating a Pacing Profile with `pacingMode: minutesBudget` succeeds when `minutesPerDay`, `daysOfWeek[]`, and `startDate` are all provided; omitting `activitiesPerDay` in this mode is not an error.
3. Editing any Pacing Profile field never alters `progressCursor` or anything already paced into a prior Generated Packet.
4. Adding a date to `skipDates[]` excludes that date from future generation without changing `daysOfWeek[]` or any other field.
5. An Instance with no Pacing Profile yet is not treated as an error state by this module — it's a valid, expected step between stamping (Module 4) and pacing setup (this module).
6. The progress display (FR-8) reflects `progressCursor` accurately and is never editable from this module's UI.
7. No mechanism anywhere in this module allows deleting a Pacing Profile independent of deleting its Instance.
