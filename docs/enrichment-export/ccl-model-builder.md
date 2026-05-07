# CCL Model Builder — Instructions for Adding New Models

This skill builds the narrative sections of CCL model entries using a CSV-first approach: pull from the Airtable CSV where the data exists, confirm or supplement from the program's own website, and do targeted web research only when specifically triggered. The goal is accurate, honest, minimal content — not comprehensive prose.

## Workflow — Always Follow This Order

Do not work section by section. Complete these three steps in sequence before writing anything:

**Step 1 — Read the CSV row for the model and load all fields.**

Read and record the value of every relevant field before doing anything else:

- `Description`, `Reach`, `Impact` → Summary
- `Cost?` → Cost & Access (note whether it says Free or Cost associated)
- `Solution Notes` → scan for any pricing, curriculum detail, or PD specifics to carry into relevant sections
- `PD required by provider?` → PD Requirements (note whether it is checked or empty)
- `Provider PD` → PD Requirements (the description of what PD is offered)
- `Device access requirements` → Technology Needs
- `Scheduling Considerations`, `Requires schedule flexibility?` → Scheduling Impact
- `Build Items Provided` → Resources Provided
- `Requires partnerships?` → Partnerships
- `Requires family involvement?`, `Family Involvement` → Family Involvement
- `Requires data sharing?` → Data Sharing
- `Required off-site learning?` → Off-Site Learning

Then identify which fields trigger website research beyond the main page fetch:
- `Requires partnerships?` = Yes or "Depends on implementation" → research needed
- `Requires data sharing?` = Yes → research needed
- `Device access requirements` = 1:1 or Shared → confirmation needed
- `Required off-site learning?` = Yes or "Depends on implementation" → research needed
- `Requires family involvement?` = Yes or "Depends on implementation" → research needed
- `Build Items Provided` is populated → website lookup needed

**Step 2 — Find the program-specific URL, then fetch it.**

The CSV `Website` field often points to an organization homepage or general programs directory — not the specific program page. Always do the following before fetching:

1. Look at the `Website` URL from the CSV. **If it is a direct link to a PDF, use that PDF as your primary source** — it is likely the most accurate and complete program-specific document available. Fetch it directly.
2. If it contains the program name or a deep path clearly specific to this program (but is not a PDF), use it directly.
3. If it's a homepage, a top-level domain, or a general directory (e.g., `/programs/`, `/resources-directory/`, `/curriculum/`), run a targeted search using all three of these together: the `Solution Name`, the `Organization`, and key terms from the `Description` (grade levels, distinctive program names, subject focus). Example: `"Exploring Careers" NFTE grades 5-9 site:nfte.com`. This combination significantly narrows results and reduces the chance of landing on a related-but-wrong page.
4. Before fetching a web page (not a PDF), confirm the URL you found actually matches the program: does the page title, grade range, and program description align with the CSV `Description`? If not, search again.
5. Fetch the program-specific URL or PDF — not the homepage. This is your primary source for Core Approach, Resources Provided, PD, Partnerships, Technology, and all other narrative sections.

The `Organization` field tells you who runs the program; the `Solution Name` is what you're looking for on their site; the `Description` tells you what it should look like when you find it. All three work together.

If a program-specific page cannot be found after searching, fall back to the organization homepage and note that no dedicated program page was located.

**Step 3 — Fill in all sections from what you now have.**
Write every section using only what you confirmed in Steps 1 and 2. If a section needs something you didn't find, say so honestly and point to the website. Never go back to search for something you missed — if it wasn't in the CSV or on the website, it doesn't go in.

**Source priority:**
1. CSV fields — most reliable for structured data
2. Program website — use for narrative, context, and confirmation
3. Nothing else, unless a conditional trigger applies

## Loading the CSV

Before building any sections, load the model's row from the CSV:

```python
import csv

def get_csv_row(model_name):
    with open('/sessions/optimistic-focused-allen/mnt/uploads/All Solutions-CCL.csv', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['Solution Name'].strip().lower() == model_name.strip().lower():
                return row
    return None
```

Key CSV fields and what they map to:

