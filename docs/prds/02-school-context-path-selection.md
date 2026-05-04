# PRD 02 — School Context & Path Selection

**Last updated:** May 4, 2026
**Status:** 🔨 In Progress

---

## Overview

The entry point to every session. Users establish the school's basic context (name, district, state, grade band, community description) and then choose which path they will follow — defining recommendations for the whole CCL program (Path A) or for a specific learning experience (Path B).

---

## Requirements (Built)

- **School Context questionnaire** — typeform-style full-screen step capturing: school name, district, state, grade band (multi-select: K-5, 6-8, 9-12, Post-secondary), and a free-text community context field
- **Auto-normalization** — grade band values like "High School" auto-convert to "9-12" and persist back to the database
- **Pre-population** — when creating a new session, the school name and district are captured upfront and pre-loaded into the School Context step
- **Path picker UI** — after confirming School Context, users see two cards: "Define for whole CCL program" (Path A) and "Define for a specific experience" (Path B)
- **Path persistence** — selected path is saved to `stepData.designScope` (`"whole_program"` or `"specific_experience"`)
- **Progressive chevron reveal** — before path selection, only "School Context" and the path picker pill are visible in the header. After selection, the full step list for that path is revealed.
- **Path A advance** — choosing Path A sets `currentStep = 0` (Upload Documents) and reveals the full Path A chevron list
- **Path B advance** — choosing Path B sets `currentStep = 2` (Define Experience) and reveals the full Path B chevron list

---

## Open Requirements

- **Step label** — consistently label Step 1 as "School Context Set Up" across all header chevrons, session cards, and transition screens
- **Path picker copy** — refine the "Choose Your Adventure" framing in the path picker UI. The current card descriptions should clearly communicate the difference in outcome (whole program vs. one experience) so users choose with confidence
- **No path change after selection** — this is intentional. Provide a brief tooltip or note in the UI that says "Not sure? You can always start a new session" to set expectations

---

## Out of Scope

- District-level sessions (sessions are scoped to one school at a time)
- Grade band sub-selection within Path B at this step (that happens in the Experience Definition step)
