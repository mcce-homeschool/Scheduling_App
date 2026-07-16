# Software Requirements Specification — Management App
## Module 7: Family Event Authoring
*Written against Domain Model §2.7 (Family Event — primary source, including `startDate`/`endDate`), §3.5b (Family Event as received, Child App side, including `startDate`/`endDate`), §2.10 (Generated Packet — date-range overlap filter and multi-child fan-out), §4.2 (Completion CSV — Family Events never produce rows), Architecture Evaluation §4/§8, Documentation Roadmap §3, and Child App Modules 3/5/9 (Daily Planner, Deferment/Waive, Wipe — all treat Family Events as display-only and non-completable).*

---

## 1. Purpose

Lets the parent author standalone, dated reminders — birthdays, appointments, trips — visible on the Child App's calendar/daily views for one or more children, with no completion concept whatsoever (Domain Model §2.7). This module owns Family Event records only: create, edit, delete. It does not touch Course/Lesson/Pacing/Activity/Chore in any way, and does not own Chore Authoring (Module 6, a separate standalone module).

## 2. Scope notes

**2.1 — A Family Event always carries `startDate` and `endDate`**, inclusive on both ends. A single-day event simply sets `startDate = endDate`. Nothing else needs a distinct code path — the (future) Packet Generation module's date-range overlap test (Domain Model §2.10, "filters every Family Event touching that child by date-range overlap") assumes a range to compare against, which this field shape supports directly.

**2.2 — `childIds[]` is a non-empty multi-select, not a single reference.** Domain Model §2.7/§2.10 already anticipates this and defines the fan-out behavior (a multi-child event is copied into each named child's individual packet) — this module just authors the list correctly: `childIds[]`, minimum one entry, each resolving to an existing Child (Module 4).

**2.3 — No recurrence mechanism for Family Events — each occurrence is its own record.** Unlike Chore's `daysOfWeek[]` (Module 6), nothing in the Domain Model gives Family Event a repeat pattern, and no user story has asked for one (e.g., a weekly piano lesson would need a new record authored for each occurrence, or a range spanning the whole season if it's being treated as one continuous "reminder block" rather than discrete lessons). Flag if you want a recurring Family Event; not something inferred here.

**2.4 — No bulk import; manual CRUD only, same volume reasoning as Chores (Module 6 §2.2).** A semester's worth of family events — birthdays, appointments, trips — is realistically a short list per child, not hundreds. Manual CRUD only.

**2.5 — Family Event ID format is locked: `EVT-{eventToken}`, 2 segments, minted once at authoring.** Same delimiter and segment rules as every other ID in the system (Interchange Contract §4): `-` delimiter, alphanumeric-only segments. `EVT` is a reserved prefix — Module 03's validation already blocks `courseCode`/`lessonCode` from taking `CHR` or `EVT` — so Family Event IDs can never collide with either the Activity ID scheme or the Chore ID scheme. This module mints `eventToken` once, at creation, the same pattern Chore Authoring uses for `choreToken` (Module 6 §2.4).

**2.6 — Family Event deletion has strictly lower stakes than Chore or Course Instance deletion.** A Family Event never produces an Activity Record, a Completion CSV row, or a Reward Ledger entry (Domain Model §2.7, explicit). Deleting one therefore has **zero data-integrity cascade to worry about** — there's no "unmatched history" concern the way there is for a deleted Chore or Course Instance (Modules 4/6 §2.4/§2.5), because nothing else in the system ever references a Family Event's `id` in the first place. A lightweight confirmation step is still worthwhile (it may be a reminder the family cares about and typed once), but it exists for user-error protection only, not data-safety.

**2.7 — `time` is optional, display-only, and unvalidated against span length.** Domain Model §2.7/§3.5b lists `time` as optional with no further constraint. This module treats it as a plain, freeform display value shown alongside the event (e.g., "3:00 PM") — most naturally meaningful for a single-day event (`startDate = endDate`), but not blocked or specially validated for a multi-day span either. No end-time field, no duration modeling — matching the same restraint already exercised for Activity Record's cut `actualStart`/`actualFinish`, Domain Model §0/§3.6.

