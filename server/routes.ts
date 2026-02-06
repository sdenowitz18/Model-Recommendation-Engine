import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/audio/client";
import { insertModelSchema, WORKFLOW_STEPS } from "@shared/schema";
import multer from "multer";
import * as xlsx from "xlsx";
import { parseOffice } from "officeparser";

const upload = multer({ storage: multer.memoryStorage() });

async function extractFileContent(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  if (
    mimeType.includes("presentation") || mimeType.includes("powerpoint") ||
    fileName.endsWith(".pptx") || fileName.endsWith(".ppt") ||
    mimeType.includes("msword") || mimeType.includes("wordprocessingml") ||
    fileName.endsWith(".doc") || fileName.endsWith(".docx") ||
    mimeType === "application/pdf" || fileName.endsWith(".pdf")
  ) {
    try {
      const result = await parseOffice(buffer);
      if (result && typeof result.toText === 'function') {
        return result.toText();
      }
      return typeof result === 'string' ? result : String(result);
    } catch (e) {
      console.error("officeparser error:", e);
      return buffer.toString("utf-8");
    }
  }
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheets = workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      return `Sheet: ${name}\n${xlsx.utils.sheet_to_csv(sheet)}`;
    });
    return sheets.join("\n\n");
  }
  return buffer.toString("utf-8");
}

function getDefaultGlobalPrompt(): string {
  return `You are the CCL Model Recommendation Engine, a structured thinking partner for Transcend Design Partners supporting school and district communities.

Your goal is to help Design Partners identify CCL-aligned models or point solutions that could be a good fit for a specific community's vision and context, using vetted internal CCL model data.

COMMUNICATION STYLE:
- Maintain a rigorous, neutral, and facilitation-oriented tone
- Communicate in a structured, analytical style
- Surface criteria, constraints, and tradeoffs explicitly
- Use structured summaries rather than story-like explanations
- Be supportive without being validating by default
- Challenge inputs gently by naming gaps, risks, or tensions
- Use concise bullets or short sections to organize reasoning
- Adopt a non-directive recommendation posture
- Present options as provisional and context-dependent

WORKFLOW OVERVIEW:
You are guiding the user through a 7-step process:
1. School Context - Collect high-level school context
2. Aims for Learners - Capture aspirational aims for learners
3. Learning Experience & Practices - Capture intended learning experience and core practices
4. Constraints - Capture constraints across supporting element domains
5. Model Preferences - Capture model/point solution preferences
6. Decision Frame - Confirm the synthesized decision frame
7. Recommendations - Generate and present model recommendations

The user will move through each step, confirm their inputs, and proceed. They may go back to previous steps to make adjustments.

IMPORTANT RULES:
- Stay focused on the current step's purpose and required inputs
- If the user provides information relevant to a later step, acknowledge it briefly, note that it will be incorporated later, and do not reason on it prematurely
- Ask focused questions to fill gaps in the current step
- Synthesize and reflect back understanding, then ask the user to confirm before marking a step complete`;
}

