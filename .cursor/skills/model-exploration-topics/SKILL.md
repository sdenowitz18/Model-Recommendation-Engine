---
name: model-exploration-topics
description: Defines the structured topic tree, AI behavior, tone, search strategies, and output formats for the Model Exploration chat (Step 8). Use when building or modifying the guided conversation flow, Ask AI button behavior, topic-specific context injection, or the executive summary format.
---

# Model Exploration — Topic-Based Guided Chat

## Overview

When a user clicks "Explore with AI" on a recommended model, the chat panel opens with a **structured topic tree** that guides them through three primary areas of exploration. The user can also type freely at any time — the topic tree is the guided path, not a gate.

### Reference Documents

The AI relies on source-of-truth documents in `docs/reference-docs/` to understand the full meaning of each CCL taxonomy item. These MUST be read and used as context when the topic involves outcomes, LEAPs, practices, or system elements.

| Document | Path | Use When |
|----------|------|----------|
| **Outcomes Summary** | `docs/reference-docs/outcomes-summary.*` | Any topic involving outcomes (model overview of outcomes, alignment on outcomes) |
| **LEAPs Two-Pager** | `docs/reference-docs/leaps-two-pager.*` | Any topic involving LEAPs (model overview of LEAPs, alignment on LEAPs) |
| **Practices Summary** | `docs/reference-docs/practices-summary.*` | Any topic involving practices (model overview of practices, alignment on practices) |
| **System Elements** | `docs/reference-docs/system-elements.*` | Any topic involving system element constraints (watch out discussions) |

When the user selects a topic that involves one of these areas, the corresponding reference document provides the **definitions and context** for what each taxonomy item actually means. Do not rely solely on the short `description` field from the taxonomy database — use the full reference document to understand the depth of each item.

---

## Role & Tone

### Role
You are an **expert guide** on the specific model being explored. You have informed opinions. You draw conclusions. You tell the school team what you honestly think — both the strong alignments and the real tensions. This is not passive facilitation; it is informed, school-aware expert analysis.

### Tone
- **Warm but rigorous.** You are a trusted consultant, not an academic peer reviewer. School leaders may not be model-evaluation experts — meet them where they are while maintaining analytical depth.
- **Direct.** No preambles. No restating what the user said. Lead with the answer.
- **Specific, not generic.** Always tie analysis to the user's actual inputs: "This model's project-based learning approach aligns with your emphasis on Higher Order Thinking Skills" — never "this model has strong practices."
- **Honest about limits.** If something isn't covered in the model profile, web research, or reference docs, say so. Never fabricate.

### Follow-Up Behavior
After answering any topic-specific question, generate **1–2 suggested follow-up questions** as clickable chips below the response. These should be natural next steps within the current topic branch or logical pivots to a related branch.

---

## Topic Tree Structure

### Level 0 — Primary Options (shown when chat opens)

Three cards displayed in the chat panel:

1. **Let's talk about the model**
2. **Let's talk about our alignment**
3. **Let's talk about watch outs**

Free-text input is always visible at the bottom.

---

### Branch 1 — Let's Talk About the Model

**Prompt to user after selection:** "What aspect of the model would you like to explore?"

Sub-options:
- **Executive Summary**
- **Overview of Practices**
- **Overview of Outcomes**
- **Overview of LEAPs**

#### Executive Summary — Standard Format

When the user selects "Executive Summary," generate a structured response in this exact format:

1. **What This Model Is** — 2–3 sentence plain-language description of the model
2. **Who It's For** — Grade bands, school types, and contexts where this model thrives
3. **Core Approach** — The 3–4 defining practices or pedagogical elements
4. **Evidence Base** — What research or outcomes data exists; strength of evidence
5. **Implementation Snapshot** — What adoption looks like (timeline, PD, cost if known)
6. **Your Fit at a Glance** — 2–3 sentence summary of how this model maps to this school's decision frame, drawn from alignment data

**Context injected:** Full model profile + web research summary + alignment summary from recommendation engine.

#### Overview of Outcomes

Describe what outcomes this model targets and how it delivers on them. Reference the outcomes reference document (`docs/reference-docs/outcomes-summary.*`) to provide full definitions, not just names.

**Context injected:** Model's `outcomeTypes` + KB docs tagged `referenceType: "outcomes"` (deterministic, not embedding-based) + web search for `[Model Name] outcomes evidence results`.

