# PRD 05 — Model Exploration & AI Chat

**Last updated:** May 4, 2026
**Status:** 📋 Planned

---

## Overview

After recommendations are generated, users can explore individual models in depth via an AI-powered chat interface. The current implementation provides a basic chat with a fixed set of conversation starter prompts and web search capability. The planned enhancement introduces a guided, topic-based conversation flow that uses the user's own session data to tailor questions and responses.

---

## Requirements (Built)

- **Model Exploration step (Step 8)** — resizable split panel: model list on the left, chat panel on the right
- **Model list** — shows all recommended models; clicking a model opens its chat panel
- **Conversation starters** — a fixed set of opening prompts displayed when a model's chat is first opened (e.g., "How well does this model align with our outcomes?", "What does implementation look like?")
- **AI chat with web search** — uses `gpt-4o-search-preview` to answer questions about a model using real-time web search results, with citations
- **Session context injection** — the model chat includes the user's school context, selected aims, practices, and constraints in the system prompt so responses are tailored to the school's situation
- **Knowledge base RAG** — relevant chunks from the admin knowledge base are retrieved and injected into the model chat context
- **Multi-model chat** — each model in the recommendations list has its own independent chat history within the session
- **Conversation persistence** — chat history for each model is stored in `step_conversations` and reloaded when the user returns to that model
- **Clear conversation** — users can clear the chat history for a given model and start fresh

---

## Open Requirements

- **Model enrichment as first-pass context** — currently, when a user opens a model's chat for the first time, the system fires a background web search (using `gpt-4o-search-preview`) and caches the result in `stepData["8"].webContent_{modelId}`. For greeting messages the web content isn't ready yet, so the first response is less informed. Once model enrichment is implemented (see [prd-07](07-admin-knowledge-base.md)), the enrichment summary should be injected into the chat context immediately — no web search needed for the first pass. Web search remains available for follow-up questions where live/current information is needed. This should make the model chat faster and more accurate on first interaction.

- **Topic-based guided workflow** — instead of open-ended chat, structure the Model Exploration experience around key topics that align with the session's inputs. Proposed topic areas:
  1. **Outcomes** — how this model aligns with the user's selected LEAPs and outcomes
  2. **LEAPs** — how the model's approach connects to specific LEAP items the user prioritized
  3. **Practices** — how the model delivers on the user's primary and additional practices
  4. **System Elements** — how the model addresses the user's constraints and system context
  5. **Implementation** — what implementation actually looks like (professional development, coaching, timeline, cost)
- **Per-topic guided question flow** — within each topic, the AI follows a guided question sequence rather than pure open-ended conversation. Questions are tailored using the user's actual session data (e.g., if the user selected "Entrepreneurship" as a LEAP, the LEAPs topic asks specifically about entrepreneurship in this model).
- **Topic navigation** — users can jump between topics (e.g., tabs or a side nav) while staying within the Model Exploration step
- **Web search integration per topic** — each topic's questions use web search to pull current, cited information about the model, combined with the user's session context

---

## Technical Reference

- Model chat route: `POST /api/sessions/:sessionId/workflow/steps/8/chat`
- Web search model: `gpt-4o-search-preview`
- Session context used in chat system prompt: `stepData["1"]` (school), `stepData["2"]` (aims), `stepData["3"]` (practices), `stepData["4"]` (constraints)
- Chat history table: `step_conversations` (keyed by sessionId + stepNumber + modelId)
- Current conversation starters: defined in `WorkflowV2.tsx` as `CONVERSATION_STARTERS` constant

---

## Out of Scope

- Side-by-side model comparison in chat
- Exporting chat transcript
- User rating or bookmarking individual chat responses
