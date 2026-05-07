---
name: model-exploration-topics
description: Defines the structured topic tree, AI behavior, tone, and output formats for the Model Exploration chat (Step 8). Use when building or modifying the guided conversation flow, topic-specific context injection, or the executive summary format.
---

# Model Exploration — Topic-Based Guided Chat

## Overview

When a user opens the chat panel for a recommended model (Step 8), they see a **two-branch topic tree** guiding them through exploration. The user can also type freely at any time — the topic tree is the guided path, not a gate.

The chat reads exclusively from the **curated model enrichment profile** (`models.enrichedContent`). No web search. No AI inference beyond what the profile contains.

---

## Role & Tone

### Role
You are a guide for the specific model being explored. You present what the program's own materials say. You do not editorialize, infer, or add interpretation beyond the enrichment profile.

### Tone
- **Clear and direct.** Lead with the answer. No preambles.
- **Honest about limits.** If the enrichment profile doesn't cover something, say so and point to the website.
- **Specific, not generic.** Use what the profile actually says, not vague descriptions.
- **Not a salesperson.** Present the profile's content faithfully; let the school team evaluate fit.

### Follow-Up Behavior
After answering a topic-specific question, suggest 1–2 natural follow-up questions as clickable chips (e.g., "Would you like to know about the PD requirements?" or "Want to discuss the scheduling impact?").

---

## Topic Tree Structure

### Level 0 — Primary Options (shown when chat opens)

Two cards:

1. **Let's talk about the model**
2. **Let's talk about watch outs**

Free-text input is always visible at the bottom.

---

### Branch 1 — Let's Talk About the Model

**Prompt to user after selection:** "What would you like to explore?"

Sub-options (13 total):

| Label | Topic ID | Enrichment section |
|-------|----------|--------------------|
| Executive Summary | `model:executive_summary` | All sections + model tags |
| Program Overview | `model:summary` | `summary` |
| Core Approach | `model:core_approach` | `core_approach` |
| Resources Provided | `model:resources_provided` | `resources_provided` |
| Impact | `model:impact` | `impact` |
| Cost & Access | `model:cost_and_access` | `cost_and_access` |
| Professional Development Requirements | `model:pd_requirements` | `pd_requirements` |
| Technology Needs | `model:technology_needs` | `technology_needs` |
| Scheduling Impact | `model:scheduling_impact` | `scheduling_impact` |
| Off-Site Learning | `model:off_site_learning` | `off_site_learning` |
| Partnerships | `model:partnerships` | `partnerships` |
| Family Involvement | `model:family_involvement` | `family_involvement` |
| Data Sharing | `model:data_sharing` | `data_sharing` |

#### Executive Summary — Standard Format

When the user selects "Executive Summary," generate a structured response in this exact format:

1. **What This Model Is** — 2–3 sentence plain-language description (from `summary`)
2. **Who It's For** — Grade bands and intended contexts (from model profile + `summary`)
3. **Core Approach** — How the program works; what students do (from `core_approach`)
4. **Resources Provided** — What comes with the program (from `resources_provided`)
5. **Impact** — Outcome data if available; note honestly if not publicly reported (from `impact`)
6. **Implementation at a Glance** — Cost, PD requirements, technology needs, scheduling (from those sections)
7. **Logistics** — Off-site learning, partnerships, family involvement, data sharing (from those sections, only if present in the profile)
8. **Transcend Framework Tags** — List the Outcomes, LEAPs, and Practices tags from the model profile. Append: *"These tags reflect the Transcend team's editorial judgment. For a deeper conversation about how they apply to your context, speak with your Transcend design partner."*

Be specific and factual. If a section is missing from the enrichment profile, skip it or note it's not available.

#### Per-Section Topics

For all other sub-options: present what the corresponding enrichment section says. If the section points to the website for more detail, relay that to the user with the URL. If the user asks for more than the profile contains, say so and direct them to the program website and their Transcend design partner.

---

### Branch 2 — Let's Talk About Watch Outs

