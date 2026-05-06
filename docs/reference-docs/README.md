# Reference Documents — CCL Taxonomy Definitions

This folder contains the source-of-truth documents that define each item in the CCL taxonomy used by the Model Recommendation Engine. These documents are referenced by the `model-exploration-topics` skill (`.cursor/skills/model-exploration-topics/SKILL.md`) to provide deep context when the AI discusses alignment, model details, or watch outs.

## Expected Documents

| File | Content | Used For |
|------|---------|----------|
| `outcomes-summary.*` | Full definitions of each CCL Outcome (Content & Career Knowledge, Cross-Cutting Competencies, Postsecondary Assets, Postsecondary Transition) | Model > Overview of Outcomes, Alignment > Outcomes |
| `leaps-two-pager.*` | Full definitions of each LEAP (Whole-Child Focus, Equity Engine, etc.) with "what this can mean" detail | Model > Overview of LEAPs, Alignment > LEAPs |
| `practices-summary.*` | Full definitions of each Practice group and individual practice | Model > Overview of Practices, Alignment > Practices |
| `system-elements.*` | Full definitions of System Element domains (staffing, budget, schedule, etc.) | Watch Out discussions |

## How These Are Used

The model exploration AI chat uses these documents as contextual reference when a user explores a specific topic. Rather than relying only on the short taxonomy descriptions in the database, the AI reads from these source documents to understand the full meaning of each outcome, LEAP, practice, or system element — then uses that understanding to give richer, more accurate analysis of how a model aligns (or doesn't) with the user's selections.
