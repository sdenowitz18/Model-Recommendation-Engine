---
name: model-exploration-chat
description: Guides changes to the Model Exploration AI chat (Step 8) in the Transcend Model Recommendation Engine. Use when modifying what context is injected into model chat, how conversation history is stored, or when implementing topic-based guided chat flows.
---

# Model Exploration Chat — How It Works & How to Modify It

## Where the code lives

**Streaming route:** `server/routes.ts` — `app.post("/api/chat/step8/stream", ...)` (~line 923)
This is the primary Step 8 chat handler. It handles topic-aware context injection, enrichment rendering, and SSE streaming.

**Non-streaming route:** `server/routes.ts` — `app.post(api.chat.stepAdvisor.path, ...)` (~line 553)
Legacy handler. Step 8 behavior is gated by `if (stepNumber === 8)`.

**Client:** `client/src/pages/WorkflowV2.tsx`
- `ModelConversationPanel` — outer layout, model list, chat panel toggle
- `ModelChatPanel` — the chat UI for a single model (includes topic tree)
- `TopicTreeSelector` — two-branch guided topic selection component
- `TOPIC_TREE` / `TOPIC_LABELS` — topic tree structure and human-readable labels

**Clear conversation route:** `DELETE /api/sessions/:sessionId/chat/model-conversation/:modelId` (~line 966)

---

## How Step 8 chat works

### Context injected into every Step 8 message

The system prompt for Step 8 chat is assembled from these layers (in order):

1. **Global advisor prompt** — from `advisor_config` table (admin-configurable)
2. **Step 8 prompt** — from `step_advisor_configs` table for step 8 (admin-configurable), fallback to `getDefaultStepPrompts()[8]` in `server/prompts.ts`
3. **School design documents** — all documents uploaded to step 0
4. **KB RAG retrieval** — top 12 relevant chunks from the knowledge base (embedding similarity to user message); for watchout topics, the system_elements reference doc is retrieved deterministically
5. **Prior steps context** — all `stepData` from steps 1–7
6. **Model profile** — name, grades, description, keyPractices, outcomeTypes, implementationSupports, link, attributes
7. **Enrichment data** — the full `enrichedContent` JSONB (12 flat sections), labeled as "authoritative source — curated from program's own materials"

### What is NOT used

- **Web search** — fully removed from Step 8. The chat handler relies exclusively on the model's enrichment data, profile metadata, and decision frame.
- **AI training knowledge about the model** — the system prompt instructs the AI to stick to the enrichment data and model profile.

### Conversation history isolation

Each model gets its own independent conversation history using a virtual step number:
```
conversationStepNumber = 8000 + modelId
```
Model ID 42 stores its chat at virtual step 8042. Models never share history.

---

## Enrichment as the authoritative source

The enrichment profile (`models.enrichedContent`) is the primary substantive context for all Step 8 responses. When it's present:
- It is labeled `=== MODEL ENRICHMENT DATA (authoritative source — curated from program's own materials) ===`
- All 12 sections are injected

When enrichment is null or empty for a model:
- The chat tells the user, directs them to the program website, and suggests contacting their Transcend design partner

There is no web search fallback.

---

## How to modify the system prompt for Step 8

**Option 1 (no code change):** Log in as admin → Admin Settings → Step Instructions → Step 8. Paste new instructions.

**Option 2 (change the default):** Edit `server/prompts.ts`, find `getDefaultStepPrompts()`, modify the entry for step 8.

---

## Topic-based guided chat

The full behavioral spec for the topic tree — branches, sub-branches, per-topic context injection, executive summary format, and tone — lives in a separate skill:

**→ See `.cursor/skills/model-exploration-topics/SKILL.md`**

### How topic injection works

1. Client sends `topic` field in the streaming chat request body
2. Server calls `getTopicReferenceTypes(topic)` → returns `["system_elements"]` for watchouts, `null` otherwise
3. Server calls `getTopicPromptAddendum(topic, stepData)` → returns a section-specific instruction block
4. Addendum is appended to the system prompt after the enrichment data

### Topic tree UI

`WorkflowV2.tsx` → `TopicTreeSelector`:
- **Level 0:** Two cards — "Let's talk about the model", "Let's talk about watch outs"
- **Branch 1 (Model):** 13 sub-options (Executive Summary + 12 enrichment sections)
- **Branch 2 (Watch Outs):** Lists the user's specific constraint flags from alignment data

Interaction patterns:
- Collapsible "Explore a topic" toggle when closed
- Back-arrow navigation between root and sub-branch
- Chip-style buttons for each option
- Watch outs card is disabled/greyed when no flags are present
- Watch out count badge shows number of flags

---

## Key data locations

| Data | Location |
|------|----------|
| Model profile | `models` table → `storage.getModel(modelId)` |
| Enrichment data | `models.enrichedContent` (JSONB) |
| Chat history | `step_conversations` table, `stepNumber = 8000 + modelId` |
| System prompt (default) | `server/prompts.ts` → `getDefaultStepPrompts()[8]` |
| System prompt (admin override) | `step_advisor_configs` table, `stepNumber = 8` |
| Topic tree UI | `WorkflowV2.tsx` → `TopicTreeSelector`, `TOPIC_TREE`, `TOPIC_LABELS` |
| Topic prompt functions | `server/prompts.ts` → `getTopicPromptAddendum()`, `getTopicReferenceTypes()` |
| Reference documents | `docs/reference-docs/` (system elements PDF used for watchouts) |
| Enrichment profile source | `docs/enrichment-export/enrichment-export-rebuilt.md` |
