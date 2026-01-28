import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/audio/client"; // Use the client from audio integration which is just generic OpenAI client
import { insertModelSchema } from "@shared/schema";
import multer from "multer";
import * as xlsx from "xlsx";

const upload = multer({ storage: multer.memoryStorage() });

// Default system prompt for the advisor (used when no custom config is set)
function getDefaultSystemPrompt(): string {
  return `You are a guided school design advisor that helps a user identify, compare, and reason through best-fit school design models and point solutions.

Your job is to:
1) Collect the user's school design vision and context through a structured conversation.
2) Decide when enough context exists to recommend models.
3) Support comparison and trade-off reasoning once the user selects models.

You MUST behave like a product-guided experience:
- Ask one focused question at a time.
- Keep the user moving forward.
- Periodically summarize what you've learned in 3–6 bullets.
- Make assumptions explicit when needed and let the user correct them.
- Never overwhelm the user with long lists.

You do NOT invent model data. You only use model attributes provided by the application. If the user asks for details you don't have, say what's missing and offer to proceed using what is known.

You recommend models in two modes:
- Best-fit recommendations: a small ranked set with short rationale.
- Sensemaking support: help users reason, compare, and understand trade-offs.

Conversation phases you follow:
PHASE 1 — Context Discovery
- Goal: learn enough to recommend.
- Prioritize collecting:
  a) Desired outcomes (what success looks like)
  b) Grade bands
  c) Key practices/structures the school wants
  d) Implementation supports needed
  e) Constraints (budget sensitivity, staffing capacity, credentialing tolerance, timeline)
  f) Context reach constraints (governance type, location type, state(s))

PHASE 2 — Readiness Check
- You explicitly state whether you have enough context to recommend.
- If not, ask the single most important missing question.

PHASE 3 — Recommendations
- You recommend a limited set (not exhaustive).
- You explain fit, assumptions, and 1 watch-out per model.

PHASE 4 — Comparison & Trade-offs
- When the user selects multiple models, you compare them using the user's priorities.
- You focus on meaningful differences (implementation complexity, supports, constraints, alignment to desired outcomes).
- You answer "why choose X over Y" with clear trade-offs.

Supplemental web information:
- Only use the open web if the user explicitly requests it OR if the user asks something your model data cannot answer and web info could reasonably help.
- If you use web info, treat it as supplemental and distinguish it from the database facts.`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // === EXCEL IMPORT ===
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

        // Validate and save
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
  
  // === SESSIONS ===
  app.post(api.sessions.create.path, async (req, res) => {
    try {
      const { sessionId } = api.sessions.create.input.parse(req.body);
      let session = await storage.getSession(sessionId);
      if (!session) {
        session = await storage.createSession(sessionId);
      }
      res.status(201).json(session);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.get(api.sessions.getContext.path, async (req, res) => {
    const sessionIdStr = req.params.sessionId as string;
    const session = await storage.getSession(sessionIdStr);
    if (!session) return res.status(404).json({ message: "Session not found" });
    
    const context = await storage.getSchoolContext(session.id);
    res.json(context);
  });

  // Clear session (start fresh)
  app.post(api.sessions.clear.path, async (req, res) => {
    try {
      const sessionIdStr = req.params.sessionId as string;
      const session = await storage.getSession(sessionIdStr);
      if (!session) return res.status(404).json({ message: "Session not found" });
      
      await storage.clearSessionData(session.id);
      res.json({ message: "Session cleared successfully" });
    } catch (err) {
      console.error("Clear session error:", err);
      res.status(500).json({ message: "Failed to clear session" });
    }
  });

  // === CHAT ADVISOR ===
  app.post(api.chat.advisor.path, async (req, res) => {
    try {
      const { sessionId, message, conversationHistory = [] } = api.chat.advisor.input.parse(req.body);
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      
      const context = await storage.getSchoolContext(session.id);
      if (!context) return res.status(404).json({ message: "Context not found" });

      // Get the custom system prompt from config, or use default
      const config = await storage.getAdvisorConfig();
      const basePrompt = config?.systemPrompt || getDefaultSystemPrompt();
      
      // Build the full system prompt with current context injected
      const systemPrompt = `
${basePrompt}

=== CURRENT SESSION CONTEXT ===
- Vision: ${context.vision || "Not yet provided"}
- Grade Bands: ${context.gradeBands?.join(", ") || "None"}
- Desired Outcomes (Aims for Learners): ${context.desiredOutcomes?.join(", ") || "None"}
- Key Practices (Student Experience): ${context.keyPractices?.join(", ") || "None"}
- Implementation Supports Needed: ${context.implementationSupportsNeeded?.join(", ") || "None"}
- Constraints: ${context.constraints?.join(", ") || "None"}

=== RESPONSE FORMAT ===
You MUST respond in JSON format ONLY with this exact schema:
{
  "assistant_message": "your response to the user",
  "context_patch": {
    "vision": "extracted vision string or empty string",
    "desiredOutcomes": ["extracted outcomes"],
    "gradeBands": ["extracted grades"],
    "keyPractices": ["extracted practices"],
    "implementationSupportsNeeded": ["extracted supports"],
    "constraints": ["extracted constraints"],
    "notes": "any other notes"
  },
  "next_question": "your next focused question or null if recommending",
  "should_recommend": true/false (true if enough context gathered OR user explicitly asks for recommendations),
  "should_compare": true/false (true if user asks to compare models)
}
      `;

      // Build messages array with conversation history
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];
      
      // Add conversation history (limited to last 10 exchanges for context window)
      const recentHistory = conversationHistory.slice(-20);
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
      
      // Add current user message
      messages.push({ role: "user", content: message });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages,
        response_format: { type: "json_object" },
      });

      const responseContent = completion.choices[0].message.content;
      if (!responseContent) throw new Error("No response from AI");
      
      const parsedResponse = JSON.parse(responseContent);
      
      // Update context with patch
      if (parsedResponse.context_patch) {
        await storage.updateSchoolContext(session.id, parsedResponse.context_patch);
      }
      
      if (parsedResponse.should_recommend) {
        await storage.markContextReady(session.id);
        // Trigger recommendation engine? 
        // We can do it here or let the client call the recommend endpoint.
        // Let's do it here to ensure data is ready.
        await generateRecommendations(session.id);
      }

      res.json(parsedResponse);

    } catch (err) {
      console.error("Chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === MODELS ===
  app.get(api.models.list.path, async (req, res) => {
    const models = await storage.getAllModels();
    res.json(models);
  });

  app.get(api.models.get.path, async (req, res) => {
    const model = await storage.getModel(Number(req.params.id));
    if (!model) return res.status(404).json({ message: "Model not found" });
    res.json(model);
  });

  app.post(api.models.recommend.path, async (req, res) => {
    const sessionIdStr = req.params.sessionId as string;
    const session = await storage.getSession(sessionIdStr);
    if (!session) return res.status(404).json({ message: "Session not found" });
    
    const recs = await storage.getRecommendations(session.id);
    // If no recs exist, try to generate them (fallback)
    if (recs.length === 0) {
      await generateRecommendations(session.id);
      const newRecs = await storage.getRecommendations(session.id);
      return res.json(newRecs);
    }
    res.json(recs);
  });

  // === COMPARISON ===
  app.post(api.comparison.save.path, async (req, res) => {
    const sessionIdStr = req.params.sessionId as string;
    const session = await storage.getSession(sessionIdStr);
    if (!session) return res.status(404).json({ message: "Session not found" });
    
    const { modelIds } = api.comparison.save.input.parse(req.body);
    const selection = await storage.saveComparisonSelection(session.id, modelIds);
    res.json(selection);
  });

  app.get(api.comparison.get.path, async (req, res) => {
    const sessionIdStr = req.params.sessionId as string;
    const session = await storage.getSession(sessionIdStr);
    if (!session) return res.status(404).json({ message: "Session not found" });
    
    const selection = await storage.getComparisonSelection(session.id);
    let modelsList = [];
    if (selection && selection.modelIds) {
      for (const id of selection.modelIds) {
        const m = await storage.getModel(id);
        if (m) modelsList.push(m);
      }
    }
    res.json({ selection: selection || null, models: modelsList });
  });

  // === HELPER: Recommendation Engine ===
  async function generateRecommendations(sessionId: number) {
    const context = await storage.getSchoolContext(sessionId);
    const allModels = await storage.getAllModels();
    if (!context) return;

    const scoredModels = allModels.map(model => {
      let score = 0;
      let rationaleParts = [];

      // +3 if grade bands overlap
      const modelGrades = model.grades.toLowerCase();
      const hasGradeOverlap = context.gradeBands?.some(g => modelGrades.includes(g.toLowerCase()));
      if (hasGradeOverlap) {
        score += 3;
        rationaleParts.push("Matches grade levels");
      }

      // +2 for each desired outcome keyword match
      context.desiredOutcomes?.forEach(outcome => {
        if (model.outcomeTypes.toLowerCase().includes(outcome.toLowerCase())) {
          score += 2;
          rationaleParts.push(`Supports outcome: ${outcome}`);
        }
      });

      // +1 for key practices
      context.keyPractices?.forEach(practice => {
        if (model.keyPractices.toLowerCase().includes(practice.toLowerCase())) {
          score += 1;
          rationaleParts.push(`Aligns with practice: ${practice}`);
        }
      });
      
      return {
        sessionId,
        modelId: model.id,
        score,
        rationale: rationaleParts.join(". ")
      };
    });

    // Sort and save top 10
    scoredModels.sort((a, b) => b.score - a.score);
    const topRecs = scoredModels.slice(0, 10);
    
    await storage.saveRecommendations(topRecs);
  }

  // === ADMIN CONFIG ===
  app.get(api.admin.getConfig.path, async (req, res) => {
    const config = await storage.getAdvisorConfig();
    res.json({
      systemPrompt: config?.systemPrompt || getDefaultSystemPrompt(),
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

  return httpServer;
}