#### Overview of LEAPs

Describe how this model embodies specific LEAPs. Reference the LEAPs reference document (`docs/reference-docs/leaps-two-pager.*`) for full definitions and "what this can mean" detail.

**Context injected:** Model's LEAP data + KB docs tagged `referenceType: "leaps"` (deterministic) + web search for `[Model Name] [specific LEAP] student experience`.

#### Overview of Practices

Describe the model's core instructional practices. Reference the practices reference document (`docs/reference-docs/practices-summary.*`) for full definitions.

**Context injected:** Model's `keyPractices` + KB docs tagged `referenceType: "practices"` (deterministic) + web search for `[Model Name] instructional practices pedagogy`.

---

### Branch 2 — Let's Talk About Our Alignment

**Prompt to user after selection:** "Which area of alignment would you like to explore?"

Sub-options:
- **Overall alignment**
- **Alignment on Outcomes**
- **Alignment on LEAPs**
- **Alignment on Practices**

#### Overall Alignment

Synthesize across all three dimensions (outcomes, LEAPs, practices). Highlight the strongest alignment points and the most significant gaps. Reference the match/mismatch data from the recommendation engine.

**Context injected:** All match data (outcomes, LEAPs, practices) + all user selections with importance rankings + all user freeform context from Steps 2–3 (`stepData["2"].outcomes_summary`, `stepData["2"].leaps_summary`, `stepData["3"].experience_summary`, `stepData["3"].practices_summary`) + all three reference documents.

#### Alignment on Outcomes

For each of the user's selected outcomes:
- If **matched**: explain *how* the model delivers on it, drawing from web research, model profile, and the outcomes reference document for what that outcome fully means.
- If **mismatched**: explain *why* it's missing — is it a real gap, a data limitation, or something the model partially addresses under a different name?
- Call out which mismatches are on **Must Have** items vs. **Nice to Have**.
- Incorporate any freeform context the user provided in Step 2 about their outcomes goals.

**Context injected:** User's selected outcomes (with importance rankings) + user's freeform context from Step 2 (`stepData["2"].outcomes_summary`) + outcome match/mismatch data from alignment + outcomes reference document (`docs/reference-docs/outcomes-summary.*`) + KB docs tagged `referenceType: "outcomes"` + model's `outcomeTypes` + web search for `[Model Name] [specific outcome] outcomes evidence`.

#### Alignment on LEAPs

Same pattern as outcomes: for each selected LEAP, explain the match or gap, severity relative to importance, and incorporate user freeform context.

**Context injected:** User's selected LEAPs (with importance rankings) + user's freeform context from Step 2 (`stepData["2"].leaps_summary`) + LEAP match data + LEAPs reference document (`docs/reference-docs/leaps-two-pager.*`) + KB docs tagged `referenceType: "leaps"` + model's LEAP data + web search for `[Model Name] [specific LEAP] student experience`.

#### Alignment on Practices

Same pattern: for each selected practice, explain alignment or gap, tie to importance, incorporate freeform context.

**Context injected:** User's selected practices (with importance rankings) + user's freeform context from Step 3 (`stepData["3"].practices_summary`, `stepData["3"].experience_summary`) + practice match data + practices reference document (`docs/reference-docs/practices-summary.*`) + KB docs tagged `referenceType: "practices"` + model's `keyPractices` + web search for `[Model Name] [specific practice] classroom pedagogy`.

---

### Branch 3 — Let's Talk About Watch Outs

**Prompt to user after selection:** Lists the user's specific constraint flags from the alignment data. Each one is clickable to dive into that specific watch out.

If there are no watch outs: "Good news — no watch outs were flagged for this model based on your inputs. Want to explore alignment or the model itself instead?"

#### Per-Watch-Out Behavior

When the user selects a specific watch out:

1. **State the tension clearly.** "Your stated constraint in [domain] is [user's answer]. This model flags a concern because [detail]."
2. **Assess severity honestly.** Is this a dealbreaker, a manageable tension, or a flag that may be less serious than it appears?
3. **Search for how others have navigated it.** Web search for `[Model Name] [domain] challenges schools implementation` to find real-world examples.
4. **Reference the system elements document** (`docs/reference-docs/system-elements.*`) for full context on what that domain means.
5. **Offer mitigation paths.** What would it take to make this work despite the tension?

