# CCL Enrichment File — Update Handoff

**From:** Transcend Education  
**Re:** Rebuilt enrichment file + skill — implications for the CCL chat tool  
**Status:** Ready for review and discussion — please don't integrate yet. Let's talk through what changed and what it means before building.

---

## What Happened

The CCL enrichment file has been fully rebuilt from scratch. All 80 models now have structured profiles generated using a new skill (`ccl-model-builder.skill`, included in this folder) that pulls from Transcend's Airtable CSV and each program's own website. The file is `enrichment-export-rebuilt.md`.

This is a meaningful structural change from what existed before, and it has direct implications for how the chat system works and what it can and can't answer. Before integrating, we need to align on several open questions below.

---

## What Changed: Sections Removed

The previous version of the enrichment file included sections that have been intentionally removed from the rebuilt file. The most significant:

**Practices** — Removed entirely. The previous file contained Practices sections describing what each model looks like in action at the school/classroom level. This content was researched and vetted by Transcend's team and reflected Transcend's own framing and analysis — it was not just pulled from program websites. Because that level of curation is no longer part of the enrichment workflow, Practices is gone.

**Leaps Alignment** — Removed. The previous file tagged models against Transcend's Leaps framework. That editorial layer has been stripped out of the rebuilt file.

**Outcomes** — Removed. Replaced by a leaner **Impact** section that pulls verbatim outcome data from the Airtable CSV (e.g., "75% of alumni report career satisfaction") or honestly states that impact data is unavailable. No Transcend editorial framing.

**Known Challenges** — Removed.

**Implementation** — Removed. There was not enough consistent, verifiable source material to write this section accurately across 80 models.

**Evidence Base** — Renamed to **Impact** and simplified.

### What this means for the chat system

If a user asks about a model's Practices, Leaps alignment, or Outcomes in the Transcend sense, the system will not have that information. The chat system should handle these questions like this:

> *"Practices, Leaps alignment, and outcomes framing for this model were developed by Transcend's research team and aren't included in the current public profile. If you'd like more detail on how this model aligns to Transcend's framework, reach out to the Transcend team directly."*

Do not attempt to infer or reconstruct Practices or Leaps from the sections that do exist. That framing is Transcend's intellectual work, not public program data.

---

## What's in the Rebuilt File

Each model profile now contains up to 12 sections:

1. **Summary** — Who runs it, what it is, grade levels, reach
2. **Core Approach** — How the program actually works, sourced from the program's own website
3. **Resources Provided** — What curriculum, PD, or materials come with it
4. **Impact** — Outcome data verbatim from CSV, or an honest "not publicly reported"
5. **Cost & Access** — Free vs. cost-associated, any pricing detail available
6. **PD Requirements** — Whether provider PD is required and what it includes
7. **Technology Needs** — Device requirements
8. **Scheduling Impact** — Hours, flexibility, how it fits into the school day
9. **Off-Site Learning** — Whether it requires students to leave campus
10. **Partnerships** — Whether external community or employer partners are required
11. **Family Involvement** — Only included when required or depends on implementation (most models: omitted)
12. **Data Sharing** — Whether student data is shared, and what the program's policy says

Content is sourced from two places: structured fields from Transcend's Airtable CSV, and the program's own publicly available website. Where something couldn't be confirmed, the section says so and points to the program URL.

---

## How to Use This File in the Chat System

- **This file is the source of truth. Do not supplement it with web searches.**
- If the answer is in the file, use it.
- If a section says "For [topic], visit [URL]," that means the information wasn't publicly confirmable — tell the user that and point them to the program's site.
- If a model isn't in the file, say so honestly and suggest they contact Transcend.
- Do not editorialize. Present what's there.

---

## Adding New Models

When a new model is added to the Airtable CSV, use `ccl-model-builder.skill` to build its profile:

1. Install the skill file in your environment.
2. Run: "Build the enrichment profile for [exact Solution Name from CSV]."
3. Review the output.
4. Insert the new entry into `enrichment-export-rebuilt.md` and update the model count in the header.
5. Reload the file in the chat system.

The skill handles program-specific URL discovery, PDF fetching if the Website field is a PDF, and section-by-section generation from confirmed sources only.

---

## Open Questions — Need to Discuss Before Integrating

These are things we haven't resolved yet. Don't build around assumptions on any of these — let's align first.

### 1. Process for updating an enriched model

Right now, the skill builds new profiles. But what happens when an existing model's details change — pricing, PD requirements, a new website, a program shutting down? We don't have a defined refresh process. Options to discuss: scheduled re-runs, manual triggers, a changelog system. What's practical given how the tool is hosted?

### 2. Integration with the chat functionality

How does the chat system actually load and reference `enrichment-export-rebuilt.md`? Is it chunked into a vector store? Loaded as context? Is there a retrieval step, or does the model get the full file? The answer to this changes how we think about section length, citation format, and how the system handles cross-model comparisons. This needs to be defined before we finalize the file structure.

### 3. The executive summary skill

There's an existing executive summary skill that was built around the previous file structure — it references sections like Practices, Leaps, and Outcomes that no longer exist in the rebuilt file. That skill needs to be rethought. What should an executive summary of a CCL model look like now, given the 12 sections we have? What's the right output format for the use cases it serves?

### 4. The overall skill architecture

More broadly: the system has multiple skills that interact with the CCL data. Now that the file structure has changed significantly, we need to audit which skills still work as-is, which need to be updated, and whether any should be retired. This is a broader conversation about the skill layer sitting on top of the enrichment file.

### 5. Practices and Leaps: long-term plan

The removal of Practices and Leaps from the enrichment file is the right call for the current automated workflow — that content required Transcend's editorial judgment and can't be reliably generated from public sources. But it leaves a gap that the chat system will surface to users. Is there a path to reintroducing that content in a different form — for example, as a separate Transcend-authored overlay file that the chat system can reference alongside the enrichment file? Or is the answer simply to direct users to Transcend for that layer?

---

## Files in This Folder

| File | What it is |
|---|---|
| `enrichment-export-rebuilt.md` | The rebuilt 80-model knowledge base. Use this, not the old file. |
| `ccl-model-builder.skill` | The skill for building new model profiles. Install to use. |
| `CCL-SYSTEM-INSTRUCTIONS.md` | This document. |

---

*Prepared by Transcend Education, May 2026.*
