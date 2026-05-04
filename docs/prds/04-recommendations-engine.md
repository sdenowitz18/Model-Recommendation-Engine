# PRD 04 — Recommendations Engine

**Last updated:** May 4, 2026
**Status:** 🔨 In Progress

---

## Overview

The recommendation engine takes all structured inputs from a session (school context, aims, practices, system elements, preferences) and produces a ranked list of CCL models with alignment rationale. The engine is deterministic and weighted — not AI-based — so recommendations are reproducible and explainable.

Path A and Path B use the same engine today. Path B will add a primary practice filter on top of the existing scoring once the models database has a `primary_practice` column.

---

## Requirements (Built)

- **Deterministic weighted scoring** — for each model, the engine computes:
  1. Aims alignment score (outcomes + LEAPs, weighted by importance: most_important=3, important=2, nice_to_have=1)
  2. Practices alignment score (practices, same weighting)
  3. Grade band match (numeric range overlap — "9-12" user input overlaps "K-12" model)
  4. Constraint detection (fuzzy keyword matching between user constraint text and model descriptions)
  5. Context notes (fuzzy match between user context summaries and model text)
  6. Total score normalized to 0–100
- **Grade band matching** — numeric range parsing handles em-dashes, "PK", "K", "Algebra 1", and common school level names
- **Alignment labels** — High (≥60%), Medium (≥30%), Low (≥1%), None (0%)
- **Recommendation cards** — show aims alignment, practices alignment, constraint flags, context notes, and link to model detail page
- **Model detail page** — shows full model info plus specific alignment overlap for the current session
- **Scoring weights config** — weights and thresholds are configurable in the recommendation engine source (`server/recommendation-engine.ts`)
- **Experience summary integration** — `stepData["3"].experience_summary` is passed to `buildContextNotes()` for fuzzy matching against models

---

## Open Requirements

- **Primary practice filter for Path B** — the Transcend team is adding a `primary_practice` column to the models database. Once available:
  - Path B sessions should **filter** the model list to only include models where `primary_practice` matches one of the user's selected primary practices from the Experience Definition step
  - Models without a `primary_practice` value are excluded from Path B results
  - After filtering, the existing scoring engine runs normally on the remaining models (outcomes, leaps, practices, system elements all still scored)
  - This filter should only apply when `stepData.designScope === "specific_experience"`
- **Preference scoring** — Step 5 preferences (implementation supports, evidence threshold, stitching openness) are captured and stored but do **not yet affect the recommendation score**. They are placeholders pending richer model metadata. Once models have structured `implementationSupports` data, these should be incorporated into scoring.
- **Semantic alignment** — current fuzzy keyword matching will miss semantic equivalents (e.g., "student agency" won't match "learner autonomy"). Long-term, embedding-based semantic matching would improve alignment accuracy.

---

## Technical Reference

- Engine: `server/recommendation-engine.ts`
- Route: `POST /api/sessions/:sessionId/recommendations`
- Scoring entry point: `generateRecommendations(stepData, models)` in the engine file
- Grade band parsing: `parseGradeBand()` in the engine
- Context notes builder: `buildContextNotes(userContext, model, outcomesSummary, leapsSummary, experienceSummary)`
- Results stored in: `recommendations` table, keyed by session

---

## Out of Scope

- LLM-based ranking (intentionally deterministic for transparency)
- Multi-model combination suggestions ("stitching" recommendations)
- Real-time score updates as user changes inputs mid-session