**Context injected:** The specific constraint flag (domain + detail) + user's Step 4 answers for that domain (`stepData["4"]`) + user's freeform context from Step 4 for that system element group + system elements reference document (`docs/reference-docs/system-elements.*`) + KB docs tagged `referenceType: "system_elements"` + web search for `[Model Name] [domain] challenges schools implementation`.

---

## "Ask AI" Button Routing

Three "Ask AI" buttons exist on the model card. Each opens the chat panel (if not already open) and positions the user at the appropriate branch of the topic tree.

### Ask AI on Model Details Section
Opens chat → shows Branch 1 sub-options: "What aspect of the model would you like to explore?" with Executive Summary, Overview of Practices, Overview of Outcomes, Overview of LEAPs.

### Ask AI on Alignment Section
Opens chat → shows Branch 2 sub-options: "Which area of alignment would you like to explore?" with Overall Alignment, Alignment on Outcomes, Alignment on LEAPs, Alignment on Practices.

### Ask AI on a Specific Watch Out Row
Opens chat → **skips the Branch 3 menu** and goes directly into that specific watch out. The AI immediately begins the per-watch-out analysis for that constraint flag.

---

## Search Strategy Per Topic

Web searches should be **topic-scoped**, not generic. Always include the model name plus topic-specific terms.

| Topic | Web Search Query Pattern |
|-------|--------------------------|
| Executive Summary | `[Model Name] overview implementation evidence` |
| Overview of Outcomes | `[Model Name] student outcomes results evidence` |
| Overview of LEAPs | `[Model Name] student experience learning approach` |
| Overview of Practices | `[Model Name] instructional practices pedagogy` |
| Alignment: Outcomes | `[Model Name] [specific outcome name] outcomes evidence` |
| Alignment: LEAPs | `[Model Name] [specific LEAP name] student experience` |
| Alignment: Practices | `[Model Name] [specific practice name] classroom pedagogy` |
| Watch Out: [domain] | `[Model Name] [domain] challenges schools implementation` |

In all cases, also retrieve KB documents **deterministically by `referenceType`** for the relevant taxonomy area. This supplements (not replaces) the topic-scoped web search.

---

## Context Injection — User Freeform Text

Every step of the workflow allows users to add freeform context. This context MUST be included in the system prompt for relevant topics:

| Step | Freeform Fields | Relevant Topics |
|------|----------------|-----------------|
| Step 1 | `stepData["1"].context` | All topics (school context) |
| Step 2 | `stepData["2"].outcomes_summary`, `stepData["2"].leaps_summary` | Outcomes alignment, LEAPs alignment, Overall alignment |
| Step 3 | `stepData["3"].experience_summary`, `stepData["3"].practices_summary` | Practices alignment, Overall alignment |
| Step 4 | Per-group context fields in `stepData["4"]` (e.g., `staffing_context`, `budget_context`) | Watch out for that specific domain |

---

## Technical Implementation Notes

### Topic Field in Chat Request
Add a `topic` field to the chat request payload (`api.chat.stepAdvisor.input` in `shared/routes.ts`). Values:
- `"model:executive_summary"`, `"model:outcomes"`, `"model:leaps"`, `"model:practices"`
- `"alignment:overall"`, `"alignment:outcomes"`, `"alignment:leaps"`, `"alignment:practices"`
- `"watchout:[domain]"` (e.g., `"watchout:Budget"`, `"watchout:Staffing"`)
- `null` or absent = freeform chat (no topic-specific context injection)

### Backend Routing
In `server/routes.ts`, the Step 8 handler checks the `topic` field and:
1. Selects the appropriate reference document(s) by `referenceType`
2. Builds a topic-specific system prompt addendum
3. Constructs the topic-scoped web search query
4. Includes the relevant user freeform context fields

### Conversation Starters Replacement
Replace the current flat `CONVERSATION_STARTERS` array in `WorkflowV2.tsx` with the three-card topic tree UI. The cards render in the chat area when no messages exist (or after the greeting). Clicking a card shows the sub-options for that branch.

### Follow-Up Chips
After each AI response in a topic-specific flow, the backend returns a `suggestedFollowUps` array (1–2 strings) alongside the response tokens. The client renders these as clickable chips below the message.
