/**
 * Seed script: populates model_field_defs, scoring_rules, and scoring_config.
 * Derived from "Data Elements for CustomGPT.xlsx" (updated March 2026).
 *
 * Run: node --env-file=.env --import tsx server/seed-rules.ts
 * Safe to re-run (upserts all rows).
 */

import { db } from "./db";
import { modelFieldDefs, scoringRules, scoringConfig } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Model field definitions
// ---------------------------------------------------------------------------

const FIELD_DEFS = [
  // Context
  {
    key: "grade_band",
    label: "Grade Band",
    airtableColumn: "Grades",
    valueType: "grade_list",
    stepNumber: 1,
    questionKey: "grade_bands",
    sortOrder: 1,
  },
  // Supporting Elements — Family & Community
  {
    key: "requires_partnership",
    label: "Requires Community/Employer Partnership",
    airtableColumn: "Requires partnerships?",
    valueType: "yes_no_unknown",
    stepNumber: 4,
    questionKey: "family_restrict_partnerships",
    sortOrder: 10,
  },
  {
    key: "requires_data_sharing",
    label: "Requires Student Data Sharing",
    airtableColumn: "Requires data sharing?",
    valueType: "yes_no_unknown",
    stepNumber: 4,
    questionKey: "family_restrict_data",
    sortOrder: 11,
  },
  {
    key: "requires_family_involvement",
    label: "Requires Family Involvement",
    airtableColumn: "Requires family involvement?",
    valueType: "yes_no_unknown",
    stepNumber: 4,
    questionKey: "family_restrict_involvement",
    sortOrder: 12,
  },
  // Supporting Elements — Scheduling (consolidated single field)
  {
    key: "requires_scheduling_flexibility",
    label: "Requires Scheduling Flexibility",
    airtableColumn: "Requires schedule flexibility?",
    valueType: "yes_no_depends_unknown",
    stepNumber: 4,
    questionKey: "family_schedule_flexible",
    sortOrder: 20,
  },
  // Supporting Elements — Technology
  {
    key: "device_access_requirements",
    label: "Device Access Requirements",
    airtableColumn: "Device access requirements",
    valueType: "device_access",
    stepNumber: 4,
    questionKey: "technology_device_access",
    sortOrder: 30,
  },
  // Supporting Elements — Budget
  {
    key: "requires_offsite_learning",
    label: "Requires Off-Site or Work-Based Learning",
    airtableColumn: "Required off-site learning?",
    valueType: "yes_no_unknown",
    stepNumber: 4,
    questionKey: "budget_transportation",
    sortOrder: 40,
  },
  {
    key: "total_solution_cost",
    label: "Total Solution Cost",
    airtableColumn: "Cost?",
    valueType: "cost_category",
    stepNumber: 4,
    questionKey: "budget_available",
    sortOrder: 41,
  },
  // Supporting Elements — PD
  {
    key: "requires_pd",
    label: "Requires Professional Development",
    airtableColumn: "PD required by provider?",
    valueType: "yes_no",
    stepNumber: 4,
    questionKey: "can_commit_pd",
    sortOrder: 50,
  },
  // Display-only context fields (no scoring rules — used to enrich watchout messages)
  {
    key: "provider_pd",
    label: "Provider PD Details",
    airtableColumn: "Provider PD",
    valueType: "text",
    stepNumber: 4,
    questionKey: null,
    sortOrder: 51,
  },
  {
    key: "scheduling_considerations",
    label: "Scheduling Considerations",
    airtableColumn: "Scheduling Considerations",
    valueType: "text",
    stepNumber: 4,
    questionKey: null,
    sortOrder: 24,
  },
  {
    key: "family_involvement_detail",
    label: "Family Involvement Detail",
    airtableColumn: "Family Involvement",
    valueType: "text",
    stepNumber: 4,
    questionKey: null,
    sortOrder: 13,
  },
] as const;

// ---------------------------------------------------------------------------
// Scoring rules
// ---------------------------------------------------------------------------

type MatchType = "equals" | "contains" | "not_contains";
type Impact = "hard_blocker" | "watchout" | "none";

type RuleSeed = {
  fieldKey: string;
  modelValue: string;
  schoolAnswerKey: string;
  schoolAnswerValue: string;
  matchType?: MatchType;
  impact: Impact;
  watchoutMessage: string | null;
};

