# Transcend Model Recommendation Engine — Roadmap

**Last updated:** May 4, 2026

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete |
| 🔨 | In Progress |
| 🔜 | Next Up |
| 📋 | Planned |
| 💡 | Backlog (future state, not yet scoped) |

---

## Epic Overview

| # | Epic | Status | PRD |
|---|------|--------|-----|
| 1 | Workflow V2 as Core | 🔨 | [prd-01](prds/01-workflow-v2-core.md) |
| 2 | School Context & Path Selection | 🔨 | [prd-02](prds/02-school-context-path-selection.md) |
| 3 | Document Upload & Prefill | 🔨 | [prd-03](prds/03-document-upload-prefill.md) |
| 4 | Recommendations Engine | 🔨 | [prd-04](prds/04-recommendations-engine.md) |
| 5 | Model Exploration & AI Chat | 📋 | [prd-05](prds/05-model-exploration-ai-chat.md) |
| 6 | Auth & Session Management | ✅ | [prd-06](prds/06-auth-sessions.md) |
| 7 | Admin & Knowledge Base | ✅ | [prd-07](prds/07-admin-knowledge-base.md) |

---

## Phase 1 — V2 as Core (Current Sprint)

These items must be completed before V2 is treated as the primary experience.

- 🔜 Unify URL routing: `/ccl-v2/:sessionId` → `/ccl/:sessionId`
- 🔜 Remove V1 sessions and V1 routing (`/ccl/:sessionId` old Workflow.tsx)
- 🔜 Remove beaker "v2" button and workflow version picker from Sessions page
- 🔜 Move document upload to after School Context in Path A (currently the first step)
- 🔜 Add `experience_summary` auto-generation to the prefill pipeline
- 🔜 Add primary practice prefill detection for Path B
- 🔜 Fix session progress display for Path B (currently shows V1 step count logic)

## Phase 2 — Recommendations Refinement

- 📋 Add `primary_practice` column to models database table
- 📋 Filter Path B recommendations by `primary_practice` match
- 📋 Ensure models without a primary practice are excluded from Path B results
- 📋 Validate that Path B recommendation output still uses outcomes/leaps/practices/system elements scoring on top of the filter

## Phase 3 — Model Exploration Enhancement

- 📋 Guided topic-based AI chat in Model Exploration step
- 📋 Topic tabs: Outcomes, LEAPs, Practices, System Elements, Implementation
- 📋 Per-topic guided question flow using user's session data + web search
- 📋 See [prd-05](prds/05-model-exploration-ai-chat.md) for full open requirements

## Phase 4 — Admin & Configuration

- 📋 DB-configurable scoring rules (currently hardcoded in `server/recommendation-engine.ts`)
- 📋 DB-configurable workflow questions (for environment promotion without reconfiguration)
- 📋 See [prd-07](prds/07-admin-knowledge-base.md) for details

## Future — Additional Model Categories

- 💡 Math models workflow
- 💡 Whole Child models workflow
- 💡 COMP3 models workflow
- 💡 Each would follow the same Path A / Path B pattern with domain-specific taxonomy

## Future — Auth Enhancements

- 💡 Forgot password / password reset flow
- 💡 See [backlog](backlog/future-ideas.md) for details
