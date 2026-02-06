import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export * from "./models/chat";

// === WORKFLOW STEP DEFINITIONS ===
export const WORKFLOW_STEPS = [
  { number: 1, key: "school_context", label: "School Context", description: "Collect high-level school context" },
  { number: 2, key: "aims_for_learners", label: "Aims for Learners", description: "Capture aspirational aims for learners" },
  { number: 3, key: "learning_experience", label: "Learning Experience & Practices", description: "Capture intended learning experience and core practices" },
  { number: 4, key: "constraints", label: "Constraints", description: "Capture constraints across supporting element domains" },
  { number: 5, key: "preferences", label: "Model Preferences", description: "Capture model/point solution preferences" },
  { number: 6, key: "decision_frame", label: "Decision Frame", description: "Confirm the decision frame" },
  { number: 7, key: "recommendations", label: "Recommendations", description: "Generate and review model recommendations" },
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
});

// === SESSION ===
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === SCHOOL CONTEXT (legacy - kept for compatibility) ===
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
  createdAt: timestamp("created_at").defaultNow(),
});

// === COMPARISON SELECTION ===
export const comparisonSelections = pgTable("comparison_selections", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => sessions.id),
  modelIds: jsonb("model_ids").$type<number[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === ADVISOR CONFIG (global instructions) ===
export const advisorConfig = pgTable("advisor_config", {
  id: serial("id").primaryKey(),
  systemPrompt: text("system_prompt").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === SCHEMAS ===
export const insertModelSchema = createInsertSchema(models).omit({ id: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSchoolContextSchema = createInsertSchema(schoolContexts).omit({ id: true });
export const insertRecommendationSchema = createInsertSchema(recommendations).omit({ id: true, createdAt: true });
export const insertComparisonSelectionSchema = createInsertSchema(comparisonSelections).omit({ id: true, createdAt: true });
export const insertAdvisorConfigSchema = createInsertSchema(advisorConfig).omit({ id: true, updatedAt: true });
export const insertWorkflowProgressSchema = createInsertSchema(workflowProgress).omit({ id: true, updatedAt: true });
export const insertStepConversationSchema = createInsertSchema(stepConversations).omit({ id: true, createdAt: true });
export const insertStepDocumentSchema = createInsertSchema(stepDocuments).omit({ id: true, createdAt: true });
export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBase).omit({ id: true, createdAt: true });
export const insertStepAdvisorConfigSchema = createInsertSchema(stepAdvisorConfigs).omit({ id: true, updatedAt: true });

// === TYPES ===
export type Model = typeof models.$inferSelect;
export type InsertModel = z.infer<typeof insertModelSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SchoolContext = typeof schoolContexts.$inferSelect;
export type InsertSchoolContext = z.infer<typeof insertSchoolContextSchema>;
export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type ComparisonSelection = typeof comparisonSelections.$inferSelect;
export type AdvisorConfig = typeof advisorConfig.$inferSelect;
export type InsertAdvisorConfig = z.infer<typeof insertAdvisorConfigSchema>;
export type WorkflowProgress = typeof workflowProgress.$inferSelect;
export type StepConversation = typeof stepConversations.$inferSelect;
export type StepDocument = typeof stepDocuments.$inferSelect;
export type KnowledgeBaseEntry = typeof knowledgeBase.$inferSelect;
export type StepAdvisorConfig = typeof stepAdvisorConfigs.$inferSelect;

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
