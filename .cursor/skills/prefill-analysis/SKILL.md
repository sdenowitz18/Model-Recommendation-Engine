---
name: prefill-analysis
description: Guides changes to the document prefill pipeline for the Transcend Model Recommendation Engine. Use when modifying how uploaded documents are analyzed, what fields are extracted, what gets written to stepData, or how prefill behaves differently for Path A vs Path B.
---

# Prefill Analysis — Document Extraction Guide

## Where the code lives

**Server route:** `server/routes.ts`
Search for `prefillFromDocuments` (~line 1065).
Route: `POST /api/sessions/:sessionId/workflow/prefill-from-documents`

**Client trigger (Path A):** `WorkflowV2.tsx` — `IntroUploadPanel` component, "Analyze documents" button
**Client trigger (Path B):** `WorkflowV2.tsx` — `ExperienceDefinitionPanel`, `runPrefill()` function

---

## Extraction Fields → stepData Write Map

| Extracted Field | stepData key written | Notes |
|---|---|---|
| `experience_name` | `stepData.experience.name` | Path B only; guard against overwrite |
| `experience_description` | `stepData.experience.description` | Path B only; guard against overwrite |
| `experience_grade_levels` | `stepData.experience.targetedGradeBands` | Path B only; array of grade strings e.g. `["9","10","11","12"]` |
| `primary_practice` | `stepData.experience.primaryPractices` | Path B only; matched to taxonomy |
| `school_name` | `stepData["1"].school_name` | Guard against overwrite |
| `state` | `stepData["1"].state` | Guard against overwrite |
| `grade_band` | `stepData["1"].grade_band` | School-level; Path A primarily |
| `community_context` | `stepData["1"].context` | Guard against overwrite |
| `outcomes` (array of names) | `stepData["2"].selected_outcomes` | Fuzzy-matched to taxonomy |
| `outcomes_context` | `stepData["2"].outcomes_summary` | Formatted bullet text |
| `leaps` (array of names) | `stepData["2"].selected_leaps` | Fuzzy-matched to taxonomy |
| `leaps_context` | `stepData["2"].leaps_summary` | Formatted bullet text |
| `practices` (array of names) | `stepData["3"].selected_practices` | Fuzzy-matched to taxonomy |
| `practices_context` | `stepData["3"].practices_summary` | Formatted bullet text |
| `experience_summary` | `stepData["3"].experience_summary` | Bullet-formatted activity list |
| `curriculum_context` | `stepData["4"].curriculum_context` | Guard against overwrite |
| `family_context` | `stepData["4"].family_context` | Guard against overwrite |
| `scheduling_context` | `stepData["4"].scheduling_context` | Guard against overwrite |
| `technology_context` | `stepData["4"].technology_context` | Guard against overwrite |
| `adult_roles_context` | `stepData["4"].adult_roles_context` | Guard against overwrite |
| `budget_context` | `stepData["4"].budget_context` | Guard against overwrite |

---

## Document Type Detection

The GPT-4o extraction prompt must detect the document type from the document's title/header and apply type-specific extraction rules. Two primary types are known:

### Type 1: Mentorship Blueprint
**Identifier:** Document title/header contains "BLUEPRINT & IMPLEMENTATION PLAN | [EXPERIENCE NAME]" or similar "Blueprint" framing.
**Example:** "CAREER CONNECTION LEARNING AT C. LECK HIGH BLUEPRINT & IMPLEMENTATION PLAN | MENTORSHIP"

### Type 2: CCL Experience Component Sketch Template (V2.0)
**Identifier:** Document title/header contains "EXPERIENCE COMPONENT DESIGN SKETCH" or "DESIGN SKETCH" or "[EXPERIENCE] Design Sketch".
**Example:** "EXPERIENCE COMPONENT DESIGN SKETCH | [EXPERIENCE]"

### Type 3: Unknown Document
Any other format. Apply general extraction heuristics.

---

## Type 1: Mentorship Blueprint — Section-by-Section Extraction

### Experience Name
- **Where:** Document title after "BLUEPRINT & IMPLEMENTATION PLAN | " (e.g., "MENTORSHIP" → normalize to "Mentorship Program")
- **Fallback:** First bold heading or program name in the opening paragraph

