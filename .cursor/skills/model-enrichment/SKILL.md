---
name: model-enrichment
description: Defines the model enrichment pipeline — how models are enriched with structured content from their website and the web, how enrichment data is stored, and how it integrates with the chat experience. Use when implementing or modifying enrichment, adjusting how enrichment data is consumed in Step 8 chat, or debugging enrichment quality.
---

# Model Enrichment Pipeline

## Overview

The enrichment pipeline pre-collects detailed, structured information about each educational model so the Step 8 AI chat can draw from rich, verified data rather than relying on live web search. Enrichment is the **primary context source** for all model chat interactions; web search is a **secondary fallback** for questions the enrichment doesn't cover or where live/current information is needed.

### Why enrichment exists

Without enrichment, the model record contains only thin metadata (name, one-sentence description, comma-separated taxonomy tags, yes/no scoring flags). The AI has almost nothing substantive to work with and must rely on `gpt-4o-search-preview` web search, which is unreliable, slow, and produces shallow/generic results. Enrichment solves this by collecting comprehensive model information once and making it immediately available for every chat interaction.

---

## Enrichment Schema

Enrichment data is stored as a JSONB object in `models.enrichedContent`. Each enrichment field is stored in **dual format**: `{field}_detailed` (comprehensive, multi-paragraph content with bullet points and specifics) and `{field}_summary` (1-3 sentence condensed version). The AI chat uses the `_detailed` version; the Admin UI offers both views via tabs.

| Base Field | Description | Stored As |
|------------|-------------|-----------|
| `summary` | Comprehensive overview of the model including origin, philosophy, distinctive features, and named initiatives | `summary_detailed`, `summary_summary` |
| `target_audience` | Grade bands, school types, geographic focus, demographics, eligibility requirements | `target_audience_detailed`, `target_audience_summary` |
| `core_approach` | Defining pedagogical practices, typical student week, specific curricula/frameworks, classroom formats | `core_approach_detailed`, `core_approach_summary` |
| `evidence_base` | All research studies with authors, years, sample sizes, findings, third-party evaluations, ESSA ratings | `evidence_base_detailed`, `evidence_base_summary` |
| `implementation` | Year-by-year timeline, PD specifics, milestones, certification processes | `implementation_detailed`, `implementation_summary` |
| `cost_and_access` | Pricing tiers, per-student costs, free vs paid, typical funding sources | `cost_and_access_detailed`, `cost_and_access_summary` |
| `outcomes_detail` | How the model delivers on each CCL outcome, mapped to taxonomy with quantitative data | `outcomes_detail_detailed`, `outcomes_detail_summary` |
| `leaps_detail` | How the model embodies each LEAP with specific in-practice examples, mapped to taxonomy | `leaps_detail_detailed`, `leaps_detail_summary` |
| `practices_detail` | Day-to-day instructional practices with specific activities and learning sequences, mapped to taxonomy | `practices_detail_detailed`, `practices_detail_summary` |
| `known_challenges` | Specific implementation challenges, critiques, failure modes, equity concerns | `known_challenges_detailed`, `known_challenges_summary` |
| `scheduling_impact` | Exactly how the model affects schedules, hours per week, flexibility needed | `scheduling_impact_detailed`, `scheduling_impact_summary` |
| `staffing_requirements` | Specific roles, ratios, certifications, planning time needs | `staffing_requirements_detailed`, `staffing_requirements_summary` |
| `technology_needs` | Specific platforms, device requirements, bandwidth, LMS integrations | `technology_needs_detailed`, `technology_needs_summary` |
| `partnership_model` | Provider-school relationship details, onboarding, ongoing support, contract terms | `partnership_model_detailed`, `partnership_model_summary` |
| `source_url` | The URL used during enrichment (provenance) | `source_url` |
| `raw_scrape` | Combined output from Phase 1 + Phase 1.5 (preserved for re-enrichment without re-scraping) | `raw_scrape` |

### Storage

| Column | Type | Purpose |
|--------|------|---------|
| `enrichedContent` | `jsonb("enriched_content")` | The structured enrichment object above |
| `enrichedAt` | `timestamp("enriched_at")` | When enrichment last ran (null = never enriched) |

Defined in `shared/schema.ts` on the `models` pgTable.

---

## Model Identity — Preventing Wrong-Model Enrichment

The enrichment prompt MUST:

1. **Use the model's URL as the primary starting point** — read and summarize content from that specific URL first
2. **Search for additional sources** — news coverage, research studies, implementation case studies, third-party reviews, school testimonials
3. **Include the name + description as disambiguation** — prevent confusion with similarly named organizations
4. **Explicitly instruct the AI** not to include information about other organizations that share a similar name
5. **Skip enrichment** if the model has no `link` value — flag it as "unable to enrich — no URL"

---

## Enrichment Pipeline — Four Phases

### Phase 1: Deep Web Scrape (greedy)

A `gpt-4o-search-preview` call with a 10,000-token cap that extracts maximum raw detail from the model's URL and broader web. The prompt emphasizes exhaustiveness over brevity — extract every number, name, quote, date, and specific detail available.

**Model:** `gpt-4o-search-preview` · max_tokens: 10,000

