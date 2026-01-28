import { db } from "./db";
import {
  models, sessions, schoolContexts, recommendations, comparisonSelections, advisorConfig,
  type Model, type InsertModel, type Session, type SchoolContext, type InsertSchoolContext,
  type Recommendation, type InsertRecommendation, type ComparisonSelection,
  type SchoolContextState, type AdvisorConfig
} from "@shared/schema";
import { eq, desc, inArray } from "drizzle-orm";

export interface IStorage {
  // Models
  getAllModels(): Promise<Model[]>;
  getModel(id: number): Promise<Model | undefined>;
  createModel(model: InsertModel): Promise<Model>;
  syncModelsFromAirtable(newModels: InsertModel[]): Promise<Model[]>;
  
  // Sessions
  createSession(sessionId: string): Promise<Session>;
  getSession(sessionId: string): Promise<Session | undefined>;
  
  // Context
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
  
  // Advisor config
  getAdvisorConfig(): Promise<AdvisorConfig | undefined>;
  saveAdvisorConfig(systemPrompt: string): Promise<AdvisorConfig>;
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
    // Also create an empty context for this session
    await db.insert(schoolContexts).values({ 
      sessionId: session.id,
      desiredOutcomes: [],
      gradeBands: [],
      keyPractices: [],
      implementationSupportsNeeded: [],
      constraints: []
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

    // Merge arrays if they exist in patch, otherwise keep existing
    // Logic: The chatbot patch overwrites or appends? 
    // The prompt says "context_patch includes only fields the user explicitly provided".
    // We should probably append unique values for arrays to avoid losing history if we want that,
    // or just overwrite if the AI determines the new state. 
    // Let's assume overwrite for simplicity of state management, AI should manage the full list if needed, 
    // OR AI sends patches of new items.
    // Let's implement array merging (union) for robustness.
    
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
    // Clear existing for this session? Maybe not, just append or replace. 
    // Let's replace for a fresh recommendation set.
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
    
    // Fetch models manually or use join. Join is better but Drizzle relationship syntax in explicit query:
    // Simple join manually
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
    // Clear recommendations
    await db.delete(recommendations).where(eq(recommendations.sessionId, sessionId));
    // Clear comparison selections
    await db.delete(comparisonSelections).where(eq(comparisonSelections.sessionId, sessionId));
    // Reset school context to empty
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
    // Check if config exists
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
}

export const storage = new DatabaseStorage();
