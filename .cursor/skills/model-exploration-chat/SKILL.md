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
- `ModelChatPanel` — the actual chat UI for a single model (~line 7982)
- `CONVERSATION_STARTERS` — hardcoded list of opening prompts (~line 7959)

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

## How to add model enrichment as first-pass context (open requirement)

Once model enrichment is implemented (see `docs/prds/07-admin-knowledge-base.md`), inject enrichment data before the web research block in `server/routes.ts`:

```typescript
// In the step 8 block (~line 436), after building selectedModelContext from the model record:
const enrichmentData = selectedModel.enrichment as Record<string, any> | null;
if (enrichmentData) {
  selectedModelContext += `\n\n=== MODEL ENRICHMENT SUMMARY ===\n${JSON.stringify(enrichmentData, null, 2)}`;
  // Skip web research for greeting if enrichment exists
  modelWebContent = enrichmentData.summary || "";
}
```

The goal: if enrichment data exists, use it as the first-pass context and skip the background web search for greeting messages (improving response speed). Web search can still be triggered on follow-up messages.

## How to add topic-based guided chat (open requirement)

The open requirement in `docs/prds/05-model-exploration-ai-chat.md` describes per-topic guided flows (Outcomes, LEAPs, Practices, System Elements, Implementation).

**Approach:**
1. Add a `topic` field to the chat request payload (`api.chat.stepAdvisor.input` in `shared/routes.ts`)
2. In the server route, build a topic-specific system prompt addendum based on `topic` + the user's relevant `stepData` for that topic
3. In `ModelChatPanel`, render topic tabs/buttons that set the active topic and send it with each message
4. For each topic, write a guided question sequence (array of strings) that the AI follows; inject the sequence into the system prompt

## How conversation starters work

`CONVERSATION_STARTERS` in `WorkflowV2.tsx` (~line 7959) is a hardcoded array of strings shown as clickable chips when a model's chat is first opened. Clicking one sends it as the user's first message.

To update starters: edit the array directly. To make them dynamic (e.g., tailored to the user's selected aims), pass `stepData` into `ModelChatPanel` and generate starters from the user's top-priority outcomes or practices.

## Key data locations

| Data | Location |
|------|----------|
| Model profile | `models` table → `storage.getModel(modelId)` |
| Web research cache | `stepData["8"].webContent_{modelId}` |
| Chat history | `step_conversations` table, `stepNumber = 8000 + modelId` |
| System prompt (default) | `server/prompts.ts` → `getDefaultStepPrompts()[8]` |
| System prompt (admin override) | `step_advisor_configs` table, `stepNumber = 8` |
| Conversation starters | `WorkflowV2.tsx` → `CONVERSATION_STARTERS` constant |