## 3. User stories

- As a parent, I want to add a birthday, doctor's appointment, or trip once, so it shows up on my child's calendar without them needing to track it themselves.
- As a parent, I want a multi-day trip to show up across every day it spans, not just its first day.
- As a parent, I want to add one event that shows up for more than one of my kids, without authoring it twice.
- As a parent, I want removing an event I made by mistake to be simple, since nothing else in the app depends on it.

## 4. Functional requirements

**FR-1 — Create Family Event.** The parent creates a Family Event with `title`, `startDate`, `endDate` (§2.1 — equal for a single-day event, `startDate ≤ endDate` otherwise), and `childIds[]` (non-empty, §2.2). Optional: `notes`, `time` (§2.7).

**FR-2 — Edit Family Event.** Any field can be changed at any time. Per the one-way interchange (Architecture Evaluation §5/§6), an edit affects only *future* packet generation — any copy already delivered to a child's device is unaffected and cannot be recalled or updated remotely.

**FR-3 — Delete Family Event.** The parent can permanently remove a Family Event. A lightweight confirmation step applies (§2.6) — user-error protection only, since no other record in the system ever references this event's `id`.

**FR-4 — List / browse Family Events.** The parent can view all Family Events, filterable by child, showing at minimum `title`, `startDate`–`endDate`, and the list of children it applies to.

**FR-5 — No recurrence mechanism (§2.3).** This module offers no "repeat weekly/monthly" option. A recurring real-world event is represented either as one record per occurrence, or as a single date-range event, at the parent's discretion — this module doesn't distinguish or enforce either interpretation.

**FR-6 — `childIds[]` must resolve.** Every entry in a Family Event's `childIds[]` must reference an existing Child (Module 4). No on-the-fly Child creation from this module.

**FR-7 — No completion concept.** A Family Event authored here never produces an Activity Record, a Completion CSV row, or a Reward Ledger entry, under any circumstance (Domain Model §2.7) — this module introduces no mechanism that would create one.

## 5. Validation rules

| Rule | Detail |
|---|---|
| `title` | Non-empty, whitespace-trimmed. |
| `startDate` / `endDate` | Both required, valid calendar dates; `startDate` ≤ `endDate`. Equal values represent a single-day event (§2.1). |
| `childIds[]` | Required; non-empty; every entry must reference an existing Child (Module 4). |
| `time` | Optional; freeform display value; no format or span-length validation (§2.7). |
| Delete | Lightweight confirmation only — no data-integrity guard needed (§2.6). |
| Bulk import | Not offered — manual CRUD only (§2.4). |
| Recurrence | Not offered — each occurrence is its own record (§2.3/FR-5). |

## 6. Permissions

No *additional* per-action PIN. The Management App's `launchPin` (Domain Model §2.11) gates the whole app once per session; this module adds no further gate.

## 7. Inputs / Outputs

**Inputs:** parent-entered form data (Family Event create/edit/delete); reads the Child table (Module 4, for `childIds[]` selection) — does not write to it.

**Outputs (written to Management App storage):**
- New, updated, or deleted Family Event records, each tagged with one or more `childId`s.
- No change to any Course, Lesson, Activity, Chore, Curriculum, or Difficulty Tier/Category data — this module touches the Family Event table only.

## 8. Acceptance criteria

1. Creating a Family Event with `startDate` equal to `endDate` succeeds and represents a single-day event.
2. Creating a Family Event with `startDate` before `endDate` succeeds and represents a multi-day span.
3. Creating a Family Event with `startDate` after `endDate` is rejected.
4. Creating a Family Event with an empty `childIds[]` is rejected; one with two or more children succeeds and is available for fan-out to each (Domain Model §2.10, a different module's concern to actually execute).
5. Editing any field of an existing Family Event never alters a copy already delivered to a child's device.
6. Deleting a Family Event requires only a lightweight confirmation, with no dependent-data check of any kind (§2.6) — contrast with Chore or Course Instance deletion (Modules 4/6), which do carry such checks.
7. No UI path in this module offers a recurrence/repeat option or a bulk/CSV import option.
