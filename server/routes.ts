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
- Sound like a helpful colleague having a casual chat.
- Ask ONE open-ended question at a time.
- Don't summarize or over-explain.
- Match the user's energy.

YOUR JOB:
Learn about their school vision through natural conversation, then recommend matching models.

TOPICS TO EXPLORE (use their words, not yours):
- What grades they serve
- What outcomes they want for students
- What learning should look like day-to-day
- Any constraints they're working with

HOW TO ASK:
- Use broad, open questions. Let them tell you in their own words.
- Don't put words in their mouth or suggest specific answers.
- Acknowledge briefly, then ask the next thing.

BAD: "What do you want students to be ready for - college, careers, or life skills?"
GOOD: "What outcomes matter most for your students?"

BAD: "Are you interested in project-based learning, personalized learning, or inquiry-based approaches?"
GOOD: "What should learning look like day-to-day for students?"

WHEN TO RECOMMEND:
- You have grades + at least one outcome + a sense of what learning should look like
- OR the user asks for recommendations

Keep it natural. You're exploring their vision together.`;
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

  // === AIRTABLE SYNC ===
  app.post("/api/admin/refresh-from-airtable", async (req, res) => {
    try {
      const { fetchModelsFromAirtable } = await import("./airtable");
      const airtableModels = await fetchModelsFromAirtable();
      const syncedModels = await storage.syncModelsFromAirtable(airtableModels);
      res.json({ 
        message: `Successfully synced ${syncedModels.length} models from Airtable`, 
        count: syncedModels.length 
      });
    } catch (err) {
      console.error("Airtable sync error:", err);
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to sync from Airtable" });
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

  // === UPDATE CONTEXT DIRECTLY ===
  app.post("/api/sessions/:sessionId/context", async (req, res) => {
    try {
      const sessionIdStr = req.params.sessionId as string;
      const session = await storage.getSession(sessionIdStr);
      if (!session) return res.status(404).json({ message: "Session not found" });
      
      const patch = req.body;
      await storage.updateSchoolContext(session.id, patch);
      const updated = await storage.getSchoolContext(session.id);
      res.json(updated);
    } catch (err) {
      console.error("Update context error:", err);
      res.status(500).json({ message: "Failed to update context" });
    }
  });

  // === GENERATE RECOMMENDATIONS MANUALLY ===
  app.post("/api/sessions/:sessionId/generate-recommendations", async (req, res) => {
    try {
      const sessionIdStr = req.params.sessionId as string;
      const session = await storage.getSession(sessionIdStr);
      if (!session) return res.status(404).json({ message: "Session not found" });
      
      // Mark context as ready and generate recommendations
      await storage.markContextReady(session.id);
      await generateRecommendations(session.id);
      
      res.json({ message: "Recommendations generated" });
    } catch (err) {
      console.error("Generate recommendations error:", err);
      res.status(500).json({ message: "Failed to generate recommendations" });
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
      
      // Don't auto-generate recommendations - let user trigger manually via the button
      // Just indicate in the response that enough context has been gathered

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
    
    // Return existing recommendations - don't auto-generate
    // User must click "Generate Recommendations" button to trigger generation
    const recs = await storage.getRecommendations(session.id);
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

    // Helper: check if any keyword from user input matches model text
    const fuzzyMatch = (userTerms: string[], modelText: string): string[] => {
      const modelLower = modelText.toLowerCase();
      const matches: string[] = [];
      for (const term of userTerms) {
        const words = term.toLowerCase().split(/\s+/);
        // Match if any significant word (3+ chars) appears in model text
        for (const word of words) {
          if (word.length >= 3 && modelLower.includes(word)) {
            matches.push(term);
            break;
          }
        }
      }
      return matches;
    };

    const scoredModels = allModels.map(model => {
      let score = 0;
      let maxScore = 0;
      const rationaleParts: string[] = [];

      // Grade match (30 points possible)
      maxScore += 30;
      const modelGrades = model.grades.toLowerCase();
      const gradeMatches = context.gradeBands?.filter(g => {
        const gradeLower = g.toLowerCase();
        // Match common grade formats: "9-12", "K-5", "6-8", "high", "middle", "elementary"
        return modelGrades.includes(gradeLower) || 
               modelGrades.includes(gradeLower.replace("-", " ")) ||
               (gradeLower.includes("9") && modelGrades.includes("high")) ||
               (gradeLower.includes("6") && modelGrades.includes("middle")) ||
               (gradeLower.includes("k") && modelGrades.includes("elementary"));
      }) || [];
      if (gradeMatches.length > 0) {
        score += 30;
        rationaleParts.push(`Serves ${gradeMatches.join(", ")} grades`);
      }

      // Outcome alignment (35 points possible)
      maxScore += 35;
      const allModelText = `${model.outcomeTypes} ${model.description} ${model.keyPractices}`.toLowerCase();
      const outcomeMatches = fuzzyMatch(context.desiredOutcomes || [], allModelText);
      if (outcomeMatches.length > 0) {
        const outcomeScore = Math.min(35, outcomeMatches.length * 12);
        score += outcomeScore;
        rationaleParts.push(`Aligns with: ${outcomeMatches.slice(0, 2).join(", ")}`);
      }

      // Practice alignment (35 points possible)
      maxScore += 35;
      const practiceMatches = fuzzyMatch(context.keyPractices || [], allModelText);
      if (practiceMatches.length > 0) {
        const practiceScore = Math.min(35, practiceMatches.length * 12);
        score += practiceScore;
        rationaleParts.push(`Supports ${practiceMatches.slice(0, 2).join(", ")}`);
      }

      // Return raw score (not percentage yet)
      return {
        sessionId,
        modelId: model.id,
        rawScore: score,
        matchCount: rationaleParts.length,
        rationale: rationaleParts.length > 0 ? rationaleParts.join(". ") : "General match based on school type"
      };
    });

    // Sort by raw score
    scoredModels.sort((a, b) => b.rawScore - a.rawScore);
    
    // Take top 10 and normalize to percentages
    const topRecs = scoredModels.slice(0, 10);
    const bestScore = topRecs.length > 0 ? topRecs[0].rawScore : 0;
    
    // Normalize: best match = 100% (if it matched anything), others relative
    // If best score is 0 (no matches), all get 0%
    const normalizedRecs = topRecs.map(rec => {
      let finalScore = 0;
      if (bestScore > 0 && rec.matchCount > 0) {
        // Normalize to 100% for best match
        finalScore = Math.round((rec.rawScore / bestScore) * 100);
      }
      return {
        sessionId: rec.sessionId,
        modelId: rec.modelId,
        score: finalScore,
        rationale: rec.rationale
      };
    });
    
    await storage.saveRecommendations(normalizedRecs);
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
