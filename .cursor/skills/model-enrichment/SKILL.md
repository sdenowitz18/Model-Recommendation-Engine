---
name: model-enrichment
description: Defines the CCL model enrichment pipeline — how model profiles are built, what sections they contain, how they are stored, and how they integrate with the Step 8 chat experience. Use when adding new models, updating enrichment data, or modifying how enrichment is consumed in chat.
---

# Model Enrichment Pipeline

## Overview

Each model in the database has a curated profile stored in `models.enrichedContent` (JSONB). Profiles are built from two sources only:
1. **Airtable CSV** — structured fields (cost, PD, scheduling, partnerships, etc.)
2. **Program's own website** — the specific program page, not the homepage

No web search beyond the program's own site. No AI inference. Only what's explicitly confirmed in the source.

---

## Enrichment Schema

Enrichment data is stored as a flat JSONB object in `models.enrichedContent`. Each key maps to one section of the model profile.

| Key | Section | Source |
|-----|---------|--------|
| `summary` | Program summary, reach, grades | CSV `Description` + `Reach` |
| `core_approach` | How the program works day-to-day | Program website |
| `resources_provided` | Curriculum, PD, materials included | CSV `Build Items Provided` + website |
| `impact` | Outcome data verbatim from CSV | CSV `Impact` |
| `cost_and_access` | Free vs. paid; any pricing detail | CSV `Cost?` + website |
| `pd_requirements` | Whether provider PD is required; what it includes | CSV `PD required by provider?` + `Provider PD` |
| `technology_needs` | Device requirements | CSV `Device access requirements` + website |
| `scheduling_impact` | Hours, flexibility, how it fits the school day | CSV `Scheduling Considerations` + `Requires schedule flexibility?` |
| `off_site_learning` | Whether students must leave campus | CSV `Required off-site learning?` |
| `partnerships` | Whether external partners are required | CSV `Requires partnerships?` + website |
| `family_involvement` | Only included when required or depends on implementation | CSV `Requires family involvement?` + `Family Involvement` |
| `data_sharing` | Whether student data is shared; privacy policy detail | CSV `Requires data sharing?` + website |

### Storage columns

| Column | Type | Purpose |
|--------|------|---------|
| `enrichedContent` | `jsonb("enriched_content")` | The flat 12-section profile object |
| `enrichedAt` | `timestamp("enriched_at")` | When enrichment was last written |

Defined in `shared/schema.ts` on the `models` pgTable.

---

## Building a New Model Profile

Use `docs/enrichment-export/ccl-model-builder.md` to build profiles for new models. The skill:

1. Reads every relevant field from the model's Airtable CSV row
2. Identifies the program-specific URL (not the homepage)
3. Fetches the program page and confirms the content matches the model
4. Writes each section using only what's confirmed in the CSV or on the program's own site
5. Does NOT touch LEAPs, Outcomes, Practices, or Known Challenges (those are Transcend editorial tags or removed sections)

**To add a new model:**
1. Ensure the model's row exists in the Airtable CSV
2. Run: "Build the enrichment profile for [exact Solution Name from CSV]" using the ccl-model-builder skill
3. Review the output
4. Append the entry to `docs/enrichment-export/enrichment-export-rebuilt.md`
5. Run `npm run db:import-enrichment` to write it into the database

---

## Importing Enrichment into the Database

**Script:** `script/import-enrichment-rebuilt.ts`
**Command:** `npm run db:import-enrichment`

- Parses `docs/enrichment-export/enrichment-export-rebuilt.md`
- Matches each model by exact name to its DB record
- **Stops on any name mismatch and asks for confirmation** — never writes to a wrong model
- Overwrites `enrichedContent` and updates `enrichedAt` in place

---

## Sections NOT Built by This Pipeline

| Section | Why |
|---------|-----|
| LEAPs Alignment | Transcend editorial tags — managed in Airtable, stored in `models.attributes` |
| Outcomes | Transcend editorial tags — managed in Airtable, stored in `models.outcomeTypes` |
| Practices | Transcend editorial tags — managed in Airtable, stored in `models.keyPractices` |
| Known Challenges | Removed from model structure |
| Evidence Base | Renamed to Impact; verbatim from CSV only |
| Target Audience | Omitted from standard profile |
| Implementation | Removed — insufficient consistent public source material |

---

## Chat Integration — How Enrichment Is Consumed

### Context injection (Step 8)

The enrichment profile is the **authoritative and sole substantive source** for Step 8 chat. No web search. No fallback to training knowledge about the model.

```
1. Model profile (name, grades, description, keyPractices, outcomeTypes, implementationSupports, link)
2. Enrichment data (enrichedContent — all 12 sections, flat)
3. School design documents (uploaded to step 0)
4. Prior steps context (stepData from steps 1–7)
```

When enrichment is null or empty for a model, the chat tells the user and directs them to the program website and their Transcend design partner.

### Topic-to-section mapping

| Topic | Enrichment section used |
|-------|------------------------|
| `model:executive_summary` | All 12 sections + model profile tags |
| `model:summary` | `summary` |
| `model:core_approach` | `core_approach` |
| `model:resources_provided` | `resources_provided` |
| `model:impact` | `impact` |
| `model:cost_and_access` | `cost_and_access` |
| `model:pd_requirements` | `pd_requirements` |
| `model:technology_needs` | `technology_needs` |
| `model:scheduling_impact` | `scheduling_impact` |
| `model:off_site_learning` | `off_site_learning` |
| `model:partnerships` | `partnerships` |
| `model:family_involvement` | `family_involvement` |
| `model:data_sharing` | `data_sharing` |
| `watchout:[domain]` | Relevant section(s) + system elements reference doc |

---

## Implementation

- Profile data: `docs/enrichment-export/enrichment-export-rebuilt.md`
- Builder skill: `docs/enrichment-export/ccl-model-builder.md`
- Import script: `script/import-enrichment-rebuilt.ts`
- DB columns: `shared/schema.ts` → `models` table
- Chat integration: `server/routes.ts` — Step 8 streaming handler injects `enrichedContent`
- Topic prompts: `server/prompts.ts` → `getTopicPromptAddendum()`

---

## Cross-References

- **Chat behavior & topic tree:** `.cursor/skills/model-exploration-topics/SKILL.md`
- **Chat implementation:** `.cursor/skills/model-exploration-chat/SKILL.md`
- **Airtable sync:** `.cursor/skills/model-sync/SKILL.md`