| CSV Field | Used In |
|---|---|
| `Description` | Summary |
| `Reach` | Summary |
| `Impact` | Impact |
| `Website` | All sections (fallback URL) |
| `Build Items Provided` | Resources Provided |
| `Cost?` | Cost & Access |
| `PD required by provider?` | PD Requirements |
| `Provider PD` | PD Requirements |
| `Device access requirements` | Technology Needs |
| `Scheduling Considerations` | Scheduling Impact |
| `Requires schedule flexibility?` | Scheduling Impact |
| `Required off-site learning?` | Off-Site Learning |
| `Requires partnerships?` | Partnerships |
| `Requires family involvement?` | Family Involvement |
| `Family Involvement` | Family Involvement |
| `Requires data sharing?` | Data Sharing |

## Sections to Build

### 1. Summary

Pull from CSV `Description`. Then append `Reach` verbatim from CSV — omit it if it says "Not publicly reported" or similar. Close with a pointer to the program website. Keep to 3–5 sentences total.

### 2. Core Approach

Fetch the program website. Describe how the program actually works — daily or weekly structure, what students do, how it's delivered — using the program's own language. One to three paragraphs. Include the source URL. Do not search beyond the program's own site.

### 3. Resources Provided

Check CSV `Build Items Provided`.

**If populated:** The field uses structured tags (e.g., "CI&A: Curriculum & Instructional Materials", "Adult: Professional Learning", "Partnerships: Community Partner Cultivation & Management"). Summarize what the program provides in plain language. Then fetch the program website and look for explicit confirmation or additional detail about what's included. Write a brief summary combining both sources, with the website URL. Example output:
```
This program provides curriculum and instructional materials, adult professional learning resources, and support for community partner cultivation. *(xello.world/en/educator/)*
```

**If not populated:**
```
Details on resources provided are not available. For more information, visit [program URL].
```

### 4. Impact

Check CSV `Impact` field first.

**If it contains actual data** (anything other than "Unavailable"): pull it verbatim as the section content, then close with a pointer to the program website for more.

**If it says "Unavailable" or is empty:**
```
For information on this program's impact, visit [program URL].
```

No web research for this section.

### 5. Cost & Access

CSV `Cost?` is populated for all 80 models. Use it as the basis. Fetch the program website to find any specifics (e.g., what "free" means, who pays, whether there are tiers). Output a sentence or two, then close with a pointer to the website.

### 6. PD Requirements

Check CSV `PD required by provider?` (`checked` = required, empty = not required or unknown) and `Provider PD`. Summarize in one to two sentences. Point to the program website. No search.

If `PD required by provider?` is empty:
```
No provider-required professional development is indicated. For details, visit [program URL].
```

If `checked`, summarize `Provider PD` content and close with the website URL.

### 7. Technology Needs

Check CSV `Device access requirements`. Values and how to handle them:

- **`None`** — State no specific device requirements. Done.
- **`1:1 required`** or **`Shared classroom devices required`** — Fetch the program website and look for explicit language about what that means in practice (browser compatibility, specs, bandwidth). Write only what the program explicitly states with a source URL. If not found: *"[CSV value]. For technical requirements, visit [program URL]."*
- **`Unknown`** — Point to the program website only.

### 8. Scheduling Impact

Check CSV `Scheduling Considerations` and `Requires schedule flexibility?`. Combine into one to two sentences. Fetch the program website to confirm or add any explicitly stated time or duration details. Close with the website URL.

### 9. Off-Site Learning

Check CSV `Required off-site learning?`. Values: `Yes`, `No`, `Depends on implementation`.

**If `No`:**
```
This program does not require off-site learning.
```

**If `Yes` or `Depends on implementation`:** Fetch the program website and look for explicit language about what off-site components are required, where they take place, and what schools need to arrange. Write only what's explicitly stated with the source URL. If nothing explicit is found:
```
This program indicates off-site learning may be required. For specifics, visit [program URL].
```

### 10. Partnerships

Check CSV `Requires partnerships?`.

- If `No` → "This program does not require external partnerships."
- If `Yes` or `Depends on implementation` → Fetch the program website and look for explicit language about what partnerships are required, with whom, and what the school's role is. Write only what's explicitly stated with the source URL. If nothing explicit is found: "This program indicates partnerships are required. For specifics, visit [program URL]."

### 11. Family Involvement

Check CSV `Requires family involvement?`.

**If `No`:** Omit this section entirely — 77 of 80 models are No, and stating it adds no value.

**If `Yes` or `Depends on implementation`:** First pull `Family Involvement` from CSV if populated — use it as a starting point. Then fetch the program website and look for explicit language about what family participation looks like, whether it's required or optional, and what schools need to communicate to families. Write only what's explicitly stated with the source URL. If nothing specific is found beyond the CSV field:
```
This program indicates family involvement is required. For specifics, visit [program URL].
```

