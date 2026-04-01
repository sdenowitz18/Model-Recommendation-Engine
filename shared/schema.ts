import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === USERS ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
// === WORKFLOW STEP DEFINITIONS ===
export const WORKFLOW_STEPS = [
  { number: 0, key: "document_upload", label: "Upload Documents", description: "Upload school design documents to pre-fill your information" },
  { number: 1, key: "school_context", label: "School Context", description: "Collect high-level school context" },
  { number: 2, key: "aims_for_learners", label: "Aims for Learners", description: "Capture aspirational aims for learners" },
  { number: 3, key: "learning_experience", label: "Learning Experience & Practices", description: "Capture intended learning experience and core practices" },
  { number: 4, key: "system_elements", label: "System Elements", description: "Capture system element constraints and context across key domains" },
  { number: 5, key: "preferences", label: "Model Preferences", description: "Capture model/point solution preferences" },
  { number: 6, key: "decision_frame", label: "Decision Frame", description: "Confirm the decision frame" },
  { number: 7, key: "recommendations", label: "Recommendations", description: "Generate and review model recommendations" },
  { number: 8, key: "model_conversation", label: "Explore Model", description: "Ask questions about your selected model" },
] as const;

export type StepKey = typeof WORKFLOW_STEPS[number]["key"];

// === MODELS ===
export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  grades: text("grades").notNull(),
  description: text("description").notNull(),
  link: text("link").notNull(),
  outcomeTypes: text("outcome_types").notNull(),
  keyPractices: text("key_practices").notNull(),
  implementationSupports: text("implementation_supports").notNull(),
  imageUrl: text("image_url"),
  attributes: jsonb("attributes").$type<Record<string, string>>().default({}),
});

