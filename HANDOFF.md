# Transcend Model Recommendation Engine — Handoff Document

**Date:** February 8, 2026
**Project:** Transcend CCL Model Recommendation Assistant
**Repo:** `model-rec-engine`

---

## 1. Context & Intent

### Problem Statement

Transcend Education's Design Partners need a structured, repeatable process to identify Career-Connected Learning (CCL) models and point solutions that best fit a school or district community's vision, constraints, and context. Previously this was manual and ad-hoc — partners relied on memory, spreadsheets, and unstructured conversations to match schools with vetted CCL models from the Transcend Exchange.

### User Impact

- **Primary users:** Transcend Design Partners (internal staff)
- **End beneficiaries:** School and district leaders seeking CCL-aligned instructional models
- Without this tool, recommendations are inconsistent, time-consuming, and lack a transparent rationale
- The tool provides a shared language (taxonomy) and a deterministic scoring engine so recommendations are defensible and reproducible

### Success Criteria

1. Design Partners can walk through a 7-step guided workflow capturing school context, aims, practices, constraints, and preferences
2. The system generates ranked model recommendations with clear alignment rationale (High/Medium/Low/None) across multiple dimensions
3. All inputs are editable, persistent, and reflected in a synthesized Decision Frame before recommendations are generated
4. Grade band matching works correctly (e.g., "High School" maps to 9-12 and overlaps K-12 models)
5. Constraint detection flags potential conflicts between user constraints and model characteristics
6. Admin can configure AI prompts, upload knowledge base documents, manage taxonomy, and sync models from Airtable

---

## 2. Source & Non-Source Code

### Source Code (in-repo)

| Layer | Key Files | Purpose |
|-------|-----------|---------|
| **Client** | `client/src/pages/Workflow.tsx` | Main workflow UI — all 7 step panels, chat, taxonomy selection, decision frame, recommendations |
| | `client/src/pages/Landing.tsx` | Landing page with model type selection (CCL active; Math, Whole Child, COMP3 coming soon) |
| | `client/src/pages/ModelDetail.tsx` | Per-model detail page showing alignment overlap with user selections |
| | `client/src/pages/LeapDetail.tsx` | Detail page for LEAP taxonomy items |
| | `client/src/pages/PracticeDetail.tsx` | Detail page for Practice items (description + examples from design kit) |
| | `client/src/pages/AdminSettings.tsx` | Admin UI for prompts, KB, taxonomy, Airtable sync, restore defaults |
| | `client/src/pages/admin-import.tsx` | Excel model import UI |
| | `client/src/App.tsx` | Router configuration (wouter) |
| | `client/src/hooks/use-advisor.ts` | AI chat hook (sends messages, streams responses, handles step data patches) |
| | `client/src/components/ui/*` | shadcn/ui component library (Radix primitives + Tailwind) |
| **Server** | `server/index.ts` | Express server entry, error handlers, Vite dev setup |
| | `server/routes.ts` | All API endpoints (~50 routes) |
| | `server/recommendation-engine.ts` | Deterministic scoring engine — weighted points, grade band matching, constraint detection, context notes |
| | `server/prompts.ts` | Default AI system prompts (global + per-step) |
| | `server/storage.ts` | Database abstraction layer (Drizzle ORM queries) |
| | `server/db.ts` | Drizzle + Neon Postgres connection |
| | `server/openai.ts` | OpenAI client wrapper |
| | `server/embeddings.ts` | RAG pipeline — chunking, embedding, retrieval for knowledge base |
| | `server/seed-taxonomy.ts` | Seeds taxonomy items (outcomes, LEAPs, practices) from code |
| | `server/restore-defaults.ts` | CLI script to restore taxonomy + default prompts to DB |
| | `server/airtable.ts` | Airtable sync client for models |
| | `server/file-parser.ts` | PDF/DOCX/text file content extraction |
| **Shared** | `shared/schema.ts` | Drizzle schema definitions, TypeScript types, workflow step definitions |
| | `shared/routes.ts` | Typed API route definitions |
| **Config** | `drizzle.config.ts` | Drizzle Kit config |
| | `vite.config.ts` | Vite config with React plugin |
| | `tailwind.config.ts` | Tailwind CSS config |
| | `tsconfig.json` | TypeScript config |
| | `.env` | Environment variables (DATABASE_URL, OPENAI_API_KEY, etc.) — **gitignored** |

### Non-Source / External Dependencies