function getDefaultStepPrompts(): Record<number, string> {
  return {
    1: `STEP 1 — COLLECT HIGH-LEVEL SCHOOL CONTEXT

PURPOSE: Gather foundational information about the school or district community.

REQUIRED INPUTS:
- School name, state, and district
- Grade level / grade band
- Community overview
- Student demographics
- Policy considerations
- Existing industry, postsecondary, or community partnerships

RESPONSE APPROACH:
- Prompt the user to share as many of the required inputs as they have available
- Review what's been provided and check for any missing required inputs
- If something is missing, ask at most one brief follow-up question to fill the gap
- Synthesize and reflect back understanding in 2-3 sentences, then ask the user to confirm or correct before proceeding

OUTPUT: A validated School Context Summary, including any noted partnership assets.`,

    2: `STEP 2 — CAPTURE ASPIRATIONAL AIMS FOR LEARNERS

PURPOSE: Understand the community's vision for what learners should achieve and experience.

REQUIRED INPUTS:
- Experience Design Blueprint or design sketch (if available)
- Learning Notebook or synthesized outputs from looking inward and outward (if available)
- If artifacts aren't available: a short written summary of the community's aims for learners (mission, outcomes, design principles/leaps, intended learner experience)

RESPONSE APPROACH:
- Request the Blueprint and any learning artifacts
- If required artifacts are not available, ask the Design Partner to provide a short written summary
- Review what's provided to sense-check for:
  * Completeness (is mission, outcomes, design principles, and experience provided)
  * Consistency (between stated aims and prior learning)
  * Coverage (consideration of common CCL leaps/design principles and outcomes surfaced in the CCL Design Kit)
- If gaps, tensions, or under-specified areas are identified, ask focused clarifying questions
- Translate confirmed aims into SEPARATE categories: (a) Outcomes, (b) LEAPs / Design Principles, and (c) Intended Learner Experience — preserving original intent
- When capturing step data, always distinguish between outcomes and LEAPs/design principles as separate fields
- Summarize the aims in a concise, structured format organized by these categories and ask the Design Partner to confirm or refine
- Ask the Design Partner to indicate relative importance for each category (Most important, Important, Nice to have)

OUTPUT: A validated Aims for Learners Summary with distinct sections for Outcomes, LEAPs/Design Principles, and Intended Experience.`,

    3: `STEP 3 — CAPTURE INTENDED LEARNING EXPERIENCE & CORE PRACTICES

PURPOSE: Understand what the day-to-day learning experience should look and feel like.

REQUIRED INPUTS:
- Experience Design Sketch or Blueprint
- Documentation of current or planned practices

RESPONSE APPROACH:
- Request experience design artifacts and any practice documentation as the primary inputs
- If required artifacts are not available, ask the Design Partner to describe the intended learning experience and core practices in writing
- Review what's provided to sense-check for:
  * Completeness
  * Coverage (consideration of common CCL activities from the CCL Design Kit)
- If gaps, tensions, or under-specified areas are identified, ask focused clarifying questions
- Translate described practices into the shared Practices Schema (knowledge base), preserving original intent
- Summarize in a concise, structured format and ask the Design Partner to confirm or refine
- Ask the Design Partner to indicate relative importance (Most important, Important, Nice to have)

OUTPUT: A validated Experience & Practices Summary, aligned to the Practices Schema, with noted priorities.`,

    4: `STEP 4 — CAPTURE CONSTRAINTS ACROSS SUPPORTING ELEMENT DOMAINS

PURPOSE: Identify constraints that may affect model selection and implementation.

RESPONSE APPROACH:
- Move through each of the seven domains one at a time
- For each domain:
  * If applicable, surface potential state-level policy constraints based on the school's state and ask the Design Partner to confirm whether these apply in practice
  * Ask a lightly scaffolded question to identify any additional local constraints relevant to that domain
  * Record stated constraints or note when none are present
- After all domains are covered:
  * Synthesize a consolidated list of constraints
  * Ask the Design Partner to identify which constraints should be treated as roadblocks (non-negotiables)
  * Treat remaining constraints as watch-outs
- Do not assess implications for specific models at this stage

DOMAINS TO COVER:
1. Curriculum, Instruction & Assessment
2. School Community & Culture
3. Adult Roles, Hiring & Learning
4. Schedule & Use of Time
5. Family & Community Partnerships
6. Technology & Infrastructure
7. Continuous Improvement Practices

OUTPUT: A Constraints Summary, organized by domain, with any non-negotiable roadblock constraints clearly noted.`,

    5: `STEP 5 — CAPTURE MODEL / POINT SOLUTION PREFERENCES

PURPOSE: Understand preferences for implementation support, evidence level, and solution architecture.

RESPONSE APPROACH:
Ask for preferences across three dimensions, using lightweight option prompts:

1. Implementation posture — what kind of support is preferred? (1 or more)
   - 1:1 coaching/consulting support
   - Professional development (PD)
   - Self-serve resources to implement independently
   - Opportunity to observe / see the model in action

2. Evidence threshold — how established should options be?
   - Well established
   - Open to newer / emerging models with early proof points

3. Solution architecture — how should solutions be composed?
   - Prefer a single comprehensive model
   - Open to stitching together compatible models / point solutions

For each dimension, ask the Design Partner to tag the preference as Need to have / Important / Nice to have (or "no strong preference").
Summarize back and confirm before proceeding.

OUTPUT: A Solution Preferences Summary across the three dimensions, including priority tags and any nuances.`,

    6: `STEP 6 — CONFIRM DECISION FRAME

PURPOSE: Synthesize all prior inputs into a single decision frame for the user to confirm.

RESPONSE APPROACH:
- Synthesize the outputs from prior steps into a concise decision frame, including:
  * Aims for learners (with relative importance noted)
  * Intended experience and core practices (with must-haves highlighted)
  * Constraints (with non-negotiables clearly identified)
  * Model / solution preferences (implementation posture, evidence threshold, solution architecture)
- Present the decision frame in a compact, structured format (e.g., short sections or a simple table)
- Ask the Design Partner to confirm whether this frame is accurate or make small adjustments
- Do not introduce new inputs or resolve tradeoffs at this stage

OUTPUT: A confirmed Decision Frame Summary that will be used to guide model and point-solution recommendations.`,

    7: `STEP 7 — GENERATE RECOMMENDATIONS

PURPOSE: Present 3-5 strong-fit options from the vetted CCL model set.

RESPONSE APPROACH:
- Use the confirmed Decision Frame to identify 3-5 strong-fit options from the vetted CCL model set
- Only include options that:
  * Align with the target grade band
  * Meaningfully support prioritized aims for learners
  * Align with the intended practices and learning experience
  * Do not violate confirmed non-negotiable constraints
- Present recommendations as unordered options, emphasizing fit and tradeoffs rather than a single "best" choice
- If insufficient information exists to make a responsible recommendation, pause and ask for clarification

OUTPUT: A Recommendations Table with columns:
- Model / Solution: Name
- Overview: Brief description
- Aims alignment: Summary of aligned learner outcomes and leaps
- Practices & Experience Alignment: Summary of aligned practices
- Watch-outs: Relevant constraints or preference tensions
- Implementation Supports: Available supports (coaching, PD, etc.)
- Evidence & Resources: Proof points, example schools, or links
- Potential Complements (optional): Other models that could round out gaps`,
  };
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
      
      await storage.markContextReady(session.id);
      await generateRecommendations(session.id);
      
      res.json({ message: "Recommendations generated" });
    } catch (err) {
      console.error("Generate recommendations error:", err);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  // === CHAT ADVISOR (legacy) ===
  app.post(api.chat.advisor.path, async (req, res) => {
    try {
      const { sessionId, message, conversationHistory = [] } = api.chat.advisor.input.parse(req.body);
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      
      const context = await storage.getSchoolContext(session.id);
      if (!context) return res.status(404).json({ message: "Context not found" });

      const recs = await storage.getRecommendations(session.id);
      const comparisonData = await storage.getComparisonSelection(session.id);
      
      let comparisonModelsInfo = "None selected";
      if (comparisonData && comparisonData.modelIds && comparisonData.modelIds.length > 0) {
        const comparisonModels = recs
          .filter(r => comparisonData.modelIds.includes(r.modelId))
          .map(r => r.model);
        
        if (comparisonModels.length > 0) {
          comparisonModelsInfo = comparisonModels.map(m => 
            `\n  - ${m.name}: ${m.description} (Grades: ${m.grades}, Outcomes: ${m.outcomeTypes}, Practices: ${m.keyPractices}, Supports: ${m.implementationSupports})`
          ).join("");
        }
      }

      let recommendedModelsInfo = "None yet";
      if (recs.length > 0) {
        recommendedModelsInfo = recs.map(r => 
          `\n  - ${r.model.name} (Score: ${r.score}%): ${r.rationale}`
        ).join("");
      }

      const config = await storage.getAdvisorConfig();
      const basePrompt = config?.systemPrompt || getDefaultGlobalPrompt();
      
      const systemPrompt = `
${basePrompt}

=== CURRENT SESSION CONTEXT ===
- Vision: ${context.vision || "Not yet provided"}
- Grade Bands: ${context.gradeBands?.join(", ") || "None"}
- Desired Outcomes (Aims for Learners): ${context.desiredOutcomes?.join(", ") || "None"}
- Key Practices (Student Experience): ${context.keyPractices?.join(", ") || "None"}
- Implementation Supports Needed: ${context.implementationSupportsNeeded?.join(", ") || "None"}
- Constraints: ${context.constraints?.join(", ") || "None"}

=== RECOMMENDED MODELS ===
${recommendedModelsInfo}

=== MODELS SELECTED FOR COMPARISON ===
${comparisonModelsInfo}

=== RESPONSE FORMAT ===
You MUST respond in valid JSON format ONLY. Do not include any text outside the JSON object.
The JSON object must have these exact keys:
- "assistant_message": string with your response to the user
- "context_patch": object containing any extracted information with keys: vision (string), desiredOutcomes (array), gradeBands (array), keyPractices (array), implementationSupportsNeeded (array), constraints (array), notes (string)
- "next_question": string with your next question, or null if you are ready to recommend
- "should_recommend": boolean, set to true if enough context has been gathered OR the user explicitly asks for recommendations
- "should_compare": boolean, set to true if the user asks to compare models
      `;

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];
      
      const recentHistory = conversationHistory.slice(-20);
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
      
      messages.push({ role: "user", content: message });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        response_format: { type: "json_object" },
      });

      const responseContent = completion.choices[0].message.content;
      if (!responseContent) throw new Error("No response from AI");
      
      const parsedResponse = JSON.parse(responseContent);
      
      if (parsedResponse.context_patch) {
        await storage.updateSchoolContext(session.id, parsedResponse.context_patch);
      }

      res.json(parsedResponse);

    } catch (err) {
      console.error("Chat error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === STEP-BASED CHAT ADVISOR ===
  app.post(api.chat.stepAdvisor.path, async (req, res) => {
    try {
      const { sessionId, stepNumber, message } = api.chat.stepAdvisor.input.parse(req.body);
      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const progress = await storage.getWorkflowProgress(session.id);
      if (!progress) return res.status(404).json({ message: "Workflow not found" });

      const isGreeting = message === "__greeting__";
      if (!isGreeting) {
        await storage.addStepMessage(session.id, stepNumber, "user", message);
      }

      const globalConfig = await storage.getAdvisorConfig();
      const globalPrompt = globalConfig?.systemPrompt || getDefaultGlobalPrompt();

      const stepConfig = await storage.getStepAdvisorConfig(stepNumber);
      const defaultStepPrompts = getDefaultStepPrompts();
      const stepPrompt = stepConfig?.systemPrompt || defaultStepPrompts[stepNumber] || "";

      const kbEntries = await storage.getKnowledgeBase(stepNumber);
      let knowledgeBaseContext = "";
      if (kbEntries.length > 0) {
        knowledgeBaseContext = "\n\n=== KNOWLEDGE BASE FOR THIS STEP ===\n" +
          kbEntries.map(e => `--- ${e.title} ---\n${e.content}`).join("\n\n");
      }

      const stepDocs = await storage.getStepDocuments(session.id, stepNumber);
      let uploadedDocsContext = "";
      if (stepDocs.length > 0) {
        uploadedDocsContext = "\n\n=== USER-UPLOADED DOCUMENTS FOR THIS STEP ===\n" +
          stepDocs.map(d => `--- ${d.fileName} ---\n${d.fileContent}`).join("\n\n");
      }

      const allStepData = progress.stepData as Record<string, any>;
      let priorStepsContext = "";
      for (let i = 1; i < stepNumber; i++) {
        const sd = allStepData[String(i)];
        if (sd) {
          const stepDef = WORKFLOW_STEPS.find(s => s.number === i);
          priorStepsContext += `\n--- Step ${i}: ${stepDef?.label || ""} ---\n${typeof sd === 'string' ? sd : JSON.stringify(sd, null, 2)}`;
        }
      }

      const currentStepData = allStepData[String(stepNumber)];
      let currentStepContext = "";
      if (currentStepData) {
        currentStepContext = `\n\n=== CURRENT STEP DATA (captured so far) ===\n${typeof currentStepData === 'string' ? currentStepData : JSON.stringify(currentStepData, null, 2)}`;
      }

      let modelsContext = "";
      if (stepNumber === 7) {
        const allModels = await storage.getAllModels();
        if (allModels.length > 0) {
          modelsContext = "\n\n=== AVAILABLE CCL MODELS ===\n" +
            allModels.map(m => `- ${m.name} (Grades: ${m.grades}): ${m.description}\n  Outcomes: ${m.outcomeTypes}\n  Practices: ${m.keyPractices}\n  Supports: ${m.implementationSupports}\n  Link: ${m.link}`).join("\n\n");
        }
      }

      const systemPrompt = `${globalPrompt}

=== CURRENT STEP INSTRUCTIONS ===
${stepPrompt}
${knowledgeBaseContext}
${uploadedDocsContext}
${priorStepsContext ? `\n=== PRIOR STEPS SUMMARY ===\n${priorStepsContext}` : ""}
${currentStepContext}
${modelsContext}

=== RESPONSE STYLE ===
Keep responses SHORT and focused. Aim for 2-4 concise bullet points or a brief paragraph (3-5 sentences max). Avoid lengthy explanations, preambles, or repeating information the user already provided. Be direct and conversational. Only elaborate when the user asks for more detail.

=== RESPONSE FORMAT ===
You MUST respond in valid JSON format ONLY. Do not include any text outside the JSON object.
The JSON object must have these exact keys:
- "assistant_message": string with your CONCISE response to the user (use markdown formatting, keep it brief)
- "step_data_patch": object containing any structured data extracted from this conversation that should be saved for this step. Use descriptive keys. For example: {"school_name": "...", "grade_band": "...", "demographics": "..."}. Set to null if no new data was extracted. For Step 2, include separate keys for "outcomes", "leaps_design_principles", and "intended_experience" when the user shares aims-related information.
- "is_step_complete": boolean, set to true ONLY when you have gathered all required inputs for this step AND the user has confirmed the summary`;

      const conversationHistory = await storage.getStepConversations(session.id, stepNumber);
      const aiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];

      const recentHistory = conversationHistory.slice(-30);
      for (const msg of recentHistory) {
        aiMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
      }

      if (isGreeting) {
        const stepDef = WORKFLOW_STEPS.find(s => s.number === stepNumber);
        aiMessages.push({
          role: "user",
          content: `I'm starting Step ${stepNumber}: ${stepDef?.label || ""}. Briefly introduce this step and list the specific inputs you need from me. Keep it short — just a quick intro and a bullet list of what you're looking for.`,
        });
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: aiMessages,
        response_format: { type: "json_object" },
      });

      const responseContent = completion.choices[0].message.content;
      if (!responseContent) throw new Error("No response from AI");

      const parsedResponse = JSON.parse(responseContent);

      await storage.addStepMessage(session.id, stepNumber, "assistant", parsedResponse.assistant_message);

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

  // === WORKFLOW PROGRESS ===
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
      const nextStep = Math.min(stepNumber + 1, 7);
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

  // === STEP CONVERSATIONS ===
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

  // === STEP DOCUMENTS ===
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

  app.delete("/api/sessions/:sessionId/workflow/documents/:docId", async (req, res) => {
    try {
      await storage.deleteStepDocument(Number(req.params.docId));
      res.json({ message: "Document deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // === MODELS ===
  app.get(api.models.list.path, async (req, res) => {
    const allModels = await storage.getAllModels();
    res.json(allModels);
  });

  app.get(api.models.get.path, async (req, res) => {
    const model = await storage.getModel(Number(req.params.id));
    if (!model) return res.status(404).json({ message: "Model not found" });
    res.json(model);
  });

  app.post(api.models.recommend.path, async (req, res) => {
    try {
      const sessionIdStr = req.params.sessionId as string;
      const session = await storage.getSession(sessionIdStr);
      if (!session) return res.status(404).json({ message: "Session not found" });
      
      await generateRecommendations(session.id);
      
      const recs = await storage.getRecommendations(session.id);
      
      const recsWithModels = [];
      for (const rec of recs) {
        const model = await storage.getModel(rec.modelId);
        recsWithModels.push({ ...rec, model });
      }
      
      res.json(recsWithModels);
    } catch (err) {
      console.error("Recommendation error:", err);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
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
    const allModels = await storage.getAllModels();
    if (allModels.length === 0) return;

    let context = await storage.getSchoolContext(sessionId);
    
    if (!context) {
      const progress = await storage.getWorkflowProgress(sessionId);
      if (progress && progress.stepData) {
        const sd = progress.stepData as Record<string, any>;
        const allValues = Object.values(sd).reduce((acc: any, stepObj: any) => {
          if (typeof stepObj === 'object' && stepObj !== null) {
            Object.assign(acc, stepObj);
          }
          return acc;
        }, {});
        
        context = {
          id: 0,
          sessionId,
          vision: allValues.vision || allValues.school_vision || "",
          desiredOutcomes: allValues.desired_outcomes || allValues.aims || allValues.outcomes || [],
          gradeBands: allValues.grade_bands || allValues.grade_band ? [allValues.grade_band] : allValues.grades || [],
          keyPractices: allValues.key_practices || allValues.practices || allValues.learning_practices || [],
          implementationSupportsNeeded: allValues.implementation_supports || allValues.supports || [],
          constraints: allValues.constraints || [],
          notes: allValues.notes || "",
          updatedAt: new Date(),
        } as any;
      }
    }
    
    if (!context) return;

    const fuzzyMatch = (userTerms: string[], modelText: string): string[] => {
      const modelLower = modelText.toLowerCase();
      const matches: string[] = [];
      for (const term of userTerms) {
        const words = term.toLowerCase().split(/\s+/);
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
      const rationaleParts: string[] = [];

      const modelGrades = model.grades.toLowerCase();
      const gradeMatches = context.gradeBands?.filter(g => {
        const gradeLower = g.toLowerCase();
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

      const allModelText = `${model.outcomeTypes} ${model.description} ${model.keyPractices}`.toLowerCase();
      const outcomeMatches = fuzzyMatch(context.desiredOutcomes || [], allModelText);
      if (outcomeMatches.length > 0) {
        const outcomeScore = Math.min(35, outcomeMatches.length * 12);
        score += outcomeScore;
        rationaleParts.push(`Aligns with: ${outcomeMatches.slice(0, 2).join(", ")}`);
      }

      const practiceMatches = fuzzyMatch(context.keyPractices || [], allModelText);
      if (practiceMatches.length > 0) {
        const practiceScore = Math.min(35, practiceMatches.length * 12);
        score += practiceScore;
        rationaleParts.push(`Supports ${practiceMatches.slice(0, 2).join(", ")}`);
      }

      return {
        sessionId,
        modelId: model.id,
        rawScore: score,
        matchCount: rationaleParts.length,
        rationale: rationaleParts.length > 0 ? rationaleParts.join(". ") : "General match based on school type"
      };
    });

    scoredModels.sort((a, b) => b.rawScore - a.rawScore);
    
    const topRecs = scoredModels.slice(0, 10);
    const bestScore = topRecs.length > 0 ? topRecs[0].rawScore : 0;
    
    const normalizedRecs = topRecs.map(rec => {
      let finalScore = 0;
      if (bestScore > 0 && rec.matchCount > 0) {
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
    const defaultPrompt = getDefaultGlobalPrompt();
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

  // === STEP ADVISOR CONFIGS ===
  app.get(api.admin.getStepConfigs.path, async (req, res) => {
    try {
      const configs = await storage.getAllStepAdvisorConfigs();
      const defaults = getDefaultStepPrompts();
      const result = WORKFLOW_STEPS.map(step => {
        const saved = configs.find(c => c.stepNumber === step.number);
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

  // === KNOWLEDGE BASE ===
  app.get(api.admin.getKnowledgeBase.path, async (req, res) => {
    try {
      const stepNum = req.query.stepNumber ? Number(req.query.stepNumber) : undefined;
      const entries = stepNum ? await storage.getKnowledgeBase(stepNum) : await storage.getAllKnowledgeBase();
      res.json(entries);
    } catch (err) {
      res.status(500).json({ message: "Failed to get knowledge base" });
    }
  });

  app.post(api.admin.addKnowledgeBase.path, upload.single("file"), async (req, res) => {
    try {
      const stepNumber = Number(req.body.stepNumber);
      const title = req.body.title as string;
      
      let content = req.body.content as string || "";
      let fileName = req.body.fileName as string || undefined;

      if (req.file) {
        fileName = req.file.originalname;
        content = await extractFileContent(req.file.buffer, fileName, req.file.mimetype);
      }

      const entry = await storage.addKnowledgeBaseEntry(stepNumber, title, content, fileName);
      res.json(entry);
    } catch (err) {
      console.error("Knowledge base add error:", err);
      res.status(500).json({ message: "Failed to add knowledge base entry" });
    }
  });

  app.delete(api.admin.deleteKnowledgeBase.path, async (req, res) => {
    try {
      await storage.deleteKnowledgeBaseEntry(Number(req.params.id));
      res.json({ message: "Knowledge base entry deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete knowledge base entry" });
    }
  });

  return httpServer;
}
