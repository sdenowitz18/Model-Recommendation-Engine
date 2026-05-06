# PRD 07 — Admin & Knowledge Base

**Last updated:** May 4, 2026
**Status:** ✅ Core Complete / 📋 Enhancements Planned

---

## Overview

The Admin panel allows Transcend staff to configure the AI advisor behavior, manage the knowledge base that informs model chat, maintain the taxonomy of outcomes/LEAPs/practices, manage models, and sync from Airtable. Currently accessible at `/admin/settings`.

---

## Requirements (Built)

- **AI prompt configuration** — global system prompt and per-step prompt overrides, editable via the Admin UI. Stored in `advisor_config` and `step_advisor_configs` tables.
- **Restore defaults** — one-click restore of taxonomy and default prompts via Admin UI or `npm run db:restore-defaults` CLI script.
- **Knowledge base** — upload documents (PDF, DOCX, etc.) into a shared knowledge base. Documents are chunked, embedded with `text-embedding-3-small`, and retrieved via RAG during model chat and AI advisor conversations.
- **Taxonomy management** — admin can view, add, and edit taxonomy items (outcomes, LEAPs, practices) via the Admin UI. Changes take effect immediately for all new sessions.
- **Model import (Excel)** — upload an Excel file to bulk-import models into the database.
- **Airtable sync** — sync models from the Transcend Exchange Airtable base. Configured with an Airtable API key and base/table ID stored in `airtable_config` table. Sync is safe: if Airtable returns 0 models, the sync throws rather than deleting all existing models.
- **Scoring rules** — scoring rules and field definitions are stored in the `scoring_rules` and `model_field_defs` tables. A seed script (`server/seed-rules.ts`) populates them. Rules can be managed programmatically.

---

## Open Requirements

- **Model enrichment on sync** — ✅ **Schema & sync foundation complete.** The `models` table now has `enrichedContent` (JSONB), `enrichedAt` (timestamp), and `airtableRecordId` (text) columns. The Airtable sync has been rewritten from delete-and-replace to a **two-tier upsert** (match by Airtable record ID first, then by name as fallback), which preserves model DB IDs and enrichment data across imports. The enrichment pipeline itself (Phase 1: website scrape via `gpt-4o-search-preview`, Phase 2: structured extraction via `gpt-4o` with CCL reference docs) and the admin UI triggers are not yet implemented. See `.cursor/skills/model-enrichment/SKILL.md` for the full enrichment specification.

- **DB-configurable scoring rules via Admin UI** — scoring rules are currently seeded from `server/seed-rules.ts` and managed via script. Long-term, these should be editable through the Admin UI so that rule changes don't require a code deployment. This is important for environment promotion: if we ever run separate staging and production databases, rules configured in one environment should be promotable to another without manual reconfiguration.
- **DB-configurable workflow questions** — similarly, workflow questions for System Elements (Step 4) and Model Preferences (Step 5) are currently hardcoded in the client. Moving these to the database would allow configuration without code changes, and would make environment promotion cleaner.
- **Priority:** both of these are low priority for now but should be on the roadmap before any multi-environment deployment.

---

## Backlog (Future)

- Environment promotion tooling (staging → production config sync)
- Audit log for admin changes
- Per-model knowledge base entries (currently KB is global)

---

## Technical Reference

- Admin UI: `client/src/pages/AdminSettings.tsx`
- Prompt routes: `GET/POST /api/admin/config`, `GET/POST /api/admin/step-configs/:stepNumber`
- KB routes: `POST /api/admin/knowledge-base/upload`, `GET /api/admin/knowledge-base`, `DELETE /api/admin/knowledge-base/:id`
- Taxonomy routes: `GET/POST /api/taxonomy`, `PATCH/DELETE /api/taxonomy/:id`
- Airtable sync route: `POST /api/admin/airtable/sync`
- Model import route: `POST /api/admin/import`
- Scoring rules seed: `server/seed-rules.ts`
- Embeddings pipeline: `server/embeddings.ts` — `ingestKnowledgeBaseEntry()`, `retrieveRelevantChunks()`
- Embedding model: `text-embedding-3-small`

---

## Out of Scope

- Public-facing model database (all admin actions are internal only)
- Automated Airtable sync on a schedule (currently manual trigger)