| Dependency | Purpose |
|------------|---------|
| **Neon PostgreSQL** | Primary database (hosted, serverless Postgres) |
| **OpenAI API** | GPT-4 for conversational AI advisor at each workflow step |
| **OpenAI Embeddings** | text-embedding-3-small for RAG knowledge base retrieval |
| **Airtable** | Optional model sync source (Transcend Exchange models) |
| **Radix UI / shadcn** | UI component primitives |
| **TanStack Query** | Server state management (caching, mutations) |
| **Drizzle ORM** | Type-safe SQL query builder |
| **react-resizable-panels** | Resizable pane layout |
| **wouter** | Lightweight client-side routing |

---

## 3. System Map

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (React SPA)                  │
│                                                          │
│  Landing ─→ Workflow ─→ 7-Step UI ─→ Recommendations    │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Chat     │  │ Content      │  │ Step Panels:     │   │
│  │ (AI      │  │ (Taxonomy,   │  │  SchoolContext    │   │
│  │ Advisor) │  │  Documents)  │  │  TaxonomySelect  │   │
│  │          │  │              │  │  Constraints      │   │
│  └──────────┘  └──────────────┘  │  Preferences      │   │
│                                  │  DecisionFrame    │   │
│                                  │  Recommendations  │   │
│                                  └──────────────────────┘│
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP API
┌──────────────────────▼──────────────────────────────────┐
│                Express Server (Node.js + tsx)             │
│                                                          │
│  Routes ─→ Storage ─→ Drizzle ORM ─→ Neon Postgres     │
│     │                                                    │
│     ├─→ OpenAI (chat completions, streaming)            │
│     ├─→ Embeddings (RAG: chunk → embed → retrieve)      │
│     ├─→ Recommendation Engine (deterministic scoring)    │
│     └─→ Airtable Sync (model import)                   │
└─────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Neon PostgreSQL Database                     │
│                                                          │
│  Tables: sessions, workflow_progress, step_conversations,│
│  step_documents, models, recommendations, taxonomy_items,│
│  knowledge_base, kb_chunks, advisor_config,              │
│  step_advisor_configs, airtable_config, school_contexts, │
│  taxonomy_group_labels                                   │
└─────────────────────────────────────────────────────────┘
```

### Data Flow: Recommendation Generation

```
stepData (steps 1-5)
    │
    ├── Step 1: school_name, district, state, grade_band, context
    ├── Step 2: selected_outcomes[], selected_leaps[], outcomes_summary, leaps_summary
    ├── Step 3: selected_practices[], experience_summary, practices_summary
    ├── Step 4: constraint_curriculum, constraint_community, ... (7 domains)
    └── Step 5: impl_coaching, impl_pd, impl_selfserve, impl_observation,
                evidence_threshold, open_to_stitching

         │  POST /api/sessions/:id/recommendations
         ▼
