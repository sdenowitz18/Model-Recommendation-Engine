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
  return `You are a friendly school design advisor helping users find the right school model.

COMMUNICATION STYLE (CRITICAL):
- Keep responses SHORT: 1-3 sentences max.
- Sound like a helpful colleague, not a formal report.
- Ask ONE question at a time. Never bundle multiple questions.
- Don't summarize unless asked. Don't over-explain.
- No bullet points in conversation - use natural sentences.
- Match the user's energy. If they're brief, you be brief.

BAD: "Thank you for sharing! Project-based learning is a wonderful approach that can help students develop critical thinking. This methodology has been shown to increase engagement. Now let me ask..."
GOOD: "Got it, project-based learning. What grades are you designing for?"

YOUR JOB:
1) Learn about their school through quick back-and-forth questions.
2) When you have enough info, recommend matching models.
3) Help them compare options if they want.

WHAT TO COLLECT (in order):
1. Grade bands (what grades?)
2. Desired outcomes (what should students be able to do?)
3. Key practices (project-based? personalized? inquiry?)
4. Constraints (budget, timeline, staffing?)

WHEN TO RECOMMEND:
- You have at least: grades + 1 outcome + 1 practice
- OR the user asks for recommendations

Keep it conversational. You're having a chat, not writing a report.`;
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
You MUST respond in valid JSON format ONLY. Do not include any text outside the JSON object.
The JSON object must have these exact keys:
- "assistant_message": string with your response to the user
- "context_patch": object containing any extracted information with keys: vision (string), desiredOutcomes (array), gradeBands (array), keyPractices (array), implementationSupportsNeeded (array), constraints (array), notes (string)
- "next_question": string with your next question, or null if you are ready to recommend
- "should_recommend": boolean, set to true if enough context has been gathered OR the user explicitly asks for recommendations
- "should_compare": boolean, set to true if the user asks to compare models
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
    const defaultPrompt = getDefaultSystemPrompt();
    res.json({
      systemPrompt: config?.systemPrompt || defaultPrompt,
      defaultPrompt: defaultPrompt,
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
