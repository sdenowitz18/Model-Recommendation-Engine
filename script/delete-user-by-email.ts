/**
 * Delete a user and all workflow data tied to their sessions (for local QA / re-signup tests).
 *
 * Usage:
 *   node --env-file=.env --import tsx script/delete-user-by-email.ts you@gmail.com
 */
import { eq, inArray } from "drizzle-orm";
import {
  users,
  sessions,
  schoolContexts,
  workflowProgress,
  stepConversations,
  stepDocuments,
  recommendations,
} from "@shared/schema";
import { db, pool } from "../server/db";

async function main() {
  const raw = process.argv[2];
  if (!raw?.trim()) {
    console.error("Usage: node --env-file=.env --import tsx script/delete-user-by-email.ts <email>");
    process.exit(1);
  }
  const email = raw.trim().toLowerCase();

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    console.log(`No user found for ${email}`);
    await pool.end();
    return;
  }

  const userSessions = await db.select().from(sessions).where(eq(sessions.userId, user.id));
  const sessionIds = userSessions.map((s) => s.id);

  if (sessionIds.length > 0) {
    await db.delete(recommendations).where(inArray(recommendations.sessionId, sessionIds));
    await db.delete(stepDocuments).where(inArray(stepDocuments.sessionId, sessionIds));
    await db.delete(stepConversations).where(inArray(stepConversations.sessionId, sessionIds));
    await db.delete(workflowProgress).where(inArray(workflowProgress.sessionId, sessionIds));
    await db.delete(schoolContexts).where(inArray(schoolContexts.sessionId, sessionIds));
  }

  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await db.delete(users).where(eq(users.id, user.id));

  console.log(`Deleted user ${email} (id ${user.id}) and ${sessionIds.length} session(s).`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
