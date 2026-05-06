---
name: model-exploration-chat
description: Guides changes to the Model Exploration AI chat (Step 8) in the Transcend Model Recommendation Engine. Use when modifying what context is injected into model chat, how web research works, how conversation history is stored, or when implementing topic-based guided chat flows.
---

# Model Exploration Chat — How It Works & How to Modify It

## Where the code lives

**Server route:** `server/routes.ts` — `app.post(api.chat.stepAdvisor.path, ...)` (~line 274)
This single route handles ALL step chat, including Step 8. Step 8 behavior is gated by `if (stepNumber === 8)`.

**Client:** `client/src/pages/WorkflowV2.tsx`
- `ModelConversationPanel` — outer layout, model list, chat panel toggle
- `ModelChatPanel` — the actual chat UI for a single model (includes topic tree)
- `TopicTreeSelector` — three-branch guided topic selection component
- `TOPIC_TREE` / `TOPIC_LABELS` — topic tree structure and human-readable labels

**Clear conversation route:** `DELETE /api/sessions/:sessionId/chat/model-conversation/:modelId` (~line 966)

## How Step 8 chat works

### Context injected into every Step 8 message

The system prompt for Step 8 chat is assembled from these layers (in order):

1. **Global advisor prompt** — from `advisor_config` table (admin-configurable)
2. **Step 8 prompt** — from `step_advisor_configs` table for step 8 (admin-configurable), fallback to `getDefaultStepPrompts()[8]` in `server/prompts.ts`
3. **School design documents** — all documents uploaded to step 0 (the intake documents)
4. **KB RAG retrieval** — top 12 relevant chunks from the knowledge base, retrieved via embedding similarity to the user's message
5. **Prior steps context** — all `stepData` from steps 1–7 (school context, aims, practices, system elements, preferences)
6. **Model profile** — full model record from DB: name, grades, description, keyPractices, outcomeTypes, implementationSupports, link, and any `attributes` JSON
7. **Web research summary** — live web search result cached in `stepData["8"].webContent_{modelId}`

### Conversation history isolation

Each model gets its own independent conversation history, stored using a **virtual step number**:
```
conversationStepNumber = 8000 + modelId
```
This means model ID 42 stores its chat at virtual step 8042. Different models never share history.

### Web research caching

- **First message (greeting `__greeting__`):** Web research fires in the background (fire-and-forget). The greeting response goes out without web content. Research result is saved to `stepData["8"].webContent_{modelId}` once it completes.
- **Subsequent messages:** If `webContent_{modelId}` is already cached in stepData, it's used directly. If not, the route fetches it synchronously before responding.
- **`fetchModelWebResearch()`** uses `gpt-4o-search-preview` to do a real-time web search for the model name + website.

## How to modify the system prompt for Step 8

**Option 1 (no code change):** Log in as admin → Admin Settings → Step Instructions → Step 8. Paste new instructions.

**Option 2 (change the default):** Edit `server/prompts.ts`, find `getDefaultStepPrompts()`, modify the entry for step 8.

## Model enrichment as first-pass context

The enrichment pipeline pre-collects detailed, structured content about each model from their website. Enrichment data is stored in `models.enrichedContent` (JSONB) and `models.enrichedAt` (timestamp). The full specification lives in:

**→ See `.cursor/skills/model-enrichment/SKILL.md`**

### Context injection priority

When enrichment data exists, it is the **primary context source** — injected before web research in the system prompt. Web search is a secondary fallback, triggered only when:
- Enrichment is null (model not yet enriched)
- The enrichment field for the current topic says "Not available from current sources"
- The user explicitly asks for live/current information

### Airtable sync preserves enrichment

The sync uses a two-tier upsert (match by `airtableRecordId` first, then by name). Model DB IDs and enrichment data are never deleted during sync. See the enrichment skill for full details on the matching strategy.

## Topic-based guided chat

The full behavioral spec for the topic tree — branches, sub-branches, per-topic context injection, search strategies, executive summary format, Ask AI button routing, and tone — lives in a separate skill:

**→ See `.cursor/skills/model-exploration-topics/SKILL.md`**

Reference documents that define CCL taxonomy items (outcomes, LEAPs, practices, system elements) live in `docs/reference-docs/`. These are used as deterministic context injection (by `referenceType`) rather than embedding-based RAG when the user is in a topic-specific flow.

**Implementation approach:**
1. Add a `topic` field to the chat request payload (`api.chat.stepAdvisor.input` in `shared/routes.ts`)
2. In the server route, check the `topic` field and retrieve the appropriate reference docs by `referenceType` + build a topic-specific system prompt addendum
3. Replace `CONVERSATION_STARTERS` in `ModelChatPanel` with the three-card topic tree UI
4. Add "Ask AI" buttons to the model card (alignment section, each watch out row, model details) that open the chat panel positioned at the corresponding branch

## How the topic tree works

The flat `CONVERSATION_STARTERS` array has been replaced by a `TopicTreeSelector` component that presents a three-level guided tree:

- **Level 0:** Three cards — "Let's talk about the model", "Let's talk about our alignment", "Let's talk about watch outs"
- **Branch 1 (Model):** Executive Summary, Overview of Practices, Overview of Outcomes, Overview of LEAPs
- **Branch 2 (Alignment):** Overall alignment, Alignment on Outcomes, Alignment on LEAPs, Alignment on Practices
- **Branch 3 (Watch Outs):** Lists the user's specific constraint flags from alignment data

The topic tree is shown both in the empty chat state and after the greeting message finishes streaming. Selecting a topic sends a pre-formed message with the `topic` field to the backend for topic-aware context injection.

"Ask AI" buttons on the model card open the chat panel positioned at the relevant branch (alignment section → Branch 2, each watchout → skips to that specific watchout, model details → Branch 1).

## Key data locations

| Data | Location |
|------|----------|
| Model profile | `models` table → `storage.getModel(modelId)` |
| Web research cache | `stepData["8"].webContent_{modelId}` |
| Chat history | `step_conversations` table, `stepNumber = 8000 + modelId` |
| System prompt (default) | `server/prompts.ts` → `getDefaultStepPrompts()[8]` |
| System prompt (admin override) | `step_advisor_configs` table, `stepNumber = 8` |
| Topic tree UI | `WorkflowV2.tsx` → `TopicTreeSelector`, `TOPIC_TREE`, `TOPIC_LABELS` |
| Topic prompt functions | `server/prompts.ts` → `getTopicPromptAddendum()`, `getTopicReferenceTypes()`, `getTopicWebSearchQuery()` |
| Reference documents | `docs/reference-docs/` (outcomes, LEAPs, practices, system elements PDFs) |