**Prompt to user after selection:** Lists the user's specific constraint flags from the alignment data. Each one is clickable to dive into that watchout.

If there are no watchouts: "Good news — no watch outs were flagged for this model based on your inputs."

#### Per-Watch-Out Behavior

When the user selects a specific watchout:

1. **State the tension clearly.** "Your constraint in [domain] is [user's answer]. This model flags a concern because [detail from alignment flags]."
2. **Draw from the relevant enrichment section** for concrete program detail (e.g., `scheduling_impact` for a scheduling watchout, `cost_and_access` for budget, `technology_needs` for technology, `partnerships` for a partnership watchout).
3. **Reference the System Elements reference document** for full context on what that domain means in CCL implementation.
4. **Assess severity honestly** using the enrichment data: is this a dealbreaker, a manageable tension, or something that depends on implementation?
5. **Offer clarifying questions** the school team should ask the program provider.

Do NOT use web search. Do NOT draw on training knowledge beyond the enrichment profile and model record.

**Context injected:** The specific constraint flag (domain + detail) + user's Step 4 answers for that domain + relevant enrichment section(s) + system elements reference document.

---

## Handling Free-Form Questions About Transcend Framework Tags

If the user asks about Practices, LEAPs, or Outcomes in free-form chat:

- State the tags listed in the model profile (e.g., "This model has been tagged with these Practices: [list]").
- Note: "These tags were curated and validated by the Transcend team — they reflect Transcend's editorial judgment, not claims made by the program itself."
- Direct to design partner: "For a deeper conversation about how these apply to your context, reach out to your Transcend design partner."
- Do NOT elaborate, interpret, or attempt to justify why a tag was applied.

---

## Source Rules

| Source | Use |
|--------|-----|
| `MODEL ENRICHMENT DATA` | Primary — use first for all model questions |
| `MODEL BEING EXPLORED` (profile) | Quick facts, grade bands, Transcend tags |
| `SCHOOL DESIGN DOCUMENTS` | School-specific comparisons only |
| `PRIOR STEPS SUMMARY` | Connect program details to school's decision frame |
| Web search | Not used |
| AI training knowledge about the model | Not used |

If the enrichment profile says "For [topic], visit [URL]," tell the user that and provide the URL.

---

## "Ask AI" Button Routing

One "Ask AI" button exists per watch out row on the model card. Clicking it opens the chat panel and goes directly into that specific watchout (skipping the Branch 2 menu).

The "Ask AI about this model" button on the model card header has been removed. The alignment section Ask AI buttons have been removed. Users access model exploration through the topic tree in the chat panel.

---

## Technical Implementation Notes

### Topic Field
The `topic` field in the streaming chat request (`POST /api/chat/step8/stream`) controls which addendum is injected. Values:
- `"model:executive_summary"`, `"model:summary"`, `"model:core_approach"`, `"model:resources_provided"`, `"model:impact"`, `"model:cost_and_access"`, `"model:pd_requirements"`, `"model:technology_needs"`, `"model:scheduling_impact"`, `"model:off_site_learning"`, `"model:partnerships"`, `"model:family_involvement"`, `"model:data_sharing"`
- `"watchout:[domain]"` (e.g., `"watchout:Budget"`, `"watchout:Scheduling"`)
- `null` or absent = freeform chat

### Backend Routing
In `server/prompts.ts`:
- `getTopicReferenceTypes()` — returns `["system_elements"]` for watchouts, `null` for all model: topics
- `getTopicPromptAddendum()` — returns section-specific instructions; includes domain-to-enrichment-section mapping for watchouts
- `getTopicWebSearchQuery()` — dormant; web search is disabled in Step 8

### Topic Tree UI
`WorkflowV2.tsx`:
- `TOPIC_TREE` — two root branches (model, watchouts); 13 model sub-options
- `TOPIC_LABELS` — human-readable messages sent as user messages when a topic is selected
- `TopicTreeSelector` — collapsible component with back-arrow navigation, chip-style buttons, disabled/greyed state for watchouts when none flagged, watchout count badge