┌─────────────────────────────────────────┐
│       Recommendation Engine              │
│                                          │
│  For each model:                        │
│    1. computeScore(aims, model.outcomes) │
│    2. computeScore(practices, model.kp)  │
│    3. checkGradeBand(model, user bands)  │
│    4. detectConstraints(user, model)     │
│    5. buildContextNotes(context, model)  │
│    6. totalPoints = aims + practices     │
│    7. sortScore = total × gradePenalty   │
│                                          │
│  Sort by sortScore, normalize to 0-100  │
│  Save to recommendations table          │
└─────────────────────────────────────────┘
```

### Scoring Weights

| Importance Level | Weight |
|-----------------|--------|
| `most_important` | 3 |
| `important` | 2 |
| `nice_to_have` | 1 |

| Alignment Label | Percentage Threshold |
|----------------|---------------------|
| High | ≥ 60% |
| Medium | ≥ 30% |
| Low | ≥ 1% |
| None | 0% |

### Grade Band Matching

Grade band matching uses **numeric range overlap** (not string matching):

- User input like "9-12" or "High School" is parsed to `[9, 12]`
- Model grades like "K–12" (em-dash) are normalized and parsed to `[0, 12]`
- Match = ranges overlap (`max1 >= min2 AND max2 >= min1`)
- Special handling: "PK" = -1, "K" = 0, "Algebra 1" ≈ grade 9, common names mapped

---

## 4. What Was Done

### Features Built

1. **7-Step Guided Workflow** — Full UI with AI chat advisor, taxonomy selection, document upload, and structured data capture at each step

2. **Landing Page** — Model type selector (CCL active; Math, Whole Child, COMP3 marked "coming soon")

3. **Taxonomy System** — Outcomes (4 groups), LEAPs (10 items with detail pages), Practices (19 items across 4 strands with descriptions and examples from the CCL Design Kit)

4. **AI Chat Advisor** — Per-step AI conversations using GPT-4 with:
   - Customizable system prompts (global + per-step)
   - Knowledge base RAG (chunked documents with embeddings)
   - Step data patching (AI extracts structured data from natural conversation)

5. **Recommendation Engine** — Deterministic weighted scoring:
   - Aims alignment (outcomes + LEAPs weighted by importance)
   - Practices alignment (weighted by importance)
   - Grade band matching (numeric range overlap with em-dash normalization)
   - Constraint detection (fuzzy keyword matching against model descriptions)
   - Context notes (fuzzy matching user context/summaries against models)
   - Preference capture (implementation supports, evidence threshold, stitching)

6. **Structured Step Data Capture**:
   - **Step 1:** Editable fields for School Name, District, State, Grade Band (dropdown), Context
   - **Step 2:** Taxonomy selection with importance levels + editable Outcomes Summary and LEAPs Summary
   - **Step 3:** Taxonomy selection + editable Experience Summary and Practices Summary
   - **Step 4:** 7 constraint domain text areas (Curriculum & Assessment, School Community & Culture, etc.)
   - **Step 5:** Radio buttons for Implementation Supports (4 options × 3 preference levels), Evidence Threshold, Solution Architecture (stitching)

7. **Decision Frame (Step 6)** — Synthesized read-only view of all inputs from Steps 1-5

8. **Recommendation Cards (Step 7)** — 2-per-row grid showing:
   - Aims Alignment (High/Medium/Low)
   - Practices Alignment (High/Medium/Low)
   - Constraints (with grade band and domain-specific flags)
   - Context notes
   - Link to detailed model page with overlap visualization

9. **Model Detail Page** — Shows model info + specific alignment details for the user's session

10. **Admin Settings** — Prompt customization, knowledge base upload, taxonomy management, Airtable sync, restore defaults

11. **Resizable Panels** — Chat and content panes are resizable (drag handles)

12. **Auto-normalization** — Grade band values like "High School" auto-convert to "9-12" and persist back

13. **Error Resilience** — `uncaughtException` / `unhandledRejection` handlers prevent server crashes from transient DB/network errors; model sync won't delete existing data on empty Airtable response

---

## 5. Decisions & Tradeoffs

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| **Deterministic scoring (not AI-based)** | Reproducible, transparent, debuggable recommendations. Users can see exactly why a model scored the way it did. | Less nuanced than LLM-based ranking; relies on keyword/fuzzy matching rather than semantic understanding of alignment |
| **Fuzzy keyword matching for alignment** | Simple, fast, no additional API calls. Works reasonably for taxonomy names (e.g., "Whole-Child Focus" matching "whole child"). | Will miss semantic equivalents (e.g., "student agency" won't match "autonomy"); needs richer model metadata to improve |
| **stepData as JSONB blob** | Flexible schema evolution — no migrations needed when adding new fields to step data | Harder to query specific fields; no DB-level validation of step data structure |
| **Grade band as numeric range overlap** | Correctly handles edge cases (em-dashes, "Algebra 1", "PK-12", common school names). More robust than string matching. | Over-matches in edge cases (e.g., Algebra 1 ≈ grade 9 is an approximation) |
| **AI step data patching** | Lets the AI extract structured data from natural conversation, reducing manual form-filling. | Sometimes sets values incorrectly (e.g., stored "High School" instead of "9-12"); requires normalization layer |
| **Neon PostgreSQL (external)** | Persistent data not tied to Replit's ephemeral environment. | Requires network access; transient EADDRNOTAVAIL errors observed under load |
| **Single-session model** | Simplifies MVP — one active session at a time per browser. | No multi-user support, no session history/comparison |
| **react-resizable-panels** | Better UX — users can resize chat vs. content areas. | Adds complexity; had to debug initial integration issues |
| **Radix Select for grade band** | Standard accessible dropdown with consistent styling. | Radix Select doesn't support empty string values (required using `undefined` for unset state) |

---

## 6. Known Issues & TODOs

### Known Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **Fuzzy matching is shallow** | Medium | Alignment scoring uses simple keyword matching. "Mentorship" won't match if the model says "mentoring" but not "mentorship" (partial word match). Needs stemming or semantic matching. |
| **Preferences not yet scored** | Medium | Step 5 preferences (implementation supports, evidence threshold, stitching) are captured and stored in alignment data but do **not** yet affect the recommendation score. They're placeholders for future scoring once models have matching metadata. |
| **Single session** | Low | The app creates/reuses one session. There's no session switcher, history, or multi-user support. |
| **Pre-existing tsc errors** | Low | Running `tsc --noEmit` shows some pre-existing type errors in the codebase that were not introduced by recent changes. |
| **Airtable sync safety** | Low | If Airtable returns 0 models (API error, empty response), the sync now throws instead of deleting all models. But there's no retry logic. |

### TODOs / Future Enhancements

| Priority | Item |
|----------|------|
| **High** | Add richer model metadata (implementation details, evidence base, grade-specific details) so constraint detection and preference scoring can be more precise |
| **High** | Score Step 5 preferences against model `implementationSupports` field once models have structured data for coaching, PD, self-serve, observation |
| **High** | Add semantic/embedding-based alignment scoring as a complement to fuzzy keyword matching |
| **Medium** | Multi-session support — session list, comparison, history |
| **Medium** | Expand to additional model types beyond CCL (Math, Whole Child, COMP3 — currently stubbed as "coming soon" on landing page) |
| **Medium** | Add export functionality — generate a PDF/Word summary of the Decision Frame and Recommendations for sharing with school partners |
| **Medium** | Improve constraint detection — use LLM to semantically evaluate whether a user's constraint conflicts with a model's approach, rather than keyword matching |
| **Low** | Add unit tests for recommendation engine scoring logic |
| **Low** | Add proper loading states and skeleton screens for all data-fetching panels |
| **Low** | Rate limiting on AI chat endpoints |

---

## 7. Open Questions

1. **How should "evidence threshold" affect scoring?** — Currently captured as "established" vs. "open to newer/emerging" but models don't have structured impact/evidence data yet. What metadata would be needed?

2. **What constitutes a constraint "conflict"?** — Currently the engine flags keywords from user constraint text that appear in the model description. Should a mismatch be stricter (e.g., if user says "no technology" and model requires heavy tech)?

3. **Stitching preference** — The user can indicate openness to combining models. How should this affect recommendations? Should the engine suggest 2-model combinations?

4. **Model metadata richness** — Current model data from Airtable/Excel is relatively sparse (name, grades, description, outcomeTypes, keyPractices, implementationSupports). What additional structured fields would improve recommendations?

5. **Multi-user / auth** — Is there a need for login, role-based access, or per-partner session management? Currently the app is open access.

6. **Context notes quality** — The `buildContextNotes` function does shallow keyword matching between user context and model text. Should this use an LLM call for richer analysis?

---

## 8. Cursor / Developer Notes

### Running Locally

```bash
# Install dependencies
npm install