### Experience Description
- **Where:** "ABOUT THIS BLUEPRINT" section — extract the first 2-3 sentences describing what the program is and what students do
- **Format:** 2-3 complete sentences. Do NOT include implementation notes or "three things to know" meta-content.
- **Example:** "C. Leck High School's Mentorship Program connects students with near-peer, industry, or supervisor mentors through a structured four-phase arc. Students develop relationship skills, learning strategies, professional knowledge, and social capital while working with their mentor through weekly advisory sessions, monthly cohort sessions, and quarterly retreats."

### Grade Levels
- **Where:** Look for explicit grade mentions ("9th grade", "grades 9-12", "high school students"). "High School" implies ["9","10","11","12"]. "Middle School" implies ["6","7","8"]. Elementary implies ["K","1","2","3","4","5"].
- **Format:** Array of grade strings. Use single characters for K-8, two digits for 10-12. E.g., `["9","10","11","12"]`

### Outcomes (→ match to taxonomy)
- **Where:** "SECTION 1: STUDENT OUTCOMES" — the bold outcome name in the left column of the table (e.g., "Relationship Skills", "Learning Strategies & Habits", "Professional Knowledge & Skills", "Social Capital")
- **Format:** Return exact names as they appear; fuzzy matching will handle alignment to taxonomy

### Outcomes Context (→ formatted summary text)
- **Where:** "SECTION 1: STUDENT OUTCOMES" table — "How Mentorship Supports It" column for each outcome
- **Format:** One bullet per outcome:
  ```
  • [Outcome Name] — [1-2 sentences from the "How Mentorship Supports It" column describing how this outcome is developed]
  ```

### LEAPs (→ match to taxonomy)
- **Where:** Look for sections labeled "Learning Experience Design Principles", "Design Principles", or "Leaps". If not explicit, infer from the program's theory of learning described in the document. Common LEAPs to look for: Whole Child, Community & Connectedness, Relevance, High Expectations & Rigorous Learning, Agency, Customization.
- **Format:** Return exact LEAP names from the taxonomy

### LEAPs Context (→ formatted summary text)
- **Where:** Descriptions of design principles, program philosophy, or what makes the experience distinctive
- **Format:** One bullet per LEAP:
  ```
  • [LEAP Name] — [how this design principle shows up in this experience]
  ```

### Practices (→ match to taxonomy)
- **Where:** "SECTION 2: THE STUDENT EXPERIENCE" — the Activity names in the numbered activity table (e.g., "Learning the Match", "First Conversation", "Structured Reflection", "Goal-Setting & Tracking", "New Introductions", "Professional Rehearsal"). Also look for the program type itself (e.g., "Mentorship" or "Near-Peer Mentoring").
- **Primary Practice:** The top-level program type (e.g., "Mentorship") — match to taxonomy
- **Additional Practices:** Specific activities within the program — match each to taxonomy where possible

### Practices Context (→ formatted summary text)
- **Where:** "SECTION 2: THE STUDENT EXPERIENCE" phases and activity descriptions
- **Format:** One bullet per practice phase or activity:
  ```
  • [Phase or Activity Name] — [what students do in this phase/activity]
  ```

### Experience Summary (→ formatted bullet list)
- **Where:** "SECTION 2: THE STUDENT EXPERIENCE" — all phases and their numbered activities
- **Format:** One bullet per phase:
  ```
  • [Phase Name] — [brief description of what students do across the activities in this phase]
  ```

### System Elements (→ per-field context paragraphs)
- **Where:** "Supporting Elements" section in the blueprint overview, AND detailed sections later in the document
- **Mapping:** Each system element label in the doc maps to a context field:
  | Document label | Extract to |
  |---|---|
  | "Curriculum, Instruction & Assessment" | `curriculum_context` |
  | "Family & Community Partnerships" | `family_context` |
  | "Schedule & Use of Time" | `scheduling_context` |
  | "Adult Roles, Hiring & Learning" | `adult_roles_context` |
  | "Budget, Operations & Technology" | `budget_context` |
  | "School Community & Culture" | include in `community_context` if no other field |

- **Format per field:** 2-4 sentences synthesizing the key decisions/structures for that element. Include specific tool/resource names (e.g., "The Compass Guide", "Qooper", "The Trail Log", "MENTOR.org framework"). Do NOT just copy-paste the raw text — synthesize it into clear, readable prose.

---

## Type 2: CCL Experience Component Sketch Template — Section-by-Section Extraction

