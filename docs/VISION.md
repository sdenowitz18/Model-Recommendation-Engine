# Transcend Model Recommendation Engine — Product Vision

**Last updated:** May 4, 2026

---

## What This Is

The Model Recommendation Engine is an internal tool for Transcend Design Partners. It provides a structured, repeatable, AI-assisted process for matching schools and districts to Career-Connected Learning (CCL) models and point solutions from the Transcend Exchange.

The tool replaces ad-hoc, memory-based recommendations with a guided workflow that captures school context, learning aims, instructional practices, system constraints, and model preferences — then produces ranked, rationale-backed recommendations.

---

## Who Uses It

**Primary users:** Transcend Design Partners (internal staff)

**End beneficiaries:** School and district leaders seeking CCL-aligned instructional models

Design Partners use this tool in conversation with school partners to gather context, explore options, and produce a recommendation they can stand behind and explain.

---

## Core Principles

1. **Guided, not open-ended** — The workflow leads users through a deliberate sequence of questions. Nothing is left to chance or memory.

2. **Two entry points, one output** — Schools can approach recommendations from their whole CCL program (Path A) or from a specific learning experience they are designing (Path B). Both paths converge on the same ranked model output.

3. **Transparent rationale** — Every recommendation shows exactly why a model scored the way it did. Users can trace alignment back to their own inputs.

4. **AI-assisted, human-confirmed** — AI helps prefill data from documents, surfaces taxonomy suggestions in conversation, and answers questions about specific models. Humans make every consequential decision.

5. **Extensible to other domains** — CCL is the first focus area. The architecture is built to support Math, Whole Child, COMP3, and other model types in future phases.

---

## What Success Looks Like

- A Design Partner can complete a full session (school context → path selection → experience/aims → practices → system elements → preferences → recommendations) in a single working session
- Recommendations are defensible: the partner can explain the alignment rationale to a school leader
- Sessions are persistent and resumable — a partner can pause and pick up where they left off
- The system improves over time as model metadata gets richer and the recommendation engine becomes more precise

---

## Current Focus (May 2026)

Integrating the V2 workflow — which introduced Path A / Path B ("Choose Your Adventure") — as the primary core experience, replacing the original V1 linear flow. Key work:

- Unifying URL routing under `/ccl/:sessionId`
- Moving document upload to after School Context in both paths
- Adding `experience_summary` auto-generation to the prefill pipeline
- Adding primary practice prefill detection for Path B
- Deprecating V1 sessions and routing

See `ROADMAP.md` for the full sequenced epic list.
