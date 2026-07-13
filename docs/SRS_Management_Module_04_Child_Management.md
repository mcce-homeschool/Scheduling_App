# Software Requirements Specification — Management App
## Module 4: Child Management
*Written against Domain Model §2.1 (Child — including the two-tier deletion guard), §2.4 (Course — template/instance split, including `progressCursor`), §1 (the central modeling decision — stamping regenerates Activity IDs, no propagation), §2.5 (Activity ID scheme, `instanceToken`), §2.9 (Pacing Profile — its dependency on this module's stamping action, §2.5/§2.6 below), §5.1 (no-propagation tradeoff), Architecture Evaluation §4/§5/§8, Documentation Roadmap §3/§8 item 1.*

---

## 1. Purpose

Lets the parent add and maintain Child records, and assign (stamp) Course Templates to a specific child, producing an independent Child Course Instance. This module owns the *Child entity itself* and the *stamping action* — it does not own Course/Lesson/Activity authoring (Course Template Library, Module 3), pacing (Pacing Configuration), or anything Chore/Family-Event-related (their own authoring modules).

## 2. Scope notes

**2.1 — Archivable-as-template remains open; this module does not attempt it.** "Can a diverged Child Course Instance be promoted back into the library?" is a real, acknowledged open question (Domain Model §6 item 1 / Roadmap §8 item 1). No promote-instance-to-template capability exists anywhere in this module. It stays tracked as open in the Domain Model/Roadmap until a future module or the TDS takes it up.

**2.2 — Child deletion is a two-tier guard.**
- **Tier 1 — hard block while any Course Instance exists.** A Child cannot be deleted while stamped Course Instances still belong to them, full stop. The parent must remove each instance first (§2.3, FR-6) — no override, no forced cascade past this point.
- **Tier 2 — warn-and-confirm-export, then cascade.** Once zero Course Instances remain, deleting the Child surfaces an explicit warning that this permanently removes the Child's remaining Management-side data (Chores, Family Events, Pacing history), and asks the parent to confirm they've already exported/backed up anything they want to keep (Master Reports, once that module exists; today, this is simply an honesty checkpoint, not a system-verified check — the Management App cannot verify an export actually happened). Only after that explicit confirmation does deletion cascade.

**2.3 — This module owns deleting/un-assigning a Course *Instance*, distinct from Module 3's Course *Template* deletion.** Module 3's FR-2 covers deleting a Course **Template** from the library — explicitly unguarded, since instances are independent copies. That's a different action from removing a specific Child's **Instance**, which is inherently child-scoped and therefore belongs here, alongside the assignment action that creates it in the first place (FR-4/FR-6 below). Deleting a Template (Module 3) never touches any instance; deleting an Instance (this module) never touches the Template it was stamped from.

**2.4 — Deleting a Course Instance cannot recall anything already delivered to the child device.** Per the one-way interchange (Architecture Evaluation §5/§6, guardrail 6), a Packet already exported to a child's device is gone — there is no bidirectional sync to un-send it. Deleting the Instance here stops **future** packet generation from it; any already-delivered content, and any Activity Records the child has already produced against it, are unaffected on the child's device and simply become unmatched-by-source on the Management side (consistent with the accepted handling of a since-deleted template's `sourceTemplateId`, Module 3 §2.4, and of unmatched Completion CSV rows generally, Domain Model §4.3).

**2.5 — Stamping (FR-4) has a required next step this module doesn't itself perform.** Domain Model §2.9 states a Pacing Profile is "set at instance creation," meaning a freshly-stamped Instance isn't actually usable by generation until pacing is configured too. This module doesn't own that step — Module 5 does — but FR-4 below is explicit that pacing setup is the expected immediate next action, so a parent (or an AI session building the UI later) doesn't treat stamping alone as "done."

**2.6 — Deleting a Course Instance (FR-6) cascades its Pacing Profile.** A Pacing Profile has no independent existence apart from its Instance (Module 5 has no "delete Pacing Profile" action of its own). FR-6 and §7's Outputs below state this explicitly.

## 3. User stories

- As a parent, I want to add a new child to the system once, so I can start assigning coursework to them.
- As a parent, I want to stamp a Course template to a specific child and get an independent copy I can pace and adjust just for them.
- As a parent, I want to be stopped from accidentally deleting a child who still has active coursework assigned.
- As a parent, I want a clear warning — not a silent wipe — before permanently removing a child's remaining data.

## 4. Functional requirements

**FR-1 — Create Child.** The parent creates a Child with `name` (required). Optional fields: `gradeLabel` (parent record-keeping only — distinct from, and unaffected by, the Child App's own cut `gradeLabel`, Domain Model §0/§3.1/§3.2), `notes`, `themeHint` (advisory only — never binding on the Child App's fully ungated theme selection, Domain Model §3.9 / SRS Module 10).

**FR-2 — Edit Child.** Any field on an existing Child can be edited freely at any time.

**FR-3 — List / browse Children.** The parent can view all Children, each showing at minimum `name`, for selection when assigning Courses or authoring Chores/Family Events elsewhere.

**FR-4 — Assign (stamp) a Course to a Child.** The parent selects an existing Course Template and a Child. This creates a new **Child Course Instance**: a full independent copy of the template's Lessons/Activities, tagged with `childId` and `sourceTemplateId`, with every Activity ID regenerated using a freshly minted `instanceToken` (Domain Model §1/§2.5). No propagation link to the template exists after this moment beyond `sourceTemplateId`'s provenance value. **A newly-stamped Instance has no Pacing Profile yet (§2.5) — this module surfaces Pacing Configuration (Module 5) as the required immediate next step, without itself owning that setup.**

**FR-5 — List a Child's Course Instances.** The parent can view every Course Instance currently stamped to a given Child, including which template each came from (`sourceTemplateId` — displayed as "template no longer available" if that template has since been deleted, matching Module 3 §2.4).

**FR-6 — Un-assign / delete a Course Instance.** The parent can permanently remove a single Course Instance from a Child. Requires an explicit confirmation step (destructive — stops all future pacing/generation from this instance). Per §2.4, this has no effect on content already delivered to the child's device or on any Activity Records the child has already produced against it. **This also removes the Instance's Pacing Profile (§2.6) — a Profile has no existence independent of its Instance, and Module 5 offers no separate deletion path for it.**

**FR-7 — Delete Child, Tier 1 (hard block).** Attempting to delete a Child who has one or more Course Instances currently assigned (FR-5) is rejected outright, listing the blocking instances. The parent must remove each one (FR-6) before Child deletion becomes possible. No override path exists.

**FR-8 — Delete Child, Tier 2 (warn, confirm, cascade).** Once a Child has zero Course Instances, attempting to delete them surfaces a warning describing what will be permanently removed (the Child record itself, and any remaining child-scoped data — Chores, Family Events, Pacing history) and asks the parent to explicitly confirm they've already exported or backed up anything they want to keep. Only on that explicit confirmation does the system cascade-delete the Child and all remaining child-scoped Management data.

## 5. Validation rules

| Rule | Detail |
|---|---|
| Child name | Non-empty, whitespace-trimmed. |
| Course assignment | Must reference an existing Course Template (`state: template`) and an existing Child; produces one new Instance per assignment, never edits an existing one. |
| Instance deletion | Requires explicit confirmation; irreversible; does not touch the source template or any child-device data. |
| Child deletion — Tier 1 | Rejected outright if any Course Instance references this `childId`; no partial or forced delete. |
| Child deletion — Tier 2 | Only reachable once zero Course Instances remain; requires explicit export/backup confirmation before cascading. |
| Archive-as-template | No such capability exists in this module (§2.1) — not a validation gap, a deliberate absence. |

## 6. Permissions

No *additional* per-action PIN. The Management App requires its own `launchPin` once per session (Domain Model §2.11) — the parent authenticates once at app launch, not per module. This module doesn't add a further gate on top of that.

## 7. Inputs / Outputs

**Inputs:** parent-entered form data (Child create/edit fields); a selected Course Template + Child pairing for assignment (FR-4); reads the Course Template Library (Module 3) to validate the template exists — does not write to it.

**Outputs (written to Management App storage):**
- New, updated, or deleted Child records.
- New Child Course Instances (full copies, regenerated Activity IDs) on assignment (FR-4).
- Deleted Course Instances, along with their Pacing Profile (FR-6, §2.6).
- On a Tier 2 Child deletion (FR-8): cascade-deletion of the Child record and any remaining Chores, Family Events, and Pacing history scoped to that `childId`.
- No change to any Course *Template*, Curriculum, or Difficulty Tier/Category data — this module touches Child records and Child Course Instances only.

## 8. Acceptance criteria

1. Creating a Child with only a `name` succeeds; all optional fields are absent without error.
2. Assigning a Course Template to a Child produces a new Instance whose Activity IDs are all distinct from the template's and from any other Instance ever stamped from that template.
3. Editing a Course Template after it has been stamped to a Child has no effect on that Child's already-created Instance.
4. Deleting a Course Instance requires an explicit confirmation step and does not alter or delete the source template; its Pacing Profile is removed along with it, leaving no orphaned Profile behind.
5. Attempting to delete a Child who has at least one Course Instance is rejected outright, and the blocking instance(s) are named in the message.
6. Deleting a Child with zero Course Instances surfaces a warning and requires an explicit export/backup confirmation before anything is removed.
7. Confirming a Tier 2 deletion removes the Child record and all remaining Chores/Family Events/Pacing data scoped to that child; nothing is removed before that confirmation is given.
8. No UI path anywhere in this module offers to promote a Course Instance back into the Course Template library (§2.1).