# Create .env with required variables
# DATABASE_URL=postgresql://...  (Neon connection string)
# OPENAI_API_KEY=sk-...
# PORT=3000

# Push schema to database
npm run db:push

# Seed taxonomy (outcomes, LEAPs, practices)
npm run db:seed

# Restore default prompts + taxonomy
npm run db:restore-defaults

# Start dev server
npm run dev
```

### Key Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `OPENAI_API_KEY` | Yes | OpenAI API key for chat + embeddings |
| `PORT` | No | Server port (default: 3000 locally) |
| `SESSION_SECRET` | No | Express session secret |

### Database

- **Provider:** Neon (serverless Postgres)
- **ORM:** Drizzle with `drizzle-kit push` for schema sync (no migration files)
- **Connection string:** In `.env` (gitignored)
- See `DATABASE_SETUP.md` for full setup instructions

### Codebase Conventions

- **Client routing:** wouter (lightweight, no React Router)
- **State management:** TanStack Query for server state; React useState/useEffect for local UI state
- **Styling:** Tailwind CSS with shadcn/ui components
- **API pattern:** Express routes return JSON; client uses fetch via TanStack Query
- **Step data persistence:** `workflowProgress.stepData` is a JSONB blob keyed by step number (e.g., `stepData["1"]` for School Context)
- **AI integration:** Each step has its own chat history (`step_conversations` table) and optional system prompt override (`step_advisor_configs` table)

### Common Tasks

| Task | Command / Action |
|------|-----------------|
| Add a new model | Admin Settings → Airtable Sync, or Admin Import → Upload Excel |
| Modify AI prompts | Admin Settings → Step Instructions tab |
| Reset taxonomy/prompts | Admin Settings → "Restore All Defaults" button, or `npm run db:restore-defaults` |
| Add new taxonomy items | `server/seed-taxonomy.ts` → add items → `npm run db:seed` |
| Modify recommendation scoring | `server/recommendation-engine.ts` |
| Add a new workflow step | Update `WORKFLOW_STEPS` in `shared/schema.ts`, add step prompt in `server/prompts.ts`, add panel in `Workflow.tsx` |

### File Size Warning

`client/src/pages/Workflow.tsx` is the largest file in the codebase (~2100 lines). It contains all step panels, the recommendation display, the decision frame, taxonomy selection, and the main layout. Consider splitting into separate component files if it grows further.

---

*Generated: February 8, 2026*
