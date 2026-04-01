/**
 * Restore taxonomy + default instructions to the database.
 * Run: npm run db:restore-defaults
 */

import { seedTaxonomy } from "./seed-taxonomy";
import { storage } from "./storage";
import { getDefaultGlobalPrompt, getDefaultStepPrompts } from "./prompts";
import { WORKFLOW_STEPS } from "@shared/schema";

async function main() {
  console.log("Seeding taxonomy...");
  const taxonomy = await seedTaxonomy();
  console.log("Taxonomy:", taxonomy);

  console.log("Restoring global instructions...");
  await storage.saveAdvisorConfig(getDefaultGlobalPrompt());

  console.log("Restoring step instructions...");
  const defaults = getDefaultStepPrompts();
  for (const step of WORKFLOW_STEPS) {
    const prompt = defaults[step.number] || "";
    if (prompt) await storage.saveStepAdvisorConfig(step.number, prompt);
  }

  console.log("Done. Taxonomy and default instructions restored to Neon.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
