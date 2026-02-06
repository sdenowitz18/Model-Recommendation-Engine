# School Design Model Advisor

## Overview

A full-stack web application that helps school teams identify, compare, and reason through best-fit school design models. The app features a staged 7-step AI-powered workflow that guides users through defining their school context, aims, learning practices, constraints, model preferences, decision frame confirmation, and finally generates model recommendations from a curated database.

The application uses a three-panel layout: a sidebar stepper for workflow navigation (7 steps with progress indicators), a chat panel for conversational AI guidance per step, and a content panel for displaying captured data, uploaded documents, decision frame synthesis, and model recommendations.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (Feb 2026)

- **Staged 7-Step Workflow**: Replaced single-pane chat with a structured 7-step workflow (School Context, Aims for Learners, Learning Experience & Practices, Constraints, Model Preferences, Decision Frame, Recommendations)
- **Per-Step Chat**: Each step has its own conversation history stored in the database, with step-specific AI instructions
- **Document Upload Per Step**: Users can upload documents to any step; content is extracted and injected into AI context
- **Knowledge Base System**: Admin can add reference documents per step; content injected into AI context at runtime
- **Step-Specific Admin Instructions**: Admin can configure both global instructions and per-step prompts with defaults from CCL methodology
- **Decision Frame (Step 6)**: Synthesizes all prior step data into a consolidated summary for review
- **Recommendations (Step 7)**: Generates model matches from the database using fuzzy matching against captured step data
- **Step Navigation**: Users can go back to prior steps, reset individual steps, or start completely fresh

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, local React state for UI
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens (CSS variables for theming)
- **Session Management**: Client-side UUID generation stored in localStorage, registered with backend on first use

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON APIs under `/api/*` prefix
- **Build Process**: Custom build script using esbuild for server bundling, Vite for client

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` defines all tables
- **Core Tables**:
  - `models` - School design models imported from Excel/Airtable
  - `sessions` - User sessions with client-generated UUIDs
  - `school_contexts` - Accumulated context from chat conversations (legacy)
  - `recommendations` - AI-generated model recommendations with scores
  - `comparison_selections` - User-selected models for comparison
  - `conversations` / `messages` - Chat history storage (legacy)
  - `advisor_config` - Stores the custom global system prompt for the AI advisor
- **Workflow Tables** (new):
  - `workflow_progress` - Tracks current step, completed steps, and accumulated step data per session
  - `step_conversations` - Per-step chat messages (role, content, stepNumber)
  - `step_documents` - User-uploaded documents per step with extracted content
  - `step_advisor_configs` - Per-step custom AI instructions
  - `knowledge_base` - Admin-managed reference documents tagged to specific steps

### AI Integration
- **Provider**: OpenAI API (configured via environment variables)
- **Use Cases**: 
  - Step-specific chat advisor for context gathering
  - Structured JSON responses with data extraction and step completion signals
- **Client Location**: `server/replit_integrations/` contains modular AI integration utilities
- **Custom Instructions**: 
  - Global instructions define advisor identity/tone (admin-configurable at `/admin/settings`)
  - Per-step instructions define focused guidance for each step (pre-populated with CCL methodology defaults)
  - Knowledge base content injected per step
  - User-uploaded document content injected per step
  - Prior step summaries included for context continuity

### Key Design Patterns
- **Shared Types**: `shared/` directory contains schemas and route definitions used by both client and server
- **WORKFLOW_STEPS constant**: Defined in `shared/schema.ts`, provides step metadata (number, label, description)
- **Type-Safe Routes**: Route definitions in `shared/routes.ts` include Zod schemas for request/response validation
- **Storage Interface**: `IStorage` interface in `server/storage.ts` abstracts database operations
- **Path Aliases**: TypeScript path aliases (`@/`, `@shared/`, `@assets/`) for clean imports
- **Default Step Prompts**: Defined in `server/routes.ts` `getDefaultStepPrompts()` function

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database toolkit with Zod integration for schema validation
- **connect-pg-simple**: PostgreSQL session store for Express sessions

### AI Services
- **OpenAI API**: Powers chat advisor
  - Requires `AI_INTEGRATIONS_OPENAI_API_KEY` environment variable
  - Uses `AI_INTEGRATIONS_OPENAI_BASE_URL` for Replit AI proxy

### Data Import
- **xlsx**: Excel file parsing for importing school models from spreadsheets
- **multer**: File upload handling for admin import and document uploads
- **Airtable API**: Direct sync from Airtable table for model management
  - Requires `AIRTABLE_API_TOKEN` secret
  - Uses `AIRTABLE_BASE_ID` (apps0C0qZ2Bk9HTOJ) and `AIRTABLE_TABLE_ID` (tblG681MURUof7xEN) environment variables
  - Endpoint: POST `/api/admin/refresh-from-airtable`

### Client Libraries
- **TanStack React Query**: Async state management and caching
- **react-markdown**: Rendering AI responses with formatting
- **uuid**: Generating session identifiers
- **wouter**: Lightweight React router

### UI Framework
- **Radix UI**: Accessible component primitives (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-built component library built on Radix
- **Tailwind CSS**: Utility-first CSS framework
- **class-variance-authority**: Component variant management

## Project Architecture

### Key Files
- `shared/schema.ts` - All database table definitions and WORKFLOW_STEPS constant
- `shared/routes.ts` - API route definitions with Zod schemas
- `server/routes.ts` - Express route handlers including step chat, workflow management, admin APIs, recommendation engine
- `server/storage.ts` - IStorage interface and DatabaseStorage implementation
- `server/airtable.ts` - Airtable sync logic
- `client/src/pages/Workflow.tsx` - Main workflow page with stepper, chat, data panels, Decision Frame, Recommendations
- `client/src/pages/AdminSettings.tsx` - Admin settings with global/step instructions and knowledge base management
- `client/src/hooks/use-advisor.ts` - Session management and legacy chat hooks
- `client/src/App.tsx` - App routing