const RULES: RuleSeed[] = [
  // ── requires_partnership ─────────────────────────────────────────────────
  {
    fieldKey: "requires_partnership",
    modelValue: "Yes",
    schoolAnswerKey: "family_restrict_partnerships",
    schoolAnswerValue: "Yes",
    impact: "watchout",
    watchoutMessage:
      "This model requires community or employer partnerships. Your school indicated it has restrictions around external partnerships, which may limit how this model can be implemented.",
  },
  {
    fieldKey: "requires_partnership",
    modelValue: "Yes",
    schoolAnswerKey: "family_restrict_partnerships",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "This model requires community or employer partnerships. You indicated your school's policy on external partnerships is unknown — confirm there are no restrictions before committing.",
  },

  // ── requires_data_sharing ─────────────────────────────────────────────────
  {
    fieldKey: "requires_data_sharing",
    modelValue: "Yes",
    schoolAnswerKey: "family_restrict_data",
    schoolAnswerValue: "Yes",
    impact: "watchout",
    watchoutMessage:
      "This model requires sharing student data with external organizations. Your school has restrictions around data sharing that may create compliance or trust barriers.",
  },
  {
    fieldKey: "requires_data_sharing",
    modelValue: "Yes",
    schoolAnswerKey: "family_restrict_data",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "This model requires sharing student data with external organizations. Your school's data-sharing policy status is unknown — verify compliance before selecting this model.",
  },

  // ── requires_family_involvement ───────────────────────────────────────────
  {
    fieldKey: "requires_family_involvement",
    modelValue: "Yes",
    schoolAnswerKey: "family_restrict_involvement",
    schoolAnswerValue: "Yes",
    impact: "watchout",
    watchoutMessage:
      "This model requires active family involvement. Your school indicated limited capacity for family engagement, which may affect the model's effectiveness.",
  },
  {
    fieldKey: "requires_family_involvement",
    modelValue: "Yes",
    schoolAnswerKey: "family_restrict_involvement",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "This model requires active family involvement. You indicated your school's policy on family involvement requirements is unknown — confirm before committing.",
  },

  // ── requires_scheduling_flexibility ──────────────────────────────────────
  // Consolidated field (replaces the 4 old sub-fields).
  // Model=Yes: watchout on all three school scheduling question keys.
  // Model=Depends on Implementation: same watchouts but softer messages.
  // Model=No or Unknown: no impact in all cases (no rules needed).
  //
  // School question: "Is your annual schedule flexible?" (family_schedule_flexible)
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Yes",
    schoolAnswerKey: "family_schedule_flexible",
    schoolAnswerValue: "No",
    impact: "watchout",
    watchoutMessage:
      "This model requires flexibility in the annual school calendar. Your school indicated its schedule is not flexible — confirm whether this model can be implemented within your calendar constraints.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Yes",
    schoolAnswerKey: "family_schedule_flexible",
    schoolAnswerValue: "A little",
    impact: "watchout",
    watchoutMessage:
      "This model requires flexibility in the annual school calendar. Your school indicated the schedule is only somewhat flexible — confirm whether there is enough room for this model's timing requirements.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Yes",
    schoolAnswerKey: "family_schedule_flexible",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "This model requires flexibility in the annual school calendar, but your school's schedule flexibility is unknown. Confirm whether you can adjust your calendar before selecting this model.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Depends on Implementation",
    schoolAnswerKey: "family_schedule_flexible",
    schoolAnswerValue: "No",
    impact: "watchout",
    watchoutMessage:
      "Some implementations of this model require flexibility in the annual school calendar. Your school indicated its schedule is not flexible — review whether the implementation approach can work within your calendar constraints.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Depends on Implementation",
    schoolAnswerKey: "family_schedule_flexible",
    schoolAnswerValue: "A little",
    impact: "watchout",
    watchoutMessage:
      "Some implementations of this model may require flexibility in the annual school calendar. Your school indicated limited schedule flexibility — confirm whether the implementation can be adjusted to fit.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Depends on Implementation",
    schoolAnswerKey: "family_schedule_flexible",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "Some implementations of this model require annual schedule flexibility. Your school's calendar flexibility is unknown — clarify this before choosing an implementation path.",
  },
  // School question: "How rigid is your seat time policy?" (scheduling_seat_time)
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Yes",
    schoolAnswerKey: "scheduling_seat_time",
    schoolAnswerValue: "Must comply with seat time policy strictly",
    impact: "watchout",
    watchoutMessage:
      "This model requires scheduling flexibility, but your school must comply strictly with seat time policy. Confirm whether the required changes are feasible before selecting this model.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Yes",
    schoolAnswerKey: "scheduling_seat_time",
    schoolAnswerValue: "Some flexibility (e.g., district waivers possible)",
    impact: "watchout",
    watchoutMessage:
      "This model requires scheduling flexibility. Your school has only limited seat time flexibility — confirm whether a district waiver would allow the time reallocations this model needs.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Depends on Implementation",
    schoolAnswerKey: "scheduling_seat_time",
    schoolAnswerValue: "Must comply with seat time policy strictly",
    impact: "watchout",
    watchoutMessage:
      "Some implementations of this model require changes to seat time. Your strict compliance requirements may limit which implementation path works for your school.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Depends on Implementation",
    schoolAnswerKey: "scheduling_seat_time",
    schoolAnswerValue: "Some flexibility (e.g., district waivers possible)",
    impact: "watchout",
    watchoutMessage:
      "Certain implementation paths for this model may require seat time changes. Verify whether your available flexibility is sufficient for the path you choose.",
  },
  // School question: "Are you able to integrate flex or choice blocks?" (scheduling_flex_blocks)
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Yes",
    schoolAnswerKey: "scheduling_flex_blocks",
    schoolAnswerValue: "No",
    impact: "watchout",
    watchoutMessage:
      "This model requires the ability to integrate flex or choice blocks. Your school indicated it cannot do this, which may limit implementation options.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Yes",
    schoolAnswerKey: "scheduling_flex_blocks",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "This model requires the ability to integrate flex or choice blocks. Your school's scheduling flexibility is unknown — confirm this is possible before selecting this model.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Depends on Implementation",
    schoolAnswerKey: "scheduling_flex_blocks",
    schoolAnswerValue: "No",
    impact: "watchout",
    watchoutMessage:
      "Some implementations of this model require flex or choice blocks in the schedule. Your school indicated it cannot integrate flex blocks, which may limit which implementation path is viable.",
  },
  {
    fieldKey: "requires_scheduling_flexibility",
    modelValue: "Depends on Implementation",
    schoolAnswerKey: "scheduling_flex_blocks",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "Some implementations of this model require flex blocks in the schedule. Your school's scheduling flexibility is unknown — clarify this before committing to an implementation path.",
  },

  // ── device_access_requirements ────────────────────────────────────────────
  {
    fieldKey: "device_access_requirements",
    modelValue: "1:1 Required",
    schoolAnswerKey: "technology_device_access",
    schoolAnswerValue: "Shared classroom devices",
    impact: "watchout",
    watchoutMessage:
      "This model works best with 1:1 student devices. Your school currently has shared classroom devices, which may limit students' ability to fully engage with the model's digital components.",
  },
  {
    fieldKey: "device_access_requirements",
    modelValue: "1:1 Required",
    schoolAnswerKey: "technology_device_access",
    schoolAnswerValue: "Limited access",
    impact: "watchout",
    watchoutMessage:
      "This model works best with 1:1 student devices. Your school has limited device access — confirm whether students will have adequate access to participate fully.",
  },
  {
    fieldKey: "device_access_requirements",
    modelValue: "1:1 Required",
    schoolAnswerKey: "technology_device_access",
    schoolAnswerValue: "No reliable device access",
    impact: "watchout",
    watchoutMessage:
      "This model works best with 1:1 student devices. Your school indicated no reliable device access, which may significantly limit implementation without a device plan in place.",
  },
  {
    fieldKey: "device_access_requirements",
    modelValue: "Shared Classroom Devices Required",
    schoolAnswerKey: "technology_device_access",
    schoolAnswerValue: "Limited access",
    impact: "watchout",
    watchoutMessage:
      "This model requires at least shared classroom devices. Your school has limited device access — verify whether students will have sufficient access to complete the model's activities.",
  },
  {
    fieldKey: "device_access_requirements",
    modelValue: "Shared Classroom Devices Required",
    schoolAnswerKey: "technology_device_access",
    schoolAnswerValue: "No reliable device access",
    impact: "watchout",
    watchoutMessage:
      "This model requires at least shared classroom devices. Your school indicated no reliable device access, which may limit participation without a device plan in place.",
  },

  // ── requires_offsite_learning ─────────────────────────────────────────────
  {
    fieldKey: "requires_offsite_learning",
    modelValue: "Yes",
    schoolAnswerKey: "budget_transportation",
    schoolAnswerValue: "No",
    impact: "watchout",
    watchoutMessage:
      "This model requires off-site or work-based learning experiences. Your school indicated it cannot support student transportation for off-site activities, which may limit participation.",
  },
  {
    fieldKey: "requires_offsite_learning",
    modelValue: "Yes",
    schoolAnswerKey: "budget_transportation",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "This model requires off-site or work-based learning. Your school's transportation support status is unknown — confirm logistics before committing to this model.",
  },

  // ── total_solution_cost ───────────────────────────────────────────────────
  // Values: "Free" | "Cost Associated" | "Free with Paid Options" | "Paid with Funding Available"
  {
    fieldKey: "total_solution_cost",
    modelValue: "Cost Associated",
    schoolAnswerKey: "budget_available",
    schoolAnswerValue: "No",
    impact: "hard_blocker",
    watchoutMessage: null,
  },
  {
    fieldKey: "total_solution_cost",
    modelValue: "Cost Associated",
    schoolAnswerKey: "budget_available",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "This model has a cost associated with it, but your school's budget availability is unknown. Confirm funding before selecting this model.",
  },
  {
    fieldKey: "total_solution_cost",
    modelValue: "Free with Paid Options",
    schoolAnswerKey: "budget_available",
    schoolAnswerValue: "No",
    impact: "watchout",
    watchoutMessage:
      "This model has a paid tier. Your school indicated no budget is available — explore whether the free tier meets your needs.",
  },
  {
    fieldKey: "total_solution_cost",
    modelValue: "Free with Paid Options",
    schoolAnswerKey: "budget_available",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "This model has a paid tier. Your school's budget status is unknown — explore cost options and confirm whether budget can be allocated.",
  },
  {
    fieldKey: "total_solution_cost",
    modelValue: "Paid with Funding Available",
    schoolAnswerKey: "budget_available",
    schoolAnswerValue: "No",
    impact: "watchout",
    watchoutMessage:
      "This model has a cost associated with it, but external funding may be available to offset it. Confirm eligibility for funding before ruling this model out.",
  },
  {
    fieldKey: "total_solution_cost",
    modelValue: "Paid with Funding Available",
    schoolAnswerKey: "budget_available",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "This model has a cost associated with it, though external funding may be available. Your school's budget status is unknown — explore funding options and confirm availability.",
  },

  // ── requires_pd ──────────────────────────────────────────────────────────
  {
    fieldKey: "requires_pd",
    modelValue: "Yes",
    schoolAnswerKey: "can_commit_pd",
    schoolAnswerValue: "No",
    impact: "hard_blocker",
    watchoutMessage: null,
  },
  {
    fieldKey: "requires_pd",
    modelValue: "Yes",
    schoolAnswerKey: "can_commit_pd",
    schoolAnswerValue: "Unknown",
    impact: "watchout",
    watchoutMessage:
      "This model requires professional development. Confirm your school can commit to the PD before selecting this model.",
  },
];

