import { db } from "./db";
import {
  models, sessions, schoolContexts, recommendations, advisorConfig, airtableConfig,
  workflowProgress, stepConversations, stepDocuments, knowledgeBase, stepAdvisorConfigs,
  taxonomyItems, taxonomyGroupLabels, kbChunks,
  modelFieldDefs, scoringRules, scoringConfig,
  users,
  type Model, type InsertModel, type Session, type SchoolContext, type InsertSchoolContext,
  type Recommendation, type InsertRecommendation,
  type SchoolContextState, type AdvisorConfig, type WorkflowProgress, type StepConversation,
  type StepDocument, type KnowledgeBaseEntry, type StepAdvisorConfig, type StepData,
  type TaxonomyItem, type InsertTaxonomyItem, type TaxonomyGroupLabel, type InsertTaxonomyGroupLabel,
  type KbChunk, type InsertKbChunk,
  type ModelFieldDef, type InsertModelFieldDef,
  type ScoringRule, type InsertScoringRule,
  type ScoringConfig, type InsertScoringConfig,
  type User,
} from "@shared/schema";
import { eq, desc, and, asc, inArray, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface SessionSummary {
  sessionId: string;
  name: string | null;
  focusArea: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  currentStep: number;
  stepsCompleted: number[];
  schoolName: string | null;
  district: string | null;
  gradeBand: string | null;
  designScope: "whole_program" | "specific_experience" | null;
}

export interface IStorage {
  // Auth / Users
  createUserWithPassword(email: string, password: string): Promise<User>;
  findUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  verifyUserPassword(user: User, password: string): Promise<boolean>;

  // Models
  getAllModels(): Promise<Model[]>;
  getModel(id: number): Promise<Model | undefined>;
  createModel(model: InsertModel): Promise<Model>;
  updateModelEnrichment(modelId: number, enrichedContent: Record<string, string>): Promise<Model>;
  syncModelsFromAirtable(newModels: InsertModel[]): Promise<Model[]>;

  // Sessions
  createSession(sessionId: string, userId?: number, focusArea?: string, name?: string): Promise<Session>;
  getSession(sessionId: string): Promise<Session | undefined>;
  getSessionsByUser(userId: number, focusArea?: string): Promise<SessionSummary[]>;
  updateSessionName(sessionId: string, name: string): Promise<void>;

  // School Context (used by recommendation engine)
  getSchoolContext(sessionId: number): Promise<SchoolContext | undefined>;
  updateSchoolContext(sessionId: number, patch: Partial<SchoolContextState>): Promise<SchoolContext>;

  // Recommendations
  saveRecommendations(recs: InsertRecommendation[]): Promise<Recommendation[]>;
  getRecommendations(sessionId: number): Promise<(Recommendation & { model: Model })[]>;
  deleteRecommendations(sessionId: number): Promise<void>;

  // Advisor config (global)
  getAdvisorConfig(): Promise<AdvisorConfig | undefined>;
  saveAdvisorConfig(systemPrompt: string): Promise<AdvisorConfig>;

  // Workflow Progress
  getWorkflowProgress(sessionId: number): Promise<WorkflowProgress | undefined>;
  createWorkflowProgress(sessionId: number): Promise<WorkflowProgress>;
  updateWorkflowProgress(sessionId: number, currentStep: number, stepsCompleted: number[], stepData: StepData): Promise<WorkflowProgress>;
  resetWorkflowStep(sessionId: number, stepNumber: number): Promise<void>;
  resetAllWorkflow(sessionId: number): Promise<void>;

  // Step Conversations
  getStepConversations(sessionId: number, stepNumber: number): Promise<StepConversation[]>;
  addStepMessage(sessionId: number, stepNumber: number, role: string, content: string): Promise<StepConversation>;
  clearStepConversation(sessionId: number, stepNumber: number): Promise<void>;
  clearAllStepConversations(sessionId: number): Promise<void>;

  // Step Documents
  getStepDocuments(sessionId: number, stepNumber: number): Promise<StepDocument[]>;
  getAllStepDocuments(sessionId: number): Promise<StepDocument[]>;
  addStepDocument(sessionId: number, stepNumber: number, fileName: string, fileContent: string, fileType: string): Promise<StepDocument>;
  deleteStepDocument(id: number): Promise<void>;

  // Knowledge Base
  getKnowledgeBase(stepNumber: number): Promise<KnowledgeBaseEntry[]>;
  getAllKnowledgeBase(): Promise<KnowledgeBaseEntry[]>;
  getKnowledgeByReferenceType(referenceType: string): Promise<KnowledgeBaseEntry[]>;
  addKnowledgeBaseEntry(stepNumber: number, title: string, content: string, fileName?: string, fileData?: string, fileMimeType?: string, referenceType?: string): Promise<KnowledgeBaseEntry>;
  getKnowledgeBaseFileData(id: number): Promise<{ fileData: string | null; fileMimeType: string | null; fileName: string | null } | undefined>;
  deleteKnowledgeBaseEntry(id: number): Promise<void>;

  // KB Chunks (RAG)
  getKbChunks(stepNumber: number): Promise<KbChunk[]>;
  getKbChunksByKnowledgeBaseId(knowledgeBaseId: number): Promise<KbChunk[]>;
  createKbChunks(chunks: InsertKbChunk[]): Promise<KbChunk[]>;
  deleteKbChunksByKnowledgeBaseId(knowledgeBaseId: number): Promise<void>;
  deleteAllKbChunks(): Promise<void>;

  // Step Advisor Configs
  getStepAdvisorConfig(stepNumber: number): Promise<StepAdvisorConfig | undefined>;
  getAllStepAdvisorConfigs(): Promise<StepAdvisorConfig[]>;
  saveStepAdvisorConfig(stepNumber: number, systemPrompt: string): Promise<StepAdvisorConfig>;

  // Taxonomy Items
  getAllTaxonomyItems(): Promise<TaxonomyItem[]>;
  getTaxonomyItems(stepNumber: number, category?: string): Promise<TaxonomyItem[]>;
  getTaxonomyItem(id: number): Promise<TaxonomyItem | undefined>;
  createTaxonomyItem(item: InsertTaxonomyItem): Promise<TaxonomyItem>;
  updateTaxonomyItem(id: number, updates: Partial<InsertTaxonomyItem>): Promise<TaxonomyItem>;
  deleteTaxonomyItem(id: number): Promise<void>;
  bulkCreateTaxonomyItems(items: InsertTaxonomyItem[]): Promise<TaxonomyItem[]>;

  // Taxonomy Group Labels (editable section headers)
  getTaxonomyGroupLabels(category: string): Promise<TaxonomyGroupLabel[]>;
  saveTaxonomyGroupLabel(category: string, groupKey: string, label: string): Promise<TaxonomyGroupLabel>;

  // Airtable Config
  getAirtableConfig(): Promise<{ baseId: string | null; tableId: string | null; apiToken: string | null } | undefined>;
  saveAirtableConfig(config: { baseId?: string; tableId?: string; apiToken?: string }): Promise<void>;

  // Model Field Defs
  getModelFieldDefs(): Promise<ModelFieldDef[]>;
  getModelFieldDef(id: number): Promise<ModelFieldDef | undefined>;
  createModelFieldDef(def: InsertModelFieldDef): Promise<ModelFieldDef>;
  updateModelFieldDef(id: number, updates: Partial<InsertModelFieldDef>): Promise<ModelFieldDef>;
  deleteModelFieldDef(id: number): Promise<void>;

  // Scoring Rules
  getScoringRules(fieldDefId?: number): Promise<(ScoringRule & { fieldDef: ModelFieldDef })[]>;
  getScoringRule(id: number): Promise<ScoringRule | undefined>;
  createScoringRule(rule: InsertScoringRule): Promise<ScoringRule>;
  updateScoringRule(id: number, updates: Partial<InsertScoringRule>): Promise<ScoringRule>;
  deleteScoringRule(id: number): Promise<void>;
  getAllScoringRulesWithFieldDefs(): Promise<(ScoringRule & { fieldDef: ModelFieldDef })[]>;

  // Scoring Config
  getScoringConfigs(): Promise<ScoringConfig[]>;
  upsertScoringConfig(key: string, value: number, label: string): Promise<ScoringConfig>;
}

export class DatabaseStorage implements IStorage {
  // === AUTH / USERS ===

  async createUserWithPassword(email: string, password: string): Promise<User> {
    const passwordHash = await bcrypt.hash(password, 12);
    const [created] = await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash,
    }).returning();
    return created;
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async verifyUserPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  // === MODELS ===

  async getAllModels(): Promise<Model[]> {
    return await db.select().from(models);
  }

  async getModel(id: number): Promise<Model | undefined> {
    const [model] = await db.select().from(models).where(eq(models.id, id));
    return model;
  }

  async createModel(model: InsertModel): Promise<Model> {
    const [newModel] = await db.insert(models).values(model).returning();
    return newModel;
  }

  async updateModelEnrichment(modelId: number, enrichedContent: Record<string, string>): Promise<Model> {
    const [updated] = await db.update(models).set({
      enrichedContent,
      enrichedAt: new Date(),
    }).where(eq(models.id, modelId)).returning();
    return updated;
  }

  async syncModelsFromAirtable(newModels: InsertModel[]): Promise<Model[]> {
    if (newModels.length === 0) {
      throw new Error("Airtable returned no models. Existing models were NOT modified to prevent data loss.");
    }

    const existingModels = await db.select().from(models);

    const byAirtableId = new Map<string, Model>();
    const byNameLower = new Map<string, Model>();
    for (const m of existingModels) {
      if (m.airtableRecordId) byAirtableId.set(m.airtableRecordId, m);
      byNameLower.set(m.name.trim().toLowerCase(), m);
    }

    const result: Model[] = [];
    const matchedDbIds = new Set<number>();

    for (const incoming of newModels) {
      let existing: Model | undefined;

      if (incoming.airtableRecordId) {
        existing = byAirtableId.get(incoming.airtableRecordId);
      }
      if (!existing) {
        existing = byNameLower.get(incoming.name.trim().toLowerCase());
      }

      if (existing) {
        matchedDbIds.add(existing.id);
        const [updated] = await db.update(models).set({
          name: incoming.name,
          grades: incoming.grades,
          description: incoming.description,
          link: incoming.link,
          outcomeTypes: incoming.outcomeTypes,
          keyPractices: incoming.keyPractices,
          implementationSupports: incoming.implementationSupports,
          imageUrl: incoming.imageUrl,
          attributes: incoming.attributes,
          airtableRecordId: incoming.airtableRecordId ?? existing.airtableRecordId,
        }).where(eq(models.id, existing.id)).returning();
        result.push(updated);
      } else {
        const [inserted] = await db.insert(models).values(incoming).returning();
        result.push(inserted);
      }
    }

    // Flag models no longer in Airtable (don't delete — preserve enrichment data).
    // Models not matched remain in the DB untouched.
    const unmatchedCount = existingModels.filter((m) => !matchedDbIds.has(m.id)).length;
    if (unmatchedCount > 0) {
      console.log(`[Airtable Sync] ${unmatchedCount} existing model(s) not found in Airtable — preserved in DB.`);
    }

    // Clear recommendations since model data changed
    await db.delete(recommendations);

    return result;
  }

  // === SESSIONS ===

  async createSession(sessionId: string, userId?: number, focusArea?: string, name?: string): Promise<Session> {
    const [session] = await db.insert(sessions).values({
      sessionId,
      userId: userId ?? null,
      focusArea: focusArea ?? "ccl",
      name: name ?? null,
    }).returning();
    await db.insert(schoolContexts).values({
      sessionId: session.id,
      desiredOutcomes: [],
      gradeBands: [],
      keyPractices: [],
      implementationSupportsNeeded: [],
      constraints: [],
    });
    await db.insert(workflowProgress).values({
      sessionId: session.id,
      currentStep: 1,
      stepsCompleted: [],
      stepData: {},
    });
    return session;
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId));
    return session;
  }

  async getSessionsByUser(userId: number, focusArea?: string): Promise<SessionSummary[]> {
    const rows = await db.select().from(sessions)
      .where(
        focusArea
          ? and(eq(sessions.userId, userId), eq(sessions.focusArea, focusArea))
          : eq(sessions.userId, userId)
      )
      .orderBy(desc(sessions.updatedAt));

    const results: SessionSummary[] = [];
    for (const s of rows) {
      const progress = await this.getWorkflowProgress(s.id);
      const stepData = (progress?.stepData ?? {}) as Record<string, any>;
      const step1 = stepData["1"] ?? {};
      results.push({
        sessionId: s.sessionId,
        name: s.name,
        focusArea: s.focusArea,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        currentStep: progress?.currentStep ?? 1,
        stepsCompleted: (progress?.stepsCompleted as number[]) ?? [],
        schoolName: step1.school_name ?? null,
        district: step1.district ?? null,
        gradeBand: step1.grade_band ?? null,
        designScope: (stepData.designScope as "whole_program" | "specific_experience") ?? null,
      });
    }
    return results;
  }

  async updateSessionName(sessionId: string, name: string): Promise<void> {
    await db.update(sessions)
      .set({ name, updatedAt: new Date() })
      .where(eq(sessions.sessionId, sessionId));
  }

  // === SCHOOL CONTEXT ===

  async getSchoolContext(sessionId: number): Promise<SchoolContext | undefined> {
    const [context] = await db.select().from(schoolContexts).where(eq(schoolContexts.sessionId, sessionId));
    return context;
  }

  async updateSchoolContext(sessionId: number, patch: Partial<SchoolContextState>): Promise<SchoolContext> {
    const [existing] = await db.select().from(schoolContexts).where(eq(schoolContexts.sessionId, sessionId));
    if (!existing) throw new Error("Context not found");

    const mergeArray = (oldArr: string[] | null, newArr: string[] | undefined) => {
      if (!newArr) return oldArr;
      if (!oldArr) return newArr;
      return Array.from(new Set([...oldArr, ...newArr]));
    };

    const updates: any = {};
    if (patch.vision !== undefined) updates.vision = patch.vision;
    if (patch.notes !== undefined) updates.notes = patch.notes;
    if (patch.desiredOutcomes) updates.desiredOutcomes = mergeArray(existing.desiredOutcomes, patch.desiredOutcomes);
    if (patch.gradeBands) updates.gradeBands = mergeArray(existing.gradeBands, patch.gradeBands);
    if (patch.keyPractices) updates.keyPractices = mergeArray(existing.keyPractices, patch.keyPractices);
    if (patch.implementationSupportsNeeded) updates.implementationSupportsNeeded = mergeArray(existing.implementationSupportsNeeded, patch.implementationSupportsNeeded);
    if (patch.constraints) updates.constraints = mergeArray(existing.constraints, patch.constraints);

    const [updated] = await db.update(schoolContexts)
      .set(updates)
      .where(eq(schoolContexts.id, existing.id))
      .returning();
    return updated;
  }

  // === RECOMMENDATIONS ===

  async saveRecommendations(recs: InsertRecommendation[]): Promise<Recommendation[]> {
    if (recs.length > 0) {
      await db.delete(recommendations).where(eq(recommendations.sessionId, recs[0].sessionId));
      return await db.insert(recommendations).values(recs).returning();
    }
    return [];
  }

  /**
   * Fetch recommendations with their associated models in a single batch query
   * (fixes the previous N+1 query pattern).
   */
  async getRecommendations(sessionId: number): Promise<(Recommendation & { model: Model })[]> {
    const recs = await db.select()
      .from(recommendations)
      .where(eq(recommendations.sessionId, sessionId))
      .orderBy(desc(recommendations.score));

    if (recs.length === 0) return [];

    // Batch-load all referenced models in a single query
    const modelIds = [...new Set(recs.map((r) => r.modelId))];
    const modelRows = await db.select().from(models).where(inArray(models.id, modelIds));
    const modelMap = new Map(modelRows.map((m) => [m.id, m]));

    const result: (Recommendation & { model: Model })[] = [];
    for (const rec of recs) {
      const model = modelMap.get(rec.modelId);
      if (model) {
        result.push({ ...rec, model });
      }
    }
    return result;
  }

  async deleteRecommendations(sessionId: number): Promise<void> {
    await db.delete(recommendations).where(eq(recommendations.sessionId, sessionId));
  }

  // === ADVISOR CONFIG ===

  async getAdvisorConfig(): Promise<AdvisorConfig | undefined> {
    const [config] = await db.select().from(advisorConfig).limit(1);
    return config;
  }

  async saveAdvisorConfig(systemPrompt: string): Promise<AdvisorConfig> {
    const existing = await this.getAdvisorConfig();
    if (existing) {
      const [updated] = await db.update(advisorConfig)
        .set({ systemPrompt, updatedAt: new Date() })
        .where(eq(advisorConfig.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(advisorConfig)
        .values({ systemPrompt })
        .returning();
      return created;
    }
  }

  // === WORKFLOW PROGRESS ===

  async getWorkflowProgress(sessionId: number): Promise<WorkflowProgress | undefined> {
    const [progress] = await db.select().from(workflowProgress).where(eq(workflowProgress.sessionId, sessionId));
    return progress;
  }

  async createWorkflowProgress(sessionId: number): Promise<WorkflowProgress> {
    const [progress] = await db.insert(workflowProgress).values({
      sessionId,
      currentStep: 1,
      stepsCompleted: [],
      stepData: {},
    }).returning();
    return progress;
  }

  async updateWorkflowProgress(sessionId: number, currentStep: number, stepsCompleted: number[], stepData: StepData): Promise<WorkflowProgress> {
    const existing = await this.getWorkflowProgress(sessionId);
    if (!existing) {
      const [created] = await db.insert(workflowProgress).values({
        sessionId,
        currentStep,
        stepsCompleted,
        stepData,
      }).returning();
      return created;
    }
    const [updated] = await db.update(workflowProgress)
      .set({ currentStep, stepsCompleted, stepData, updatedAt: new Date() })
      .where(eq(workflowProgress.id, existing.id))
      .returning();
    return updated;
  }

  async resetWorkflowStep(sessionId: number, stepNumber: number): Promise<void> {
    const existing = await this.getWorkflowProgress(sessionId);
    if (!existing) return;
    const newCompleted = (existing.stepsCompleted as number[]).filter((s) => s !== stepNumber);
    const newStepData = { ...(existing.stepData as Record<string, any>) };
    delete newStepData[String(stepNumber)];
    await db.update(workflowProgress)
      .set({ stepsCompleted: newCompleted, stepData: newStepData, updatedAt: new Date() })
      .where(eq(workflowProgress.id, existing.id));
    await this.clearStepConversation(sessionId, stepNumber);
    await db.delete(stepDocuments).where(
      and(eq(stepDocuments.sessionId, sessionId), eq(stepDocuments.stepNumber, stepNumber)),
    );
    if (stepNumber === 7) {
      await this.deleteRecommendations(sessionId);
    }
  }

  async resetAllWorkflow(sessionId: number): Promise<void> {
    const existing = await this.getWorkflowProgress(sessionId);
    if (existing) {
      await db.update(workflowProgress)
        .set({ currentStep: 1, stepsCompleted: [], stepData: {}, updatedAt: new Date() })
        .where(eq(workflowProgress.id, existing.id));
    }
    await this.clearAllStepConversations(sessionId);
    await db.delete(stepDocuments).where(eq(stepDocuments.sessionId, sessionId));
    await db.delete(recommendations).where(eq(recommendations.sessionId, sessionId));
  }

  // === STEP CONVERSATIONS ===

  async getStepConversations(sessionId: number, stepNumber: number): Promise<StepConversation[]> {
    return await db.select().from(stepConversations)
      .where(and(eq(stepConversations.sessionId, sessionId), eq(stepConversations.stepNumber, stepNumber)))
      .orderBy(asc(stepConversations.createdAt));
  }

  async addStepMessage(sessionId: number, stepNumber: number, role: string, content: string): Promise<StepConversation> {
    const [msg] = await db.insert(stepConversations).values({
      sessionId, stepNumber, role, content,
    }).returning();
    return msg;
  }

  async clearStepConversation(sessionId: number, stepNumber: number): Promise<void> {
    await db.delete(stepConversations).where(
      and(eq(stepConversations.sessionId, sessionId), eq(stepConversations.stepNumber, stepNumber)),
    );
  }

  async clearAllStepConversations(sessionId: number): Promise<void> {
    await db.delete(stepConversations).where(eq(stepConversations.sessionId, sessionId));
  }

  // === STEP DOCUMENTS ===

  async getStepDocuments(sessionId: number, stepNumber: number): Promise<StepDocument[]> {
    return await db.select().from(stepDocuments)
      .where(and(eq(stepDocuments.sessionId, sessionId), eq(stepDocuments.stepNumber, stepNumber)))
      .orderBy(desc(stepDocuments.createdAt));
  }

  async getAllStepDocuments(sessionId: number): Promise<StepDocument[]> {
    return await db.select().from(stepDocuments)
      .where(eq(stepDocuments.sessionId, sessionId))
      .orderBy(desc(stepDocuments.createdAt));
  }

  async addStepDocument(sessionId: number, stepNumber: number, fileName: string, fileContent: string, fileType: string): Promise<StepDocument> {
    const [doc] = await db.insert(stepDocuments).values({
      sessionId, stepNumber, fileName, fileContent, fileType,
    }).returning();
    return doc;
  }

  async deleteStepDocument(id: number): Promise<void> {
    await db.delete(stepDocuments).where(eq(stepDocuments.id, id));
  }

  // === KNOWLEDGE BASE ===

  async getKnowledgeBase(stepNumber: number): Promise<KnowledgeBaseEntry[]> {
    return await db.select().from(knowledgeBase)
      .where(eq(knowledgeBase.stepNumber, stepNumber))
      .orderBy(desc(knowledgeBase.createdAt));
  }

  async getAllKnowledgeBase(): Promise<KnowledgeBaseEntry[]> {
    return await db.select().from(knowledgeBase).orderBy(asc(knowledgeBase.stepNumber));
  }

  async getKnowledgeByReferenceType(referenceType: string): Promise<KnowledgeBaseEntry[]> {
    try {
      return await db.select().from(knowledgeBase)
        .where(eq(knowledgeBase.referenceType, referenceType))
        .orderBy(desc(knowledgeBase.createdAt));
    } catch {
      return [];
    }
  }

  async getKnowledgeBaseFileData(id: number): Promise<{ fileData: string | null; fileMimeType: string | null; fileName: string | null } | undefined> {
    const [entry] = await db.select({
      fileData: knowledgeBase.fileData,
      fileMimeType: knowledgeBase.fileMimeType,
      fileName: knowledgeBase.fileName,
    }).from(knowledgeBase).where(eq(knowledgeBase.id, id));
    return entry;
  }

  async addKnowledgeBaseEntry(stepNumber: number, title: string, content: string, fileName?: string, fileData?: string, fileMimeType?: string, referenceType?: string): Promise<KnowledgeBaseEntry> {
    const [entry] = await db.insert(knowledgeBase).values({
      stepNumber, title, content, fileName: fileName || null,
      fileData: fileData || null, fileMimeType: fileMimeType || null,
      referenceType: referenceType || null,
    }).returning();
    return entry;
  }

  async deleteKnowledgeBaseEntry(id: number): Promise<void> {
    await db.delete(knowledgeBase).where(eq(knowledgeBase.id, id));
  }

  // === KB CHUNKS (RAG) ===

  async getKbChunks(stepNumber: number): Promise<KbChunk[]> {
    return await db.select().from(kbChunks)
      .where(eq(kbChunks.stepNumber, stepNumber))
      .orderBy(asc(kbChunks.chunkIndex));
  }

  async getKbChunksByKnowledgeBaseId(knowledgeBaseId: number): Promise<KbChunk[]> {
    return await db.select().from(kbChunks)
      .where(eq(kbChunks.knowledgeBaseId, knowledgeBaseId))
      .orderBy(asc(kbChunks.chunkIndex));
  }

  async createKbChunks(chunks: InsertKbChunk[]): Promise<KbChunk[]> {
    if (chunks.length === 0) return [];
    return await db.insert(kbChunks).values(chunks).returning();
  }

  async deleteKbChunksByKnowledgeBaseId(knowledgeBaseId: number): Promise<void> {
    await db.delete(kbChunks).where(eq(kbChunks.knowledgeBaseId, knowledgeBaseId));
  }

  async deleteAllKbChunks(): Promise<void> {
    await db.delete(kbChunks);
  }

  // === STEP ADVISOR CONFIGS ===

  async getStepAdvisorConfig(stepNumber: number): Promise<StepAdvisorConfig | undefined> {
    const [config] = await db.select().from(stepAdvisorConfigs)
      .where(eq(stepAdvisorConfigs.stepNumber, stepNumber));
    return config;
  }

  async getAllStepAdvisorConfigs(): Promise<StepAdvisorConfig[]> {
    return await db.select().from(stepAdvisorConfigs).orderBy(asc(stepAdvisorConfigs.stepNumber));
  }

  async saveStepAdvisorConfig(stepNumber: number, systemPrompt: string): Promise<StepAdvisorConfig> {
    const existing = await this.getStepAdvisorConfig(stepNumber);
    if (existing) {
      const [updated] = await db.update(stepAdvisorConfigs)
        .set({ systemPrompt, updatedAt: new Date() })
        .where(eq(stepAdvisorConfigs.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(stepAdvisorConfigs).values({
      stepNumber, systemPrompt,
    }).returning();
    return created;
  }

  // === TAXONOMY ITEMS ===

  async getAllTaxonomyItems(): Promise<TaxonomyItem[]> {
    return await db.select().from(taxonomyItems)
      .orderBy(asc(taxonomyItems.sortOrder));
  }

  async getTaxonomyItems(stepNumber: number, category?: string): Promise<TaxonomyItem[]> {
    if (category) {
      return await db.select().from(taxonomyItems)
        .where(and(eq(taxonomyItems.stepNumber, stepNumber), eq(taxonomyItems.category, category)))
        .orderBy(asc(taxonomyItems.sortOrder), asc(taxonomyItems.name));
    }
    return await db.select().from(taxonomyItems)
      .where(eq(taxonomyItems.stepNumber, stepNumber))
      .orderBy(asc(taxonomyItems.category), asc(taxonomyItems.sortOrder), asc(taxonomyItems.name));
  }

  async getTaxonomyItem(id: number): Promise<TaxonomyItem | undefined> {
    const [item] = await db.select().from(taxonomyItems).where(eq(taxonomyItems.id, id));
    return item;
  }

  async createTaxonomyItem(item: InsertTaxonomyItem): Promise<TaxonomyItem> {
    const [created] = await db.insert(taxonomyItems).values(item).returning();
    return created;
  }

  async updateTaxonomyItem(id: number, updates: Partial<InsertTaxonomyItem>): Promise<TaxonomyItem> {
    const [updated] = await db.update(taxonomyItems)
      .set(updates)
      .where(eq(taxonomyItems.id, id))
      .returning();
    return updated;
  }

  async deleteTaxonomyItem(id: number): Promise<void> {
    await db.delete(taxonomyItems).where(eq(taxonomyItems.id, id));
  }

  async bulkCreateTaxonomyItems(items: InsertTaxonomyItem[]): Promise<TaxonomyItem[]> {
    if (items.length === 0) return [];
    return await db.insert(taxonomyItems).values(items).returning();
  }

  async getTaxonomyGroupLabels(category: string): Promise<TaxonomyGroupLabel[]> {
    return await db.select().from(taxonomyGroupLabels)
      .where(eq(taxonomyGroupLabels.category, category))
      .orderBy(asc(taxonomyGroupLabels.sortOrder), asc(taxonomyGroupLabels.groupKey));
  }

  async saveTaxonomyGroupLabel(category: string, groupKey: string, label: string): Promise<TaxonomyGroupLabel> {
    const existing = await db.select().from(taxonomyGroupLabels)
      .where(and(eq(taxonomyGroupLabels.category, category), eq(taxonomyGroupLabels.groupKey, groupKey)));
    if (existing.length > 0) {
      const [updated] = await db.update(taxonomyGroupLabels)
        .set({ label, updatedAt: new Date() })
        .where(eq(taxonomyGroupLabels.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(taxonomyGroupLabels).values({ category, groupKey, label }).returning();
    return created;
  }

  // === MODEL FIELD DEFS ===

  async getModelFieldDefs(): Promise<ModelFieldDef[]> {
    return await db.select().from(modelFieldDefs).orderBy(asc(modelFieldDefs.sortOrder), asc(modelFieldDefs.key));
  }

  async getModelFieldDef(id: number): Promise<ModelFieldDef | undefined> {
    const [row] = await db.select().from(modelFieldDefs).where(eq(modelFieldDefs.id, id));
    return row;
  }

  async createModelFieldDef(def: InsertModelFieldDef): Promise<ModelFieldDef> {
    const [row] = await db.insert(modelFieldDefs).values(def).returning();
    return row;
  }

  async updateModelFieldDef(id: number, updates: Partial<InsertModelFieldDef>): Promise<ModelFieldDef> {
    const [row] = await db.update(modelFieldDefs).set(updates).where(eq(modelFieldDefs.id, id)).returning();
    return row;
  }

  async deleteModelFieldDef(id: number): Promise<void> {
    await db.delete(scoringRules).where(eq(scoringRules.fieldDefId, id));
    await db.delete(modelFieldDefs).where(eq(modelFieldDefs.id, id));
  }

  // === SCORING RULES ===

  async getScoringRules(fieldDefId?: number): Promise<(ScoringRule & { fieldDef: ModelFieldDef })[]> {
    const rows = fieldDefId
      ? await db.select().from(scoringRules).where(eq(scoringRules.fieldDefId, fieldDefId)).orderBy(asc(scoringRules.id))
      : await db.select().from(scoringRules).orderBy(asc(scoringRules.fieldDefId), asc(scoringRules.id));

    const fieldDefIds = [...new Set(rows.map((r) => r.fieldDefId))];
    if (fieldDefIds.length === 0) return [];
    const defs = await db.select().from(modelFieldDefs).where(inArray(modelFieldDefs.id, fieldDefIds));
    const defMap = new Map(defs.map((d) => [d.id, d]));

    return rows
      .map((r) => {
        const fd = defMap.get(r.fieldDefId);
        if (!fd) return null;
        return { ...r, fieldDef: fd };
      })
      .filter(Boolean) as (ScoringRule & { fieldDef: ModelFieldDef })[];
  }

  async getScoringRule(id: number): Promise<ScoringRule | undefined> {
    const [row] = await db.select().from(scoringRules).where(eq(scoringRules.id, id));
    return row;
  }

  async createScoringRule(rule: InsertScoringRule): Promise<ScoringRule> {
    const [row] = await db.insert(scoringRules).values(rule).returning();
    return row;
  }

  async updateScoringRule(id: number, updates: Partial<InsertScoringRule>): Promise<ScoringRule> {
    const [row] = await db.update(scoringRules).set({ ...updates, updatedAt: new Date() }).where(eq(scoringRules.id, id)).returning();
    return row;
  }

  async deleteScoringRule(id: number): Promise<void> {
    await db.delete(scoringRules).where(eq(scoringRules.id, id));
  }

  async getAllScoringRulesWithFieldDefs(): Promise<(ScoringRule & { fieldDef: ModelFieldDef })[]> {
    return this.getScoringRules();
  }

  // === SCORING CONFIG ===

  async getScoringConfigs(): Promise<ScoringConfig[]> {
    return await db.select().from(scoringConfig).orderBy(asc(scoringConfig.key));
  }

  async upsertScoringConfig(key: string, value: number, label: string): Promise<ScoringConfig> {
    const [existing] = await db.select().from(scoringConfig).where(eq(scoringConfig.key, key));
    if (existing) {
      const [updated] = await db.update(scoringConfig)
        .set({ value, label, updatedAt: new Date() })
        .where(eq(scoringConfig.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(scoringConfig).values({ key, value, label }).returning();
    return created;
  }

  // === AIRTABLE CONFIG ===

  async getAirtableConfig(): Promise<{ baseId: string | null; tableId: string | null; apiToken: string | null } | undefined> {
    const [row] = await db.select().from(airtableConfig).limit(1);
    if (!row) return undefined;
    return { baseId: row.baseId ?? null, tableId: row.tableId ?? null, apiToken: row.apiToken ?? null };
  }

  async saveAirtableConfig(config: { baseId?: string; tableId?: string; apiToken?: string }): Promise<void> {
    const [existing] = await db.select().from(airtableConfig).limit(1);
    if (existing) {
      await db.update(airtableConfig)
        .set({
          baseId: config.baseId !== undefined ? config.baseId : existing.baseId,
          tableId: config.tableId !== undefined ? config.tableId : existing.tableId,
          apiToken: config.apiToken !== undefined ? (config.apiToken || null) : existing.apiToken,
          updatedAt: new Date(),
        })
        .where(eq(airtableConfig.id, existing.id));
    } else {
      await db.insert(airtableConfig).values({
        baseId: config.baseId ?? null,
        tableId: config.tableId ?? null,
        apiToken: config.apiToken ?? null,
      });
    }
  }
}

export const storage = new DatabaseStorage();
