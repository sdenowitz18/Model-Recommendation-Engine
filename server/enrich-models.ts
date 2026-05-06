import { openai } from "./openai";
import { storage } from "./storage";
import type { Model } from "@shared/schema";

const ENRICHMENT_FIELDS_GENERAL = [
  { key: "summary", desc: "Comprehensive overview: what the model is, its origin, philosophy, who created it, how long it's been operating, and what makes it distinctive. Include specific program components and named initiatives." },
  { key: "target_audience", desc: "Grade bands served, school types (traditional, charter, alternative), geographic focus, demographics and populations specifically targeted, any eligibility requirements or prerequisites." },
  { key: "core_approach", desc: "The defining pedagogical practices and how learning works day-to-day. Describe what a typical week looks like for a student. Include specific activities, project types, curriculum structure, and classroom formats. Name specific curricula or frameworks used." },
  { key: "evidence_base", desc: "All research studies, evaluations, and documented outcomes. Include study names, authors, years, sample sizes, and specific findings (graduation rates, test scores, employment outcomes). Note the strength of evidence (RCT, quasi-experimental, descriptive). Include any third-party evaluations." },
  { key: "implementation", desc: "Detailed implementation timeline (year-by-year if available). What does Year 1 look like? Year 2? What professional development is required and how long? What planning time is needed? What are the specific milestones? Include any certification or quality benchmarking processes." },
  { key: "cost_and_access", desc: "Specific pricing tiers, licensing fees, per-student costs, what's included in each tier, free vs. paid components, how schools typically fund it (grants, Title funds, general budget). Include any available pricing from public sources." },
  { key: "known_challenges", desc: "Specific implementation challenges schools have reported, common critiques from educators or researchers, failure modes, what conditions lead to poor implementation, any equity concerns raised." },
  { key: "scheduling_impact", desc: "Exactly how the model affects the school schedule. Does it require block scheduling, release time, dedicated periods? How many hours per week? Can it fit into existing advisory or elective blocks? What scheduling flexibility is needed?" },
  { key: "staffing_requirements", desc: "Specific roles needed (coordinator, coach, liaison, etc.), teacher-to-student ratios, whether external staff are required, what certifications or training staff need, how much planning time teachers need." },
  { key: "technology_needs", desc: "Specific platforms, software, or tools required. Device requirements (1:1, shared, BYOD). Internet bandwidth needs. Any proprietary technology. LMS integration requirements." },
  { key: "partnership_model", desc: "How the provider-school relationship works in detail. What does onboarding look like? What ongoing support is provided? What's expected from the school? Contract length, renewal terms, account management structure." },
];

const ALL_ENRICHMENT_KEYS = [
  ...ENRICHMENT_FIELDS_GENERAL.map((f) => f.key),
  "outcomes_detail",
  "leaps_detail",
  "practices_detail",
];

// ---------------------------------------------------------------------------
// Taxonomy definition extraction
// ---------------------------------------------------------------------------

const OUTCOMES_HIERARCHY: Record<string, string[]> = {
  "Content & Career Knowledge & Skills": [
    "Science, Technology, Engineering & Math (STEM)",
    "Humanities",
    "Arts & Physical Education",
  ],
  "Cross-Cutting Competencies": [
    "Higher Order Thinking Skills",
    "Higher-Order Thinking Skills",
    "Learning Strategies & Habits",
    "Professional Knowledge & Skills",
    "Relationship Skills",
    "Relationships Skills",
    "Identity & Purpose",
  ],
  "Postsecondary Assets": [
    "Postsecondary Plan",
    "Industry Credentials",
    "Industry-Recognized Credentials",
    "Job Seeking Resources",
    "Social Capital",
    "College Credit",
    "Early College Credits",
  ],
  "Postsecondary Transition": [
    "High School Graduation",
    "Postsecondary Enrollment",
    "Successful Career Transition",
  ],
};

