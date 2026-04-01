import { db } from "./db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("Adding reference_type column to knowledge_base table...");
  await db.execute(sql`
    ALTER TABLE knowledge_base
    ADD COLUMN IF NOT EXISTS reference_type text
  `);
  console.log("Migration complete.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