// ---------------------------------------------------------------------------
// Scoring config defaults
// ---------------------------------------------------------------------------

const SCORING_CONFIG = [
  // Category weights (overall multipliers)
  { key: "outcomes_weight",         value: 1.0,   label: "Outcomes scoring weight" },
  { key: "leaps_weight",            value: 1.0,   label: "LEAPs scoring weight" },
  { key: "practices_weight",        value: 1.0,   label: "Practices scoring weight" },
  // Per-category tier point values
  { key: "leaps_top_pts",           value: 5,     label: "LEAPs: Top Priority match points" },
  { key: "leaps_important_pts",     value: 3,     label: "LEAPs: Important match points" },
  { key: "leaps_nice_pts",          value: 1,     label: "LEAPs: Nice to Have match points" },
  { key: "outcomes_top_pts",        value: 5,     label: "Outcomes: Top Priority match points" },
  { key: "outcomes_important_pts",  value: 3,     label: "Outcomes: Important match points" },
  { key: "outcomes_nice_pts",       value: 1,     label: "Outcomes: Nice to Have match points" },
  { key: "practices_top_pts",       value: 5,     label: "Practices: Top Priority match points" },
  { key: "practices_important_pts", value: 3,     label: "Practices: Important match points" },
  { key: "practices_nice_pts",      value: 1,     label: "Practices: Nice to Have match points" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertFieldDef(def: (typeof FIELD_DEFS)[number]) {
  const existing = await db.select().from(modelFieldDefs).where(eq(modelFieldDefs.key, def.key));
  if (existing.length > 0) {
    await db.update(modelFieldDefs).set({
      label: def.label,
      airtableColumn: def.airtableColumn,
      valueType: def.valueType,
      stepNumber: def.stepNumber,
      questionKey: def.questionKey,
      sortOrder: def.sortOrder,
    }).where(eq(modelFieldDefs.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db.insert(modelFieldDefs).values({
    key: def.key,
    label: def.label,
    airtableColumn: def.airtableColumn,
    valueType: def.valueType,
    stepNumber: def.stepNumber,
    questionKey: def.questionKey,
    sortOrder: def.sortOrder,
  }).returning();
  return row.id;
}

async function upsertRule(fieldDefId: number, rule: RuleSeed) {
  const existing = await db.select().from(scoringRules).where(
    and(
      eq(scoringRules.fieldDefId, fieldDefId),
      eq(scoringRules.modelValue, rule.modelValue),
      eq(scoringRules.schoolAnswerKey, rule.schoolAnswerKey),
      eq(scoringRules.schoolAnswerValue, rule.schoolAnswerValue),
    ),
  );

  const matchType = rule.matchType ?? "equals";

  if (existing.length > 0) {
    await db.update(scoringRules).set({
      impact: rule.impact,
      matchType,
      watchoutMessage: rule.watchoutMessage,
      updatedAt: new Date(),
    }).where(eq(scoringRules.id, existing[0].id));
  } else {
    await db.insert(scoringRules).values({
      fieldDefId,
      modelValue: rule.modelValue,
      schoolAnswerKey: rule.schoolAnswerKey,
      schoolAnswerValue: rule.schoolAnswerValue,
      matchType,
      impact: rule.impact,
      watchoutMessage: rule.watchoutMessage,
    });
  }
}

async function upsertConfig(cfg: { key: string; value: number; label: string }) {
  const existing = await db.select().from(scoringConfig).where(eq(scoringConfig.key, cfg.key));
  if (existing.length === 0) {
    await db.insert(scoringConfig).values({ key: cfg.key, value: cfg.value, label: cfg.label });
  } else {
    await db.update(scoringConfig).set({ label: cfg.label }).where(eq(scoringConfig.key, cfg.key));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // ── Cleanup: remove old requires_scheduling_flexibility (replaced by consolidated field) ──
  const oldSfRows = await db.select().from(modelFieldDefs).where(eq(modelFieldDefs.key, "requires_scheduling_flexibility"));
  // Only remove if it was the OLD style (it might not exist yet — the new one will be upserted below)

  // ── Cleanup: remove 4 old scheduling sub-fields ───────────────────────────
  const oldSchedulingKeys = [
    "requires_seat_time_flexibility",
    "requires_subject_minute_reallocation",
    "requires_flex_choice_blocks",
    "requires_annual_schedule_flexibility",
  ];
  for (const key of oldSchedulingKeys) {
    const rows = await db.select().from(modelFieldDefs).where(eq(modelFieldDefs.key, key));
    if (rows.length > 0) {
      await db.delete(scoringRules).where(eq(scoringRules.fieldDefId, rows[0].id));
      await db.delete(modelFieldDefs).where(eq(modelFieldDefs.id, rows[0].id));
      console.log(`  ✓ Removed old scheduling field: ${key}`);
    }
  }

  // ── Cleanup: remove requires_staff_outreach ───────────────────────────────
  const staffRows = await db.select().from(modelFieldDefs).where(eq(modelFieldDefs.key, "requires_staff_outreach"));
  if (staffRows.length > 0) {
    await db.delete(scoringRules).where(eq(scoringRules.fieldDefId, staffRows[0].id));
    await db.delete(modelFieldDefs).where(eq(modelFieldDefs.id, staffRows[0].id));
    console.log("  ✓ Removed requires_staff_outreach field def and its rules");
  }

  // ── Cleanup: remove device_capability_requirements ───────────────────────
  const deviceCapRows = await db.select().from(modelFieldDefs).where(eq(modelFieldDefs.key, "device_capability_requirements"));
  if (deviceCapRows.length > 0) {
    await db.delete(scoringRules).where(eq(scoringRules.fieldDefId, deviceCapRows[0].id));
    await db.delete(modelFieldDefs).where(eq(modelFieldDefs.id, deviceCapRows[0].id));
    console.log("  ✓ Removed device_capability_requirements field def and its rules");
  }

  // ── Cleanup: remove old scheduling_implications field (renamed to scheduling_considerations) ──
  const oldSchedImplRows = await db.select().from(modelFieldDefs).where(eq(modelFieldDefs.key, "scheduling_implications"));
  if (oldSchedImplRows.length > 0) {
    await db.delete(scoringRules).where(eq(scoringRules.fieldDefId, oldSchedImplRows[0].id));
    await db.delete(modelFieldDefs).where(eq(modelFieldDefs.id, oldSchedImplRows[0].id));
    console.log("  ✓ Removed old scheduling_implications field def (replaced by scheduling_considerations)");
  }

  // ── Cleanup: remove old numeric_budget_exceeded rule ─────────────────────
  const costDef = await db.select().from(modelFieldDefs).where(eq(modelFieldDefs.key, "total_solution_cost"));
  if (costDef.length > 0) {
    const oldBudgetRules = await db.select().from(scoringRules).where(eq(scoringRules.fieldDefId, costDef[0].id));
    for (const r of oldBudgetRules) {
      if (r.matchType === "numeric_budget_exceeded" || r.schoolAnswerKey === "budget_spend") {
        await db.delete(scoringRules).where(eq(scoringRules.id, r.id));
        console.log(`  ✓ Removed old budget rule id=${r.id}`);
      }
      // Remove old "Funding Available" standalone rule (replaced by "Paid with Funding Available")
      if (r.modelValue === "Funding Available") {
        await db.delete(scoringRules).where(eq(scoringRules.id, r.id));
        console.log(`  ✓ Removed old "Funding Available" cost rule id=${r.id}`);
      }
    }
  }

  // ── Cleanup: remove old not_contains / contains device_access rules ───────
  const deviceAccessDef = await db.select().from(modelFieldDefs).where(eq(modelFieldDefs.key, "device_access_requirements"));
  if (deviceAccessDef.length > 0) {
    const oldDeviceAccessRules = await db.select().from(scoringRules).where(eq(scoringRules.fieldDefId, deviceAccessDef[0].id));
    for (const r of oldDeviceAccessRules) {
      if (r.matchType === "not_contains" || r.matchType === "contains") {
        await db.delete(scoringRules).where(eq(scoringRules.id, r.id));
        console.log(`  ✓ Removed old device_access rule id=${r.id} matchType=${r.matchType}`);
      }
    }
  }

  console.log("Seeding model field defs…");
  const fieldDefIdMap: Record<string, number> = {};
  for (const def of FIELD_DEFS) {
    const id = await upsertFieldDef(def);
    fieldDefIdMap[def.key] = id;
    console.log(`  ✓ ${def.key} → id ${id}`);
  }

  console.log("\nSeeding scoring rules…");
  for (const rule of RULES) {
    const fieldDefId = fieldDefIdMap[rule.fieldKey];
    if (!fieldDefId) {
      console.warn(`  ✗ Unknown fieldKey "${rule.fieldKey}" — skipping`);
      continue;
    }
    await upsertRule(fieldDefId, rule);
    console.log(`  ✓ ${rule.fieldKey} | model=${rule.modelValue} | ${rule.schoolAnswerKey}=${rule.schoolAnswerValue} [${rule.matchType ?? "equals"}] → ${rule.impact}`);
  }

  console.log("\nSeeding scoring config…");
  for (const cfg of SCORING_CONFIG) {
    await upsertConfig(cfg);
    console.log(`  ✓ ${cfg.key} = ${cfg.value}`);
  }

  // ── Cleanup: remove legacy aims_weight ────────────────────────────────────
  const oldAimsWeight = await db.select().from(scoringConfig).where(eq(scoringConfig.key, "aims_weight"));
  if (oldAimsWeight.length > 0) {
    await db.delete(scoringConfig).where(eq(scoringConfig.key, "aims_weight"));
    console.log("  ✓ Removed legacy aims_weight config");
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
