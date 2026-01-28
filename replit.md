# School Design Model Advisor

## Overview

A full-stack web application that helps school teams identify, compare, and reason through best-fit school design models. The app features an AI-powered chat advisor that guides users through defining their school context (vision, outcomes, grade bands, practices, constraints) and then recommends matching school models from a curated database. Users can compare recommended models side-by-side.

The application follows a two-pane layout: a persistent chat interface on the left for conversational discovery, and a dynamic content area on the right for viewing recommendations, comparisons, and model details.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, local React state for UI
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens (CSS variables for theming)
- **Animations**: Framer Motion for chat bubble and transition animations
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
  - `models` - School design models imported from Excel
  - `sessions` - User sessions with client-generated UUIDs
  - `school_contexts` - Accumulated context from chat conversations
  - `recommendations` - AI-generated model recommendations with scores
  - `comparison_selections` - User-selected models for comparison
  - `conversations` / `messages` - Chat history storage

### AI Integration
- **Provider**: OpenAI API (configured via environment variables)
- **Use Cases**: 
  - Chat advisor for context gathering and recommendations
  - Voice chat capabilities (audio transcription and synthesis)
  - Image generation support
- **Client Location**: `server/replit_integrations/` contains modular AI integration utilities

### Key Design Patterns
- **Shared Types**: `shared/` directory contains schemas and route definitions used by both client and server
- **Type-Safe Routes**: Route definitions in `shared/routes.ts` include Zod schemas for request/response validation
- **Storage Interface**: `IStorage` interface in `server/storage.ts` abstracts database operations
- **Path Aliases**: TypeScript path aliases (`@/`, `@shared/`, `@assets/`) for clean imports

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database toolkit with Zod integration for schema validation
- **connect-pg-simple**: PostgreSQL session store for Express sessions

### AI Services
- **OpenAI API**: Powers chat advisor, voice features, and image generation
  - Requires `AI_INTEGRATIONS_OPENAI_API_KEY` environment variable
  - Uses `AI_INTEGRATIONS_OPENAI_BASE_URL` for Replit AI proxy

### Data Import
- **xlsx**: Excel file parsing for importing school models from spreadsheets
- **multer**: File upload handling for the admin import endpoint

### Client Libraries
- **TanStack React Query**: Async state management and caching
- **Framer Motion**: Animation library
- **react-markdown**: Rendering AI responses with formatting
- **uuid**: Generating session identifiers
- **wouter**: Lightweight React router

### UI Framework
- **Radix UI**: Accessible component primitives (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-built component library built on Radix
- **Tailwind CSS**: Utility-first CSS framework
- **class-variance-authority**: Component variant management