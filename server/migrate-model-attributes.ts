/**
 * One-off migration: surgically update existing test model attributes to align
 * with the new Airtable field structure without re-randomizing any data.
 *
 * Changes per model:
 *   - Rename attributes["scheduling_implications"] → attributes["scheduling_considerations"]
 *   - Add attributes["requires_scheduling_flexibility"] derived from the 4 old scheduling fields
 *   - Remove attributes["requires_staff_outreach"]
 *   - Remove attributes["device_capability_requirements"]
 *
 * Run: node --env-file=.env --import tsx server/migrate-model-attributes.ts
 */

import { db } from "./db";
import { models } from "@shared/schema";
import { eq } from "drizzle-orm";

function deriveSchedulingFlexibility(attrs: Record<string, string>): string {
  const keys = [
    "requires_seat_time_flexibility",
    "requires_subject_minute_reallocation",
    "requires_flex_choice_blocks",
    "requires_annual_schedule_flexibility",
  ];
  const values = keys.map((k) => (attrs[k] ?? "").toLowerCase());

  if (values.some((v) => v === "yes")) return "Yes";
  if (values.some((v) => v === "depends on implementation")) return "Depends on Implementation";
  if (values.every((v) => v === "no")) return "No";
  return "Unknown";
}

async function main() {
  const allModels = await db.select().from(models);
  console.log(`Found ${allModels.length} model(s) to migrate.`);

  for (const model of allModels) {
    const attrs = { ...((model.attributes as Record<string, string>) ?? {}) };
    const changes: string[] = [];

    // 1. Rename scheduling_implications → scheduling_considerations
    if ("scheduling_implications" in attrs) {
      attrs["scheduling_considerations"] = attrs["scheduling_implications"];
      delete attrs["scheduling_implications"];
      changes.push("renamed scheduling_implications → scheduling_considerations");
    }

    // 2. Add requires_scheduling_flexibility (consolidated) if not already set
    if (!attrs["requires_scheduling_flexibility"]) {
      const derived = deriveSchedulingFlexibility(attrs);
      attrs["requires_scheduling_flexibility"] = derived;
      changes.push(`added requires_scheduling_flexibility = "${derived}"`);
    }

    // 3. Remove stale fields that no longer have rules or Airtable sources
    const toRemove = [
      "requires_staff_outreach",
      "device_capability_requirements",
      "requires_seat_time_flexibility",
      "requires_subject_minute_reallocation",
      "requires_flex_choice_blocks",
      "requires_annual_schedule_flexibility",
    ];
    for (const key of toRemove) {
      if (key in attrs) {
        delete attrs[key];
        changes.push(`removed ${key}`);
      }
    }

    if (changes.length === 0) {
      console.log(`  — ${model.name}: already up to date`);
      continue;
    }

    await db.update(models).set({ attributes: attrs }).where(eq(models.id, model.id));

    console.log(`  ✓ ${model.name}:`);
    for (const c of changes) console.log(`      ${c}`);
  }

  console.log("\nMigration complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
