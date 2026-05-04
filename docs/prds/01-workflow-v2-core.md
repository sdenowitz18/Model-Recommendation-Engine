# PRD 01 — Workflow V2 as Core Experience

**Last updated:** May 4, 2026
**Status:** 🔨 In Progress

---

## Overview

The V2 workflow introduced a "Choose Your Adventure" path selection after School Context, letting users define recommendations for their whole CCL program (Path A) or for a specific learning experience they are designing (Path B). The team has validated the direction and this epic covers integrating V2 as the single primary workflow, retiring V1.

---

## Requirements (Built)

- **Path picker** — after completing School Context (Step 1), users choose between Path A (whole CCL program) and Path B (specific experience). Choice persists to `stepData.designScope`.
- **Path A flow** — School Context → Upload Documents → Aims for Learners → Practices → System Elements → Model Preferences → Decision Frame → Recommendations → Model Exploration
- **Path B flow** — School Context → Define Experience (4 sub-screens: Upload, Details, Additional Practices, Prioritized Practices) → Aims for Learners → System Elements → Model Preferences → Decision Frame → Recommendations → Model Exploration
- **Progressive header disclosure** — step chevrons only reveal after path selection; before that, only School Context and the path picker pill are shown
- **Data key compatibility** — V2 writes to the same `stepData` keys as V1 (e.g., `stepData["3"].selected_practices`) so the recommendation engine works unchanged
- **V2-specific data** — path choice (`stepData.designScope`) and experience metadata (`stepData.experience`) stored under new top-level keys that don't conflict with V1 keys
- **Sessions page** — new sessions default to V2; existing sessions have a "v2" button to open in V2 UI
- **Full-screen typeform-style steps** — all steps in V2 use full-screen questionnaire panels (no split AI chat panel per step)
- **Voice recording** — `useTalkItOut` hook wired into Experience, Aims, Practices, and System Elements steps
- **Reset** — resetting a session wipes all data including `designScope`; user re-picks path from scratch
- **No mid-session path switch** — once a path is chosen, users cannot change it; they must delete the session and start over

---

## Open Requirements

- **Unify URL routing** — currently V2 sessions use `/ccl-v2/:sessionId` and V1 sessions use `/ccl/:sessionId`. All sessions should use `/ccl/:sessionId` pointing to the V2 workflow component. V1 sessions can be deleted; no migration needed.
- **Remove V1 routing and UI artifacts** — retire `Workflow.tsx` (V1), remove the "v2" beaker button from session cards, remove the v1/v2 workflow version picker from the new session dialog
- **Fix session progress display for Path B** — the sessions list uses a hardcoded `TOTAL_STEPS = 8` and "Step X of 8" label. Path B has one fewer distinct step (no standalone Practices step). Progress display and step labels should account for the active path.
- **Label consistency** — Step 1 should be consistently labeled "School Context" everywhere (header chevrons, sessions list, transition pages)
- **"Back" behavior from path picker** — currently there is no way to return to the path picker after selection. The chevron pill for path picker should not be clickable after a path is chosen (already the case). Confirm this is intentional in any user-facing copy.

---

## Out of Scope

- Multi-user collaboration on a single session
- Branching within a path (sub-paths)
- Saving multiple path selections per session
