# Transcend Model Recommendation Engine — Handoff Document

**Last updated:** May 4, 2026
**Project:** Transcend CCL Model Recommendation Assistant
**Repo:** `sdenowitz18/Model-Recommendation-Engine` (GitHub)
**Local path:** `/Users/stevendenowitz/Downloads/Transcend/model-rec-engine` (moving to `/Users/stevendenowitz/coding-projects/model-rec-engine`)
**Dev server:** `http://localhost:5001` (PORT set in `.env`)

---

## READ THIS FIRST — What We're Working On Right Now

The V2 workflow (Path A / Path B "Choose Your Adventure") has been validated with the team and is being integrated as the **primary core experience**. The following items are the immediate next steps. Read through all of them before starting work — they are interconnected.

### Immediate Next Up

1. **Unify URL routing** — all sessions should use `/ccl/:sessionId` pointing to `WorkflowV2.tsx`. Currently V2 sessions use `/ccl-v2/:sessionId`. Update `App.tsx` to route `/ccl/:sessionId` to `WorkflowV2` and retire the `/ccl-v2/` route.

2. **Remove V1 artifacts** — once routing is unified:
   - Delete or archive `client/src/pages/Workflow.tsx` (the old V1 workflow, ~9,000+ lines)
   - Remove the "v2" beaker button (`<Beaker>`) from session cards in `Sessions.tsx`
   - Remove the "Workflow version" v1/v2 picker from the new session dialog in `Sessions.tsx`
   - All new sessions navigate to `/ccl/:sessionId`

3. **Delete existing V1 sessions** — existing sessions in the database that were created before V2 are not compatible with the new unified routing. The plan is to delete them and start fresh. No migration needed — just a one-time DB wipe of existing sessions and their associated workflow data.

4. **Move document upload in Path A** — in Path A (whole CCL program), the Upload Documents step currently appears as Step 0 (before School Context). This needs to change: **upload should happen after School Context (Step 1)**, as Step 1.5 or as the first step that appears after School Context is confirmed and the path picker selects Path A. The upload step then leads to Aims for Learners (Step 2). Look at `WorkflowV2.tsx` around `handleAdvanceFromPathADocuments` and `V2_STEPS_PATH_A` to understand current behavior.

5. **Add `experience_summary` to the prefill pipeline** — the prefill route (`server/routes.ts`, search for `prefillFromDocuments`, ~line 1065) extracts leaps, outcomes, and practices from uploaded documents. It should also generate a short `experience_summary` string and write it to `stepData["3"].experience_summary`. Currently the UI shows a placeholder "AI-generated summary will appear here" with no backend generation.

6. **Add primary practice detection to Path B prefill** — when prefilling in Path B, the pipeline should attempt to identify the primary practice described in the uploaded documents and suggest it in `stepData.experience.primaryPractices`. This is a suggestion only — the user can override it in the Experience Details form.

7. **Fix session progress display for Path B** — `Sessions.tsx` uses `TOTAL_STEPS = 8` and "Step X of 8" for all sessions. Path B has a different effective step count. The `stepLabel()` and progress bar logic should account for `designScope` in the session's step data.

---

## Project Overview

The Model Recommendation Engine is an internal tool for **Transcend Design Partners** to match schools with Career-Connected Learning (CCL) models from the Transcend Exchange. It replaces ad-hoc manual recommendations with a structured, AI-assisted workflow.

**GitHub:** `git@github.com:sdenowitz18/Model-Recommendation-Engine.git`
**Deployed via:** Vercel (connected to GitHub; `npm run build` build command)
**Database:** Neon PostgreSQL (serverless, cloud-hosted)
**Auth:** Email/password with bcrypt + Express sessions stored in Postgres

---

## Architecture

