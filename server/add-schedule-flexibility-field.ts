/**
 * One-off migration: add the "Requires Annual Schedule Flexibility" model field
 * and its four scoring rules.
 *
 * Run: node --env-file=.env --import tsx server/add-schedule-flexibility-field.ts
 */

import { db } from "./db";
import { modelFieldDefs, scoringRules } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  // Guard: don't create a duplicate if the field already exists
  const existing = await db
    .select()
    .from(modelFieldDefs)
    .where(eq(modelFieldDefs.key, "requires_annual_schedule_flexibility"));

  if (existing.length > 0) {
    console.log("Field already exists (id=%d). Skipping.", existing[0].id);
    process.exit(0);
  }

  // 1. Create the model field definition
  const [fd] = await db
    .insert(modelFieldDefs)
    .values({
      key: "requires_annual_schedule_flexibility",
      label: "Requires Annual Schedule Flexibility",
      airtableColumn: "Requires Annual Schedule Flexibility",
      valueType: "yes_no_depends_unknown",
      stepNumber: 4,
      questionKey: "family_schedule_flexible",
      sortOrder: 14,
    })
    .returning();

  console.log(`Created fieldDef: id=${fd.id}, key=${fd.key}`);

  // 2. Create the four scoring rules
  const rules = [
    {
      fieldDefId: fd.id,
      modelValue: "Yes",
      schoolAnswerKey: "family_schedule_flexible",
      schoolAnswerValue: "No",
      matchType: "equals",
      impact: "hard_blocker",
      watchoutMessage: null as string | null,
    },
    {
      fieldDefId: fd.id,
      modelValue: "Yes",
      schoolAnswerKey: "family_schedule_flexible",
      schoolAnswerValue: "A little",
      matchType: "equals",
      impact: "watchout",
      watchoutMessage:
        "This model requires flexibility in the annual school calendar. Your school indicated the schedule is only somewhat flexible — confirm whether there is enough room to accommodate this model's timing requirements.",
    },
    {
      fieldDefId: fd.id,
      modelValue: "Depends on Implementation",
      schoolAnswerKey: "family_schedule_flexible",
      schoolAnswerValue: "No",
      matchType: "equals",
      impact: "watchout",
      watchoutMessage:
        "This model may require flexibility in the annual school calendar depending on how it's implemented. Your school indicated the schedule is not flexible — review whether the implementation approach can work within your calendar constraints.",
    },
    {
      fieldDefId: fd.id,
      modelValue: "Depends on Implementation",
      schoolAnswerKey: "family_schedule_flexible",
      schoolAnswerValue: "A little",
      matchType: "equals",
      impact: "watchout",
      watchoutMessage:
        "This model may require some flexibility in the annual school calendar. Your school indicated limited schedule flexibility — confirm whether the implementation approach can be adjusted to fit your calendar.",
    },
  ];

  await db.insert(scoringRules).values(rules);
  console.log(`Inserted ${rules.length} scoring rules.`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