function extractDefinitionsFromKb(
  kbContent: string,
  itemNames: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const normalizedContent = kbContent.replace(/fi\s/g, "fi").replace(/ff\s/g, "ff").replace(/fl\s/g, "fl");

  for (const name of itemNames) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`${escapedName}\\s+([A-Z][^]*?)(?=\\n(?:[A-Z][a-z]|$))`, "i"),
      new RegExp(`${escapedName}[\\s\\n]+(.+(?:\\n.+)*)`, "i"),
    ];

    for (const pattern of patterns) {
      const match = normalizedContent.match(pattern);
      if (match && match[1]) {
        const def = match[1].trim().split("\n").slice(0, 5).join(" ").trim();
        if (def.length > 20) {
          result[name] = def;
          break;
        }
      }
    }
  }

  return result;
}

function getOutcomeSubItems(modelOutcomes: string): string[] {
  const tags = modelOutcomes.split(",").map((s) => s.trim()).filter(Boolean);
  const subItems: string[] = [];
  for (const tag of tags) {
    const children = OUTCOMES_HIERARCHY[tag];
    if (children) {
      subItems.push(...children);
    } else {
      subItems.push(tag);
    }
  }
  return [...new Set(subItems)];
}

function buildTaxonomyContext(
  model: Model,
  kbContent: Record<string, string>,
): { outcomesContext: string; leapsContext: string; practicesContext: string } {
  const attrs = (model.attributes ?? {}) as Record<string, string>;

  let outcomesContext = "";
  if (kbContent.outcomes) {
    const outcomesList = attrs.outcomes_list || model.outcomeTypes || "";
    const subItems = getOutcomeSubItems(outcomesList);
    const defs = extractDefinitionsFromKb(kbContent.outcomes, subItems);
    if (Object.keys(defs).length > 0) {
      outcomesContext = "This model is tagged with the following CCL outcome sub-items. For EACH one, explain specifically how the model addresses it:\n" +
        Object.entries(defs).map(([name, def]) => `- **${name}**: ${def}`).join("\n");
    } else {
      outcomesContext = `This model is tagged with these CCL outcomes: ${outcomesList}. Walk through each sub-item under these categories and explain how the model addresses it.`;
    }
  }

  let leapsContext = "";
  if (kbContent.leaps) {
    const leapsList = attrs.leaps_list || "";
    const leapNames = leapsList.split(",").map((s) => s.trim()).filter(Boolean);
    const defs = extractDefinitionsFromKb(kbContent.leaps, leapNames);
    if (Object.keys(defs).length > 0) {
      leapsContext = "This model is tagged with the following CCL LEAPs. For EACH one, explain specifically what it looks like in practice within this model:\n" +
        Object.entries(defs).map(([name, def]) => `- **${name}**: ${def}`).join("\n");
    } else {
      leapsContext = `This model is tagged with these CCL LEAPs: ${leapsList}. For each one, explain what it looks like in practice.`;
    }
  }

  let practicesContext = "";
  if (kbContent.practices) {
    const practicesList = attrs.practices_list || model.keyPractices || "";
    const practiceNames = practicesList.split(",").map((s) => s.trim()).filter(Boolean);
    const defs = extractDefinitionsFromKb(kbContent.practices, practiceNames);
    if (Object.keys(defs).length > 0) {
      practicesContext = "This model is tagged with the following CCL practices. For EACH one, describe specific student activities, assignment types, and learning sequences within this model:\n" +
        Object.entries(defs).map(([name, def]) => `- **${name}**: ${def}`).join("\n");
    } else {
      practicesContext = `This model is tagged with these CCL practices: ${practicesList}. For each one, describe what it looks like day-to-day.`;
    }
  }

  return { outcomesContext, leapsContext, practicesContext };
}

// ---------------------------------------------------------------------------
// Phase 1: Deep web scrape
// ---------------------------------------------------------------------------

