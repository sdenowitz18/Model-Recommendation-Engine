/**
 * Seed script: randomizes all model fields with realistic test data drawn from
 * the actual taxonomy (outcomes, leaps, practices) and valid scoring attribute
 * value sets. Run this once to populate models for testing.
 *
 * Run: node --env-file=.env --import tsx server/seed-model-test-data.ts
 *
 * WARNING: Overwrites ALL model data. Do not run after syncing real data from Airtable.
 */

import { db } from "./db";
import { models, taxonomyItems, modelFieldDefs } from "@shared/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Grade band groupings (realistic sets matching the parseModelGrades parser)
// ---------------------------------------------------------------------------

const GRADE_BAND_OPTIONS = [
  "K, 1, 2, 3, 4, 5",                                 // Elementary
  "6, 7, 8",                                           // Middle
  "9, 10, 11, 12",                                     // High School
  "PS",                                                // Post-secondary
  "K, 1, 2, 3, 4, 5, 6, 7, 8",                       // K-8
  "6, 7, 8, 9, 10, 11, 12",                           // Middle + HS
  "K, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12",        // K-12
  "K, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, PS",    // All grades
];

// ---------------------------------------------------------------------------
// Weighted value pools per modelFieldDef valueType
// (repeat values to increase their probability)
// ---------------------------------------------------------------------------

const VALUE_SETS: Record<string, string[]> = {
  // "No" is most common — most models don't require hard-to-meet conditions.
  // "Unknown" second, "Yes" least common.
  yes_no_unknown: [
    "No", "No", "No",
    "Unknown", "Unknown",
    "Yes",
  ],
  // For "Depends on Implementation" fields: No/Depends most common, Yes least.
  yes_no_depends_unknown: [
    "No", "No", "No",
    "Depends on Implementation", "Depends on Implementation",
    "Unknown",
    "Yes",
  ],
  // Device access: most models work without 1:1; only a few require it.
  device_access: [
    "No Device Requirements", "No Device Requirements", "No Device Requirements",
    "Shared Classroom Devices Required", "Shared Classroom Devices Required",
    "1:1 Required",
  ],
  // Categorical cost: Free most common, Cost Associated least.
  cost_category: [
    "Free", "Free", "Free",
    "Free with Paid Options", "Free with Paid Options",
    "Paid with Funding Available",
    "Cost Associated",
  ],
  // Simple yes/no for requires_pd: most models don't require PD.
  yes_no: [
    "No", "No", "No",
    "Yes",
  ],
  grade_list: [], // handled separately
};