### 12. Data Sharing

Check CSV `Requires data sharing?`. Values: `Yes`, `No`, `Unknown`.

**If `No`:**
```
This program does not require data sharing.
```

**If `Unknown`:**
```
Data sharing requirements are not confirmed. For details, visit [program URL].
```

**If `Yes`:** Fetch the program website — specifically the privacy policy or data use agreement if linked. Look for explicit language about what student data is collected, how it's used, and who has access. Write only what's explicitly stated with the source URL. If nothing explicit is found:
```
This program indicates data sharing is required. For privacy and data use details, visit [program URL].
```

## CSV Fields Not Used in Sections

The following CSV fields are either internal Transcend editorial tags or do not map to model profile sections. Do not attempt to create sections for these:
- `Leaps`, `CCL Outcomes`, `CCL Kit Activities` — Transcend framework tags, managed separately
- `Grad Aims`, `Activities` — Transcend categorizations, not program-provided data
- `Solution Notes` — Internal research notes; use only if it contains specific confirmable facts (e.g., pricing from board documents)
- `Status`, `Source`, `Date`, `Topic / Project`, `CCL`, `Literacy` — Internal metadata
- `Model Alignment + Fit`, `Learning Value for Transcend`, `Link: Call Notes`, `Link: Evaluation` — Internal Transcend assessments
- `Evidence of Impact`, `Economic Feasibility and Sustainability` — Nearly empty or rating-only fields; do not use

## Sections Not Built by This Skill

- **Known Challenges** — Removed from the model structure. Do not create it.
- **Evidence Base** — Renamed to Impact. If an existing entry still has an `### Evidence Base` section, rename it to `### Impact` when applying changes.
- **LEAPs Alignment** — Transcend editorial tags. Do not touch.
- **Outcomes** — Transcend editorial tags. Do not touch.
- **Practices** — Built separately from program materials. Do not touch.
- **Target Audience** — Skip unless specifically asked.

## The Validation Standard

For any content written from the program website:
- It must appear explicitly in the source — not implied, not inferred
- You must have the specific page URL, not just the homepage
- If you're not certain the source actually says it, it doesn't go in
- When in doubt, point to the website and say nothing more

Short and honest is always better than detailed and uncertain.

## Output Formats

**Content from CSV:**
```
[Content from CSV field]. For more details, visit [program URL].
```

**Content confirmed from website:**
```
[Content from program website]. *([specific-page-url])*
```

**Nothing confirmable:**
```
For [section topic], visit [program URL].
```

Keep sections short. Many will be one to three sentences. That's correct.

## Output File

Write all rebuilt model entries to a new file:
```
/sessions/optimistic-focused-allen/mnt/enrichment-export/enrichment-export-rebuilt.md
```

Do not modify the existing `enrichment-export.md`. The rebuilt file starts fresh — initialize it with the file header if it doesn't exist yet, then append each model's completed entry as you go.

File header to use:
```markdown
# CCL Model Enrichment Export — Rebuilt

Generated: [today's date]
Models: 80

---
```

## Applying Changes

After building sections for a model:

1. Build all sections from CSV and website data
2. Assemble the complete model entry in the correct section order
3. Append it to `enrichment-export-rebuilt.md`
4. Read the appended entry back to confirm it looks right before moving to the next model

Use this Python pattern for section replacement:

```python
import re

def replace_section_for_model(text, model_name, section_name, new_content):
    model_start = text.find(f'## {model_name}\n')
    if model_start == -1:
        return text, False
    next_model = text.find('\n## ', model_start + 10)
    model_block = text[model_start:next_model] if next_model != -1 else text[model_start:]

    section_header = f'### {section_name}\n'
    sec_start = model_block.find(section_header)
    if sec_start == -1:
        return text, False
    sec_content_start = sec_start + len(section_header)
    next_sec = re.search(r'\n### ', model_block[sec_content_start:])
    sec_content_end = sec_content_start + next_sec.start() if next_sec else len(model_block)

    new_block = (model_block[:sec_start] + section_header + '\n' +
                 new_content + '\n' + model_block[sec_content_end:])
    return text[:model_start] + new_block + (text[next_model:] if next_model != -1 else ''), True
```

## When Processing Multiple Models

Process one model at a time. Load the CSV row, build all sections, apply changes, verify, then move to the next. Report a brief summary after each: what came from CSV, what was confirmed from the website, what couldn't be confirmed.
