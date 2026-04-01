/**
 * One-off migration: update existing test models to the new taxonomy field structure.
 *
 * What this does:
 *  - Sets outcomeTypes to high-level outcome category labels (derived from each model's
 *    existing outcomes_list by looking up the group for each taxonomy item by name).
 *  - Sets keyPractices to high-level activity category labels (derived from practices_list).
 *  - Copies attributes["leaps_list"] → attributes["leaps"] for exact leap scoring.
 *  - Adds placeholder attributes["reach"], attributes["impact"], attributes["build_items"]
 *    if not already present.
 *
 * Run: node --env-file=.env --import tsx server/migrate-taxonomy-fields.ts
 */

import { db } from "./db";
import { models, taxonomyItems } from "@shared/schema";
import { OUTCOME_GROUPS, PRACTICE_GROUPS } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Loading taxonomy items...");
  const allTaxonomy = await db.select().from(taxonomyItems);

  // Build name → group maps for outcomes and practices
  const outcomeGroupByName = new Map<string, string>();
  const practiceGroupByName = new Map<string, string>();
  for (const item of allTaxonomy) {
    if (item.category === "outcome" && item.group) {
      outcomeGroupByName.set(item.name.toLowerCase(), item.group);
    }
    if (item.category === "practice" && item.group) {
      practiceGroupByName.set(item.name.toLowerCase(), item.group);
    }
  }

  // Build group key → label maps
  const outcomeGroupLabel = Object.fromEntries(OUTCOME_GROUPS.map((g) => [g.key, g.label]));
  const practiceGroupLabel = Object.fromEntries(PRACTICE_GROUPS.map((g) => [g.key, g.label]));

  console.log("Loading models...");
  const allModels = await db.select().from(models);
  console.log(`  Found ${allModels.length} models.\n`);

  const REACH_PLACEHOLDER = "Reach data not yet available — will be populated on next Airtable sync.";
  const IMPACT_PLACEHOLDER = "Impact data not yet available — will be populated on next Airtable sync.";
  const BUILD_ITEMS_PLACEHOLDER = "Build items data not yet available — will be populated on next Airtable sync.";

  for (const model of allModels) {
    const attrs = (model.attributes as Record<string, string>) || {};

    // ── Derive high-level outcome categories from outcomes_list ──────────────
    const outcomesList = attrs["outcomes_list"] ?? "";
    const outcomeGroupKeys = new Set<string>();
    for (const name of outcomesList.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      const groupKey = outcomeGroupByName.get(name);
      if (groupKey) outcomeGroupKeys.add(groupKey);
    }
    const newOutcomeTypes = [...outcomeGroupKeys]
      .map((k) => outcomeGroupLabel[k])
      .filter(Boolean)
      .join(", ");

    // ── Derive high-level practice categories from practices_list ────────────
    const practicesList = attrs["practices_list"] ?? "";
    const practiceGroupKeys = new Set<string>();
    for (const name of practicesList.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
      const groupKey = practiceGroupByName.get(name);
      if (groupKey) practiceGroupKeys.add(groupKey);
    }
    const newKeyPractices = [...practiceGroupKeys]
      .map((k) => practiceGroupLabel[k])
      .filter(Boolean)
      .join(", ");

    // ── Copy leaps_list → leaps for exact scoring ────────────────────────────
    const leapsList = attrs["leaps_list"] ?? "";
    const newLeaps = leapsList; // exact names, already stored correctly

    // ── Add placeholder display fields if missing ────────────────────────────
    const updatedAttrs = {
      ...attrs,
      leaps: newLeaps || attrs["leaps"] || "",
      reach: attrs["reach"] || REACH_PLACEHOLDER,
      impact: attrs["impact"] || IMPACT_PLACEHOLDER,
      build_items: attrs["build_items"] || BUILD_ITEMS_PLACEHOLDER,
    };

    await db.update(models).set({
      outcomeTypes: newOutcomeTypes || model.outcomeTypes,
      keyPractices: newKeyPractices || model.keyPractices,
      attributes: updatedAttrs,
    }).where(eq(models.id, model.id));

    console.log(`  ✓ ${model.name}`);
    console.log(`      outcomeTypes: ${newOutcomeTypes || "(unchanged)"}`);
    console.log(`      keyPractices: ${newKeyPractices || "(unchanged)"}`);
    console.log(`      leaps: ${newLeaps || "(empty)"}`);
  }

  console.log(`\nMigration complete. Updated ${allModels.length} models.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
