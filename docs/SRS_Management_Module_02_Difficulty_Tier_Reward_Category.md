# Software Requirements Specification — Management App
## Module 2: Difficulty Tier & Reward Category Management
*Written against Domain Model §2.3 and §2.5/§2.6 (flat earn-amount rule), Architecture Evaluation §5 (data flow — no ledger-visibility channel) and §11 guardrail 6, Documentation Roadmap §2. Written ahead of Course Template Library because Activity's required `difficultyTier` reference (§2.5) depends on this table existing.*

---

## 1. Purpose

Lets the parent maintain the single, shared Difficulty Tier / Reward Category table used identically by Activity and Chore. This module owns tier authoring, ordering, and the tier-to-category pairing only — it does not own reward *display* (theme-owned, a separate module) or the Reward Ledger itself (earning/spending happens in the Activity & Chore Completion and Reward Economy modules).

## 2. Scope notes

**2.1 — Tier and Category are one action, not two.** The domain model states adding a tier and adding a category are the same action (§2.3). This module exposes a single "add tier" form (label only); the paired Reward Category — `categoryId`, `internalLabel` — is minted automatically and never exposed as a separate CRUD surface.

**2.2 — Delete guard checks Activity/Chore references only, not Reward Ledger data.** **The Management App has no way to see Reward Ledger entries at all.** Per Architecture Evaluation §5 and guardrail 6 (§11), the Management ↔ Child interchange is one-way in each direction with no spend channel and, more fundamentally here, **no ledger-visibility channel** — the Management App never receives Reward Ledger balances or entries under any circumstance, not even via the eventual Completion CSV import (Phase 4), which reconciles completion records, not ledger balances. A guard that checks data the app structurally cannot see is unimplementable. **FR-7 below has no Reward Ledger clause.**

This is safe, not just necessary: reward currency is fungible once earned. Categories never convert into each other (§2.3), but a past `earn` entry doesn't retroactively depend on the tier that produced it — the Reward Ledger only ever stores `categoryId` on its entries, never `tierId` (Domain Model §3.7). Deleting a tier (and its paired category) after the fact doesn't orphan or invalidate any already-recorded Ledger entry's meaning; it only prevents *future* completions from earning into that category, which the Activity/Chore reference check already covers by construction — you can't complete something whose Activity Type or Chore points at a deleted tier, because that reference would already have been caught by this same guard before the tier could be deleted out from under it.

**2.3 — `order` is a managed sequence, not a parent-typed number.** Tiers are reordered via move-up/move-down actions; the underlying `order` value is system-maintained, removing any need for the parent to manage unique rank values by hand.

## 3. User stories

- As a parent, I want a small set of difficulty levels ready on day one, so I can start authoring Activities and Chores immediately without a setup detour.
- As a parent, I want to add a new difficulty level later (e.g., "Very Hard") without disturbing anything already recorded under the existing levels.
- As a parent, I want to be stopped from deleting a difficulty level that's actually in use, so I never end up with an Activity or Chore pointing at nothing.

## 4. Functional requirements

**FR-1 — Seed defaults on first launch.** The app initializes with three tiers: **Easy, Medium, Hard**, in that order, each paired with its own auto-minted Reward Category. This is a one-time seed, not a reset-able default — subsequent changes are the parent's own data.

**FR-2 — Create Tier.** The parent creates a new tier with a `label` (required). On creation, a paired Reward Category (`categoryId`, `internalLabel`) is auto-minted and permanently linked — this pairing is never exposed as a separate step or a separate form.

**FR-3 — Edit Tier label.** A tier's `label` can be renamed at any time. Renaming does not affect its `rewardCategoryId` pairing or any existing Reward Ledger entries, Activities, or Chores referencing it — labels are display text, not identity.

**FR-4 — Reorder tiers.** The parent can move a tier up or down in the list; `order` is recalculated automatically for all affected tiers. This changes display sequence only — it has no effect on the tier-to-category mapping or on anything already recorded against a tier.

**FR-5 — Mapping is immutable once created.** A tier's `rewardCategoryId` is set once, at creation (FR-2), and is never reassignable through this module. There is no "change this tier's category" action anywhere in the UI.

**FR-6 — New tier always pairs with a new category, never reuses one.** Every FR-2 creation mints a fresh `categoryId` — there is no path to attach a new tier's label to an existing category at a different weight.

**FR-7 — Delete, reference-guarded against Activity/Chore only.** A tier can be deleted only if it is referenced by zero Activities and zero Chores anywhere in the Management App's own data. **The guard does not check Reward Ledger data** — the Management App has no visibility into it (§2.2). Attempting to delete a referenced tier is rejected, with a summary of what's blocking it (e.g., "Used by 12 Activities, 3 Chores").

**FR-8 — List / browse.** The parent can view all tiers in their current order, each showing its `label`, for selection when authoring Activities, Chores, or when reviewing Master Reports.

## 5. Validation rules

| Rule | Detail |
|---|---|
| Label required | Non-empty, whitespace-trimmed. |
| Label uniqueness | Not enforced — two tiers with the same label is a parent-authoring choice, not a data-integrity risk, since identity lives in `categoryId`, not `label`. |
| Mapping immutability | `rewardCategoryId` cannot be changed on an existing tier through any UI path. |
| New tier ⇒ new category | Every tier creation mints a new `categoryId`; no UI path attaches a tier to a pre-existing category. |
| Delete guard | Rejected if the tier is referenced by any Activity or Chore. **Reward Ledger data is never checked (§2.2) — not part of this rule, not a silent gap.** |
| Order | System-maintained; no direct parent input, no uniqueness validation needed. |

## 6. Permissions

No *additional* per-action PIN. The Management App requires its own `launchPin` once per session (Domain Model §2.11) — the parent authenticates once at app launch, not per module. This module doesn't add a further gate on top of that.

## 7. Inputs / Outputs

**Inputs:** parent-entered tier label (create, rename); reorder actions (move up/down); on delete, a reference check against Activity and Chore data only.

**Outputs (written to Management App storage):**
- New, renamed, reordered, or deleted Tier + paired Category records.
- No change to any Activity, Chore, Course, or Curriculum data — this module touches the Tier/Category table only, and reads (never writes) Activity/Chore data for the delete-guard check. It never reads Reward Ledger data, because it structurally cannot (§2.2).

## 8. Acceptance criteria

1. On first launch, exactly three tiers exist — Easy, Medium, Hard, in that order — each with its own distinct `categoryId` already paired.
2. Creating a new tier mints a new, never-before-used `categoryId`, visible nowhere as a reusable option for another tier.
3. Renaming a tier's label has no effect on any existing Activity, Chore, or Reward Ledger entry referencing its category.
4. Reordering tiers changes their display order only; re-fetching any tier's `rewardCategoryId` before and after a reorder returns the same value.
5. Attempting to delete a tier referenced by at least one Activity or Chore is rejected, and the blocking references are summarized in the message.
6. Deleting a tier referenced by zero Activities and zero Chores succeeds and removes it (and its paired category) from the list — **regardless of whether any Reward Ledger entries anywhere reference its category**, since that's never checked (§2.2).
7. No UI path anywhere allows changing which category an existing tier maps to.