// Fallback for any unrecognised valueType — favour "No" / "Unknown"
const FALLBACK_VALUES = ["No", "No", "Unknown", "Yes"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], min: number, max: number): T[] {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Loading taxonomy items...");
  const allTaxonomy = await db.select().from(taxonomyItems);

  const outcomeNames = allTaxonomy
    .filter((t) => t.category === "outcome")
    .map((t) => t.name);

  const leapNames = allTaxonomy
    .filter((t) => t.category === "leap")
    .map((t) => t.name);

  const practiceNames = allTaxonomy
    .filter((t) => t.category === "practice")
    .map((t) => t.name);

  console.log(`  Outcomes: ${outcomeNames.length}, LEAPs: ${leapNames.length}, Practices: ${practiceNames.length}`);

  console.log("Loading model field definitions...");
  const fieldDefs = await db.select().from(modelFieldDefs);
  console.log(`  Field defs: ${fieldDefs.length}`);

  console.log("Loading models...");
  const allModels = await db.select().from(models);
  console.log(`  Models: ${allModels.length}`);

  const implementationSupportOptions = [
    "1:1 Coaching & Consulting",
    "Professional Development (PD)",
    "Self-serve Resources",
    "Observation Opportunities",
    "Curriculum Materials",
    "Train-the-Trainer",
    "Virtual Coaching",
    "On-site Support",
  ];

  // Decide which models will be free (~40% of them, at least 1 if >1 model)
  const freeIndices = new Set<number>();
  if (allModels.length > 1) {
    const freeCount = Math.max(1, Math.floor(allModels.length * 0.4));
    const shuffled = [...allModels.keys()].sort(() => Math.random() - 0.5);
    shuffled.slice(0, freeCount).forEach((i) => freeIndices.add(i));
  }

  console.log(`\nMarking ${freeIndices.size} model(s) as free.`);
  console.log("\nRandomizing model data...");

  for (let i = 0; i < allModels.length; i++) {
    const model = allModels[i];
    const isFree = freeIndices.has(i);

    // Grade bands — pick one realistic grouping
    const grades = pick(GRADE_BAND_OPTIONS);

    // High-level outcome, practice, and leap values matching the new Airtable structure
    const OUTCOME_CATEGORY_LABELS = [
      "Content & Career Knowledge & Skills",
      "Cross-Cutting Competencies",
      "Postsecondary Assets",
      "Postsecondary Transition",
    ];
    const ACTIVITY_CATEGORY_LABELS = [
      "Academic Integration",
      "Advising",
      "Work-Based Learning",
      "Career & College Preparation Coursework",
    ];
    const LEAP_LABELS = [
      "Relevance", "Agency", "Whole-Child Focus", "Connection & Community",
      "High Expectations with Rigorous Learning", "Customization",
    ];

    const selectedOutcomeCategories = pickN(OUTCOME_CATEGORY_LABELS, 1, 3);
    const selectedActivityCategories = pickN(ACTIVITY_CATEGORY_LABELS, 1, 3);
    const selectedLeapLabels = pickN(LEAP_LABELS, 1, 3);

    // Keep lower-level names for display-only lists (derived from taxonomy loaded above)
    const selectedOutcomeNames = pickN(outcomeNames, 2, 5);
    const selectedPracticeNames = pickN(practiceNames, 2, 5);

    const outcomeTypes = selectedOutcomeCategories.join(", ");
    const keyPractices = selectedActivityCategories.join(", ");

    // Implementation supports
    const implSupports = pickN(implementationSupportOptions, 2, 4).join(", ");

    const REACH_EXAMPLES = [
      "~100K students/year across 25 U.S. states.",
      "747K+ students; 4,425+ schools; 155+ countries (cumulative over 10 years).",
      "Available to all public schools statewide (~470K students).",
      "Part of a ~8M student, 9,000+ school footprint across North America.",
    ];
    const IMPACT_EXAMPLES = [
      "75% of alumni report career satisfaction; 96% value civic engagement.",
      "81% of students expressed increased career interest after program.",
      "92% of educators report feeling more competent after implementation.",
      "Unavailable — evidence gathering in progress.",
    ];
    const BUILD_ITEMS_EXAMPLES = [
      "Curriculum materials, teacher guides, and implementation coaching.",
      "Self-paced PD modules, lesson plans, and assessment tools.",
      "Student workbook, instructor guide, and post-program survey.",
      "Standards-aligned lesson plans, assessments, and teacher training.",
    ];

    // Scoring attributes — every field def gets a valid value, guaranteed
    const attributes: Record<string, string> = {
      // Display-only lower-level lists
      outcomes_list: selectedOutcomeNames.join(", "),
      leaps_list: selectedLeapLabels.join(", "),
      practices_list: selectedPracticeNames.join(", "),
      // Individual leap names for exact scoring match
      leaps: selectedLeapLabels.join(", "),
      // Context display fields
      reach: pick(REACH_EXAMPLES),
      impact: pick(IMPACT_EXAMPLES),
      build_items: pick(BUILD_ITEMS_EXAMPLES),
    };

    for (const fd of fieldDefs) {
      if (fd.key === "grade_band") continue; // grades handled separately

      if (fd.key === "total_solution_cost") {
        attributes[fd.key] = isFree ? "Free" : pick(VALUE_SETS.cost_category.filter(v => v !== "Free"));
        continue;
      }

      // provider_pd, scheduling_considerations, family_involvement_detail
      // are text fields — their content is set after the loop based on other attributes
      if (fd.key === "provider_pd" || fd.key === "scheduling_considerations" || fd.key === "family_involvement_detail") {
        continue;
      }

      const valueSet = VALUE_SETS[fd.valueType];
      if (valueSet && valueSet.length > 0) {
        attributes[fd.key] = pick(valueSet);
      } else {
        // Fallback: use yes/no/unknown for any unrecognized valueType
        attributes[fd.key] = pick(FALLBACK_VALUES);
      }
    }

    // ── Context-aware text fields ──────────────────────────────────────────
    // provider_pd: only set when the model requires PD
    const requiresPd = attributes["requires_pd"];
    const PROVIDER_PD_EXAMPLES = [
      "PD, coaching, and community of practice provided, focused on implementation of the model as a whole.",
      "3 hrs virtual PD and up to four coaching sessions included.",
      "NFTE U educator training required for certification.",
      "PD included and required as part of license.",
      "Annual 2-day in-person convening plus monthly virtual office hours.",
      "Online self-paced orientation (~6 hrs) required before launch.",
    ];
    attributes["provider_pd"] = requiresPd === "Yes"
      ? pick(PROVIDER_PD_EXAMPLES)
      : "No PD offered";

    // scheduling_considerations: linked to the consolidated scheduling flexibility attribute
    const schedulingFlexibility = attributes["requires_scheduling_flexibility"];
    const SCHEDULING_EXAMPLES_YES = [
      "Paid internship placements require time outside regular classes.",
      "Credit-bearing class requires a dedicated period in 11th–12th grade.",
      "Weekly off-campus site visits require early release on Fridays.",
    ];
    const SCHEDULING_EXAMPLES_DEPENDS = [
      "P-20 pathway model varies by district design; may require schedule adjustment.",
      "Implementation can be embedded in existing CTE periods or run as standalone.",
    ];
    const SCHEDULING_EXAMPLES_NO = [
      "5–30 hr modules fit into existing class time.",
      "Live virtual sessions scheduled within existing class periods.",
      "All content is asynchronous and teacher-paced.",
    ];
    if (schedulingFlexibility === "Yes") {
      attributes["scheduling_considerations"] = pick(SCHEDULING_EXAMPLES_YES);
    } else if (schedulingFlexibility === "Depends on Implementation") {
      attributes["scheduling_considerations"] = pick(SCHEDULING_EXAMPLES_DEPENDS);
    } else {
      attributes["scheduling_considerations"] = pick(SCHEDULING_EXAMPLES_NO);
    }

    // family_involvement_detail: linked to requires_family_involvement attribute value
    const familyInvolvement = attributes["requires_family_involvement"];
    const FAMILY_EXAMPLES_YES = [
      "Families sign a commitment agreement and attend two orientation sessions.",
      "Parent advisory council meets monthly; family input shapes program design.",
      "Families are required to participate in student-led conferences twice yearly.",
    ];
    const FAMILY_EXAMPLES_DEPENDS = [
      "Family engagement encouraged but optional; resources available in multiple languages.",
    ];
    const FAMILY_EXAMPLES_NO = [
      "No required family involvement; optional updates shared via newsletter.",
    ];
    if (familyInvolvement === "Yes") {
      attributes["family_involvement_detail"] = pick(FAMILY_EXAMPLES_YES);
    } else if (familyInvolvement === "Depends on Implementation") {
      attributes["family_involvement_detail"] = pick(FAMILY_EXAMPLES_DEPENDS);
    } else {
      attributes["family_involvement_detail"] = pick(FAMILY_EXAMPLES_NO);
    }

    await db.update(models).set({
      grades,
      outcomeTypes,
      keyPractices,
      implementationSupports: implSupports,
      attributes,
    }).where(eq(models.id, model.id));

    const costLabel = attributes["total_solution_cost"] ?? "—";
    console.log(`  ✓ ${model.name}`);
    console.log(`      Grades: ${grades}`);
    console.log(`      Outcome categories: ${outcomeTypes}`);
    console.log(`      Activity categories: ${keyPractices}`);
    console.log(`      LEAPs: ${attributes["leaps"]}`);
    console.log(`      Cost: ${costLabel} | PD Required: ${requiresPd}`);
    console.log(`      Scheduling flexibility: ${attributes["requires_scheduling_flexibility"]}`);
  }

  console.log(`\nDone. Randomized ${allModels.length} models.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