```
Browser (React SPA, Vite)
    │
    │  HTTP + session cookie
    ▼
Express Server (Node.js + tsx)
    ├── Auth routes (login, register, logout, /me)
    ├── Session routes (create, list, rename, delete)
    ├── Workflow routes (progress, chat, documents, prefill, reset)
    ├── Model routes (recommendations, model detail)
    └── Admin routes (prompts, KB, taxonomy, Airtable sync, import)
         │
         ├── Neon PostgreSQL (via Drizzle ORM)
         ├── OpenAI API (chat completions, embeddings, web search)
         └── Airtable API (model sync)
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `users` | Email + bcrypt password hash |
| `user_sessions` | Express session store (connect-pg-simple) |
| `sessions` | Questionnaire sessions (one per school engagement) |
| `workflow_progress` | `currentStep`, `stepsCompleted`, `stepData` (JSONB) |
| `step_conversations` | AI chat history per session + step |
| `step_documents` | Uploaded files with extracted text |
| `models` | CCL models (name, grades, description, practices, outcomes) |
| `recommendations` | Scored recommendations per session |
| `taxonomy_items` | Outcomes, LEAPs, practices (seeded from code) |
| `knowledge_base` / `kb_chunks` | Admin-uploaded KB docs + embeddings |
| `advisor_config` / `step_advisor_configs` | AI prompt configuration |
| `scoring_rules` / `model_field_defs` | Recommendation scoring rules |

### stepData Structure

`workflow_progress.stepData` is a JSONB blob. Key structure:

```json
{
  "designScope": "whole_program" | "specific_experience",
  "experience": {
    "name": "...",
    "description": "...",
    "targetedGradeBands": ["9", "10"],
    "primaryPractices": [{ "id": 1, "name": "...", "importance": "most_important" }]
  },
  "1": { "school_name": "...", "district": "...", "state": "...", "grade_bands": ["9-12"], "context": "..." },
  "2": { "selected_outcomes": [...], "selected_leaps": [...], "outcomes_summary": "...", "leaps_summary": "..." },
  "3": { "selected_practices": [...], "experience_summary": "...", "practices_summary": "..." },
  "4": { "constraint_curriculum": "...", "constraint_community": "...", ... },
  "5": { "impl_coaching": "...", "evidence_threshold": "...", "open_to_stitching": "..." },
  "8": { "selectedModelId": 42 }
}
```

---

## V2 Workflow Architecture

`WorkflowV2.tsx` (~9,000 lines) is the current primary workflow file. Key concepts:

### Path A (Whole CCL Program)
Steps: School Context (1) → Upload Documents (0) → Aims (2) → Practices (3) → System Elements (4) → Model Preferences (5) → Decision Frame (6) → Recommendations (7) → Model Exploration (8)

*Note: Step 0 appearing after Step 1 is an intentional V2 design — the path picker sends users back to step 0 after completing step 1. The chevron UI handles this correctly. This ordering is changing: upload will move to after School Context in the next sprint (see Next Up above).*

### Path B (Specific Experience)
Steps: School Context (1) → Define Experience (2, four sub-screens) → Aims (3) → System Elements (4) → Model Preferences (5) → Decision Frame (6) → Recommendations (7) → Model Exploration (8)

*No standalone Practices step — practices are captured inside Define Experience.*

### Data Compatibility Strategy
V2 stores data in the same `stepData` keys as V1 so the recommendation engine (`server/recommendation-engine.ts`) works without modification:
- Path B experience practices → `stepData["3"].selected_practices`
- Path B aims → `stepData["2"]` (same as V1 Path A)
- V2-specific data → `stepData.designScope`, `stepData.experience` (new keys, no conflict)

### Key Components in WorkflowV2.tsx

| Component | Purpose |
|-----------|---------|
| `WorkflowV2` (default export) | Main layout, header, step routing, path picker state |
| `StepContent` | Routes each step number to the correct component |
| `PathPickerPanel` | Two-card UI for choosing Path A or Path B |
| `ExperienceDefinitionPanel` | Path B Step 2 — 4 sub-screens (upload, details, practices, prioritize) |
| `SchoolContextQuestionnaire` | Step 1 — typeform-style school context form |
| `AimsForLearnersQuestionnaire` | Step 2 (Path A) / Step 3 (Path B) |
| `PracticesQuestionnaire` | Step 3 (Path A only) |
| `SystemElementsQuestionnaire` | Step 4 |
| `ModelPreferencesQuestionnaire` | Step 5 |
| `DecisionFrameReview` | Step 6 — read-only summary of all inputs |
| `RecommendationsView` | Step 7 — recommendation cards |
| `ModelConversationPanel` | Step 8 — model list + AI chat |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `client/src/pages/WorkflowV2.tsx` | **Primary workflow** (~9,000 lines) — all step panels, path logic |
| `client/src/pages/Workflow.tsx` | **V1 workflow (deprecated)** — to be retired |
| `client/src/pages/Sessions.tsx` | Session list page |
| `client/src/pages/Landing.tsx` | Model type selector (CCL active; Math, Whole Child, COMP3 coming soon) |
| `client/src/pages/AdminSettings.tsx` | Admin UI |
| `client/src/App.tsx` | Router configuration |
| `client/src/hooks/use-talk-it-out.ts` | Voice recording → transcription hook |
| `server/routes.ts` | All API endpoints (~1,900 lines) |
| `server/recommendation-engine.ts` | Deterministic scoring engine |
| `server/storage.ts` | Database abstraction layer (Drizzle ORM) |
| `server/db.ts` | Neon Postgres connection |
| `server/embeddings.ts` | RAG pipeline for knowledge base |
| `server/file-parser.ts` | PDF/DOCX/text extraction |
| `server/seed-taxonomy.ts` | Seeds outcomes, LEAPs, practices |
| `server/seed-rules.ts` | Seeds scoring rules |
| `shared/schema.ts` | Drizzle schema + TypeScript types + `WORKFLOW_STEPS` |
| `shared/routes.ts` | Typed API route definitions |

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `OPENAI_API_KEY` | Yes | Chat completions + embeddings + web search |
| `PORT` | No | Default: 5001 (set in `.env`) |
| `SESSION_SECRET` | Yes | Express session signing key |

---

## Running Locally

```bash
npm install
npm run dev           # starts on http://localhost:5001
npm run db:push       # push schema changes to Neon
npm run db:seed       # seed taxonomy (outcomes, LEAPs, practices)
npm run db:restore-defaults  # restore default prompts + taxonomy
```

---

## Documentation Structure

All product documentation lives in `docs/`:

```
docs/
├── VISION.md                        # Product vision, principles, users
├── ROADMAP.md                       # Sequenced epic list with status
├── prds/
│   ├── 01-workflow-v2-core.md       # V2 as primary experience
│   ├── 02-school-context-path-selection.md
│   ├── 03-document-upload-prefill.md
│   ├── 04-recommendations-engine.md
│   ├── 05-model-exploration-ai-chat.md
│   ├── 06-auth-sessions.md
│   └── 07-admin-knowledge-base.md
└── backlog/
    └── future-ideas.md              # Future items not yet in any PRD
```

Each PRD contains: **Overview**, **Requirements (Built)**, **Open Requirements**, **Out of Scope**.

At the end of a work session, use the `update-prds` skill to update the relevant PRDs with decisions made and requirements completed.

---

## Known Issues & Decisions

| Issue | Decision |
|-------|---------|
| V1 sessions exist in DB | Delete them; no migration needed. All new sessions use V2. |
| `/ccl-v2/:sessionId` route | Unify to `/ccl/:sessionId` pointing to WorkflowV2 |
| Path A step 0 before step 1 | Changing: upload moves to after School Context |
| `experience_summary` not generated | Add to prefill route (server/routes.ts ~line 1065) |
| Session progress shows "Step X of 8" for Path B | Fix `stepLabel()` in Sessions.tsx to account for designScope |
| No mid-session path change | Intentional. Users delete session and start over. |
| Resetting a session | Wipes everything including designScope. User re-picks path. |
| Primary practice filter for Path B recs | Pending `primary_practice` DB column addition to models table |
| Forgot password | Backlog — not currently implemented |
| DB-configurable rules | Backlog — currently seeded from code |

---

*Previous handoff (Feb 8, 2026) is superseded by this document.*
