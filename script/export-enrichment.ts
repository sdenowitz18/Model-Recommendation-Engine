/**
 * Export all enriched models to docs/enrichment-export/enrichment-export.md
 *
 * Usage:
 *   npm run db:export-enrichment
 */
import fs from "fs";
import path from "path";
import { isNotNull } from "drizzle-orm";
import { models } from "@shared/schema";
import { db, pool } from "../server/db";

const SKIP_FIELDS = new Set(["raw_scrape", "source_url"]);

const FIELD_LABELS: Record<string, string> = {
  summary: "Summary",
  target_audience: "Target Audience",
  core_approach: "Core Approach",
  evidence_base: "Evidence Base",
  implementation: "Implementation",
  cost_and_access: "Cost & Access",
  outcomes_detail: "Outcomes",
  leaps_detail: "LEAPs Alignment",
  practices_detail: "Practices",
  known_challenges: "Known Challenges",
  scheduling_impact: "Scheduling Impact",
  staffing_requirements: "Staffing Requirements",
  technology_needs: "Technology Needs",
  partnership_model: "Partnership Model",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS);

function renderSection(label: string, detailed: string | undefined, summary: string | undefined): string {
  const lines: string[] = [];
  lines.push(`### ${label}`);
  if (detailed && detailed !== "Not available from current sources") {
    lines.push(detailed);
  } else if (summary && summary !== "Not available from current sources") {
    lines.push(summary);
  } else {
    lines.push("_Not available from current sources._");
  }
  return lines.join("\n\n");
}

async function main() {
  const allModels = await db
    .select()
    .from(models)
    .where(isNotNull(models.enrichedAt));

  if (allModels.length === 0) {
    console.log("No enriched models found.");
    await pool.end();
    return;
  }

  const outDir = path.resolve("docs/enrichment-export");
  fs.mkdirSync(outDir, { recursive: true });

  const lines: string[] = [
    `# Model Enrichment Export`,
    ``,
    `Generated: ${new Date().toISOString()}  `,
    `Models: ${allModels.length}`,
    ``,
    `---`,
    ``,
  ];

  for (const model of allModels) {
    const ec = (model.enrichedContent ?? {}) as Record<string, string>;
    const sourceUrl = ec["source_url"] ?? model.link ?? "";

    lines.push(`## ${model.name}`);
    lines.push(``);
    lines.push(`**Grades:** ${model.grades}  `);
    lines.push(`**Source:** ${sourceUrl}  `);
    lines.push(`**Enriched:** ${model.enrichedAt?.toISOString() ?? "unknown"}  `);
    lines.push(``);

    for (const base of FIELD_ORDER) {
      const detailed = ec[`${base}_detailed`];
      const summary = ec[`${base}_summary`];
      if (!detailed && !summary) continue;
      lines.push(renderSection(FIELD_LABELS[base], detailed, summary));
      lines.push(``);
    }

    // Any remaining fields not in the known order
    for (const [key, val] of Object.entries(ec)) {
      if (SKIP_FIELDS.has(key)) continue;
      const base = key.replace(/_detailed$|_summary$/, "");
      if (FIELD_ORDER.includes(base)) continue;
      if (key.endsWith("_summary")) continue; // already shown with detailed
      const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`### ${label}`);
      lines.push(val);
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
  }

  const outPath = path.join(outDir, "enrichment-export.md");
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`Exported ${allModels.length} models → ${outPath}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
