# PRD 05 — Model Exploration & AI Chat

**Last updated:** May 5, 2026
**Status:** 🟡 In Progress

---

## Overview

After recommendations are generated, users can explore individual models in depth via an AI-powered chat interface. The chat is structured around a **topic tree** that guides users through three primary areas: learning about the model itself, evaluating alignment with their school's inputs, and discussing specific watch outs. Users can also type freely at any time.

---

## Requirements (Built)

- **Model Exploration step (Step 8)** — resizable split panel: model list on the left, chat panel on the right
- **Model list** — shows all recommended models; clicking a model opens its chat panel
- **AI chat with web search** — uses `gpt-4o-search-preview` to answer questions about a model using real-time web search results, with citations
- **Session context injection** — the model chat includes the user's school context, selected aims, practices, and constraints in the system prompt so responses are tailored to the school's situation
- **Knowledge base RAG** — relevant chunks from the admin knowledge base are retrieved and injected into the model chat context
- **Multi-model chat** — each model in the recommendations list has its own independent chat history within the session
- **Conversation persistence** — chat history for each model is stored in `step_conversations` and reloaded when the user returns to that model
- **Clear conversation** — users can clear the chat history for a given model and start fresh
- **Topic-based guided workflow** — structured three-branch topic tree replacing flat conversation starters:
  - **Branch 1 — Let's talk about the model:** Executive Summary, Overview of Practices, Overview of Outcomes, Overview of LEAPs
  - **Branch 2 — Let's talk about our alignment:** Overall alignment, Alignment on Outcomes, Alignment on LEAPs, Alignment on Practices
  - **Branch 3 — Let's talk about watch outs:** Lists the user's specific constraint flags; each one clickable to dive into that specific watch out
- **Topic-aware context injection** — when a topic is selected, the backend retrieves KB documents deterministically by `referenceType` (instead of embedding-based RAG) and injects topic-specific system prompt addenda
- **Reference documents** — CCL taxonomy definition documents (outcomes, LEAPs, practices, system elements) stored in `docs/reference-docs/` and used as authoritative context for topic-specific responses
- **Per-topic web search** — web search queries are scoped to the specific topic (e.g., `[Model Name] critical thinking outcomes evidence` instead of a generic search)
- **User freeform context inclusion** — freeform text the user entered in Steps 2–4 (outcomes_summary, leaps_summary, practices_summary, experience_summary, system element context) is injected into relevant topic prompts
- **Executive summary standard format** — six-section structured output: What This Model Is, Who It's For, Core Approach, Evidence Base, Implementation Snapshot, Your Fit at a Glance
- **Ask AI buttons on model cards** — three placements: model details area, expanded alignment sections (Outcomes, LEAPs, Practices), and each individual watch out row. Each button opens the chat panel positioned at the relevant branch of the topic tree.
- **Suggested follow-up chips** — after topic-specific responses, the AI generates 1–2 suggested follow-up questions rendered as clickable chips below the response

---

## Open Requirements

- **Model enrichment as first-pass context** — currently, when a user opens a model's chat for the first time, the system fires a background web search (using `gpt-4o-search-preview`) and caches the result in `stepData["8"].webContent_{modelId}`. For greeting messages the web content isn't ready yet, so the first response is less informed. Once model enrichment is implemented (see [prd-07](07-admin-knowledge-base.md)), the enrichment summary should be injected into the chat context immediately — no web search needed for the first pass. Web search remains available for follow-up questions where live/current information is needed.

---

## Technical Reference

- Step 8 streaming chat route: `POST /api/chat/step8/stream`
- Step 8 JSON chat route: `POST /api/chat/step-advisor` (with `stepNumber: 8`)
- Web search model: `gpt-4o-search-preview`
- Topic prompt functions: `server/prompts.ts` — `getTopicPromptAddendum()`, `getTopicReferenceTypes()`, `getTopicWebSearchQuery()`
- Topic tree UI: `WorkflowV2.tsx` — `TopicTreeSelector` component, `TOPIC_TREE` constant, `TOPIC_LABELS` mapping
- Reference documents: `docs/reference-docs/` (outcomes-summary.pdf, leaps-two-pager.pdf, practices-summary.pdf, system-elements.pdf)
- Behavior spec: `.cursor/skills/model-exploration-topics/SKILL.md`

---

## Out of Scope

- Side-by-side model comparison in chat
- Exporting chat transcript
- User rating or bookmarking individual chat responses
