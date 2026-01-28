import { z } from 'zod';
import { models, schoolContexts, recommendations, comparisonSelections } from './schema';

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

// Chat advisor response format
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
      }),
      responses: {
        200: chatAdvisorResponseSchema,
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
export type ModelResponse = z.infer<typeof api.models.list.responses[200]>[number];
