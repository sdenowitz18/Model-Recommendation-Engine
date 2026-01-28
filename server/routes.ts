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
      const { sessionId, message } = api.chat.advisor.input.parse(req.body);
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      
      const context = await storage.getSchoolContext(session.id);
      if (!context) return res.status(404).json({ message: "Context not found" });

      // Construct system prompt with current context state
      const systemPrompt = `
        You are a guided school design advisor helping a school team identify best-fit design models from Transcend Education's Innovative Model Exchange.
        
        CURRENT CONTEXT:
        - Vision: ${context.vision || "Not yet provided"}
        - Grade Bands: ${context.gradeBands?.join(", ") || "None"}
        - Desired Outcomes (Aims for Learners): ${context.desiredOutcomes?.join(", ") || "None"}
        - Key Practices (Student Experience): ${context.keyPractices?.join(", ") || "None"}
        - Implementation Supports Needed: ${context.implementationSupportsNeeded?.join(", ") || "None"}
        - Constraints: ${context.constraints?.join(", ") || "None"}
        
        STEP-BY-STEP QUESTION ORDER (follow this sequence):
        
        STEP 1 - SCHOOL INFO (ask first if not provided):
        - Where is the school located?
        - What grades does the school serve?
        - Is this an existing school or a new design?
        
        STEP 2 - AIMS FOR LEARNERS (ask second):
        - What outcomes do you want for students? (e.g., critical thinking, collaboration, creativity)
        - What Transcend Leaps are you prioritizing? (e.g., Whole-Child Focus, Equity-Driven, Learner-Led)
        - What skills and competencies matter most?
        
        STEP 3 - STUDENT EXPERIENCE (ask third):
        - What should learning look like day-to-day for students?
        - What teaching approaches or practices are important? (e.g., project-based, personalized, inquiry-based)
        - How should students spend their time?
        
        STEP 4 - IMPLEMENTATION SUPPORTS (ask fourth):
        - What kind of support does your team need to implement a new model?
        - What are your constraints? (budget, timeline, staffing, facilities)
        - What resources are already in place?
        
        YOUR ROLE:
        1. Guide the user through these steps IN ORDER. Don't skip ahead.
        2. If they provide information out of order, acknowledge it but gently return to the current step.
        3. When you have enough from each step (at minimum: grades, 1+ outcomes, 1+ practice, 1+ support need), you can recommend.
        4. Respond in JSON format ONLY.
        
        JSON SCHEMA:
        {
          "assistant_message": "your response to the user",
          "context_patch": {
            "vision": "extracted vision string",
            "desiredOutcomes": ["extracted outcome"],
            "gradeBands": ["extracted grades"],
            "keyPractices": ["extracted practice"],
            "implementationSupportsNeeded": ["extracted support"],
            "constraints": ["extracted constraint"],
            "notes": "any other notes"
          },
          "next_question": "your next focused question or null if recommending",
          "should_recommend": boolean (true if enough context gathered OR user explicitly asks for recommendations),
          "should_compare": boolean (true if user asks to compare models)
        }
        
        RULES:
        - Ask ONE focused question at a time.
        - Follow the step order above. Move to the next step only after the current one has meaningful input.
        - If the user provides information, extract it into 'context_patch'.
        - If 'should_recommend' is true, 'next_question' should be null.
        - Be warm, helpful, professional, and encouraging.
        - Acknowledge what they share before asking the next question.
      `;

      const completion = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
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

  return httpServer;
}
