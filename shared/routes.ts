import { z } from "zod";
import { models, recommendations, advisorConfig, taxonomyItems } from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const taxonomySelectionSchema = z.object({
  id: z.number(),
  name: z.string(),
  importance: z.enum(["most_important", "important", "nice_to_have"]),
});

export const stepChatResponseSchema = z.object({
  assistant_message: z.string(),
  step_data_patch: z.record(z.any()).optional(),
  is_step_complete: z.boolean(),
  suggested_outcomes: z.array(z.number()).optional(), // taxonomy item IDs (Step 2)
  suggested_leaps: z.array(z.number()).optional(),    // taxonomy item IDs (Step 2)
  suggested_taxonomy_ids: z.array(z.number()).optional(), // generic taxonomy IDs (any step)
});

export const api = {
  sessions: {
    create: {
      method: "POST" as const,
      path: "/api/sessions",
      input: z.object({ sessionId: z.string(), focusArea: z.string().optional(), name: z.string().optional() }),
      responses: {
        201: z.object({ id: z.number(), sessionId: z.string() }),
        400: errorSchemas.validation,
      },
    },
    listByUser: {
      method: "GET" as const,
      path: "/api/sessions/user",
    },
    update: {
      method: "PATCH" as const,
      path: "/api/sessions/:sessionId",
      input: z.object({ name: z.string() }),
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/sessions/:sessionId",
    },
  },
  chat: {
    stepAdvisor: {
      method: "POST" as const,
      path: "/api/chat/step-advisor",
      input: z.object({
        sessionId: z.string(),
        stepNumber: z.number(),
        message: z.string(),
        modelId: z.number().optional(),
        topic: z.string().optional(),
      }),
      responses: {
        200: stepChatResponseSchema,
        404: errorSchemas.notFound,
        500: errorSchemas.internal,
      },
    },
  },
  models: {
    list: {
      method: "GET" as const,
      path: "/api/models",
      responses: {
        200: z.array(z.custom<typeof models.$inferSelect>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/models/:id",
      responses: {
        200: z.custom<typeof models.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    getRecommendations: {
      method: "GET" as const,
      path: "/api/sessions/:sessionId/recommendations",
    },
    recommend: {
      method: "POST" as const,
      path: "/api/sessions/:sessionId/recommend",
      responses: {
        200: z.array(z.custom<typeof recommendations.$inferSelect & { model: typeof models.$inferSelect }>()),
        404: errorSchemas.notFound,
      },
    },
  },
  workflow: {
    getProgress: {
      method: "GET" as const,
      path: "/api/sessions/:sessionId/workflow",
    },
    updateProgress: {
      method: "POST" as const,
      path: "/api/sessions/:sessionId/workflow",
      input: z.object({
        currentStep: z.number(),
        stepsCompleted: z.array(z.number()),
        stepData: z.record(z.any()),
      }),
    },
    confirmStep: {
      method: "POST" as const,
      path: "/api/sessions/:sessionId/workflow/confirm-step",
      input: z.object({ stepNumber: z.number() }),
    },
    resetStep: {
      method: "POST" as const,
      path: "/api/sessions/:sessionId/workflow/reset-step",
      input: z.object({ stepNumber: z.number() }),
    },
    resetAll: {
      method: "POST" as const,
      path: "/api/sessions/:sessionId/workflow/reset-all",
    },
    getConversation: {
      method: "GET" as const,
      path: "/api/sessions/:sessionId/workflow/conversation/:stepNumber",
    },
    getDocuments: {
      method: "GET" as const,
      path: "/api/sessions/:sessionId/workflow/documents/:stepNumber",
    },
    voiceToText: {
      method: "POST" as const,
      path: "/api/sessions/:sessionId/voice-to-text",
      responses: {
        200: z.object({ transcript: z.string() }),
      },
    },
    prefillFromDocuments: {
      method: "POST" as const,
      path: "/api/sessions/:sessionId/workflow/prefill-from-documents",
      responses: {
        200: z.object({
          prefilled: z.object({
            step1: z.record(z.any()),
            step2: z.object({ leaps: z.number(), outcomes: z.number() }),
            step3: z.object({ practices: z.number() }),
          }),
          extracted: z.record(z.any()),
        }),
      },
    },
  },
  admin: {
    getConfig: {
      method: "GET" as const,
      path: "/api/admin/config",
      responses: {
        200: z.object({
          systemPrompt: z.string(),
          updatedAt: z.string().nullable(),
        }),
      },
    },
    saveConfig: {
      method: "POST" as const,
      path: "/api/admin/config",
      input: z.object({ systemPrompt: z.string() }),
      responses: {
        200: z.custom<typeof advisorConfig.$inferSelect>(),
      },
    },
    getStepConfigs: {
      method: "GET" as const,
      path: "/api/admin/step-configs",
    },
    saveStepConfig: {
      method: "POST" as const,
      path: "/api/admin/step-configs/:stepNumber",
      input: z.object({ systemPrompt: z.string() }),
    },
    getAirtableConfig: {
      method: "GET" as const,
      path: "/api/admin/airtable-config",
    },
    saveAirtableConfig: {
      method: "POST" as const,
      path: "/api/admin/airtable-config",
      input: z.object({ baseId: z.string().optional(), tableId: z.string().optional(), apiToken: z.string().optional() }),
    },
    getKnowledgeBase: {
      method: "GET" as const,
      path: "/api/admin/knowledge-base",
    },
    addKnowledgeBase: {
      method: "POST" as const,
      path: "/api/admin/knowledge-base",
    },
    deleteKnowledgeBase: {
      method: "DELETE" as const,
      path: "/api/admin/knowledge-base/:id",
    },
    // Taxonomy Items
    getTaxonomy: {
      method: "GET" as const,
      path: "/api/admin/taxonomy/:stepNumber",
    },
    createTaxonomyItem: {
      method: "POST" as const,
      path: "/api/admin/taxonomy",
      input: z.object({
        stepNumber: z.number(),
        category: z.string(),
        name: z.string(),
        description: z.string().optional(),
        examples: z.string().optional(),
        detailContent: z.string().optional(),
        group: z.string().optional(),
        sortOrder: z.number().optional(),
      }),
    },
    updateTaxonomyItem: {
      method: "PUT" as const,
      path: "/api/admin/taxonomy/:id",
      input: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        examples: z.string().nullable().optional(),
        detailContent: z.string().nullable().optional(),
        category: z.string().optional(),
        group: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
      }),
    },
    getTaxonomyGroupLabels: {
      method: "GET" as const,
      path: "/api/admin/taxonomy-group-labels/:category",
    },
    saveTaxonomyGroupLabel: {
      method: "POST" as const,
      path: "/api/admin/taxonomy-group-labels",
      input: z.object({ category: z.string(), groupKey: z.string(), label: z.string() }),
    },
    deleteTaxonomyItem: {
      method: "DELETE" as const,
      path: "/api/admin/taxonomy/:id",
    },
    seedTaxonomy: {
      method: "POST" as const,
      path: "/api/admin/seed-taxonomy",
    },
    restoreDefaults: {
      method: "POST" as const,
      path: "/api/admin/restore-defaults",
    },
    parseTaxonomyFromKB: {
      method: "POST" as const,
      path: "/api/admin/taxonomy/parse-from-kb",
      input: z.object({
        stepNumber: z.number(),
        knowledgeBaseId: z.number(),
      }),
    },
    // Model Field Defs
    getModelFieldDefs: {
      method: "GET" as const,
      path: "/api/admin/model-field-defs",
    },
    createModelFieldDef: {
      method: "POST" as const,
      path: "/api/admin/model-field-defs",
      input: z.object({
        key: z.string(),
        label: z.string(),
        airtableColumn: z.string().optional(),
        valueType: z.string().default("yes_no_unknown"),
        stepNumber: z.number().optional(),
        questionKey: z.string().optional(),
        sortOrder: z.number().optional(),
      }),
    },
    updateModelFieldDef: {
      method: "PUT" as const,
      path: "/api/admin/model-field-defs/:id",
      input: z.object({
        label: z.string().optional(),
        airtableColumn: z.string().nullable().optional(),
        valueType: z.string().optional(),
        stepNumber: z.number().nullable().optional(),
        questionKey: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
      }),
    },
    deleteModelFieldDef: {
      method: "DELETE" as const,
      path: "/api/admin/model-field-defs/:id",
    },
    // Scoring Rules
    getScoringRules: {
      method: "GET" as const,
      path: "/api/admin/scoring-rules",
    },
    createScoringRule: {
      method: "POST" as const,
      path: "/api/admin/scoring-rules",
      input: z.object({
        fieldDefId: z.number(),
        modelValue: z.string(),
        schoolAnswerKey: z.string(),
        schoolAnswerValue: z.string(),
        matchType: z.enum(["equals", "contains", "not_contains", "numeric_budget_exceeded"]).optional(),
        impact: z.enum(["hard_blocker", "watchout", "none"]),
        watchoutMessage: z.string().nullable().optional(),
      }),
    },
    updateScoringRule: {
      method: "PUT" as const,
      path: "/api/admin/scoring-rules/:id",
      input: z.object({
        modelValue: z.string().optional(),
        schoolAnswerKey: z.string().optional(),
        schoolAnswerValue: z.string().optional(),
        matchType: z.enum(["equals", "contains", "not_contains", "numeric_budget_exceeded"]).optional(),
        impact: z.enum(["hard_blocker", "watchout", "none"]).optional(),
        watchoutMessage: z.string().nullable().optional(),
      }),
    },
    deleteScoringRule: {
      method: "DELETE" as const,
      path: "/api/admin/scoring-rules/:id",
    },
    generateWatchoutMessage: {
      method: "POST" as const,
      path: "/api/admin/scoring-rules/generate-watchout",
      input: z.object({
        fieldDefId: z.number(),
        modelValue: z.string(),
        schoolAnswerKey: z.string(),
        schoolAnswerValue: z.string(),
        impact: z.enum(["hard_blocker", "watchout"]),
      }),
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    // Scoring Config
    getScoringConfig: {
      method: "GET" as const,
      path: "/api/admin/scoring-config",
    },
    updateScoringConfig: {
      method: "POST" as const,
      path: "/api/admin/scoring-config",
      input: z.object({
        key: z.string(),
        value: z.number(),
        label: z.string(),
      }),
    },
  },
  // Taxonomy (public, for workflow UI)
  taxonomy: {
    getItems: {
      method: "GET" as const,
      path: "/api/taxonomy/:stepNumber",
    },
    getItem: {
      method: "GET" as const,
      path: "/api/taxonomy/item/:id",
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type StepChatResponse = z.infer<typeof stepChatResponseSchema>;
export type ModelResponse = z.infer<typeof api.models.list.responses[200]>[number];
