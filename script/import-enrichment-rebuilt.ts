/**
 * Imports the rebuilt enrichment file into the database.
 *
 * For each model in enrichment-export-rebuilt.md:
 *   1. Exact name match against DB models
 *   2. On mismatch: stop and ask for confirmation before continuing
 *   3. On match: overwrite enrichedContent in place
 *
 * Usage:
 *   npm run db:import-enrichment
 */
import fs from "fs";
import path from "path";
import * as readline from "readline";
import { eq } from "drizzle-orm";
import { models } from "@shared/schema";
import { db, pool } from "../server/db";

const ENRICHMENT_FILE = path.resolve("docs/enrichment-export/enrichment-export-rebuilt.md");

const SECTION_KEYS: Record<string, string> = {
  "Summary": "summary",
  "Core Approach": "core_approach",
  "Resources Provided": "resources_provided",
  "Impact": "impact",
  "Cost & Access": "cost_and_access",
  "PD Requirements": "pd_requirements",
  "Technology Needs": "technology_needs",
  "Scheduling Impact": "scheduling_impact",
  "Off-Site Learning": "off_site_learning",
  "Partnerships": "partnerships",
  "Family Involvement": "family_involvement",
  "Data Sharing": "data_sharing",
};

interface ParsedModel {
  name: string;
  sections: Record<string, string>;
}

function parseEnrichmentFile(content: string): ParsedModel[] {
  const result: ParsedModel[] = [];
  // Split on level-2 headers (## Model Name), keeping the delimiter
  const blocks = content.split(/\n(?=## )/);

  for (const block of blocks) {
    const nameMatch = block.match(/^## (.+)/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    const sections: Record<string, string> = {};
    // Split on level-3 headers (### Section Name)
    const sectionParts = block.split(/\n(?=### )/);

    for (const part of sectionParts) {
      const headerMatch = part.match(/^### (.+)/m);
      if (!headerMatch) continue;
      const sectionTitle = headerMatch[1].trim();
      const key = SECTION_KEYS[sectionTitle];
      if (!key) continue;

      const content = part
        .replace(/^### .+\n?/, "")
        .replace(/^---+\s*$/gm, "")
        .trim();

      if (content) {
        sections[key] = content;
      }
    }

    if (Object.keys(sections).length > 0) {
      result.push({ name, sections });
    }
  }

  return result;
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function closestMatch(targetName: string, dbNames: string[]): string {
  // Simple Levenshtein-based closest match for display purposes
  let best = dbNames[0];
  let bestScore = Infinity;
  for (const name of dbNames) {
    const dist = levenshtein(targetName.toLowerCase(), name.toLowerCase());
    if (dist < bestScore) { bestScore = dist; best = name; }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

async function main() {
  const content = fs.readFileSync(ENRICHMENT_FILE, "utf-8");
  const parsed = parseEnrichmentFile(content);
  console.log(`\nParsed ${parsed.length} models from enrichment file.\n`);

  const dbModels = await db.select({ id: models.id, name: models.name }).from(models);
  const dbByName = new Map(dbModels.map((m) => [m.name.toLowerCase().trim(), m]));
  const dbNames = dbModels.map((m) => m.name);

  let imported = 0;
  let skipped = 0;

  for (const parsed_model of parsed) {
    const key = parsed_model.name.toLowerCase().trim();
    const dbRecord = dbByName.get(key);

    if (!dbRecord) {
      const closest = closestMatch(parsed_model.name, dbNames);
      console.log(`\n⚠️  MISMATCH: "${parsed_model.name}" not found in DB.`);
      console.log(`   Closest DB name: "${closest}"`);
      const answer = await prompt(`   Options:\n   [s] Skip this model\n   [u] Use "${closest}" as the match\n   [q] Quit\n   > `);

      if (answer === "q") {
        console.log("\nAborted by user.");
        await pool.end();
        process.exit(0);
      } else if (answer === "u") {
        const matchedRecord = dbModels.find((m) => m.name === closest);
        if (matchedRecord) {
          await db
            .update(models)
            .set({ enrichedContent: parsed_model.sections as any, enrichedAt: new Date() })
            .where(eq(models.id, matchedRecord.id));
          console.log(`   ✓ Imported "${parsed_model.name}" → "${closest}" (id: ${matchedRecord.id})`);
          imported++;
        }
      } else {
        console.log(`   Skipped.`);
        skipped++;
      }
      continue;
    }

    await db
      .update(models)
      .set({ enrichedContent: parsed_model.sections as any, enrichedAt: new Date() })
      .where(eq(models.id, dbRecord.id));

    console.log(`✓ ${parsed_model.name} (id: ${dbRecord.id}) — ${Object.keys(parsed_model.sections).length} sections`);
    imported++;
  }

  console.log(`\nDone. ${imported} imported, ${skipped} skipped.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