async function phase1WebScrape(model: Model): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-search-preview",
    messages: [
      {
        role: "system",
        content: `You are a thorough researcher collecting DETAILED information about educational models and programs. Your goal is to extract as much specific, factual detail as possible — not summaries. Include exact numbers, named programs, timelines, quotes, specific requirements, and implementation details. School administrators will use this to make purchasing decisions, so depth and specificity matter more than brevity.`,
      },
      {
        role: "user",
        content: `Research the educational model called "${model.name}". Their official website is ${model.link}. Description: "${model.description}".

Start by reading ALL content you can find at ${model.link} and its subpages. Then search for additional sources — news articles, research papers, case studies, school testimonials, conference presentations, blog posts, and third-party reviews about this specific program.

Extract EVERYTHING you can find about:

1. **Program Details**: What exactly is it? What are the named components/modules? How is the curriculum structured? What does a student's typical day/week look like?

2. **Implementation**: What's the year-by-year rollout timeline? What specific PD is required (hours, format, topics)? What planning time do teachers need? Are there certification levels?

3. **Evidence & Research**: Name specific studies, authors, years, and findings. Include sample sizes, effect sizes, graduation rates, or any quantitative outcomes documented.

4. **Cost & Access**: Pricing tiers, per-student costs, what's free vs. paid, how schools fund it. Include anything mentioned on the website or in news articles.

5. **Staffing & Scheduling**: Specific roles needed, teacher ratios, scheduling requirements (block vs. traditional, hours per week, release time).

6. **Technology**: Specific platforms, tools, device requirements, LMS integrations.

7. **Partnerships**: How does the provider-school relationship work? Onboarding process, ongoing support, contract terms.

8. **Challenges**: What do schools struggle with? Any critiques in the literature or press?

9. **Scale & Reach**: How many schools/students/districts use it? Geographic spread.

Be exhaustive. Include specific numbers, dates, names, and quotes whenever available. Do NOT summarize — dump all the raw detail you find. If information is sparse in one area, say so explicitly.

Only include information that clearly pertains to "${model.name}" — do not include information about other organizations with similar names.`,
      },
    ],
    max_tokens: 10000,
  });

  return response.choices[0]?.message?.content || "";
}

// ---------------------------------------------------------------------------
// Phase 1.5: Targeted deep dives (conditional — only if Phase 1 is thin)
// ---------------------------------------------------------------------------

const PHASE_1_5_TOPICS = [
  {
    label: "Implementation & Operations",
    prompt: (name: string, link: string) =>
      `Search for detailed implementation information about "${name}" (${link}). I need specifics on:
- Step-by-step implementation process — what happens in month 1, semester 1, year 1, year 2+?
- Professional development: how many hours, what format (in-person, virtual, coaching cycles), what topics, who delivers it?
- What does teacher planning look like? How much collaboration time is needed?
- Quality benchmarks or certification processes (if any)
- What does a school need to have in place BEFORE starting?
- Common implementation pitfalls and how to avoid them
- Any implementation case studies from specific schools or districts (name them)

Be as specific and detailed as possible. Include exact numbers, timelines, and named examples.`,
  },
  {
    label: "Evidence & Student Outcomes",
    prompt: (name: string, link: string) =>
      `Search for ALL research, evaluations, and documented outcomes for "${name}" (${link}). I need:
- Names of specific research studies, authors, publication years, and journals
- Sample sizes and methodology (RCT, quasi-experimental, correlational, descriptive)
- Specific findings: graduation rates, test score changes, college enrollment, employment outcomes, SEL measures
- Any third-party evaluations (What Works Clearinghouse, CASEL, ESSA tier ratings)
- Longitudinal data if available
- Student and teacher testimonials with specific quotes if available
- Any published criticism of the evidence base

Be exhaustive — include every study, evaluation, or documented outcome you can find.`,
  },
  {
    label: "Student Experience & Daily Practice",
    prompt: (name: string, link: string) =>
      `Search for detailed descriptions of what "${name}" (${link}) looks like in practice for STUDENTS. I need:
- What does a typical student day or week look like?
- What specific projects, assignments, or activities do students do?
- How is student work assessed and graded?
- What does student progression look like over time (semester to semester, year to year)?
- How do students interact with external partners, mentors, or employers?
- What specific skills or competencies are developed and how are they tracked?
- Student voice: any quotes, testimonials, or case studies from actual students?
- How does the experience differ by grade level?

Include specific examples, named activities, and real student experiences wherever possible.`,
  },
  {
    label: "Cost, Access & School Requirements",
    prompt: (name: string, link: string) =>
      `Search for information about the cost, access model, and school requirements for "${name}" (${link}). I need:
- Pricing: per-student cost, annual fees, licensing tiers, what's included at each level
- Free vs. paid components — is there a free trial or freemium tier?
- How do schools typically pay for it? (Title I, Title IV, Perkins, general fund, grants)
- Technology requirements: specific devices, platforms, software, bandwidth
- Staffing requirements: specific roles needed, FTE requirements, certifications
- Scheduling: how it fits into the school day, whether it requires schedule changes
- Facility or space requirements
- Minimum school/district size or other eligibility criteria

Include any specific numbers or pricing found on the website, in news articles, or in grant documents.`,
  },
];

