/**
 * One-off migration: add name, device_id, focus_area columns to sessions table.
 *
 * Run: node --env-file=.env --import tsx server/add-session-fields.ts
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS name TEXT`);
  await db.execute(sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_id TEXT`);
  await db.execute(sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS focus_area TEXT DEFAULT 'ccl'`);
  console.log("Migration complete: sessions columns added.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