### Experience Name
- **Where:** "[EXPERIENCE]" placeholder in the title, or the school/component name in the intro paragraph "This Design Sketch of [name of school] [component]"
- **Note:** If the placeholder is still "[EXPERIENCE]", return null — the school hasn't filled it in yet

### Experience Description
- **Where:** The intro paragraph "This Design Sketch of [name of school] [component]. This program is one component of the school's Career-Connected design." — synthesize with what's in the overview
- **Format:** 2-3 sentences

### Grade Levels
- **Where:** Student outcomes section, schedule section, or school name/context. Infer from school type if stated.

### Outcomes (→ match to taxonomy)
- **Where:** "STUDENT OUTCOMES" section — the "Outcomes" column listing outcome names. Also look at "Goals By the end of this experience, students will..." column for context.
- **Format:** Return exact names; fuzzy matching handles alignment

### Outcomes Context (→ formatted summary text)
- **Where:** "How [Experience] Supports This" column in the STUDENT OUTCOMES table
- **Format:** One bullet per outcome:
  ```
  • [Outcome Name] — [text from "How [Experience] Supports This" column]
  ```

### LEAPs (→ match to taxonomy)
- **Where:** "LeapsLEAPS" section or "LEAPS / DESIGN PRINCIPLES" section — the bold LEAP heading names (WHOLE CHILD, COMMUNITY & CONNECTEDNESS, RELEVANCE, HIGH EXPECTATIONS & RIGOROUS LEARNING, AGENCY, CUSTOMIZATION)
- **Taxonomy mapping:**
  | Document heading | Taxonomy name |
  |---|---|
  | WHOLE CHILD | Whole Child |
  | COMMUNITY & CONNECTEDNESS | Community & Connectedness |
  | RELEVANCE | Relevance |
  | HIGH EXPECTATIONS & RIGOROUS LEARNING | High Expectations & Rigorous Learning |
  | AGENCY | Agency |
  | CUSTOMIZATION | Customization |

### LEAPs Context (→ formatted summary text)
- **Where:** "Kids will say…" column content for each LEAP, and the Pulse Check indicators
- **Format:** One bullet per LEAP:
  ```
  • [LEAP Name] — [what students say / how this principle shows up in this experience]
  ```

### Practices (→ match to taxonomy)
- **Where:** "ACTIVITIES & PRACTICES" section — the Activity/Practice names in the "[PART OR PHASE OF EXPERIENCE]" tables. Also use the "What the Student Does" column for context.
- **Primary Practice:** The top-level experience type (e.g., "Mentorship", "Work-Based Learning", "Internship")

### Practices Context (→ formatted summary text)
- **Where:** "ACTIVITIES & PRACTICES" tables — phase descriptions and "What the Student Does" content
- **Format:** One bullet per phase or practice:
  ```
  • [Phase/Activity Name] — [what students do]
  ```

### Experience Summary (→ formatted bullet list)
- **Where:** "ACTIVITIES & PRACTICES" tables — all phases and their activities
- **Format:** One bullet per phase/component:
  ```
  • [Phase or Component Name] — [brief description of student activities in this phase]
  ```

### System Elements (→ per-field context paragraphs)
- **Where:** FIRST check "SCHOOL ELEMENT HIGH LEVEL DESIGN DECISIONS" section (the summary table at the top with "[Type here]" fields — these are filled in by the school with their actual decisions). THEN supplement with "SCHOOL ELEMENT DESIGN DETAILS" sections for additional detail.
- **Mapping:** Same as Mentorship Blueprint:
  | Document label | Extract to |
  |---|---|
  | "Family & Community Partnerships" | `family_context` |
  | "Curriculum, Instruction & Assessment" | `curriculum_context` |
  | "Schedule & Use of Time" | `scheduling_context` |
  | "Adult Roles, Hiring & Learning" | `adult_roles_context` |
  | "Budget, Operations & Technology" | `budget_context` |
  | "School Community & Culture" | supplement `community_context` |

- **Format:** If "[Type here]" placeholders are still blank/unfilled, return null for that field. Only extract if actual content has been entered.

---

## Type 3: Unknown Document — General Extraction Heuristics

For documents that don't match either type above:

