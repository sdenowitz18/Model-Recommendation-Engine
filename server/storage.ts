import { db } from "./db";
import {
  models, sessions, schoolContexts, recommendations, comparisonSelections, advisorConfig,
  workflowProgress, stepConversations, stepDocuments, knowledgeBase, stepAdvisorConfigs,
  type Model, type InsertModel, type Session, type SchoolContext, type InsertSchoolContext,
  type Recommendation, type InsertRecommendation, type ComparisonSelection,
  type SchoolContextState, type AdvisorConfig, type WorkflowProgress, type StepConversation,
  type StepDocument, type KnowledgeBaseEntry, type StepAdvisorConfig, type StepData
} from "@shared/schema";
import { eq, desc, and, asc } from "drizzle-orm";

export interface IStorage {
  // Models
  getAllModels(): Promise<Model[]>;
  getModel(id: number): Promise<Model | undefined>;
  createModel(model: InsertModel): Promise<Model>;
  syncModelsFromAirtable(newModels: InsertModel[]): Promise<Model[]>;
  
  // Sessions
  createSession(sessionId: string): Promise<Session>;
  getSession(sessionId: string): Promise<Session | undefined>;
  
  // Context (legacy)
  getSchoolContext(sessionId: number): Promise<SchoolContext | undefined>;
  updateSchoolContext(sessionId: number, patch: Partial<SchoolContextState>): Promise<SchoolContext>;
  markContextReady(sessionId: number): Promise<void>;
  
  // Recommendations
  saveRecommendations(recs: InsertRecommendation[]): Promise<Recommendation[]>;
  getRecommendations(sessionId: number): Promise<(Recommendation & { model: Model })[]>;
  
  // Comparison
  saveComparisonSelection(sessionId: number, modelIds: number[]): Promise<ComparisonSelection>;
  getComparisonSelection(sessionId: number): Promise<ComparisonSelection | undefined>;
  
  // Clear session
  clearSessionData(sessionId: number): Promise<void>;
  
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
  addKnowledgeBaseEntry(stepNumber: number, title: string, content: string, fileName?: string): Promise<KnowledgeBaseEntry>;
  deleteKnowledgeBaseEntry(id: number): Promise<void>;

  // Step Advisor Configs
  getStepAdvisorConfig(stepNumber: number): Promise<StepAdvisorConfig | undefined>;
  getAllStepAdvisorConfigs(): Promise<StepAdvisorConfig[]>;
  saveStepAdvisorConfig(stepNumber: number, systemPrompt: string): Promise<StepAdvisorConfig>;
}

export class DatabaseStorage implements IStorage {
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

  async syncModelsFromAirtable(newModels: InsertModel[]): Promise<Model[]> {
    await db.delete(recommendations);
    await db.delete(models);
    if (newModels.length === 0) return [];
    return await db.insert(models).values(newModels).returning();
  }

  async createSession(sessionId: string): Promise<Session> {
    const [session] = await db.insert(sessions).values({ sessionId }).returning();
    await db.insert(schoolContexts).values({ 
      sessionId: session.id,
      desiredOutcomes: [],
      gradeBands: [],
      keyPractices: [],
      implementationSupportsNeeded: [],
      constraints: []
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

  async markContextReady(sessionId: number): Promise<void> {
    await db.update(schoolContexts)
      .set({ isReadyForRecommendation: true })
      .where(eq(schoolContexts.sessionId, sessionId));
  }

  async saveRecommendations(recs: InsertRecommendation[]): Promise<Recommendation[]> {
    if (recs.length > 0) {
      await db.delete(recommendations).where(eq(recommendations.sessionId, recs[0].sessionId));
      return await db.insert(recommendations).values(recs).returning();
    }
    return [];
  }

  async getRecommendations(sessionId: number): Promise<(Recommendation & { model: Model })[]> {
    const recs = await db.select()
      .from(recommendations)
      .where(eq(recommendations.sessionId, sessionId))
      .orderBy(desc(recommendations.score));
    
    const result = [];
    for (const rec of recs) {
      const model = await this.getModel(rec.modelId);
      if (model) {
        result.push({ ...rec, model });
      }
    }
    return result;
  }

  async saveComparisonSelection(sessionId: number, modelIds: number[]): Promise<ComparisonSelection> {
    await db.delete(comparisonSelections).where(eq(comparisonSelections.sessionId, sessionId));
    const [selection] = await db.insert(comparisonSelections).values({ sessionId, modelIds }).returning();
    return selection;
  }

  async getComparisonSelection(sessionId: number): Promise<ComparisonSelection | undefined> {
    const [selection] = await db.select().from(comparisonSelections).where(eq(comparisonSelections.sessionId, sessionId));
    return selection;
  }

  async clearSessionData(sessionId: number): Promise<void> {
    await db.delete(recommendations).where(eq(recommendations.sessionId, sessionId));
    await db.delete(comparisonSelections).where(eq(comparisonSelections.sessionId, sessionId));
    await db.update(schoolContexts)
      .set({
        vision: null,
        desiredOutcomes: [],
        gradeBands: [],
        keyPractices: [],
        implementationSupportsNeeded: [],
        constraints: [],
        notes: null,
        isReadyForRecommendation: false
      })
      .where(eq(schoolContexts.sessionId, sessionId));
  }

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
    const newCompleted = (existing.stepsCompleted as number[]).filter(s => s !== stepNumber);
    const newStepData = { ...(existing.stepData as Record<string, any>) };
    delete newStepData[String(stepNumber)];
    await db.update(workflowProgress)
      .set({ stepsCompleted: newCompleted, stepData: newStepData, updatedAt: new Date() })
      .where(eq(workflowProgress.id, existing.id));
    await this.clearStepConversation(sessionId, stepNumber);
    await db.delete(stepDocuments).where(
      and(eq(stepDocuments.sessionId, sessionId), eq(stepDocuments.stepNumber, stepNumber))
    );
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
    await db.delete(comparisonSelections).where(eq(comparisonSelections.sessionId, sessionId));
  }

  // === STEP CONVERSATIONS ===
  async getStepConversations(sessionId: number, stepNumber: number): Promise<StepConversation[]> {
    return await db.select().from(stepConversations)
      .where(and(eq(stepConversations.sessionId, sessionId), eq(stepConversations.stepNumber, stepNumber)))
      .orderBy(asc(stepConversations.createdAt));
  }

  async addStepMessage(sessionId: number, stepNumber: number, role: string, content: string): Promise<StepConversation> {
    const [msg] = await db.insert(stepConversations).values({
      sessionId, stepNumber, role, content
    }).returning();
    return msg;
  }

  async clearStepConversation(sessionId: number, stepNumber: number): Promise<void> {
    await db.delete(stepConversations).where(
      and(eq(stepConversations.sessionId, sessionId), eq(stepConversations.stepNumber, stepNumber))
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
      sessionId, stepNumber, fileName, fileContent, fileType
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

  async addKnowledgeBaseEntry(stepNumber: number, title: string, content: string, fileName?: string): Promise<KnowledgeBaseEntry> {
    const [entry] = await db.insert(knowledgeBase).values({
      stepNumber, title, content, fileName: fileName || null
    }).returning();
    return entry;
  }

  async deleteKnowledgeBaseEntry(id: number): Promise<void> {
    await db.delete(knowledgeBase).where(eq(knowledgeBase.id, id));
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
      stepNumber, systemPrompt
    }).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