// === MODEL FIELD DEFS (configurable model attributes for recommendation engine) ===
export const modelFieldDefs = pgTable("model_field_defs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),           // e.g. "requires_partnership"
  label: text("label").notNull(),                // e.g. "Requires Partnership"
  airtableColumn: text("airtable_column"),       // e.g. "Requires Partnership" (Airtable field name)
  valueType: text("value_type").notNull().default("yes_no_unknown"), // "yes_no_unknown" | "grade_list" | "text"
  stepNumber: integer("step_number"),            // workflow step this maps to
  questionKey: text("question_key"),             // stepData question key to compare against
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// === SCORING RULES (configurable hard blocker / watchout rules) ===
export const scoringRules = pgTable("scoring_rules", {
  id: serial("id").primaryKey(),
  fieldDefId: integer("field_def_id").notNull().references(() => modelFieldDefs.id),
  modelValue: text("model_value").notNull(),     // model attribute value to match (e.g. "Yes", "Unknown", "*")
  schoolAnswerKey: text("school_answer_key").notNull(),  // stepData question key (e.g. "family_restrict_partnerships")
  schoolAnswerValue: text("school_answer_value").notNull(), // school answer that triggers rule (e.g. "Yes")
  matchType: text("match_type").notNull().default("equals"), // "equals" | "contains" | "not_contains" | "numeric_budget_exceeded"
  impact: text("impact").notNull(),              // "hard_blocker" | "watchout" | "none"
  watchoutMessage: text("watchout_message"),     // auto-generated human-readable message
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === SCORING CONFIG (scoring weights / tuning) ===
export const scoringConfig = pgTable("scoring_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),           // e.g. "aims_weight", "practices_weight"
  value: real("value").notNull(),
  label: text("label").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === SESSION ===
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  name: text("name"),                         // auto-set from school context after step 1
  deviceId: text("device_id"),                // kept for migration compatibility, no longer used for auth
  userId: integer("user_id").references(() => users.id),
  focusArea: text("focus_area").default("ccl"), // "ccl" | "math" | etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === SCHOOL CONTEXT (used by recommendation engine for scoring) ===
export const schoolContexts = pgTable("school_contexts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id),
  vision: text("vision"),
  desiredOutcomes: jsonb("desired_outcomes").$type<string[]>(),
  gradeBands: jsonb("grade_bands").$type<string[]>(),
  keyPractices: jsonb("key_practices").$type<string[]>(),
  implementationSupportsNeeded: jsonb("implementation_supports_needed").$type<string[]>(),
  constraints: jsonb("constraints").$type<string[]>(),
  notes: text("notes"),
  isReadyForRecommendation: boolean("is_ready_for_recommendation").default(false),
});

// === WORKFLOW PROGRESS ===
export const workflowProgress = pgTable("workflow_progress", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id),
  currentStep: integer("current_step").notNull().default(1),
  stepsCompleted: jsonb("steps_completed").$type<number[]>().notNull().default([]),
  stepData: jsonb("step_data").$type<Record<string, any>>().notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === STEP CONVERSATIONS (per-step chat history stored in DB) ===
export const stepConversations = pgTable("step_conversations", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id),
  stepNumber: integer("step_number").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === STEP DOCUMENTS (user uploads per step) ===
export const stepDocuments = pgTable("step_documents", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id),
  stepNumber: integer("step_number").notNull(),
  fileName: text("file_name").notNull(),
  fileContent: text("file_content").notNull(),
  fileType: text("file_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === KNOWLEDGE BASE (admin reference docs per step) ===
export const knowledgeBase = pgTable("knowledge_base", {
  id: serial("id").primaryKey(),
  stepNumber: integer("step_number").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  fileName: text("file_name"),
  fileData: text("file_data"), // base64-encoded original file for download
  fileMimeType: text("file_mime_type"), // MIME type of original file
  referenceType: text("reference_type"), // "outcomes" | "practices" | "leaps" | null (null = chat context)
  createdAt: timestamp("created_at").defaultNow(),
});

// === KB CHUNKS (chunked + embedded knowledge base content for RAG) ===
export const kbChunks = pgTable("kb_chunks", {
  id: serial("id").primaryKey(),
  knowledgeBaseId: integer("knowledge_base_id").notNull().references(() => knowledgeBase.id),
  stepNumber: integer("step_number").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: jsonb("embedding").$type<number[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === STEP ADVISOR CONFIGS (per-step custom prompts) ===
export const stepAdvisorConfigs = pgTable("step_advisor_configs", {
  id: serial("id").primaryKey(),
  stepNumber: integer("step_number").notNull().unique(),
  systemPrompt: text("system_prompt").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === RECOMMENDATIONS ===
export const recommendations = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id),
  modelId: integer("model_id").notNull().references(() => models.id),
  score: real("score").notNull(),
  rationale: text("rationale"),
  alignment: jsonb("alignment").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === TAXONOMY ITEMS (canonical outcomes, LEAPs, practices for structured selection) ===
// Outcome group labels — from Career Connected Learning Outcomes PDF
export const OUTCOME_GROUPS = [
  { key: "content_career", label: "Content & Career Knowledge & Skills" },
  { key: "cross_cutting", label: "Cross-Cutting Competencies" },
  { key: "postsecondary_assets", label: "Postsecondary Assets" },
  { key: "postsecondary_transition", label: "Postsecondary Transition" },
] as const;

export type OutcomeGroupKey = typeof OUTCOME_GROUPS[number]["key"];

// Practice group labels — from Career Connected Learning Activities PDF
export const PRACTICE_GROUPS = [
  { key: "academic_integration", label: "Academic Integration" },
  { key: "advising", label: "Advising" },
  { key: "work_based_learning", label: "Work-Based Learning" },
  { key: "career_college_prep", label: "Career & College Preparation Coursework" },
] as const;

export type PracticeGroupKey = typeof PRACTICE_GROUPS[number]["key"];

// Editable group labels stored in DB (overrides default labels when present)
export const taxonomyGroupLabels = pgTable("taxonomy_group_labels", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // "outcome" | "practice"
  groupKey: text("group_key").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const taxonomyItems = pgTable("taxonomy_items", {
  id: serial("id").primaryKey(),
  stepNumber: integer("step_number").notNull(),
  category: text("category").notNull(), // "outcome" | "leap" | "practice" | etc.
  group: text("group"), // outcome: content_career, cross_cutting, etc. | practice: academic_integration, advising, etc.
  parentId: integer("parent_id"), // self-referential: null = top-level, otherwise points to parent item
  name: text("name").notNull(),
  description: text("description"), // shown on hover
  examples: text("examples"), // for practices: e.g. "Books, games, role plays" — shown on hover
  detailContent: text("detail_content"), // for LEAPs: "What this leap can mean" — shown on detail page
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// === ADVISOR CONFIG (global instructions) ===
export const advisorConfig = pgTable("advisor_config", {
  id: serial("id").primaryKey(),
  systemPrompt: text("system_prompt").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === AIRTABLE CONFIG (Base ID, Table ID, API token for models sync) ===
export const airtableConfig = pgTable("airtable_config", {
  id: serial("id").primaryKey(),
  baseId: text("base_id"),
  tableId: text("table_id"),
  apiToken: text("api_token"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === INSERT SCHEMAS ===
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertModelSchema = createInsertSchema(models).omit({ id: true });
export const insertModelFieldDefSchema = createInsertSchema(modelFieldDefs).omit({ id: true, createdAt: true });
export const insertScoringRuleSchema = createInsertSchema(scoringRules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScoringConfigSchema = createInsertSchema(scoringConfig).omit({ id: true, updatedAt: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSchoolContextSchema = createInsertSchema(schoolContexts).omit({ id: true });
export const insertRecommendationSchema = createInsertSchema(recommendations).omit({ id: true, createdAt: true });
export const insertAdvisorConfigSchema = createInsertSchema(advisorConfig).omit({ id: true, updatedAt: true });
export const insertWorkflowProgressSchema = createInsertSchema(workflowProgress).omit({ id: true, updatedAt: true });
export const insertStepConversationSchema = createInsertSchema(stepConversations).omit({ id: true, createdAt: true });
export const insertStepDocumentSchema = createInsertSchema(stepDocuments).omit({ id: true, createdAt: true });
export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBase).omit({ id: true, createdAt: true });
export const insertStepAdvisorConfigSchema = createInsertSchema(stepAdvisorConfigs).omit({ id: true, updatedAt: true });
export const insertTaxonomyItemSchema = createInsertSchema(taxonomyItems).omit({ id: true, createdAt: true });
export const insertTaxonomyGroupLabelSchema = createInsertSchema(taxonomyGroupLabels).omit({ id: true, updatedAt: true });
export const insertKbChunkSchema = createInsertSchema(kbChunks).omit({ id: true, createdAt: true });

// === TYPES ===
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Model = typeof models.$inferSelect;
export type InsertModel = z.infer<typeof insertModelSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SchoolContext = typeof schoolContexts.$inferSelect;
export type InsertSchoolContext = z.infer<typeof insertSchoolContextSchema>;
export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type AdvisorConfig = typeof advisorConfig.$inferSelect;
export type InsertAdvisorConfig = z.infer<typeof insertAdvisorConfigSchema>;
export type WorkflowProgress = typeof workflowProgress.$inferSelect;
export type StepConversation = typeof stepConversations.$inferSelect;
export type StepDocument = typeof stepDocuments.$inferSelect;
export type KnowledgeBaseEntry = typeof knowledgeBase.$inferSelect;
export type StepAdvisorConfig = typeof stepAdvisorConfigs.$inferSelect;

export type TaxonomyItem = typeof taxonomyItems.$inferSelect;
export type InsertTaxonomyItem = z.infer<typeof insertTaxonomyItemSchema>;
export type TaxonomyGroupLabel = typeof taxonomyGroupLabels.$inferSelect;
export type InsertTaxonomyGroupLabel = z.infer<typeof insertTaxonomyGroupLabelSchema>;

export type KbChunk = typeof kbChunks.$inferSelect;
export type InsertKbChunk = z.infer<typeof insertKbChunkSchema>;

export type ModelFieldDef = typeof modelFieldDefs.$inferSelect;
export type InsertModelFieldDef = z.infer<typeof insertModelFieldDefSchema>;
export type ScoringRule = typeof scoringRules.$inferSelect;
export type InsertScoringRule = z.infer<typeof insertScoringRuleSchema>;
export type ScoringConfig = typeof scoringConfig.$inferSelect;
export type InsertScoringConfig = z.infer<typeof insertScoringConfigSchema>;

// Structured selection format stored in stepData for Step 2
export type TaxonomySelection = {
  id: number;
  name: string;
  importance: "most_important" | "important" | "nice_to_have";
};

export type SchoolContextState = {
  vision: string | null;
  desiredOutcomes: string[];
  gradeBands: string[];
  keyPractices: string[];
  implementationSupportsNeeded: string[];
  constraints: string[];
  notes: string | null;
  isReadyForRecommendation?: boolean;
};

export type StepData = Record<string, any>;
