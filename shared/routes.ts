import { z } from 'zod';
import { models, schoolContexts, recommendations, comparisonSelections, advisorConfig } from './schema';

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

export const chatAdvisorResponseSchema = z.object({
  assistant_message: z.string(),
  context_patch: z.object({
    vision: z.string().optional(),
    desiredOutcomes: z.array(z.string()).optional(),
    gradeBands: z.array(z.string()).optional(),
    keyPractices: z.array(z.string()).optional(),
    implementationSupportsNeeded: z.array(z.string()).optional(),
    constraints: z.array(z.string()).optional(),
    notes: z.string().optional(),
  }).optional(),
  next_question: z.string().nullable(),
  should_recommend: z.boolean(),
  should_compare: z.boolean(),
});

export const stepChatResponseSchema = z.object({
  assistant_message: z.string(),
  step_data_patch: z.record(z.any()).optional(),
  is_step_complete: z.boolean(),
});

export const api = {
  sessions: {
    create: {
      method: 'POST' as const,
      path: '/api/sessions',
      input: z.object({ sessionId: z.string() }),
      responses: {
        201: z.object({ id: z.number(), sessionId: z.string() }),
        400: errorSchemas.validation,
      },
    },
    getContext: {
      method: 'GET' as const,
      path: '/api/sessions/:sessionId/context',
      responses: {
        200: z.custom<typeof schoolContexts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    clear: {
      method: 'POST' as const,
      path: '/api/sessions/:sessionId/clear',
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    }
  },
  chat: {
    advisor: {
      method: 'POST' as const,
      path: '/api/chat/advisor',
      input: z.object({
        sessionId: z.string(),
        message: z.string(),
        conversationHistory: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })).optional(),
      }),
      responses: {
        200: chatAdvisorResponseSchema,
        404: errorSchemas.notFound,
        500: errorSchemas.internal,
      },
    },
    stepAdvisor: {
      method: 'POST' as const,
      path: '/api/chat/step-advisor',
      input: z.object({
        sessionId: z.string(),
        stepNumber: z.number(),
        message: z.string(),
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
      method: 'GET' as const,
      path: '/api/models',
      responses: {
        200: z.array(z.custom<typeof models.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/models/:id',
      responses: {
        200: z.custom<typeof models.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    recommend: {
      method: 'POST' as const,
      path: '/api/sessions/:sessionId/recommend',
      responses: {
        200: z.array(z.custom<typeof recommendations.$inferSelect & { model: typeof models.$inferSelect }>()),
        404: errorSchemas.notFound,
      },
    },
  },
  comparison: {
    save: {
      method: 'POST' as const,
      path: '/api/sessions/:sessionId/comparison',
      input: z.object({ modelIds: z.array(z.number()) }),
      responses: {
        200: z.custom<typeof comparisonSelections.$inferSelect>(),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/sessions/:sessionId/comparison',
      responses: {
        200: z.object({
          selection: z.custom<typeof comparisonSelections.$inferSelect>().nullable(),
          models: z.array(z.custom<typeof models.$inferSelect>()),
        }),
      },
    },
  },
  workflow: {
    getProgress: {
      method: 'GET' as const,
      path: '/api/sessions/:sessionId/workflow',
    },
    updateProgress: {
      method: 'POST' as const,
      path: '/api/sessions/:sessionId/workflow',
      input: z.object({
        currentStep: z.number(),
        stepsCompleted: z.array(z.number()),
        stepData: z.record(z.any()),
      }),
    },
    confirmStep: {
      method: 'POST' as const,
      path: '/api/sessions/:sessionId/workflow/confirm-step',
      input: z.object({ stepNumber: z.number() }),
    },
    resetStep: {
      method: 'POST' as const,
      path: '/api/sessions/:sessionId/workflow/reset-step',
      input: z.object({ stepNumber: z.number() }),
    },
    resetAll: {
      method: 'POST' as const,
      path: '/api/sessions/:sessionId/workflow/reset-all',
    },
    getConversation: {
      method: 'GET' as const,
      path: '/api/sessions/:sessionId/workflow/conversation/:stepNumber',
    },
    getDocuments: {
      method: 'GET' as const,
      path: '/api/sessions/:sessionId/workflow/documents/:stepNumber',
    },
  },
  admin: {
    getConfig: {
      method: 'GET' as const,
      path: '/api/admin/config',
      responses: {
        200: z.object({
          systemPrompt: z.string(),
          updatedAt: z.string().nullable(),
        }),
      },
    },
    saveConfig: {
      method: 'POST' as const,
      path: '/api/admin/config',
      input: z.object({ systemPrompt: z.string() }),
      responses: {
        200: z.custom<typeof advisorConfig.$inferSelect>(),
      },
    },
    getStepConfigs: {
      method: 'GET' as const,
      path: '/api/admin/step-configs',
    },
    saveStepConfig: {
      method: 'POST' as const,
      path: '/api/admin/step-configs/:stepNumber',
      input: z.object({ systemPrompt: z.string() }),
    },
    getKnowledgeBase: {
      method: 'GET' as const,
      path: '/api/admin/knowledge-base',
    },
    addKnowledgeBase: {
      method: 'POST' as const,
      path: '/api/admin/knowledge-base',
    },
    deleteKnowledgeBase: {
      method: 'DELETE' as const,
      path: '/api/admin/knowledge-base/:id',
    },
  }
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

export type ChatAdvisorResponse = z.infer<typeof chatAdvisorResponseSchema>;
export type StepChatResponse = z.infer<typeof stepChatResponseSchema>;
export type ModelResponse = z.infer<typeof api.models.list.responses[200]>[number];