**Key instruction:** "Be exhaustive. Include specific numbers, dates, names, and quotes whenever available. Do NOT summarize — dump all the raw detail you find."

**Cost:** ~$0.04–0.08 per model.

### Phase 1.5: Targeted Deep Dives

Four separate `gpt-4o-search-preview` calls, each focused on a specific area where school administrators need depth:

1. **Implementation & Operations** — step-by-step process, PD hours/format, planning needs, quality benchmarks, case studies from named schools
2. **Evidence & Student Outcomes** — named studies, authors, years, sample sizes, methodology, findings, ESSA ratings, third-party evaluations
3. **Student Experience & Daily Practice** — typical day/week, specific projects, assessment, progression, mentorship, student quotes
4. **Cost, Access & School Requirements** — pricing tiers, funding sources, tech/staffing/scheduling/facility requirements

**Model:** `gpt-4o-search-preview` × 4 · max_tokens: 4,000 each

**Cost:** ~$0.08–0.16 per model (4 calls).

### Phase 2: Detailed Structured Extraction

A `gpt-4o` call that processes ALL raw content from Phases 1 + 1.5 along with model metadata and CCL reference docs, producing a detailed JSON object with rich bullet points and specific examples per field.

**Model:** `gpt-4o` · max_tokens: 12,000 · response_format: json_object

**Key instruction:** "Each field should contain rich, specific content with bullet points, named examples, numbers, and quotes where available. Do NOT summarize — be thorough and specific."

**Cost:** ~$0.06–0.12 per model.

### Phase 2.5: Summary Generation

A `gpt-4o-mini` call that condenses each detailed field into a 1-3 sentence summary for quick scanning.

**Model:** `gpt-4o-mini` · max_tokens: 3,000 · response_format: json_object

**Cost:** ~$0.002–0.005 per model.

### Total cost per model: ~$0.18–0.37 (one-time, cached)

| Model count | Total enrichment cost | Estimated time (sequential) |
|-------------|----------------------|----------------------------|
| 30 models | ~$5.40–$11.10 | ~15–30 min |
| 50 models | ~$9.00–$18.50 | ~25–45 min |
| 100 models | ~$18.00–$37.00 | ~45–90 min |

---

## When Enrichment Runs

- **Manual trigger (Admin UI):** enrich a single model, all un-enriched models, or force re-enrich all
- **After Airtable sync:** if a model's name or link changed during sync, `enrichedAt` is nulled so it gets re-enriched on next manual trigger
- **New models:** inserted with `enrichedAt = null`, flagged for enrichment

### Re-enrichment Without Re-scraping

If a model already has `enrichedContent.raw_scrape`, Phase 2 can be re-run using the existing scrape data without calling `gpt-4o-search-preview` again. Useful when CCL reference docs are updated.

---

## Chat Integration — How Enrichment Is Consumed

### Context injection priority (waterfall)

```
1. Model profile (name, grades, description, practices, outcomes, link, attributes)
2. Enrichment data (enrichedContent — primary substantive content)
3. Web search (secondary fallback when enrichment is null or thin)
4. KB reference documents (CCL taxonomy definitions, deterministic by referenceType)
5. User decision frame (stepData from steps 1–7)
```

### Topic-specific field mapping

| Topic | Primary enrichment field(s) |
|-------|---------------------------|
| `model:executive_summary` | `summary`, `target_audience`, `core_approach`, `evidence_base`, `implementation`, `cost_and_access` |
| `model:outcomes` | `outcomes_detail` |
| `model:leaps` | `leaps_detail` |
| `model:practices` | `practices_detail` |
| `alignment:*` | Same as model:* plus user decision frame |
| `watchout:Scheduling` | `scheduling_impact` |
| `watchout:Staffing` | `staffing_requirements` |
| `watchout:Technology` | `technology_needs` |
| `watchout:Budget` | `cost_and_access` |
| `watchout:*` (other) | `known_challenges`, `partnership_model` |

If the enrichment field says "Not available from current sources" or is missing, fall back to a topic-scoped web search.

---

## Admin UI

- **Models tab** in Admin Settings shows enrichment status per model
- Click on a model's enrichment badge to open the enrichment viewer dialog
- **Dual-view tabs:** "Detailed" tab shows comprehensive content; "Summary" tab shows 1-3 sentence summaries per field
- "Enrich" button per model, "Enrich All" button for batch, "Re-enrich" to replace existing data
- Backward-compatible: models enriched before the dual-format update show fields without tabs

---

## Implementation

- Pipeline: `server/enrich-models.ts` — `enrichModel(modelId)` and `enrichAllModels()`
- Routes: `POST /api/admin/models/:id/enrich`, `POST /api/admin/models/enrich-all`
- Admin UI: `client/src/pages/AdminSettings.tsx` — enrichment status + viewer in Models tab
- Chat integration: `server/routes.ts` — Step 8 streaming handler injects `enrichedContent`

---

## Cross-References

- **Airtable sync & upsert:** `.cursor/skills/model-sync/SKILL.md`
- **Chat behavior & topic tree:** `.cursor/skills/model-exploration-topics/SKILL.md`
- **Chat implementation:** `.cursor/skills/model-exploration-chat/SKILL.md`
- **CCL reference docs:** `docs/reference-docs/` (outcomes, LEAPs, practices, system elements)