1. **Experience Name:** Look for the most prominent title, heading, or program name at the top of the document
2. **Experience Description:** First substantive paragraph that describes what the program/experience is
3. **Grade Levels:** Any explicit mention of grade levels, school type, or student age range
4. **Outcomes:** Any section labeled "outcomes", "goals", "graduate aims", "KSMs", "knowledge skills and mindsets", "grad aims", or "what students will..." — list the named outcomes
5. **LEAPs:** Any section labeled "design principles", "learning principles", "LEAPs", "theory of learning", or "what must be true for all students" — match to taxonomy
6. **Practices:** Any section labeled "activities", "practices", "student experience", "program components", "what students do", or "learning experiences" — list the activity/practice names
7. **System Elements:** Any sections discussing curriculum, staffing, scheduling, family engagement, technology, or budget — extract paragraph-level context for each
8. **When in doubt:** Extract rather than omit — it's better to have context the user can edit than to return null

---

## Output Formatting Rules

These rules apply to ALL document types. The goal is to produce text that is IMMEDIATELY readable in the workflow's text fields — not raw extractions.

### Context Summary Fields (`outcomes_context`, `leaps_context`, `practices_context`)
Use bullet format, one item per selected taxonomy item:
```
• [Item Name] — [1-2 sentences from the document about how this item shows up or why it matters]

• [Item Name] — [...]
```
Separate bullets with a blank line. Keep each bullet to 1-2 sentences. Do NOT use sub-bullets.

### Experience Summary (`experience_summary`)
Bullet format, one per phase or component:
```
• [Phase/Component Name] — [what students do in this phase or component]
```

### System Element Context Fields (`curriculum_context`, `family_context`, etc.)
Write 2-4 readable sentences in plain prose. Include:
- Specific tool/program/curriculum names mentioned in the document
- Key structural decisions (frequency, format, who's involved)
- Any notable resources or platforms
Do NOT just copy-paste raw text. Synthesize and make it readable.

### Experience Description (`experience_description`)
2-3 complete sentences that could stand alone to describe the experience. Include:
- What the program/experience IS
- What students DO in it
- What the intended development or outcome is

### Grade Levels (`experience_grade_levels`)
Array of strings. Use these formats:
- Kindergarten → "K"
- Grades 1-9 → single digit string: "1", "2", ..., "9"
- Grades 10-12 → two-digit string: "10", "11", "12"
- If "High School" stated → ["9","10","11","12"]
- If "Middle School" stated → ["6","7","8"]
- If "Elementary" stated → ["K","1","2","3","4","5"]
- Return empty array `[]` if grade levels cannot be determined

---

## How to Add a New Extracted Field

1. Add the field definition to the `Return ONLY this JSON structure` section of `extractionPrompt` in `server/routes.ts`
2. After `const extracted = JSON.parse(...)`, read the new field from `extracted`
3. Write it to the appropriate `stepData` key using the existing patch pattern
4. Add the field to the table at the top of this SKILL.md

## Taxonomy Matching

`matchTaxonomyName(name, items)` is in `server/taxonomy-match.ts`. It does fuzzy matching (normalized lowercase, partial overlap). If GPT returns a name that doesn't match, check if:
- The taxonomy item's name has changed in the DB
- The synonym list in the extraction prompt needs updating
- The document uses a significantly different name that needs a manual alias

## Testing Prefill

1. **Restart the dev server** — `node --import tsx` does NOT hot-reload; server must be restarted for `routes.ts` changes to take effect
2. Upload a document in a dev session
3. Click "Analyze documents" (Path A) or advance past screen 1 in Experience Definition (Path B)
4. Check server logs for:
   - `[prefill] Taxonomy sizes: X LEAPs, Y outcomes, Z practices`
   - `[prefill] Matched: X LEAPs, Y outcomes, Z practices`
   - `[prefill] System elements prefilled: curriculum_context, ...`
   - `[prefill] Path B experience prefilled: name, description, ...`
5. Check the workflow UI — Experience Details, Outcomes, LEAPs, Practices, and System Elements should show prefilled content
6. Verify the Decision Frame (Step 6) reflects the prefilled data

## Path A vs Path B Differences

| | Path A | Path B |
|---|---|---|
| When prefill runs | After uploading on the standalone Upload step (Step 0) | After uploading on screen 1 of the Experience Definition step |
| Scope of documents | Whole school / CCL program | Specific experience being designed |
| Prompt context | Standard prompt | Adds "IMPORTANT: These documents describe a SPECIFIC LEARNING EXPERIENCE" |
| Extra extracted fields | None | `experience_name`, `experience_description`, `experience_grade_levels`, `primary_practice` |
| Extra writes | None | Writes to `stepData.experience` |
