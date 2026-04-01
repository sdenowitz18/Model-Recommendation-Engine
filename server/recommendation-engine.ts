import { storage } from "./storage";
import type { Model, InsertRecommendation } from "@shared/schema";
import { OUTCOME_GROUPS, PRACTICE_GROUPS } from "@shared/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportanceLevel = "most_important" | "important" | "nice_to_have";

interface TaxonomySelection {
  id: number;
  name: string;
  importance: ImportanceLevel;
}

interface MatchDetail {
  name: string;
  importance: ImportanceLevel;
  matched: boolean;
  children?: { name: string; importance: ImportanceLevel }[];
}

interface ScoreBreakdown {
  earned: number;
  max: number;
  pct: number;
  label: "High" | "Medium" | "Low" | "None";
  matches: MatchDetail[];
}

interface ConstraintFlag {
  domain: string;
  detail: string;
}

export interface AlignmentData {
  aimsScore: ScoreBreakdown;
  outcomesScore: ScoreBreakdown;
  leapsScore: ScoreBreakdown;
  practicesScore: ScoreBreakdown;
  constraintFlags: ConstraintFlag[];
  gradeBandMatch: boolean;
  gradeBandDetail: string;
  totalPoints: number;
  contextNotes: string[];
  preferences: {
    implCoaching?: string;
    implPd?: string;
    implSelfserve?: string;
    implObservation?: string;
    evidenceThreshold?: string;
    openToStitching?: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_BASE: Record<ImportanceLevel, number> = {
  most_important: 5,
  important: 3,
  nice_to_have: 1,
};

// Grade band mapping: school multi-select values → grade ranges
const GRADE_BAND_RANGES: Record<string, [number, number]> = {
  "K-5": [0, 5],
  "6-8": [6, 8],
  "9-12": [9, 12],
  "Post-secondary": [13, 14],
};

function pctToLabel(pct: number): "High" | "Medium" | "Low" | "None" {
  if (pct >= 60) return "High";
  if (pct >= 30) return "Medium";
  if (pct >= 1) return "Low";
  return "None";
}

// System element context keys (Step 4)
const SYSTEM_ELEMENT_CONTEXT_KEYS = [
  { key: "curriculum_context", label: "Curriculum, Instruction & Assessment" },
  { key: "family_context", label: "Family & Community Partnerships" },
  { key: "scheduling_context", label: "Scheduling & Use of Time" },
  { key: "technology_context", label: "Technology & Tech Infrastructure" },
  { key: "adult_roles_context", label: "Adult Roles, Hiring & Development" },
  { key: "budget_context", label: "Budget & Operations" },
];

// Legacy constraint domain keys (backward compat)
const LEGACY_CONSTRAINT_KEYS = [
  { key: "constraint_curriculum", label: "Curriculum, Instruction & Assessment" },
  { key: "constraint_community", label: "School Community & Culture" },
  { key: "constraint_staffing", label: "Adult Roles, Hiring & Learning" },
  { key: "constraint_schedule", label: "Schedule & Use of Time" },
  { key: "constraint_family", label: "Family & Community Partnerships" },
  { key: "constraint_technology", label: "Technology & Infrastructure" },
  { key: "constraint_improvement", label: "Continuous Improvement Practices" },
];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function generateRecommendations(sessionId: number): Promise<void> {
  const allModels = await storage.getAllModels();
  if (allModels.length === 0) return;

  const progress = await storage.getWorkflowProgress(sessionId);
  if (!progress?.stepData) return;

  const sd = progress.stepData as Record<string, any>;

  // Load DB-configured rules, scoring weights, and taxonomy (for group-level scoring)
  const [allRulesWithDefs, scoringConfigs, allTaxonomyItems] = await Promise.all([
    storage.getAllScoringRulesWithFieldDefs(),
    storage.getScoringConfigs(),
    storage.getAllTaxonomyItems(),
  ]);
  const taxonomyById = Object.fromEntries(allTaxonomyItems.map((t) => [t.id, t]));

  const configMap = Object.fromEntries(scoringConfigs.map((c) => [c.key, c.value]));
  const outcomesWeight = configMap["outcomes_weight"] ?? configMap["aims_weight"] ?? 1.0;
  const leapsWeight = configMap["leaps_weight"] ?? configMap["aims_weight"] ?? 1.0;
  const practicesWeight = configMap["practices_weight"] ?? 1.0;

  const leapsTierBase: Record<ImportanceLevel, number> = {
    most_important: configMap["leaps_top_pts"] ?? 5,
    important:      configMap["leaps_important_pts"] ?? 3,
    nice_to_have:   configMap["leaps_nice_pts"] ?? 1,
  };
  const outcomesTierBase: Record<ImportanceLevel, number> = {
    most_important: configMap["outcomes_top_pts"] ?? 5,
    important:      configMap["outcomes_important_pts"] ?? 3,
    nice_to_have:   configMap["outcomes_nice_pts"] ?? 1,
  };
  const practicesTierBase: Record<ImportanceLevel, number> = {
    most_important: configMap["practices_top_pts"] ?? 5,
    important:      configMap["practices_important_pts"] ?? 3,
    nice_to_have:   configMap["practices_nice_pts"] ?? 1,
  };

  // --- Step 1: Context ---
  const step1 = sd["1"] || {};
  const userContext: string = step1.context || "";

  // --- Gather user selections ---
  const step2 = sd["2"] || {};
  const step3 = sd["3"] || {};

  const selectedOutcomes: TaxonomySelection[] = step2.selected_outcomes || [];
  const selectedLeaps: TaxonomySelection[] = step2.selected_leaps || [];
  const selectedPractices: TaxonomySelection[] = step3.selected_practices || [];

  const outcomesSummary: string = step2.outcomes_summary || "";
  const leapsSummary: string = step2.leaps_summary || "";
  const experienceSummary: string = step3.experience_summary || "";

  // --- Grade bands (multi-select array or legacy single value) ---
  const gradeBands: string[] = Array.isArray(step1.grade_bands)
    ? step1.grade_bands
    : step1.grade_band
      ? [step1.grade_band]
      : [];

  // --- Step 4: System Elements ---
  const step4 = sd["4"] || {};
  const constraintTexts: { domain: string; text: string }[] = [];

  for (const c of SYSTEM_ELEMENT_CONTEXT_KEYS) {
    const val = step4[c.key];
    if (val && typeof val === "string" && val.trim().length > 0 && val.toLowerCase() !== "none") {
      constraintTexts.push({ domain: c.label, text: val });
    }
  }
  // Note: structured step4 answers (device access, budget, PD, etc.) are handled
  // by DB-driven evaluateRules — do NOT feed them into the fuzzy text matcher here
  // or they produce false-positive watchouts (e.g. "high" matching model descriptions).
  if (constraintTexts.length === 0) {
    for (const c of LEGACY_CONSTRAINT_KEYS) {
      const val = step4[c.key];
      if (val && typeof val === "string" && val.trim().length > 0 && val.toLowerCase() !== "none") {
        constraintTexts.push({ domain: c.label, text: val });
      }
    }
  }
  const legacyConstraints = step4.constraints;
  if (constraintTexts.length === 0 && typeof legacyConstraints === "object" && legacyConstraints) {
    for (const [domain, text] of Object.entries(legacyConstraints)) {
      if (text && typeof text === "string" && text.trim().length > 0 && text.toLowerCase() !== "none") {
        constraintTexts.push({ domain, text: text as string });
      }
    }
  }

  // --- Step 5: Preferences ---
  const step5 = sd["5"] || {};
  const preferences = {
    implCoaching: step5.impl_coaching,
    implPd: step5.impl_pd,
    implSelfserve: step5.impl_selfserve,
    implObservation: step5.impl_observation,
    evidenceThreshold: step5.evidence_threshold,
    openToStitching: step5.open_to_stitching,
  };

  // --- Score each model ---
  const filtered: { model: Model; alignment: AlignmentData; sortScore: number }[] = [];

  for (const model of allModels) {
    const modelAttrsForScoring = (model.attributes as Record<string, string>) || {};

    // Score Outcomes and Practices at the high-level group level (exact label match)
    const outcomesScore = computeGroupedScore(selectedOutcomes, model.outcomeTypes, OUTCOME_GROUPS, taxonomyById, outcomesTierBase);
    // Leaps matched individually by exact name against attributes["leaps"]
    const leapsScore = computeLeapsScore(selectedLeaps, modelAttrsForScoring["leaps"] ?? "", leapsTierBase);
    // Practices grouped by activity category
    const practicesScore = computeGroupedScore(selectedPractices, model.keyPractices, PRACTICE_GROUPS, taxonomyById, practicesTierBase);

    // Combined aims score (outcomes + leaps merged) — kept for UI backward compatibility
    const aimsScore = mergeScores(outcomesScore, leapsScore);

    // Grade band check — DB-backed hard blocker
    const { match: gradeBandMatch, detail: gradeBandDetail, isHardBlocker: gradeBandHardBlocker } =
      checkGradeBand(model, gradeBands);

    // DB-driven rule evaluation (hard blockers + watchouts)
    const { hardBlocked, watchoutFlags } = evaluateRules(allRulesWithDefs, model, step4);

    // Skip model entirely if hard-blocked by grade band or attribute rule
    if (gradeBandHardBlocker || hardBlocked) continue;

    // Constraint flags = grade band watchout (if soft mismatch) + attribute watchouts + fuzzy text watchouts
    const constraintFlags: ConstraintFlag[] = [];
    if (!gradeBandMatch && gradeBands.length > 0) {
      constraintFlags.push({
        domain: "Grade Band",
        detail: `Model serves "${model.grades}" but you need "${gradeBands.join(", ")}"`,
      });
    }
    constraintFlags.push(...watchoutFlags);
    constraintFlags.push(...detectTextConstraints(constraintTexts, model));

    const contextNotes = buildContextNotes(userContext, model, outcomesSummary, leapsSummary, experienceSummary);

    const totalPoints =
      outcomesScore.earned * outcomesWeight +
      leapsScore.earned * leapsWeight +
      practicesScore.earned * practicesWeight;
    const gradePenalty = gradeBandMatch ? 1 : 0.8;

    filtered.push({
      model,
      alignment: {
        aimsScore,
        outcomesScore,
        leapsScore,
        practicesScore,
        constraintFlags,
        gradeBandMatch,
        gradeBandDetail,
        totalPoints,
        contextNotes,
        preferences,
      } as AlignmentData,
      sortScore: totalPoints * gradePenalty,
    });
  }

  filtered.sort((a, b) => b.sortScore - a.sortScore);

  // Only include models with at least one alignment point — zero-score models are not shown.
  const topRecs = filtered.filter((r) => r.sortScore > 0);
  const bestScore = topRecs[0]?.sortScore || 0;

  const normalizedRecs: InsertRecommendation[] = topRecs.map((rec) => ({
    sessionId,
    modelId: rec.model.id,
    score: bestScore > 0 ? Math.round((rec.sortScore / bestScore) * 100) : 0,
    rationale: rec.alignment.gradeBandDetail,
    alignment: rec.alignment,
  }));

  await storage.saveRecommendations(normalizedRecs);
}

// ---------------------------------------------------------------------------
// DB-driven rule evaluation
// ---------------------------------------------------------------------------

// Scheduling fields that enrich watchout messages with model.attributes["scheduling_considerations"]
const SCHEDULING_FIELD_KEYS = new Set([
  "requires_scheduling_flexibility",
]);

function evaluateRules(
  rulesWithDefs: Awaited<ReturnType<typeof storage.getAllScoringRulesWithFieldDefs>>,
  model: Model,
  step4: Record<string, any>,
): { hardBlocked: boolean; watchoutFlags: ConstraintFlag[] } {
  const modelAttrs = (model.attributes as Record<string, string>) || {};

  // Accumulate watchouts per fieldDef so multiple rules firing for the same field
  // (e.g. scheduling flexibility checking 3 school questions) can be consolidated
  // into a single watchout flag instead of cluttering the output with repetition.
  type WatchoutAccum = { domain: string; fieldKey: string; details: string[] };
  const watchoutAccum = new Map<number, WatchoutAccum>();

  for (const rule of rulesWithDefs) {
    const { fieldDef } = rule;

    // grade_band and display-only fields (no questionKey) are handled elsewhere
    if (fieldDef.key === "grade_band" || !fieldDef.questionKey) continue;

    const schoolAnswer = step4[rule.schoolAnswerKey];
    const modelValue = modelAttrs[fieldDef.key];

    // All match types require the model to have a value for this field
    if (!modelValue) continue;

    // Model value match (wildcard "*" always matches)
    const modelValueMatch =
      rule.modelValue === "*" ||
      normalizeValue(modelValue) === normalizeValue(rule.modelValue);
    if (!modelValueMatch) continue;

    if (!schoolAnswer) continue;
    const schoolStr = String(schoolAnswer);

    // ── Match type logic ─────────────────────────────────────────────────────
    let matched = false;
    const matchType = rule.matchType ?? "equals";

    if (matchType === "equals") {
      matched =
        rule.schoolAnswerValue === "*" ||
        normalizeValue(schoolStr) === normalizeValue(rule.schoolAnswerValue);
    } else if (matchType === "contains") {
      matched = schoolStr.toLowerCase().includes(rule.schoolAnswerValue.toLowerCase());
    } else if (matchType === "not_contains") {
      matched = !schoolStr.toLowerCase().includes(rule.schoolAnswerValue.toLowerCase());
    }

    if (!matched) continue;

    if (rule.impact === "hard_blocker") {
      return { hardBlocked: true, watchoutFlags: [] };
    }

    if (rule.impact === "watchout") {
      let detail = rule.watchoutMessage ?? "";

      // ── Layer 1: Model-attribute enrichment (from Airtable context columns) ──
      // Note: scheduling_considerations is applied once at consolidation time below,
      // not per-rule, so it doesn't repeat across the merged scheduling watchout.
      if (fieldDef.key === "requires_pd") {
        const providerPd = modelAttrs["provider_pd"];
        if (providerPd) detail = `This model requires professional development: ${providerPd}`;
      } else if (fieldDef.key === "requires_family_involvement") {
        const involvement = modelAttrs["family_involvement_detail"];
        if (involvement) detail = `${detail} Family involvement required: ${involvement}`.trim();
      }

      // ── Layer 2: User-context enrichment (free-form detail from workflow) ──
      if (fieldDef.questionKey) {
        const userDetail = (step4[fieldDef.questionKey + "_detail"] ?? "").toString().trim();
        if (userDetail) detail = `${detail} Your school noted: "${userDetail}"`.trim();
      }

      if (detail) {
        const existing = watchoutAccum.get(fieldDef.id);
        if (existing) {
          existing.details.push(detail);
        } else {
          watchoutAccum.set(fieldDef.id, {
            domain: fieldDef.label,
            fieldKey: fieldDef.key,
            details: [detail],
          });
        }
      }
    }
  }

  // Build the final watchout flags, consolidating multiple entries for the same
  // field into one flag. Scheduling considerations are appended once at the end.
  const watchoutFlags: ConstraintFlag[] = [];
  for (const { domain, fieldKey, details } of watchoutAccum.values()) {
    let finalDetail = details.length === 1 ? details[0] : details.join(" ");

    if (SCHEDULING_FIELD_KEYS.has(fieldKey)) {
      const considerations = modelAttrs["scheduling_considerations"];
      if (considerations) finalDetail = `${finalDetail} Scheduling note: ${considerations}`.trim();
    }

    watchoutFlags.push({ domain, detail: finalDetail });
  }

  return { hardBlocked: false, watchoutFlags };
}

function normalizeValue(v: string): string {
  return v.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Grade band logic (updated: individual grade values from Airtable)
// ---------------------------------------------------------------------------

/**
 * Model grades field contains individual values like:
 * "K, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, PK, Post-secondary"
 * School selects bands: "K-5", "6-8", "9-12", "Post-secondary"
 */
function parseModelGrades(gradesField: string): Set<string> {
  const result = new Set<string>();
  if (!gradesField) return result;

  // Split on comma or semicolon
  const parts = gradesField.split(/[,;]/).map((p) => p.trim().toLowerCase());
  for (const part of parts) {
    if (!part) continue;
    // Handle ranges like "k-5", "9-12", "6-8"
    if (part.includes("-") && !part.startsWith("pre-")) {
      const [start, end] = part.split("-");
      const s = gradeToNum(start.trim());
      const e = gradeToNum(end.trim());
      if (s !== null && e !== null) {
        for (let i = s; i <= e; i++) result.add(String(i));
      }
    } else {
      const n = gradeToNum(part);
      if (n !== null) result.add(String(n));
    }
    // Special tokens
    if (part === "post-secondary" || part === "post secondary" || part === "postsecondary" || part === "ps") {
      result.add("post-secondary");
    }
    if (part === "pk" || part === "pre-k" || part === "prek") {
      result.add("-1");
    }
  }
  return result;
}

function gradeToNum(g: string): number | null {
  const s = g.trim().toLowerCase();
  if (s === "k" || s === "kindergarten") return 0;
  if (s === "pk" || s === "pre-k" || s === "prek") return -1;
  const n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  return null;
}

function gradeBandToGrades(band: string): Set<string> {
  const result = new Set<string>();
  const range = GRADE_BAND_RANGES[band];
  if (!range) {
    // Try old parseGradeRange as fallback
    const parsed = parseGradeRangeFallback(band);
    if (parsed) {
      for (let i = parsed[0]; i <= parsed[1]; i++) result.add(String(i));
    }
    return result;
  }
  if (band === "Post-secondary") {
    result.add("post-secondary");
    result.add("13");
    result.add("14");
    return result;
  }
  for (let i = range[0]; i <= range[1]; i++) result.add(String(i));
  return result;
}

function checkGradeBand(
  model: Model,
  gradeBands: string[],
): { match: boolean; detail: string; isHardBlocker: boolean } {
  if (gradeBands.length === 0) {
    return { match: true, detail: "No grade band specified", isHardBlocker: false };
  }

  const modelGrades = parseModelGrades(model.grades);

  if (modelGrades.size === 0) {
    // Can't parse — try legacy range parser, assume match to avoid false negatives
    const legacyRange = parseGradeRangeFallback(model.grades);
    if (!legacyRange) {
      return { match: true, detail: `Model grades "${model.grades}" (unable to parse)`, isHardBlocker: false };
    }
    // Build model grade set from range
    for (let i = legacyRange[0]; i <= legacyRange[1]; i++) modelGrades.add(String(i));
  }

  // Check overlap between model grades and any selected school band
  const matchedBands: string[] = [];
  for (const band of gradeBands) {
    const bandGrades = gradeBandToGrades(band);
    const hasOverlap = [...bandGrades].some((g) => modelGrades.has(g));
    if (hasOverlap) matchedBands.push(band);
  }

  if (matchedBands.length > 0) {
    return {
      match: true,
      detail: `Serves ${matchedBands.join(", ")} grades (model: ${model.grades})`,
      isHardBlocker: false,
    };
  }

  // No overlap — this is a hard blocker per the plan
  return {
    match: false,
    detail: `Grade band mismatch: model serves "${model.grades}", you need "${gradeBands.join(", ")}"`,
    isHardBlocker: true,
  };
}

// Legacy range parser (kept for backward compat with old grade formats)
function parseGradeRangeFallback(raw: string): [number, number] | null {
  if (!raw) return null;
  const s = raw.replace(/[\u2013\u2014]/g, "-").toLowerCase().trim();
  if (s.includes("high school") || s === "high") return [9, 12];
  if (s.includes("middle school") || s === "middle") return [6, 8];
  if (s.includes("elementary") || s === "elem") return [0, 5];
  if (s.includes("pre-k") || s.startsWith("pk")) {
    const nums = s.match(/\d+/g);
    const max = nums && nums.length > 0 ? parseInt(nums[nums.length - 1], 10) : 5;
    return [-1, max];
  }
  const hasAlgebra = s.includes("algebra");
  const nums = s.match(/\d+/g);
  if (!nums || nums.length === 0) {
    if (s.startsWith("k")) return [0, 5];
    return null;
  }
  const parsed = nums.map((n) => parseInt(n, 10));
  if (parsed.length === 1) {
    if (s.startsWith("k")) return [0, parsed[0]];
    if (hasAlgebra) return [parsed[0], 9];
    return [parsed[0], parsed[0]];
  }
  let min = parsed[0];
  let max = parsed[parsed.length - 1];
  if (s.startsWith("k")) min = 0;
  if (hasAlgebra) max = Math.max(max, 9);
  return [Math.min(min, max), Math.max(min, max)];
}

// ---------------------------------------------------------------------------
// Text-based constraint detection (soft fuzzy matching)
// ---------------------------------------------------------------------------

function detectTextConstraints(
  userConstraints: { domain: string; text: string }[],
  model: Model,
): ConstraintFlag[] {
  const flags: ConstraintFlag[] = [];
  const modelText = [model.description, model.keyPractices, model.implementationSupports]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const constraint of userConstraints) {
    const words = constraint.text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .filter(
        (w) =>
          !["there", "their", "they", "that", "this", "with", "from", "have", "been", "about", "would", "could", "should", "some", "other", "than", "what", "when", "which", "into", "more", "also", "will", "must", "need", "none", "does", "each"].includes(w),
      );

    for (const word of words) {
      if (modelText.includes(word)) {
        flags.push({
          domain: constraint.domain,
          detail: `Potential overlap with "${constraint.domain}" constraint — model mentions "${word}"`,
        });
        break;
      }
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Context notes builder
// ---------------------------------------------------------------------------

function buildContextNotes(
  userContext: string,
  model: Model,
  outcomesSummary: string,
  leapsSummary: string,
  experienceSummary: string,
): string[] {
  const notes: string[] = [];
  const modelText = [model.description, model.keyPractices, model.outcomeTypes, model.implementationSupports]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (userContext) {
    const contextWords = userContext
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5)
      .filter((w) => !["there", "their", "about", "would", "could", "should", "which", "these", "those", "other"].includes(w));

    const matchedWords = contextWords.filter((w) => modelText.includes(w));
    if (matchedWords.length > 0) {
      const unique = Array.from(new Set(matchedWords)).slice(0, 3);
      notes.push(`Context alignment: model description references ${unique.map((w) => `"${w}"`).join(", ")}`);
    }
  }

  if (outcomesSummary && fuzzyMatchSingle(outcomesSummary.slice(0, 100), modelText)) {
    notes.push(`Outcomes alignment: "${outcomesSummary.slice(0, 80)}..."`);
  }
  if (experienceSummary && fuzzyMatchSingle(experienceSummary.slice(0, 100), modelText)) {
    notes.push(`Experience alignment: "${experienceSummary.slice(0, 80)}..."`);
  }

  return notes;
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/** Merge two ScoreBreakdowns into one combined score (used to build the backward-compat aimsScore). */
function mergeScores(a: ScoreBreakdown, b: ScoreBreakdown): ScoreBreakdown {
  const earned = a.earned + b.earned;
  const max = a.max + b.max;
  const pct = max > 0 ? Math.round((earned / max) * 100) : 0;
  return {
    earned,
    max,
    pct,
    label: pctToLabel(pct),
    matches: [...a.matches, ...b.matches],
  };
}

function tierPriority(tier: ImportanceLevel): number {
  if (tier === "most_important") return 2;
  if (tier === "important") return 1;
  return 0;
}

/**
 * Group user selections by their taxonomy group key, apply the highest tier per group,
 * then exact-match the group label against the comma-separated model field.
 * Used for both Outcomes (OUTCOME_GROUPS) and Practices (PRACTICE_GROUPS).
 */
function computeGroupedScore(
  selections: TaxonomySelection[],
  modelField: string,
  groups: readonly { key: string; label: string }[],
  taxonomyById: Record<number, { group?: string | null }>,
  tierBase?: Record<ImportanceLevel, number>,
): ScoreBreakdown {
  if (selections.length === 0) {
    return { earned: 0, max: 0, pct: 0, label: "None", matches: [] };
  }

  const activeTierBase = tierBase ?? TIER_BASE;

  // Aggregate selections by group key; track highest tier and all children
  const byGroup = new Map<string, { tier: ImportanceLevel; children: TaxonomySelection[] }>();
  for (const sel of selections) {
    const groupKey = taxonomyById[sel.id]?.group;
    if (!groupKey) continue;
    const existing = byGroup.get(groupKey);
    if (!existing) {
      byGroup.set(groupKey, { tier: sel.importance, children: [sel] });
    } else {
      if (tierPriority(sel.importance) > tierPriority(existing.tier)) {
        existing.tier = sel.importance;
      }
      existing.children.push(sel);
    }
  }

  const modelLabels = new Set(
    (modelField ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  );

  let earned = 0;
  let max = 0;
  const matches: MatchDetail[] = [];

  for (const [groupKey, { tier, children }] of byGroup) {
    const groupDef = groups.find((g) => g.key === groupKey);
    if (!groupDef) continue;
    const weight = activeTierBase[tier] ?? 3;
    max += weight;
    const matched = modelLabels.has(groupDef.label.toLowerCase());
    if (matched) earned += weight;
    matches.push({
      name: groupDef.label,
      importance: tier,
      matched,
      children: children.map((c) => ({ name: c.name, importance: c.importance })),
    });
  }

  const pct = max > 0 ? Math.round((earned / max) * 100) : 0;
  return { earned, max, pct, label: pctToLabel(pct), matches };
}

/**
 * Match each selected leap individually by exact name against the model's
 * attributes["leaps"] comma-separated string.
 */
function computeLeapsScore(
  selections: TaxonomySelection[],
  modelLeaps: string,
  tierBase?: Record<ImportanceLevel, number>,
): ScoreBreakdown {
  if (selections.length === 0) {
    return { earned: 0, max: 0, pct: 0, label: "None", matches: [] };
  }

  const activeTierBase = tierBase ?? TIER_BASE;
  const modelLeapSet = new Set(
    (modelLeaps ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  );

  let earned = 0;
  let max = 0;
  const matches: MatchDetail[] = selections.map((sel) => {
    const weight = activeTierBase[sel.importance] ?? 3;
    max += weight;
    const matched = modelLeapSet.has(sel.name.toLowerCase());
    if (matched) earned += weight;
    return { name: sel.name, importance: sel.importance, matched };
  });

  const pct = max > 0 ? Math.round((earned / max) * 100) : 0;
  return { earned, max, pct, label: pctToLabel(pct), matches };
}

function fuzzyMatchSingle(name: string, text: string): boolean {
  if (!text) return false;
  const textLower = typeof text === "string" ? text.toLowerCase() : String(text).toLowerCase();
  const words = name
    .toLowerCase()
    .replace(/[-&]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  return words.some((w) => textLower.includes(w));
}
