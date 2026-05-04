# Backlog — Future Ideas

**Last updated:** May 4, 2026

These are future-state items that have been discussed but are not yet scoped into any active PRD. When an item becomes a priority, create or extend a PRD for it rather than building it directly from this list.

---

## Auth & Sessions

### Forgot Password / Password Reset
Users are likely to forget their password given infrequent use of the tool. A simple reset flow would reduce friction significantly.

**Proposed approach:**
- User enters their email on a "Forgot password" screen
- System sends a reset link (requires an email service like Resend, SendGrid, or similar — not currently configured)
- Alternatively, a simpler admin-triggered password reset (admin sets a temporary password for the user)
- If email service is too heavy, consider a "contact your admin to reset" fallback for the MVP

**Relevant PRD:** [06-auth-sessions.md](../prds/06-auth-sessions.md)

---

## Recommendations Engine

### Stitching — Multi-Model Combination Suggestions
Users can currently indicate openness to combining models ("stitching"), but the engine doesn't use this signal. Long-term, the engine could suggest 2-model combinations for users who are open to it.

**Relevant PRD:** [04-recommendations-engine.md](../prds/04-recommendations-engine.md)

### Semantic / Embedding-Based Alignment Scoring
Current fuzzy keyword matching misses semantic equivalents (e.g., "student agency" won't match "learner autonomy"). Embedding-based scoring (cosine similarity between user input embeddings and model description embeddings) would improve alignment accuracy without requiring exact keyword matches.

**Relevant PRD:** [04-recommendations-engine.md](../prds/04-recommendations-engine.md)

---

## Admin & Configuration

### DB-Configurable Scoring Rules (Environment Promotion)
Scoring rules are currently seeded from code. For multi-environment deployments (staging → production), rules should be manageable via the Admin UI and promotable between environments without reconfiguration.

**Relevant PRD:** [07-admin-knowledge-base.md](../prds/07-admin-knowledge-base.md)

### DB-Configurable Workflow Questions
System Elements (Step 4) and Model Preferences (Step 5) questions are hardcoded in the client. Moving them to the database would decouple content from code.

**Relevant PRD:** [07-admin-knowledge-base.md](../prds/07-admin-knowledge-base.md)

---

## Model Export

### PDF / Word Export of Decision Frame + Recommendations
Design Partners may want to share a summary with school leaders. A generated PDF or Word document of the Decision Frame and Recommendations (with alignment rationale) would make this easy.

No PRD yet — create one when this becomes a priority.

---

## Additional Model Categories

The landing page currently shows CCL as the only active category. The following are planned but not yet scoped:

### Math Models
A guided workflow for identifying math-focused instructional models and curricula aligned to school needs. Would follow the same Path A / Path B architecture with a Math-specific taxonomy.

### Whole Child Models
Models addressing social, emotional, and academic development. Domain-specific taxonomy needed.

### COMP3 Models
Competency-based models and micro-credentialing solutions for personalized pathways. Domain-specific taxonomy needed.

**Note:** Each new category would likely need its own taxonomy seed, its own set of models in the database, and its own focus area routing (e.g., `/math/:sessionId`). The recommendation engine architecture is already extensible to support this.

---

## Model Exploration

### Conversation Export
Allow users to export the AI chat transcript from Model Exploration for a given model, for documentation or sharing purposes.

### Side-by-Side Model Comparison
Let users compare two models head-to-head in the exploration step — both their alignment scores and their AI chat responses to the same question.

**Relevant PRD:** [05-model-exploration-ai-chat.md](../prds/05-model-exploration-ai-chat.md)