const PHASE_1_RICH_THRESHOLD = 8000;

async function phase1_5DeepDives(model: Model): Promise<string[]> {
  const results: string[] = [];

  for (const topic of PHASE_1_5_TOPICS) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-search-preview",
        messages: [
          {
            role: "system",
            content: `You are a thorough researcher. Extract maximum detail — specific numbers, names, dates, quotes. Do not summarize. Only include information about the specific program asked about.`,
          },
          {
            role: "user",
            content: topic.prompt(model.name, model.link),
          },
        ],
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content || "";
      if (content) {
        results.push(`=== ${topic.label} ===\n${content}`);
      }
    } catch (err: any) {
      console.warn(`[Enrichment] Phase 1.5 "${topic.label}" failed for ${model.name}:`, err.message);
      results.push(`=== ${topic.label} ===\n(Search failed: ${err.message})`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Phase 2: Structured extraction (gpt-4o-mini + inline taxonomy definitions)
// ---------------------------------------------------------------------------

async function phase2StructuredExtraction(
  model: Model,
  allResearchContent: string,
  kbContent: Record<string, string>,
): Promise<Record<string, string>> {
  const generalFieldsSpec = ENRICHMENT_FIELDS_GENERAL.map((f) => `- "${f.key}": ${f.desc}`).join("\n");

  const { outcomesContext, leapsContext, practicesContext } = buildTaxonomyContext(model, kbContent);

  const taxonomyFieldsSpec = [
    `- "outcomes_detail": Walk through each tagged outcome sub-item below and explain how this model addresses it. Use a bulleted list with one entry per sub-item. Include evidence and specifics from the research.\n\n${outcomesContext}`,
    `- "leaps_detail": Walk through each tagged LEAP below and explain what it looks like in practice within this model. Use a bulleted list with one entry per LEAP. Include specific examples.\n\n${leapsContext}`,
    `- "practices_detail": Walk through each tagged practice below and describe the specific student activities, assignments, and learning sequences for it within this model. Use a bulleted list with one entry per practice.\n\n${practicesContext}`,
  ].join("\n\n");

  const attrs = (model.attributes ?? {}) as Record<string, string>;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are generating a DETAILED structured enrichment document for an educational model. Each field should contain rich, specific content with bullet points, named examples, numbers, and quotes where available. Do NOT summarize — be thorough and specific. School administrators will use this to evaluate whether this model fits their school.

For the taxonomy fields (outcomes_detail, leaps_detail, practices_detail), you MUST address each sub-item individually in a bulleted list. Do not combine or skip items.

If information is genuinely unavailable for a field, write "Not available from current sources" — do not fabricate.

Return ONLY a valid JSON object with string values. No markdown code fences. You may use markdown formatting (headers, bullets, bold) WITHIN the string values.`,
      },
      {
        role: "user",
        content: `Generate a DETAILED structured enrichment document for "${model.name}". Use ALL the research content provided — do not leave out details.

=== GENERAL FIELDS ===
${generalFieldsSpec}

=== TAXONOMY MAPPING FIELDS (address each sub-item individually) ===
${taxonomyFieldsSpec}

=== MODEL METADATA ===
Name: ${model.name}
Description: ${model.description}
Grades: ${model.grades}
URL: ${model.link}
Outcome Types: ${model.outcomeTypes}
Key Practices: ${model.keyPractices}
Outcomes List: ${attrs.outcomes_list || "N/A"}
LEAPs List: ${attrs.leaps_list || "N/A"}
Practices List: ${attrs.practices_list || "N/A"}

=== ALL RESEARCH CONTENT ===
${allResearchContent}`,
      },
    ],
    max_tokens: 12000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    console.error(`[Enrichment] Failed to parse JSON for ${model.name}:`, content.slice(0, 200));
    return { error: "Failed to parse structured extraction response", raw_response: content };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EnrichmentResult {
  modelId: number;
  modelName: string;
  success: boolean;
  error?: string;
}

export async function enrichModel(modelId: number): Promise<EnrichmentResult> {
  const model = await storage.getModel(modelId);
  if (!model) {
    return { modelId, modelName: "Unknown", success: false, error: "Model not found" };
  }

  if (!model.link || model.link.trim() === "") {
    return {
      modelId,
      modelName: model.name,
      success: false,
      error: "No URL — unable to enrich",
    };
  }

  try {
    console.log(`[Enrichment] Phase 1: Deep web scrape for "${model.name}" (${model.link})...`);
    const rawScrape = await phase1WebScrape(model);

    let allResearchContent = rawScrape;

    if (rawScrape.length < PHASE_1_RICH_THRESHOLD) {
      console.log(`[Enrichment] Phase 1 returned ${rawScrape.length} chars (< ${PHASE_1_RICH_THRESHOLD}), running Phase 1.5 deep dives...`);
      const deepDives = await phase1_5DeepDives(model);
      allResearchContent = [rawScrape, ...deepDives].join("\n\n");
    } else {
      console.log(`[Enrichment] Phase 1 returned ${rawScrape.length} chars — skipping Phase 1.5`);
    }

    console.log(`[Enrichment] Phase 2: Structured extraction for "${model.name}"...`);
    const kbContent = await getKbReferenceContent();
    const structured = await phase2StructuredExtraction(model, allResearchContent, kbContent);

    const enrichedContent: Record<string, string> = {};
    enrichedContent.source_url = model.link;
    enrichedContent.raw_scrape = allResearchContent;

    for (const key of ALL_ENRICHMENT_KEYS) {
      const val = structured[key];
      if (!val) continue;
      if (typeof val === "object" && val !== null) {
        enrichedContent[`${key}_detailed`] = Object.entries(val as Record<string, string>)
          .map(([subKey, subVal]) => `• **${subKey}**: ${subVal}`)
          .join("\n\n");
      } else {
        enrichedContent[`${key}_detailed`] = String(val);
      }
    }

    await storage.updateModelEnrichment(modelId, enrichedContent);

    console.log(`[Enrichment] Done: "${model.name}" (raw: ${allResearchContent.length} chars)`);
    return { modelId, modelName: model.name, success: true };
  } catch (err: any) {
    console.error(`[Enrichment] Error enriching "${model.name}":`, err.message);
    return { modelId, modelName: model.name, success: false, error: err.message };
  }
}

export async function enrichAllModels(
  onlyUnenriched = true,
): Promise<{ results: EnrichmentResult[]; totalCost: string }> {
  const allModels = await storage.getAllModels();
  const targets = onlyUnenriched
    ? allModels.filter((m) => !m.enrichedAt)
    : allModels;

  console.log(`[Enrichment] Starting batch: ${targets.length} model(s) ${onlyUnenriched ? "(unenriched only)" : "(all)"}`);

  const results: EnrichmentResult[] = [];
  for (const model of targets) {
    const result = await enrichModel(model.id);
    results.push(result);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const costEstimate = `~$${(succeeded * 0.08).toFixed(2)}–$${(succeeded * 0.15).toFixed(2)}`;

  console.log(`[Enrichment] Batch complete: ${succeeded} succeeded, ${failed} failed. Est. cost: ${costEstimate}`);

  return { results, totalCost: costEstimate };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getKbReferenceContent(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const refType of ["outcomes", "practices", "leaps"]) {
    const entries = await storage.getKnowledgeByReferenceType(refType);
    if (entries.length > 0) {
      result[refType] = entries.map((e) => e.content).join("\n\n");
    }
  }
  return result;
}
