# PRD 03 — Document Upload & Prefill

**Last updated:** May 4, 2026
**Status:** 🔨 In Progress

---

## Overview

Users can upload documents (school profiles, program blueprints, strategic plans) to reduce manual data entry. The system uses GPT-4o to extract structured information from those documents and prefill taxonomy selections, summaries, and — for Path B — experience details. Upload timing and prefill behavior differ slightly between Path A and Path B.

---

## Requirements (Built)

- **File upload** — supports PDF, DOCX, PPTX, TXT, MD. Max file size: 4 MB (Vercel serverless limit). Files are stored in the database with extracted text content.
- **Path B upload** — document upload is embedded as the first sub-screen of the Experience Definition step (Step 2). After uploading, the system immediately runs prefill before advancing to the Experience Details form.
- **Prefill pipeline** (`POST /api/sessions/:sessionId/workflow/prefill-from-documents`) — uses GPT-4o to extract:
  - **School context** (Step 1): school name, district, state, grade band
  - **Aims** (Step 2): matched LEAPs and outcomes from the taxonomy, with a `leaps_summary` and `outcomes_summary`
  - **Practices** (Step 3): matched practices from the taxonomy, with importance levels
- **Taxonomy matching** — GPT-4o is given the full list of taxonomy items (LEAPs, outcomes, practices) and asked to match extracted content against them by name
- **Pre-fill badges** — the UI shows "Pre-filled" badges on taxonomy items that were populated from documents, so users know what was auto-selected vs. manually chosen
- **Delete uploaded docs** — users can remove uploaded documents from the session

---

## Open Requirements

- **Path A upload placement** — currently in V2, Path A sends users to a standalone Upload Documents step (Step 0) before School Context. This needs to be reordered: **upload should happen after School Context (Step 1) in Path A**, not before. The Upload step should be the second step in Path A (between School Context and Aims for Learners).
- **`experience_summary` auto-generation** — the prefill pipeline does not currently generate an `experience_summary`. This field exists in the UI (in the Practices/Experience review panel) with a placeholder "AI-generated summary will appear here." The prefill route (`server/routes.ts`, around line 1065) should be extended to also generate a brief experience summary and write it to `stepData["3"].experience_summary`.
- **Primary practice prefill for Path B** — when running prefill in Path B, the pipeline should also attempt to identify the most prominent practice described in the uploaded documents and suggest it as the primary practice in the Experience Definition form. This should be treated as a suggestion (user can override), written to `stepData.experience.primaryPractices`.
- **Prefill scope for Path B** — the prefill prompt context should acknowledge that the documents are describing a specific experience (not the whole school), so extraction of aims and practices is scoped accordingly.

---

## Technical Reference

- Prefill route: `server/routes.ts` — search for `prefillFromDocuments` (~line 1065)
- Upload route: `POST /api/sessions/:sessionId/workflow/documents/:stepNumber/upload`
- Document storage: `step_documents` table with `fileContent` (extracted text), `fileName`, `stepNumber`
- Prefill writes to: `stepData["1"]` (school), `stepData["2"]` (aims), `stepData["3"]` (practices)
- Path B prefill should also write to: `stepData.experience.primaryPractices` and `stepData["3"].experience_summary`

---

## Out of Scope

- Files larger than 4 MB (Vercel serverless constraint)
- Real-time streaming prefill (currently batch on button press)
- Prefill for System Elements or Model Preferences steps
