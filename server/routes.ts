import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { z } from "zod";
import multer from "multer";
import * as xlsx from "xlsx";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { storage } from "./storage";
import { openai } from "./openai";
import { toFile } from "openai";
import { getDefaultGlobalPrompt, getDefaultStepPrompts } from "./prompts";
import { generateRecommendations } from "./recommendation-engine";
import { extractFileContent } from "./file-parser";
import { retrieveRelevantChunks, ingestKnowledgeBaseEntry, reindexAllKnowledgeBase } from "./embeddings";
import { seedTaxonomy } from "./seed-taxonomy";
import { api } from "@shared/routes";
import { insertModelSchema, WORKFLOW_STEPS } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage() });

// Auth middleware — returns 401 if the user is not logged in
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

/**
 * Fetches a live web research summary about a model using gpt-4o-search-preview,
 * which performs real web searches rather than relying on training-data recall.
 * Returns cited, up-to-date content about the model's philosophy, implementation,
 * evidence, and cost. Result is cached in stepData so it only runs once per session.
 */
async function fetchModelWebResearch(modelName: string, modelLink?: string | null): Promise<string> {
  try {
    const linkHint = modelLink ? ` Their website is ${modelLink}.` : "";
    const completion = await (openai.chat.completions.create as any)({
      model: "gpt-4o-search-preview",
      web_search_options: {},
      messages: [
        {
          role: "system",
          content: "You are an expert researcher on educational models, school transformation programs, and innovative learning designs. Search the web to find accurate, specific, up-to-date information. Cite sources inline where relevant. Do not fabricate details — if information is unavailable, say so clearly.",
        },
        {
          role: "user",
          content: `Search the web and provide a comprehensive research summary about the educational model or program called "${modelName}".${linkHint}\n\nCover the following:\n1. Core philosophy and what makes this model distinctive\n2. How it works day-to-day in schools (structures, schedules, roles)\n3. Target grade levels and types of schools it serves\n4. Evidence base and documented student outcomes\n5. Implementation requirements (staffing, training, technology, time)\n6. Cost structure and how schools typically access the model\n7. Notable partner schools or real-world examples\n8. Common challenges or critiques\n\nBe specific and factual. Cite web sources inline. Where information is limited or uncertain, say so.`,
        },
      ],
    });
    return completion.choices[0].message.content ?? "";
  } catch (err) {
    console.warn(`[Step 8] Model web research failed for "${modelName}":`, err);
    return "";
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {

  // =========================================================================
  // AUTH
  // =========================================================================

  const authSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
  });

  // Register a new account
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password } = authSchema.parse(req.body);
      const existing = await storage.findUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      const user = await storage.createUserWithPassword(email, password);
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
      res.status(201).json({ id: user.id, email: user.email });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[auth] register error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Sign in to an existing account
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = authSchema.parse(req.body);
      const user = await storage.findUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const valid = await storage.verifyUserPassword(user, password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
      res.json({ id: user.id, email: user.email });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[auth] login error:", err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Get current user
  app.get("/api/auth/me", (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    storage.getUserById(req.session.userId).then((user) => {
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Not authenticated" });
      }
      res.json({ id: user.id, email: user.email });
    }).catch(() => res.status(500).json({ message: "Server error" }));
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  // =========================================================================
  // ADMIN — Model Import & Airtable Sync
  // =========================================================================

  app.post("/api/admin/import-models", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = "Transcend Models";
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        return res.status(400).json({ message: `Sheet "${sheetName}" not found` });
      }

      const data = xlsx.utils.sheet_to_json(worksheet);

      const importedModels = [];
      for (const row of data as any[]) {
        const modelData = {
          name: row["Model Name"],
          grades: row["Grades"],
          description: row["Description"],
          link: row["Model Link"],
          outcomeTypes: row["Outcome Types"],
          keyPractices: row["Key Practices"],
          implementationSupports: row["Implementation Supports"],
          imageUrl: row["Image URL"] || null,
        };

        const validated = insertModelSchema.parse(modelData);
        const saved = await storage.createModel(validated);
        importedModels.push(saved);
      }

      res.json({ message: `Successfully imported ${importedModels.length} models`, count: importedModels.length });
    } catch (err) {
      console.error("Import error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data format in Excel", details: err.errors });
      }
      res.status(500).json({ message: "Internal server error during import" });
    }
  });

  app.post("/api/admin/refresh-from-airtable", async (req, res) => {
    try {
      const { fetchModelsFromAirtable } = await import("./airtable");
      const airtableModels = await fetchModelsFromAirtable();
      const syncedModels = await storage.syncModelsFromAirtable(airtableModels);
      res.json({
        message: `Successfully synced ${syncedModels.length} models from Airtable`,
        count: syncedModels.length,
      });
    } catch (err) {
      console.error("Airtable sync error:", err);
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to sync from Airtable" });
    }
  });

  // =========================================================================
  // SESSIONS
  // =========================================================================

  app.post(api.sessions.create.path, requireAuth, async (req, res) => {
    try {
      const { sessionId, focusArea, name } = api.sessions.create.input.parse(req.body);
      const userId = req.session.userId!;
      let session = await storage.getSession(sessionId);
      if (!session) {
        session = await storage.createSession(sessionId, userId, focusArea, name);
      }
      res.status(201).json(session);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // List all sessions for the authenticated user
  app.get("/api/sessions/user", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { focusArea } = req.query as { focusArea?: string };
      const summaries = await storage.getSessionsByUser(userId, focusArea);
      res.json(summaries);
    } catch (err) {
      console.error("Error listing sessions:", err);
      res.status(500).json({ message: "Failed to list sessions" });
    }
  });

  // Update session name
  app.patch(api.sessions.update.path, requireAuth, async (req, res) => {
    try {
      const { name } = api.sessions.update.input.parse(req.body);
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.userId !== req.session.userId) {
        return res.status(404).json({ message: "Session not found" });
      }
      await storage.updateSessionName(req.params.sessionId, name);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // Delete a session and all its data
  app.delete(api.sessions.delete.path, requireAuth, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId);
      if (!session || session.userId !== req.session.userId) {
        return res.status(404).json({ message: "Session not found" });
      }
      await storage.resetAllWorkflow(session.id);
      const { db } = await import("./db");
      const { sessions, schoolContexts, workflowProgress } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(schoolContexts).where(eq(schoolContexts.sessionId, session.id));
      await db.delete(workflowProgress).where(eq(workflowProgress.sessionId, session.id));
      await db.delete(sessions).where(eq(sessions.sessionId, req.params.sessionId));
      res.json({ ok: true });
    } catch (err) {
      console.error("Error deleting session:", err);
      res.status(500).json({ message: "Failed to delete session" });
    }
  });

  // =========================================================================
  // STEP-BASED CHAT ADVISOR (core product)
  // =========================================================================

  app.post(api.chat.stepAdvisor.path, async (req, res) => {
    try {
      const { sessionId, stepNumber, message, modelId: directModelId } = api.chat.stepAdvisor.input.parse(req.body);
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const progress = await storage.getWorkflowProgress(session.id);
      if (!progress) return res.status(404).json({ message: "Workflow not found" });

      const isGreeting = message === "__greeting__";

      // Step 8 conversations are isolated per-model using a virtual step number
      // (8000 + modelId) so different models never share conversation history.
      const conversationStepNumber = stepNumber === 8 && directModelId
        ? 8000 + directModelId
        : stepNumber;

      if (!isGreeting) {
        await storage.addStepMessage(session.id, conversationStepNumber, "user", message);
      }

      // Build system prompt from global + step config + knowledge base + context
      const globalConfig = await storage.getAdvisorConfig();
      const globalPrompt = globalConfig?.systemPrompt || getDefaultGlobalPrompt();

      const stepConfig = await storage.getStepAdvisorConfig(stepNumber);
      const defaultStepPrompts = getDefaultStepPrompts();
      const stepPrompt = stepConfig?.systemPrompt || defaultStepPrompts[stepNumber] || "";

      // Always inject Craft phase documents (step 0) into every step's context
      const introDocs = await storage.getStepDocuments(session.id, 0);
      let introDocsContext = "";
      if (introDocs.length > 0) {
        introDocsContext = "\n\n=== SCHOOL DESIGN DOCUMENTS (uploaded at intake — Craft phase) ===\n" +
          introDocs.map((d) => `--- ${d.fileName} ---\n${d.fileContent}`).join("\n\n");
      }

      const stepDocs = await storage.getStepDocuments(session.id, stepNumber);
      let uploadedDocsContext = "";
      if (stepDocs.length > 0) {
        uploadedDocsContext = "\n\n=== USER-UPLOADED DOCUMENTS FOR THIS STEP ===\n" +
          stepDocs.map((d) => `--- ${d.fileName} ---\n${d.fileContent}`).join("\n\n");
      }

      // KB retrieval strategy:
      // - Step 2: Include ALL KB chunks (full CCL Design Kit needed for gap analysis,
      //   total is only ~9k tokens so no reason to filter)
      // - Other steps: Use RAG-based retrieval to pull only relevant chunks
      let knowledgeBaseContext = "";
      if (stepNumber === 2) {
        // Full KB inclusion for Step 2 — gap analysis requires the complete framework
        const allKbChunks = await storage.getKbChunks(stepNumber);
        if (allKbChunks.length > 0) {
          knowledgeBaseContext = "\n\n=== CCL DESIGN KIT REFERENCE (full framework) ===\n" +
            allKbChunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
        } else {
          // Fallback if not indexed yet
          const kbEntries = await storage.getKnowledgeBase(stepNumber);
          if (kbEntries.length > 0) {
            knowledgeBaseContext = "\n\n=== KNOWLEDGE BASE FOR THIS STEP ===\n" +
              kbEntries.map((e) => `--- ${e.title} ---\n${e.content}`).join("\n\n");
          }
        }
      } else {
        // RAG retrieval for other steps
        const searchQuery = isGreeting
          ? `Step ${stepNumber}: ${WORKFLOW_STEPS.find((s) => s.number === stepNumber)?.label || ""}`
          : message;
        const relevantChunks = await retrieveRelevantChunks(searchQuery, stepNumber, 12);
        if (relevantChunks.length > 0) {
          knowledgeBaseContext = "\n\n=== KNOWLEDGE BASE (most relevant sections) ===\n" +
            relevantChunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
        } else {
          const kbEntries = await storage.getKnowledgeBase(stepNumber);
          if (kbEntries.length > 0) {
            knowledgeBaseContext = "\n\n=== KNOWLEDGE BASE FOR THIS STEP ===\n" +
              kbEntries.map((e) => `--- ${e.title} ---\n${e.content}`).join("\n\n");
          }
        }
      }

      const allStepData = progress.stepData as Record<string, any>;
      let priorStepsContext = "";
      for (let i = 1; i < stepNumber; i++) {
        const sd = allStepData[String(i)];
        if (sd) {
          const stepDef = WORKFLOW_STEPS.find((s) => s.number === i);
          priorStepsContext += `\n--- Step ${i}: ${stepDef?.label || ""} ---\n${typeof sd === "string" ? sd : JSON.stringify(sd, null, 2)}`;
        }
      }

      const currentStepData = allStepData[String(stepNumber)];
      let currentStepContext = "";
      if (currentStepData) {
        currentStepContext = `\n\n=== CURRENT STEP DATA (captured so far) ===\n${typeof currentStepData === "string" ? currentStepData : JSON.stringify(currentStepData, null, 2)}`;
      }

      // Inject taxonomy items for any step that has them
      let taxonomyContext = "";
      const allTaxonomyItems = await storage.getTaxonomyItems(stepNumber);
      if (allTaxonomyItems.length > 0) {
        taxonomyContext = "\n\n=== CANONICAL TAXONOMY ITEMS ===\n";

        if (stepNumber === 2) {
          // Step 2: grouped outcomes + flat LEAPs (existing format)
          const outcomes = allTaxonomyItems.filter((t) => t.category === "outcome");
          const leaps = allTaxonomyItems.filter((t) => t.category === "leap");
          if (outcomes.length > 0) {
            const groups: Record<string, typeof outcomes> = {};
            for (const o of outcomes) {
              const g = o.group || "other";
              if (!groups[g]) groups[g] = [];
              groups[g].push(o);
            }
            const groupLabels: Record<string, string> = {
              academic_career: "Academic & Career Knowledge & Skills",
              cross_cutting: "Cross-Cutting (Life & Learning) Competencies",
              wellbeing: "Well-being",
              wayfinding: "Wayfinding",
            };
            taxonomyContext += "\n--- OUTCOMES ---\n";
            for (const [groupKey, items] of Object.entries(groups)) {
              taxonomyContext += `\n[${groupLabels[groupKey] || groupKey}]\n` +
                items.map((o) => `  ID: ${o.id} | Name: ${o.name}${o.description ? ` | ${o.description}` : ""}`).join("\n") + "\n";
            }
          }
          if (leaps.length > 0) {
            taxonomyContext += "\n--- LEAPs ---\n" +
              leaps.map((l) => `ID: ${l.id} | Name: ${l.name}${l.description ? ` | ${l.description}` : ""}`).join("\n");
          }
          taxonomyContext += "\n\nIMPORTANT: Only suggest items from this list. Use the exact IDs in your suggested_outcomes and suggested_leaps arrays.";
        } else {
          // Other steps: hierarchical tree by category
          const categories = [...new Set(allTaxonomyItems.map((t) => t.category))];
          for (const cat of categories) {
            const items = allTaxonomyItems.filter((t) => t.category === cat);
            const roots = items.filter((t) => !t.parentId);
            const childrenOf = (pid: number) => items.filter((t) => t.parentId === pid);
            const hasHierarchy = roots.some((r) => childrenOf(r.id).length > 0);

            taxonomyContext += `\n--- ${cat.toUpperCase()}S ---\n`;
            if (hasHierarchy) {
              taxonomyContext += "(Hierarchical: Level 1 = headers (NOT selectable), Level 2 & 3 = selectable items)\n";
              for (const l1 of roots) {
                taxonomyContext += `\n[${l1.name}]${l1.description ? ` — ${l1.description}` : ""}\n`;
                for (const l2 of childrenOf(l1.id)) {
                  taxonomyContext += `  ID: ${l2.id} | Name: ${l2.name}${l2.description ? ` | ${l2.description}` : ""}\n`;
                  for (const l3 of childrenOf(l2.id)) {
                    taxonomyContext += `    ID: ${l3.id} | Name: ${l3.name}${l3.description ? ` | ${l3.description}` : ""}\n`;
                  }
                }
              }
            } else {
              for (const t of items) {
                taxonomyContext += `  ID: ${t.id} | Name: ${t.name}${t.description ? ` | ${t.description}` : ""}\n`;
              }
            }
          }
          taxonomyContext += "\nIMPORTANT: Only suggest selectable items (Level 2 and Level 3) from this list. Use the exact IDs in your suggested_taxonomy_ids array. Do NOT suggest Level 1 header IDs.";
        }
      }

      // Step 8: inject the selected model's full profile + dynamic attributes + live web research
      let selectedModelContext = "";
      if (stepNumber === 8) {
        const selectedModelId = directModelId ?? (allStepData["8"] as any)?.selectedModelId;
        if (selectedModelId) {
          const selectedModel = await storage.getModel(Number(selectedModelId));
          if (selectedModel) {
            // Base model profile from Airtable
            selectedModelContext = `\n\n=== MODEL BEING EXPLORED ===\nName: ${selectedModel.name}\nGrade Bands: ${selectedModel.grades}\nDescription: ${selectedModel.description}\nKey Practices: ${selectedModel.keyPractices}\nOutcome Types: ${selectedModel.outcomeTypes}\nImplementation Supports: ${selectedModel.implementationSupports}${selectedModel.link ? `\nWebsite: ${selectedModel.link}` : ""}`;

            // Append admin-configured dynamic attributes if present
            const attrs = selectedModel.attributes as Record<string, string> | null;
            if (attrs && Object.keys(attrs).length > 0) {
              selectedModelContext += `\n\nAdditional Model Details:\n` +
                Object.entries(attrs).map(([k, v]) => `- ${k}: ${v}`).join("\n");
            }

            // Fetch or retrieve cached web research — keyed per model ID to prevent bleed-over.
            // For greetings: fire in background so the response is instant.
            // For subsequent messages: use cache or fetch synchronously.
            const step8Data = (allStepData["8"] as Record<string, any>) ?? {};
            const webContentKey = `webContent_${selectedModel.id}`;
            let modelWebContent: string = step8Data[webContentKey] ?? "";

            if (!modelWebContent && isGreeting) {
              // Fire-and-forget: don't block the greeting on web research
              fetchModelWebResearch(selectedModel.name, selectedModel.link)
                .then(async (content) => {
                  if (!content) return;
                  try {
                    const freshProgress = await storage.getWorkflowProgress(session.id);
                    if (!freshProgress) return;
                    const updatedStepData = { ...(freshProgress.stepData as Record<string, any>) };
                    const freshStep8 = (updatedStepData["8"] as Record<string, any>) ?? {};
                    if (!freshStep8[webContentKey]) {
                      updatedStepData["8"] = { ...freshStep8, [webContentKey]: content };
                      await storage.updateWorkflowProgress(session.id, freshProgress.currentStep, freshProgress.stepsCompleted as number[], updatedStepData);
                    }
                  } catch (e) {
                    console.warn("[Step 8] Background web research cache save failed:", e);
                  }
                })
                .catch(err => console.warn("[Step 8] Background web research failed:", err));
              // Don't include web content in the greeting context — it isn't ready yet
              modelWebContent = "";
            } else if (!modelWebContent) {
              // Subsequent messages: fetch synchronously so the AI has full context
              modelWebContent = await fetchModelWebResearch(selectedModel.name, selectedModel.link);
              if (modelWebContent) {
                const updatedStepData = { ...(progress.stepData as Record<string, any>) };
                updatedStepData["8"] = { ...step8Data, [webContentKey]: modelWebContent };
                await storage.updateWorkflowProgress(
                  session.id,
                  progress.currentStep,
                  progress.stepsCompleted as number[],
                  updatedStepData,
                );
              }
            }

            if (modelWebContent) {
              selectedModelContext += `\n\n=== MODEL RESEARCH SUMMARY ===\n${modelWebContent}`;
            } else if (!isGreeting) {
              selectedModelContext += `\n\n=== MODEL RESEARCH SUMMARY ===\nResearch summary unavailable. Draw on your training knowledge about this model and direct the user to the model's website for additional information${selectedModel.link ? ` at ${selectedModel.link}` : ""}.`;
            }
          }
        }
      }

      let modelsContext = "";
      if (stepNumber === 7) {
        const allModels = await storage.getAllModels();
        if (allModels.length > 0) {
          modelsContext = "\n\n=== AVAILABLE CCL MODELS ===\n" +
            allModels.map((m) =>
              `- ${m.name} (Grades: ${m.grades}): ${m.description}\n  Outcomes: ${m.outcomeTypes}\n  Practices: ${m.keyPractices}\n  Supports: ${m.implementationSupports}\n  Link: ${m.link}`,
            ).join("\n\n");
        }
      }

      let taxonomyResponseNote = "";
      if (stepNumber === 2) {
        taxonomyResponseNote = `\n- "suggested_outcomes": array of taxonomy item IDs (numbers) matching user input for outcomes. Only include when you have NEW suggestions. Omit if no new suggestions.
- "suggested_leaps": array of taxonomy item IDs (numbers) matching user input for LEAPs. Only include when you have NEW suggestions. Omit if no new suggestions.`;
      } else if (allTaxonomyItems.length > 0) {
        taxonomyResponseNote = `\n- "suggested_taxonomy_ids": array of taxonomy item IDs (numbers) matching user input. Only include when you have NEW suggestions. Omit if no new suggestions.`;
      }

      const responseStyle = stepNumber === 8
        ? `Use markdown formatting — headers and bullets for structured answers, prose for nuanced analysis. Match response depth to the question: brief for factual lookups, thorough for fit/implementation analysis. No preambles. No restating the question. Be direct.`
        : `Keep responses SHORT and focused. Use bullet points, not paragraphs. Structure with markdown headers (## Header) when giving multi-part responses. Avoid lengthy explanations, preambles, or repeating information the user already provided. Be direct and conversational. Only elaborate when the user asks for more detail.`;

      const systemPrompt = `${globalPrompt}

=== CURRENT STEP INSTRUCTIONS ===
${stepPrompt}
${knowledgeBaseContext}
${introDocsContext}
${uploadedDocsContext}
${taxonomyContext}
${priorStepsContext ? `\n=== PRIOR STEPS SUMMARY ===\n${priorStepsContext}` : ""}
${currentStepContext}
${selectedModelContext}
${modelsContext}

=== RESPONSE STYLE ===
${responseStyle}

=== RESPONSE FORMAT ===
You MUST respond in valid JSON format ONLY. Do not include any text outside the JSON object.
The JSON object must have these exact keys:
- "assistant_message": string with your CONCISE response to the user (use markdown formatting, keep it brief)
- "step_data_patch": object containing structured data extracted from this conversation. You MUST use the EXACT keys specified in the "STEP DATA PATCH" section of the Current Step Instructions above. Emit ALL keys you have data for on EVERY response — do not wait until the step is complete. Even partial data should be patched immediately so the UI fields populate in real time. Set to null ONLY if no new data was extracted from the user's message.
- "is_step_complete": boolean, set to true ONLY when you have gathered all required inputs for this step AND the user has confirmed the summary${taxonomyResponseNote}`;

      // Build message history
      const conversationHistory = await storage.getStepConversations(session.id, conversationStepNumber);
      const aiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];

      const recentHistory = conversationHistory.slice(-30);
      for (const msg of recentHistory) {
        aiMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
      }

      if (isGreeting) {
        const stepDef = WORKFLOW_STEPS.find((s) => s.number === stepNumber);
        if (stepNumber === 8) {
          aiMessages.push({
            role: "user",
            content: `I've selected this model to explore. Give me a brief, friendly intro — 1-2 sentences max — then ask what I'd like to know. Do not surface information, analysis, or alignment points unprompted. Keep it very short.`,
          });
        } else {
          aiMessages.push({
            role: "user",
            content: `I'm starting Step ${stepNumber}: ${stepDef?.label || ""}. Briefly introduce this step and list the specific inputs you need from me. Keep it short — just a quick intro and a bullet list of what you're looking for.`,
          });
        }
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: stepNumber === 8 ? 0.5 : 0.2,
        messages: aiMessages,
        response_format: { type: "json_object" },
      });

      const responseContent = completion.choices[0].message.content;
      if (!responseContent) throw new Error("No response from AI");

      const parsedResponse = JSON.parse(responseContent);

      // Persist assistant message
      await storage.addStepMessage(session.id, conversationStepNumber, "assistant", parsedResponse.assistant_message);

      // Merge any extracted step data
      if (parsedResponse.step_data_patch && Object.keys(parsedResponse.step_data_patch).length > 0) {
        const currentData = { ...(progress.stepData as Record<string, any>) };
        const existingStepData = currentData[String(stepNumber)] || {};
        currentData[String(stepNumber)] = { ...existingStepData, ...parsedResponse.step_data_patch };
        await storage.updateWorkflowProgress(session.id, progress.currentStep, progress.stepsCompleted as number[], currentData);
      }

      res.json(parsedResponse);
    } catch (err) {
      console.error("Step chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =========================================================================
  // STEP 8 — STREAMING CHAT (SSE)
  // Tokens stream to the client immediately; step_data_patch is extracted
  // in the background by a cheap gpt-4o-mini call after the stream ends.
  // =========================================================================

  app.post("/api/chat/step8/stream", async (req, res) => {
    const { sessionId, message, modelId: directModelId } = req.body as {
      sessionId: string;
      message: string;
      modelId?: number;
    };

    if (!sessionId || !message || !directModelId) {
      return res.status(400).json({ message: "sessionId, message, and modelId are required" });
    }

    try {
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const progress = await storage.getWorkflowProgress(session.id);
      if (!progress) return res.status(404).json({ message: "Workflow not found" });

      const stepNumber = 8;
      const isGreeting = message === "__greeting__";
      const conversationStepNumber = 8000 + directModelId;

      if (!isGreeting) {
        await storage.addStepMessage(session.id, conversationStepNumber, "user", message);
      }

      // --- Build system prompt (identical logic to step-advisor) ---
      const globalConfig = await storage.getAdvisorConfig();
      const globalPrompt = globalConfig?.systemPrompt || getDefaultGlobalPrompt();
      const stepConfig = await storage.getStepAdvisorConfig(stepNumber);
      const defaultStepPrompts = getDefaultStepPrompts();
      const stepPrompt = stepConfig?.systemPrompt || defaultStepPrompts[stepNumber] || "";

      const introDocs = await storage.getStepDocuments(session.id, 0);
      const introDocsContext = introDocs.length > 0
        ? "\n\n=== SCHOOL DESIGN DOCUMENTS (uploaded at intake — Craft phase) ===\n" +
          introDocs.map((d) => `--- ${d.fileName} ---\n${d.fileContent}`).join("\n\n")
        : "";

      const stepDocs = await storage.getStepDocuments(session.id, stepNumber);
      const uploadedDocsContext = stepDocs.length > 0
        ? "\n\n=== USER-UPLOADED DOCUMENTS FOR THIS STEP ===\n" +
          stepDocs.map((d) => `--- ${d.fileName} ---\n${d.fileContent}`).join("\n\n")
        : "";

      const searchQuery = isGreeting ? `Step 8: Explore a Specific Model` : message;
      const relevantChunks = await retrieveRelevantChunks(searchQuery, stepNumber, 12);
      const kbEntries = relevantChunks.length === 0 ? await storage.getKnowledgeBase(stepNumber) : [];
      const knowledgeBaseContext = relevantChunks.length > 0
        ? "\n\n=== KNOWLEDGE BASE (most relevant sections) ===\n" +
          relevantChunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n")
        : kbEntries.length > 0
          ? "\n\n=== KNOWLEDGE BASE FOR THIS STEP ===\n" +
            kbEntries.map((e) => `--- ${e.title} ---\n${e.content}`).join("\n\n")
          : "";

      const allStepData = progress.stepData as Record<string, any>;
      let priorStepsContext = "";
      for (let i = 1; i < stepNumber; i++) {
        const sd = allStepData[String(i)];
        if (sd) {
          const stepDef = WORKFLOW_STEPS.find((s) => s.number === i);
          priorStepsContext += `\n--- Step ${i}: ${stepDef?.label || ""} ---\n${typeof sd === "string" ? sd : JSON.stringify(sd, null, 2)}`;
        }
      }

      const currentStepData = allStepData[String(stepNumber)];
      const currentStepContext = currentStepData
        ? `\n\n=== CURRENT STEP DATA (captured so far) ===\n${typeof currentStepData === "string" ? currentStepData : JSON.stringify(currentStepData, null, 2)}`
        : "";

      // Model profile + web research
      const selectedModel = await storage.getModel(Number(directModelId));
      let selectedModelContext = "";
      if (selectedModel) {
        selectedModelContext = `\n\n=== MODEL BEING EXPLORED ===\nName: ${selectedModel.name}\nGrade Bands: ${selectedModel.grades}\nDescription: ${selectedModel.description}\nKey Practices: ${selectedModel.keyPractices}\nOutcome Types: ${selectedModel.outcomeTypes}\nImplementation Supports: ${selectedModel.implementationSupports}${selectedModel.link ? `\nWebsite: ${selectedModel.link}` : ""}`;

        const attrs = selectedModel.attributes as Record<string, string> | null;
        if (attrs && Object.keys(attrs).length > 0) {
          selectedModelContext += `\n\nAdditional Model Details:\n` +
            Object.entries(attrs).map(([k, v]) => `- ${k}: ${v}`).join("\n");
        }

        const step8Data = (allStepData["8"] as Record<string, any>) ?? {};
        const webContentKey = `webContent_${selectedModel.id}`;
        let modelWebContent: string = step8Data[webContentKey] ?? "";

        if (!modelWebContent && isGreeting) {
          // Fire-and-forget for greetings
          fetchModelWebResearch(selectedModel.name, selectedModel.link)
            .then(async (content) => {
              if (!content) return;
              const fp = await storage.getWorkflowProgress(session.id);
              if (!fp) return;
              const us = { ...(fp.stepData as Record<string, any>) };
              const fs8 = (us["8"] as Record<string, any>) ?? {};
              if (!fs8[webContentKey]) {
                us["8"] = { ...fs8, [webContentKey]: content };
                await storage.updateWorkflowProgress(session.id, fp.currentStep, fp.stepsCompleted as number[], us);
              }
            })
            .catch(err => console.warn("[Step 8 stream] Background web research failed:", err));
        } else if (!modelWebContent) {
          modelWebContent = await fetchModelWebResearch(selectedModel.name, selectedModel.link);
          if (modelWebContent) {
            const us = { ...(progress.stepData as Record<string, any>) };
            us["8"] = { ...step8Data, [webContentKey]: modelWebContent };
            await storage.updateWorkflowProgress(session.id, progress.currentStep, progress.stepsCompleted as number[], us);
          }
        }

        if (modelWebContent) {
          selectedModelContext += `\n\n=== MODEL RESEARCH SUMMARY ===\n${modelWebContent}`;
        } else if (!isGreeting) {
          selectedModelContext += `\n\n=== MODEL RESEARCH SUMMARY ===\nResearch summary unavailable. Draw on your training knowledge about this model${selectedModel.link ? ` and direct the user to ${selectedModel.link}` : ""}.`;
        }
      }

      const systemPrompt = `${globalPrompt}

=== CURRENT STEP INSTRUCTIONS ===
${stepPrompt}
${knowledgeBaseContext}
${introDocsContext}
${uploadedDocsContext}
${priorStepsContext ? `\n=== PRIOR STEPS SUMMARY ===\n${priorStepsContext}` : ""}
${currentStepContext}
${selectedModelContext}

=== RESPONSE STYLE ===
Use markdown formatting — headers and bullets for structured answers, prose for nuanced analysis. Match response depth to the question: brief for factual lookups, thorough for fit/implementation analysis. No preambles. No restating the question. Be direct.`;

      const conversationHistory = await storage.getStepConversations(session.id, conversationStepNumber);
      const aiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];
      for (const msg of conversationHistory.slice(-30)) {
        aiMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
      }
      if (isGreeting) {
        aiMessages.push({
          role: "user",
          content: `I've selected this model to explore. Give me a brief, friendly intro — 1-2 sentences max — then ask what I'd like to know. Do not surface information, analysis, or alignment points unprompted. Keep it very short.`,
        });
      }

      // --- SSE headers ---
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      // --- Stream the response ---
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.5,
        messages: aiMessages,
        stream: true,
      });

      let fullMessage = "";
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content ?? "";
        if (token) {
          fullMessage += token;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();

      // --- Background: persist assistant message + extract step_data_patch ---
      (async () => {
        try {
          await storage.addStepMessage(session.id, conversationStepNumber, "assistant", fullMessage);

          // Extract conversation_summary and interest_level with a cheap mini call
          const patchCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0,
            messages: [
              {
                role: "system",
                content: `You extract structured data from a model exploration conversation. Respond with a JSON object containing:
- "conversation_summary": string (2-4 sentences summarising key topics and questions explored so far)
- "interest_level": "high" | "medium" | "low" | null (only if the user explicitly expressed their interest level; otherwise null)`,
              },
              {
                role: "user",
                content: `Here is the latest assistant message:\n\n${fullMessage}\n\nAnd the user message that prompted it:\n\n${isGreeting ? "(greeting)" : message}`,
              },
            ],
            response_format: { type: "json_object" },
          });

          const raw = patchCompletion.choices[0].message.content;
          if (raw) {
            const patch = JSON.parse(raw);
            if (patch && Object.keys(patch).length > 0) {
              const fp = await storage.getWorkflowProgress(session.id);
              if (fp) {
                const stepData = { ...(fp.stepData as Record<string, any>) };
                stepData["8"] = { ...(stepData["8"] || {}), ...patch };
                await storage.updateWorkflowProgress(session.id, fp.currentStep, fp.stepsCompleted as number[], stepData);
              }
            }
          }
        } catch (e) {
          console.warn("[Step 8 stream] Background patch extraction failed:", e);
        }
      })();
    } catch (err) {
      console.error("[Step 8 stream] Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      } else {
        res.write(`data: ${JSON.stringify({ error: "Internal server error" })}\n\n`);
        res.end();
      }
    }
  });

  // =========================================================================
  // WORKFLOW PROGRESS
  // =========================================================================

  app.get(api.workflow.getProgress.path, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });

      let progress = await storage.getWorkflowProgress(session.id);
      if (!progress) {
        progress = await storage.createWorkflowProgress(session.id);
      }
      res.json(progress);
    } catch (err) {
      res.status(500).json({ message: "Failed to get workflow progress" });
    }
  });

  app.post(api.workflow.updateProgress.path, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const { currentStep, stepsCompleted, stepData } = api.workflow.updateProgress.input.parse(req.body);
      const progress = await storage.updateWorkflowProgress(session.id, currentStep, stepsCompleted, stepData);
      res.json(progress);
    } catch (err) {
      res.status(500).json({ message: "Failed to update workflow progress" });
    }
  });

  app.post(api.workflow.confirmStep.path, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const { stepNumber } = api.workflow.confirmStep.input.parse(req.body);
      const progress = await storage.getWorkflowProgress(session.id);
      if (!progress) return res.status(404).json({ message: "Workflow not found" });

      const completed = Array.from(new Set([...(progress.stepsCompleted as number[]), stepNumber]));
      const nextStep = Math.min(stepNumber + 1, 8);
      await storage.updateWorkflowProgress(session.id, nextStep, completed, progress.stepData as Record<string, any>);
      res.json({ message: "Step confirmed", nextStep });
    } catch (err) {
      res.status(500).json({ message: "Failed to confirm step" });
    }
  });

  app.post(api.workflow.resetStep.path, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const { stepNumber } = api.workflow.resetStep.input.parse(req.body);
      await storage.resetWorkflowStep(session.id, stepNumber);
      res.json({ message: "Step reset" });
    } catch (err) {
      res.status(500).json({ message: "Failed to reset step" });
    }
  });

  app.post(api.workflow.resetAll.path, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });

      await storage.resetAllWorkflow(session.id);
      res.json({ message: "All steps reset" });
    } catch (err) {
      res.status(500).json({ message: "Failed to reset workflow" });
    }
  });

  // =========================================================================
  // STEP CONVERSATIONS
  // =========================================================================

  app.get(api.workflow.getConversation.path, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const stepNumber = Number(req.params.stepNumber);
      const messages = await storage.getStepConversations(session.id, stepNumber);
      res.json(messages);
    } catch (err) {
      res.status(500).json({ message: "Failed to get conversation" });
    }
  });

  // Pre-warm the research cache for a model so it's ready before the user's first question.
  // Called fire-and-forget from the client when a model tab is first opened.
  app.post("/api/sessions/:sessionId/models/:modelId/prefetch-research", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const modelId = Number(req.params.modelId);
      const model = await storage.getModel(modelId);
      if (!model) return res.status(404).json({ message: "Model not found" });

      const progress = await storage.getWorkflowProgress(session.id);
      if (!progress) return res.status(404).json({ message: "Workflow not found" });

      const allStepData = progress.stepData as Record<string, any>;
      const step8Data = (allStepData["8"] as Record<string, any>) ?? {};
      const webContentKey = `webContent_${modelId}`;

      // Already cached — nothing to do
      if (step8Data[webContentKey]) {
        return res.json({ ok: true, cached: true });
      }

      // Respond immediately so the client doesn't block, then fetch in background
      res.json({ ok: true, cached: false });

      fetchModelWebResearch(model.name, model.link)
        .then(async (content) => {
          if (!content) return;
          const freshProgress = await storage.getWorkflowProgress(session.id);
          if (!freshProgress) return;
          const updatedStepData = { ...(freshProgress.stepData as Record<string, any>) };
          const freshStep8 = (updatedStepData["8"] as Record<string, any>) ?? {};
          if (!freshStep8[webContentKey]) {
            updatedStepData["8"] = { ...freshStep8, [webContentKey]: content };
            await storage.updateWorkflowProgress(session.id, freshProgress.currentStep, freshProgress.stepsCompleted as number[], updatedStepData);
          }
        })
        .catch(err => console.warn(`[Step 8] Prefetch research failed for model ${modelId}:`, err));
    } catch (err) {
      res.status(500).json({ message: "Failed to prefetch research" });
    }
  });

  // Clear conversation history for a specific model in step 8 (uses virtual step number)
  app.delete("/api/sessions/:sessionId/chat/model-conversation/:modelId", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });
      const modelId = Number(req.params.modelId);
      await storage.clearStepConversation(session.id, 8000 + modelId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to clear conversation" });
    }
  });

  // =========================================================================
  // STEP DOCUMENTS
  // =========================================================================

  app.get(api.workflow.getDocuments.path, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const stepNumber = Number(req.params.stepNumber);
      const docs = await storage.getStepDocuments(session.id, stepNumber);
      res.json(docs);
    } catch (err) {
      res.status(500).json({ message: "Failed to get documents" });
    }
  });

  app.post("/api/sessions/:sessionId/workflow/documents/:stepNumber/upload", upload.single("file"), async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const stepNumber = Number(req.params.stepNumber);
      const fileName = req.file.originalname;
      const fileType = req.file.mimetype;

      const fileContent = await extractFileContent(req.file.buffer, fileName, fileType);

      const doc = await storage.addStepDocument(session.id, stepNumber, fileName, fileContent, fileType);
      res.json(doc);
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // -------------------------------------------------------------------------
  // BLOB UPLOAD — handles large files that exceed Vercel's 4.5MB function limit.
  // The browser uploads directly to Vercel Blob storage; this endpoint provides
  // the upload token and processes the file once it lands in blob storage.
  // -------------------------------------------------------------------------
  app.post("/api/blob/upload", async (req, res) => {
    try {
      const body = req.body as HandleUploadBody;
      const jsonResponse = await handleUpload({
        body,
        request: req as any,
        onBeforeGenerateToken: async (_pathname, _clientPayload) => {
          return {
            allowedContentTypes: [
              "application/pdf",
              "application/msword",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "application/vnd.ms-powerpoint",
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              "text/plain",
              "text/markdown",
            ],
            maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB
          };
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          try {
            const { sessionId, stepNumber } = JSON.parse(tokenPayload || "{}");
            if (!sessionId || stepNumber === undefined) return;

            const fileRes = await fetch(blob.url);
            const arrayBuffer = await fileRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = blob.contentType || "application/octet-stream";
            const fileName = blob.pathname.split("/").pop() || blob.pathname;

            const text = await extractFileContent(buffer, fileName, contentType);
            await storage.addStepDocument(Number(sessionId), Number(stepNumber), fileName, text, contentType);
          } catch (err) {
            console.error("[blob] onUploadCompleted error:", err);
          }
        },
      });
      res.json(jsonResponse);
    } catch (err) {
      console.error("[blob] upload error:", err);
      res.status(400).json({ error: String(err) });
    }
  });

  app.delete("/api/sessions/:sessionId/workflow/documents/:docId", async (req, res) => {
    try {
      await storage.deleteStepDocument(Number(req.params.docId));
      res.json({ message: "Document deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // =========================================================================
  // VOICE TO TEXT (Whisper transcription for Step 1 context)
  // =========================================================================

  app.post(api.workflow.voiceToText.path, upload.single("audio"), async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });
      if (!req.file) return res.status(400).json({ message: "No audio file provided" });

      const mimeType = req.file.mimetype || "audio/webm";
      const ext = mimeType.includes("mp4") ? "mp4"
        : mimeType.includes("mpeg") ? "mp3"
        : mimeType.includes("ogg") ? "ogg"
        : "webm";

      console.log(`[voice-to-text] size=${req.file.size}B mime=${mimeType} ext=${ext}`);

      if (req.file.size < 100) {
        return res.status(400).json({ message: "Audio file too small — nothing was recorded." });
      }

      // Use OpenAI's toFile helper — the most reliable way to pass buffers to Whisper
      const audioFile = await toFile(req.file.buffer, `recording.${ext}`, { type: mimeType });
      const transcription = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: audioFile,
      });

      console.log(`[voice-to-text] transcript="${transcription.text.slice(0, 80)}"`);
      res.json({ transcript: transcription.text });
    } catch (err) {
      console.error("Voice-to-text error:", err);
      res.status(500).json({ message: "Failed to transcribe audio" });
    }
  });

  // =========================================================================
  // PRE-FILL FROM DOCUMENTS (Step 0 intake analysis)
  // =========================================================================

  app.post(api.workflow.prefillFromDocuments.path, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const introDocs = await storage.getStepDocuments(session.id, 0);
      if (introDocs.length === 0) {
        return res.json({ prefilled: { step1: {}, step2: { leaps: 0, outcomes: 0 }, step3: { practices: 0 } }, extracted: {} });
      }

      const docContent = introDocs.map((d) => `--- ${d.fileName} ---\n${d.fileContent}`).join("\n\n");

      // Fetch taxonomy items and KB framework reference docs in parallel
      const [step2Taxonomy, step3Taxonomy, outcomesKB, practicesKB, leapsKB] = await Promise.all([
        storage.getTaxonomyItems(2),
        storage.getTaxonomyItems(3),
        storage.getKnowledgeByReferenceType("outcomes"),
        storage.getKnowledgeByReferenceType("practices"),
        storage.getKnowledgeByReferenceType("leaps"),
      ]);

      const leapItems = step2Taxonomy.filter((t) => t.category === "leap");
      const outcomeItems = step2Taxonomy.filter((t) => t.category === "outcome");
      const practiceItems = step3Taxonomy.filter((t) => t.category === "practice" && t.parentId !== null);

      // Build taxonomy lists for semantic matching
      const leapsList = leapItems.map((i) => `- ${i.name}${i.description ? `: ${i.description}` : ""}`).join("\n");
      const outcomesList = outcomeItems.map((i) => `- ${i.name}${i.description ? `: ${i.description}` : ""}`).join("\n");
      const practicesList = practiceItems.map((i) => `- ${i.name}${i.description ? `: ${i.description}` : ""}`).join("\n");

      // Append KB reference content if available
      const leapsKBContent = leapsKB.length > 0 ? `\n\nLEAPs Framework Reference:\n${leapsKB.map((e) => e.content).join("\n\n")}` : "";
      const outcomesKBContent = outcomesKB.length > 0 ? `\n\nLearning Outcomes Framework Reference:\n${outcomesKB.map((e) => e.content).join("\n\n")}` : "";
      const practicesKBContent = practicesKB.length > 0 ? `\n\nPractices & Activities Framework Reference:\n${practicesKB.map((e) => e.content).join("\n\n")}` : "";

      const extractionPrompt = `You are analyzing school design documents to extract structured information for a school model recommendation workflow.

You have access to the official taxonomy lists below. For leaps, outcomes, and practices, return ONLY exact names from those provided lists — do not invent new names. Match semantically: the document may use synonyms or describe something without naming it exactly.

Synonym awareness:
- "Outcomes" may also be called "Grad Aims", "Graduate Profile", "Knowledge, Skills, and Mindsets", or "KSMs"
- "Practices" may also be called "activities", "components", "learning experiences", or "program elements"
- "LEAPs" may also be called "design principles", "learning principles", or "extraordinary learning"

=== AVAILABLE LEAPs ===
${leapsList}${leapsKBContent}

=== AVAILABLE OUTCOMES ===
${outcomesList}${outcomesKBContent}

=== AVAILABLE PRACTICES ===
${practicesList}${practicesKBContent}

Return ONLY this JSON structure (no other text):
{
  "school_name": "string or null",
  "state": "string or null — full US state name, e.g. 'Texas'",
  "grade_band": "K-5" | "6-8" | "9-12" | "K-8" | "K-12" | "6-12" | "PK-5" | "PK-12" | null,
  "community_context": "string or null — synthesized paragraph covering: student demographics and backgrounds, community needs, policy/mandate context, industry/employer partnerships, post-secondary relationships, and any unique context mentioned in the documents",
  "leaps": ["exact names from the AVAILABLE LEAPs list that are explicitly mentioned or clearly described in the documents"],
  "outcomes": ["exact names from the AVAILABLE OUTCOMES list — also check for Grad Aims / KSMs / graduate profile content"],
  "practices": ["exact names from the AVAILABLE PRACTICES list — also check for activities, components, learning experiences"],
  "leaps_context": "string or null — synthesize what the document says specifically about the matched LEAPs/design principles: how they show up, why they matter, what they look like in practice",
  "outcomes_context": "string or null — synthesize what the document says about the matched outcomes: goals, rationale, student populations, how they are developed",
  "practices_context": "string or null — synthesize what the document says about the matched practices/activities/components: how they are implemented, their purpose, any specifics mentioned"
}

Grade band mapping: "Elementary" → "K-5", "Middle School" → "6-8", "High School" → "9-12". Use null if ambiguous.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        messages: [
          { role: "system", content: extractionPrompt },
          { role: "user", content: `Analyze these school design documents:\n\n${docContent}` },
        ],
        response_format: { type: "json_object" },
      });

      const extracted = JSON.parse(completion.choices[0].message.content || "{}");

      // Exact name lookup (case-insensitive) — GPT-4o returns exact taxonomy names
      const exactFind = (name: string, items: typeof step2Taxonomy) => {
        const n = name.toLowerCase().trim();
        return items.find((item) => item.name.toLowerCase() === n);
      };

      type TaxonomySelection = { id: number; name: string; importance: "most_important" | "important" | "nice_to_have" };

      const matchedLeaps: TaxonomySelection[] = [];
      const matchedOutcomes: TaxonomySelection[] = [];
      const matchedPractices: TaxonomySelection[] = [];

      for (const name of (extracted.leaps || []) as string[]) {
        const m = exactFind(name, leapItems);
        if (m && !matchedLeaps.find((x) => x.id === m.id)) {
          matchedLeaps.push({ id: m.id, name: m.name, importance: "important" });
        }
      }
      for (const name of (extracted.outcomes || []) as string[]) {
        const m = exactFind(name, outcomeItems);
        if (m && !matchedOutcomes.find((x) => x.id === m.id)) {
          matchedOutcomes.push({ id: m.id, name: m.name, importance: "important" });
        }
      }
      for (const name of (extracted.practices || []) as string[]) {
        const m = exactFind(name, practiceItems);
        if (m && !matchedPractices.find((x) => x.id === m.id)) {
          matchedPractices.push({ id: m.id, name: m.name, importance: "important" });
        }
      }

      const progress = await storage.getWorkflowProgress(session.id);
      if (!progress) return res.status(404).json({ message: "Workflow not found" });

      const allStepData = { ...(progress.stepData as Record<string, any>) };
      const existingStep1 = allStepData["1"] || {};

      // Step 1 — school context (guard against overwriting values already set at workflow creation)
      const step1Patch: Record<string, any> = {};
      if (extracted.school_name && !(existingStep1.school_name || session.name)) step1Patch.school_name = extracted.school_name;
      if (extracted.state && !existingStep1.state) step1Patch.state = extracted.state;
      if (extracted.grade_band && !existingStep1.grade_band) step1Patch.grade_band = extracted.grade_band;
      if (extracted.community_context && !existingStep1.context) step1Patch.context = extracted.community_context;
      if (Object.keys(step1Patch).length > 0) {
        allStepData["1"] = { ...existingStep1, ...step1Patch };
      }

      // Step 2 — aims for learners
      const step2Patch: Record<string, any> = {};
      if (matchedLeaps.length > 0) {
        step2Patch.selected_leaps = matchedLeaps;
        step2Patch.leaps_summary = extracted.leaps_context || "Pre-filled from uploaded documents. Review and adjust as needed.";
      }
      if (matchedOutcomes.length > 0) {
        step2Patch.selected_outcomes = matchedOutcomes;
        step2Patch.outcomes_summary = extracted.outcomes_context || "Pre-filled from uploaded documents. Review and adjust as needed.";
      }
      if (Object.keys(step2Patch).length > 0) {
        allStepData["2"] = { ...(allStepData["2"] || {}), ...step2Patch };
      }

      // Step 3 — learning experiences & practices
      const step3Patch: Record<string, any> = {};
      if (matchedPractices.length > 0) {
        step3Patch.selected_practices = matchedPractices;
        step3Patch.practices_summary = extracted.practices_context || "Pre-filled from uploaded documents. Review and adjust as needed.";
      }
      if (Object.keys(step3Patch).length > 0) {
        allStepData["3"] = { ...(allStepData["3"] || {}), ...step3Patch };
      }

      await storage.updateWorkflowProgress(
        session.id,
        progress.currentStep,
        progress.stepsCompleted as number[],
        allStepData,
      );

      res.json({
        prefilled: {
          step1: step1Patch,
          step2: { leaps: matchedLeaps.length, outcomes: matchedOutcomes.length },
          step3: { practices: matchedPractices.length },
        },
        extracted,
      });
    } catch (err) {
      console.error("Prefill error:", err);
      res.status(500).json({ message: "Failed to analyze documents" });
    }
  });

  // =========================================================================
  // MODELS & RECOMMENDATIONS
  // =========================================================================

  app.get(api.models.list.path, async (req, res) => {
    const allModels = await storage.getAllModels();
    res.json(allModels);
  });

  app.get(api.models.get.path, async (req, res) => {
    const model = await storage.getModel(Number(req.params.id));
    if (!model) return res.status(404).json({ message: "Model not found" });
    res.json(model);
  });

  app.get(api.models.getRecommendations.path, async (req, res) => {
    const sessionIdStr = req.params.sessionId as string;
    const session = await storage.getSession(sessionIdStr);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const recs = await storage.getRecommendations(session.id);
    res.json(recs);
  });

  app.post(api.models.recommend.path, async (req, res) => {
    try {
      const sessionIdStr = req.params.sessionId as string;
      const session = await storage.getSession(sessionIdStr);
      if (!session) return res.status(404).json({ message: "Session not found" });

      await generateRecommendations(session.id);

      const recs = await storage.getRecommendations(session.id);
      res.json(recs);
    } catch (err) {
      console.error("Recommendation error:", err);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  // =========================================================================
  // ADMIN CONFIG
  // =========================================================================

  app.get(api.admin.getConfig.path, async (req, res) => {
    const config = await storage.getAdvisorConfig();
    const defaultPrompt = getDefaultGlobalPrompt();
    res.json({
      systemPrompt: config?.systemPrompt || defaultPrompt,
      defaultPrompt,
      updatedAt: config?.updatedAt?.toISOString() || null,
    });
  });

  app.post(api.admin.saveConfig.path, async (req, res) => {
    try {
      const { systemPrompt } = api.admin.saveConfig.input.parse(req.body);
      const config = await storage.saveAdvisorConfig(systemPrompt);
      res.json(config);
    } catch (err) {
      console.error("Save config error:", err);
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // =========================================================================
  // STEP ADVISOR CONFIGS
  // =========================================================================

  app.get(api.admin.getStepConfigs.path, async (req, res) => {
    try {
      const configs = await storage.getAllStepAdvisorConfigs();
      const defaults = getDefaultStepPrompts();
      const result = WORKFLOW_STEPS.map((step) => {
        const saved = configs.find((c) => c.stepNumber === step.number);
        return {
          stepNumber: step.number,
          stepLabel: step.label,
          systemPrompt: saved?.systemPrompt || defaults[step.number] || "",
          defaultPrompt: defaults[step.number] || "",
          updatedAt: saved?.updatedAt?.toISOString() || null,
          isCustom: !!saved,
        };
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to get step configs" });
    }
  });

  app.post(api.admin.saveStepConfig.path, async (req, res) => {
    try {
      const stepNumber = Number(req.params.stepNumber);
      const { systemPrompt } = api.admin.saveStepConfig.input.parse(req.body);
      const config = await storage.saveStepAdvisorConfig(stepNumber, systemPrompt);
      res.json(config);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // =========================================================================
  // KNOWLEDGE BASE
  // =========================================================================

  app.get(api.admin.getAirtableConfig.path, async (req, res) => {
    try {
      const config = await storage.getAirtableConfig();
      res.json({
        baseId: config?.baseId ?? null,
        tableId: config?.tableId ?? null,
        apiTokenConfigured: !!(config?.apiToken),
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to get Airtable config" });
    }
  });

  app.post(api.admin.saveAirtableConfig.path, async (req, res) => {
    try {
      const body = api.admin.saveAirtableConfig.input?.parse?.(req.body) ?? req.body;
      await storage.saveAirtableConfig({ baseId: body.baseId, tableId: body.tableId, apiToken: body.apiToken });
      res.json({ message: "Airtable config saved" });
    } catch (err) {
      res.status(500).json({ message: "Failed to save Airtable config" });
    }
  });

  app.get(api.admin.getKnowledgeBase.path, async (req, res) => {
    try {
      const stepNum = req.query.stepNumber ? Number(req.query.stepNumber) : undefined;
      const entries = stepNum ? await storage.getKnowledgeBase(stepNum) : await storage.getAllKnowledgeBase();
      res.json(entries);
    } catch (err) {
      res.status(500).json({ message: "Failed to get knowledge base" });
    }
  });

  // Download original KB file (public route — accessible from workflow)
  app.get("/api/kb/:id/download", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const fileInfo = await storage.getKnowledgeBaseFileData(id);
      if (!fileInfo || !fileInfo.fileData) {
        return res.status(404).json({ message: "No downloadable file available for this entry" });
      }
      const buffer = Buffer.from(fileInfo.fileData, "base64");
      res.setHeader("Content-Type", fileInfo.fileMimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${fileInfo.fileName || "reference-document"}"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  app.post(api.admin.addKnowledgeBase.path, upload.single("file"), async (req, res) => {
    try {
      const stepNumber = Number(req.body.stepNumber);
      const title = req.body.title as string;

      let content = (req.body.content as string) || "";
      let fileName = (req.body.fileName as string) || undefined;

      if (req.file) {
        fileName = req.file.originalname;
        content = await extractFileContent(req.file.buffer, fileName, req.file.mimetype);
      }

      // Store original file as base64 for later download
      const fileData = req.file ? req.file.buffer.toString("base64") : undefined;
      const fileMimeType = req.file ? req.file.mimetype : undefined;

      const referenceType = (req.body.referenceType as string) || undefined;
      const entry = await storage.addKnowledgeBaseEntry(stepNumber, title, content, fileName, fileData, fileMimeType, referenceType);

      // Chunk + embed for RAG retrieval (async, non-blocking for the response)
      ingestKnowledgeBaseEntry(entry.id, stepNumber, title, content)
        .then((count) => console.log(`Indexed KB entry ${entry.id}: ${count} chunks`))
        .catch((err) => console.error(`Failed to index KB entry ${entry.id}:`, err));

      res.json(entry);
    } catch (err) {
      console.error("Knowledge base add error:", err);
      res.status(500).json({ message: "Failed to add knowledge base entry" });
    }
  });

  app.delete(api.admin.deleteKnowledgeBase.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      // Delete chunks first, then the entry itself
      await storage.deleteKbChunksByKnowledgeBaseId(id);
      await storage.deleteKnowledgeBaseEntry(id);
      res.json({ message: "Knowledge base entry deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete knowledge base entry" });
    }
  });

  // Re-index all KB entries (admin utility — chunks + embeds everything)
  app.post("/api/admin/reindex-kb", async (req, res) => {
    try {
      const result = await reindexAllKnowledgeBase();
      res.json({ message: `Re-indexed ${result.entries} entries into ${result.total} chunks` });
    } catch (err) {
      console.error("Reindex error:", err);
      res.status(500).json({ message: "Failed to re-index knowledge base" });
    }
  });

  // =========================================================================
  // TAXONOMY ITEMS (admin CRUD)
  // =========================================================================

  app.get(api.admin.getTaxonomy.path, async (req, res) => {
    try {
      const stepNumber = Number(req.params.stepNumber);
      const category = req.query.category as string | undefined;
      const items = await storage.getTaxonomyItems(stepNumber, category);
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Failed to get taxonomy items" });
    }
  });

  app.post(api.admin.createTaxonomyItem.path, async (req, res) => {
    try {
      const data = api.admin.createTaxonomyItem.input.parse(req.body);
      const item = await storage.createTaxonomyItem(data);
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put(api.admin.updateTaxonomyItem.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updates = api.admin.updateTaxonomyItem.input.parse(req.body);
      const item = await storage.updateTaxonomyItem(id, updates);
      res.json(item);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.admin.deleteTaxonomyItem.path, async (req, res) => {
    try {
      await storage.deleteTaxonomyItem(Number(req.params.id));
      res.json({ message: "Taxonomy item deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete taxonomy item" });
    }
  });

  app.get(api.admin.getTaxonomyGroupLabels.path, async (req, res) => {
    try {
      const category = req.params.category as string;
      const labels = await storage.getTaxonomyGroupLabels(category);
      res.json(labels);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch taxonomy group labels" });
    }
  });

  app.post(api.admin.saveTaxonomyGroupLabel.path, async (req, res) => {
    try {
      const { category, groupKey, label } = api.admin.saveTaxonomyGroupLabel.input.parse(req.body);
      const saved = await storage.saveTaxonomyGroupLabel(category, groupKey, label);
      res.json(saved);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post(api.admin.seedTaxonomy.path, async (req, res) => {
    try {
      const result = await seedTaxonomy();
      res.json({
        message: `Taxonomy seeded: ${result.outcomes} outcomes, ${result.leaps} LEAPs, ${result.practices} practices`,
        ...result,
      });
    } catch (err) {
      console.error("Seed taxonomy error:", err);
      res.status(500).json({ message: "Failed to seed taxonomy" });
    }
  });

  app.post(api.admin.restoreDefaults.path, async (req, res) => {
    try {
      const taxonomyResult = await seedTaxonomy();
      await storage.saveAdvisorConfig(getDefaultGlobalPrompt());
      const defaults = getDefaultStepPrompts();
      for (const step of WORKFLOW_STEPS) {
        const prompt = defaults[step.number] || "";
        if (prompt) await storage.saveStepAdvisorConfig(step.number, prompt);
      }
      res.json({
        message: "Restored taxonomy, global instructions, and step instructions to defaults.",
        taxonomy: taxonomyResult,
      });
    } catch (err) {
      console.error("Restore defaults error:", err);
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to restore defaults" });
    }
  });

  app.post(api.admin.parseTaxonomyFromKB.path, async (req, res) => {
    try {
      const { stepNumber, knowledgeBaseId } = api.admin.parseTaxonomyFromKB.input.parse(req.body);
      const kbEntries = await storage.getKnowledgeBase(stepNumber);
      const entry = kbEntries.find((e) => e.id === knowledgeBaseId);
      if (!entry) return res.status(404).json({ message: "Knowledge base entry not found" });

      // Use GPT to extract taxonomy items from the KB document
      const isStep2 = stepNumber === 2;
      const systemPrompt = isStep2
        ? `You are an expert at extracting structured taxonomy items from educational documents.
Given a document about school design, extract a list of items that are either "outcome" (student outcomes / graduate aims) or "leap" (Learning Experience & Assessment Practices / design principles).

For outcomes, also assign a group from these options:
- "content_career" — Content & Career Knowledge & Skills
- "cross_cutting" — Cross-Cutting Competencies
- "postsecondary_assets" — Postsecondary Assets
- "postsecondary_transition" — Postsecondary Transition

Return a JSON object with this format:
{
  "items": [
    { "category": "outcome" | "leap", "group": "content_career" | "cross_cutting" | "postsecondary_assets" | "postsecondary_transition" | null, "name": "Short canonical name", "description": "One-sentence description", "examples": "Optional examples" }
  ]
}

For LEAPs, set group to null. Only extract clear, distinct items. Do not invent items not present in the source text. Keep names concise (2-6 words).`
        : `You are an expert at extracting structured, hierarchical taxonomy items from educational documents.
Given a document, extract items organized into a 3-level hierarchy:

- **Level 1**: Top-level categories/themes (e.g., "Instructional Exposure"). These are grouping headers.
- **Level 2**: Specific items under a Level 1 category (e.g., "Direct Instruction"). These are selectable by users.
- **Level 3**: Optional sub-items under a Level 2 item (e.g., "Problem-Based Instruction" under "Inquiry-Based Instruction"). Also selectable.

Return a JSON object with this format:
{
  "items": [
    {
      "name": "Level 1 category name",
      "description": "One-sentence description or null",
      "children": [
        {
          "name": "Level 2 item name",
          "description": "One-sentence description or null",
          "children": [
            { "name": "Level 3 sub-item name", "description": "One-sentence description or null" }
          ]
        }
      ]
    }
  ],
  "category": "practice"
}

Rules:
- Preserve the document's hierarchy faithfully. Level 1 items are broad themes, Level 2 are specific practices/items, Level 3 are sub-variants.
- The "category" field should describe what type of item this is (e.g., "practice", "principle", "competency"). Use a single word, lowercase.
- Keep names concise (2-6 words). Do not invent items not in the source text.
- If a Level 2 item has no sub-items, omit the "children" array or set it to [].`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Extract taxonomy items from this document:\n\nTitle: ${entry.title}\n\nContent:\n${entry.content}`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(completion.choices[0].message.content || "{}");

      let toInsert: any[];

      if (isStep2) {
        const extractedItems = parsed.items || [];
        toInsert = extractedItems.map((item: any, idx: number) => ({
          stepNumber,
          category: item.category,
          group: item.group || null,
          parentId: null,
          name: item.name,
          description: item.description || null,
          sortOrder: idx,
        }));
      } else {
        // Flatten hierarchical response into flat rows with parentId references
        const category = parsed.category || "practice";
        const hierarchicalItems = parsed.items || [];
        toInsert = [];
        // We need to insert in stages to get parent IDs
        // First pass: create Level 1 items
        const level1Inserts = hierarchicalItems.map((l1: any, idx: number) => ({
          stepNumber,
          category,
          group: null,
          parentId: null,
          name: l1.name,
          description: l1.description || null,
          sortOrder: idx * 100,
        }));
        const createdL1 = await storage.bulkCreateTaxonomyItems(level1Inserts);

        // Second pass: create Level 2 items referencing Level 1
        for (let i = 0; i < hierarchicalItems.length; i++) {
          const l1 = hierarchicalItems[i];
          const l1Id = createdL1[i]?.id;
          if (!l1Id || !l1.children) continue;
          const level2Inserts = l1.children.map((l2: any, j: number) => ({
            stepNumber,
            category,
            group: null,
            parentId: l1Id,
            name: l2.name,
            description: l2.description || null,
            sortOrder: i * 100 + j,
          }));
          const createdL2 = await storage.bulkCreateTaxonomyItems(level2Inserts);

          // Third pass: Level 3 items
          for (let j = 0; j < l1.children.length; j++) {
            const l2 = l1.children[j];
            const l2Id = createdL2[j]?.id;
            if (!l2Id || !l2.children || l2.children.length === 0) continue;
            const level3Inserts = l2.children.map((l3: any, k: number) => ({
              stepNumber,
              category,
              group: null,
              parentId: l2Id,
              name: l3.name,
              description: l3.description || null,
              sortOrder: i * 100 + j * 10 + k,
            }));
            await storage.bulkCreateTaxonomyItems(level3Inserts);
          }
        }

        // For hierarchical, we already inserted everything above
        const allItems = await storage.getTaxonomyItems(stepNumber, category);
        res.json({ message: `Extracted ${allItems.length} items in hierarchy`, items: allItems });
        return;
      }

      const created = await storage.bulkCreateTaxonomyItems(toInsert);
      res.json({ message: `Extracted ${created.length} items`, items: created });
    } catch (err) {
      console.error("Parse taxonomy error:", err);
      res.status(500).json({ message: "Failed to parse taxonomy from knowledge base" });
    }
  });

  // =========================================================================
  // ADMIN — Model Field Defs
  // =========================================================================

  app.get(api.admin.getModelFieldDefs.path, async (_req, res) => {
    try {
      const defs = await storage.getModelFieldDefs();
      res.json(defs);
    } catch (err) {
      res.status(500).json({ message: "Failed to get model field defs" });
    }
  });

  app.post(api.admin.createModelFieldDef.path, async (req, res) => {
    try {
      const def = await storage.createModelFieldDef(req.body);
      res.status(201).json(def);
    } catch (err) {
      res.status(500).json({ message: "Failed to create model field def" });
    }
  });

  app.put(api.admin.updateModelFieldDef.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await storage.updateModelFieldDef(id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update model field def" });
    }
  });

  app.delete(api.admin.deleteModelFieldDef.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteModelFieldDef(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete model field def" });
    }
  });

  // =========================================================================
  // ADMIN — Scoring Rules
  // =========================================================================

  app.get(api.admin.getScoringRules.path, async (req, res) => {
    try {
      const fieldDefId = req.query.fieldDefId ? Number(req.query.fieldDefId) : undefined;
      const rules = await storage.getScoringRules(fieldDefId);
      res.json(rules);
    } catch (err) {
      res.status(500).json({ message: "Failed to get scoring rules" });
    }
  });

  app.post(api.admin.createScoringRule.path, async (req, res) => {
    try {
      const rule = await storage.createScoringRule(req.body);
      res.status(201).json(rule);
    } catch (err) {
      res.status(500).json({ message: "Failed to create scoring rule" });
    }
  });

  app.put(api.admin.updateScoringRule.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await storage.updateScoringRule(id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update scoring rule" });
    }
  });

  app.delete(api.admin.deleteScoringRule.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteScoringRule(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete scoring rule" });
    }
  });

  app.post(api.admin.generateWatchoutMessage.path, async (req, res) => {
    try {
      const { fieldDefId, modelValue, schoolAnswerKey, schoolAnswerValue, impact } = req.body;

      const fieldDef = await storage.getModelFieldDef(fieldDefId);
      if (!fieldDef) return res.status(404).json({ message: "Field def not found" });

      const prompt = `You are writing a concise, human-readable watchout message for a school model recommendation system.

Context:
- Model attribute: "${fieldDef.label}" (key: ${fieldDef.key})
- The model's value for this attribute: "${modelValue}"
- The school's answer to the question "${schoolAnswerKey}": "${schoolAnswerValue}"
- Impact type: ${impact === "hard_blocker" ? "Hard Blocker (model excluded)" : "Watchout (flag with message)"}

Write a brief (1-2 sentence) explanation of why this combination might be a concern for the school. 
- For a watchout: explain the potential issue and what it means for implementation.
- Keep it clear, professional, and actionable.
- Do not mention technical field names or keys — use plain English.
- Do not start with "Watchout:" or similar labels.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.4,
      });

      const message = completion.choices[0]?.message?.content?.trim() || "";
      res.json({ message });
    } catch (err) {
      console.error("Generate watchout error:", err);
      res.status(500).json({ message: "Failed to generate watchout message" });
    }
  });

  // =========================================================================
  // ADMIN — Scoring Config
  // =========================================================================

  app.get(api.admin.getScoringConfig.path, async (_req, res) => {
    try {
      const configs = await storage.getScoringConfigs();
      res.json(configs);
    } catch (err) {
      res.status(500).json({ message: "Failed to get scoring config" });
    }
  });

  app.post(api.admin.updateScoringConfig.path, async (req, res) => {
    try {
      const { key, value, label } = req.body;
      const config = await storage.upsertScoringConfig(key, value, label);
      res.json(config);
    } catch (err) {
      res.status(500).json({ message: "Failed to update scoring config" });
    }
  });

  // =========================================================================
  // TAXONOMY (public — for workflow UI)
  // =========================================================================

  app.get(api.taxonomy.getItems.path, async (req, res) => {
    try {
      const stepNumber = Number(req.params.stepNumber);
      const items = await storage.getTaxonomyItems(stepNumber);
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Failed to get taxonomy items" });
    }
  });

  app.get(api.taxonomy.getItem.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const item = await storage.getTaxonomyItem(id);
      if (!item) return res.status(404).json({ message: "Taxonomy item not found" });
      res.json(item);
    } catch (err) {
      res.status(500).json({ message: "Failed to get taxonomy item" });
    }
  });

  return httpServer;
}
