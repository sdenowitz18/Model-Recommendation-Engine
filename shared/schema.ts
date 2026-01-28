import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export * from "./models/chat";

// === MODELS ===
export const models = pgTable("models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  grades: text("grades").notNull(),
  description: text("description").notNull(),
  link: text("link").notNull(),
  outcomeTypes: text("outcome_types").notNull(), // Comma separated or JSON? User said text.
  keyPractices: text("key_practices").notNull(),
  implementationSupports: text("implementation_supports").notNull(),
  imageUrl: text("image_url"), // Added for UI
});

// === SESSION ===
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(), // Client-generated UUID
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === SCHOOL CONTEXT ===
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

// === ADVISOR CONFIG ===
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
