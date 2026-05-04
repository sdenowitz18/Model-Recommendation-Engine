# PRD 06 — Auth & Session Management

**Last updated:** May 4, 2026
**Status:** ✅ Core Complete / 🔨 Cleanup In Progress

---

## Overview

Authentication ensures that sessions are tied to specific Design Partners. Session management allows users to create, resume, rename, and delete questionnaire sessions. Each user sees only their own sessions.

---

## Requirements (Built)

- **Email/password auth** — register and login with email + bcrypt-hashed password (min 8 characters). Passwords are stored hashed; there are no plaintext credentials anywhere.
- **Session-based authentication** — Express sessions with `connect-pg-simple` storing session data in the `user_sessions` Postgres table. Session cookie is HTTP-only, 30-day expiry.
- **Protected routes** — all workflow routes require authentication. Unauthenticated requests receive a 401. The frontend redirects unauthenticated users to `/login?redirect=<original-url>`.
- **Sessions list** — authenticated users see all their sessions at `/ccl`. Sessions show school name/district, grade band, progress, last updated timestamp.
- **Create session** — new sessions capture school name and district upfront, then navigate to the workflow. Currently routes to V2 by default.
- **Rename session** — inline editing on session cards; commits on Enter or blur.
- **Delete session** — with confirmation dialog. Permanently removes session and all associated data.
- **Logout** — destroys server-side session and clears cookie.
- **User-scoped sessions** — `GET /api/sessions/user?focusArea=ccl` returns only sessions owned by the authenticated user.

---

## Open Requirements

- **V1 session cleanup** — existing sessions created before V2 that live at `/ccl/:sessionId` (pointing to `Workflow.tsx`) should be deleted. All new sessions will use the V2 workflow. No migration is needed — a one-time delete of pre-V2 sessions is the plan.
- **Session progress display for Path B** — the sessions list shows "Step X of 8" using a hardcoded 8-step count. Path B has a different effective step count. Progress display should reflect the user's active path.
- **URL unification** — sessions created as V2 (`/ccl-v2/:sessionId`) should be accessible via `/ccl/:sessionId`. This requires updating the routing in `App.tsx` and the navigation in `Sessions.tsx`.

---

## Backlog (Future)

- **Forgot password / password reset** — users have a real chance of forgetting their password given infrequent use. A simple reset flow (enter email → receive reset link or new password) would reduce friction. See [backlog/future-ideas.md](../backlog/future-ideas.md) for discussion.
- **Remember which email** — some users may also forget which email they registered with. Consider a "hint" mechanism or a shared team login.

---

## Technical Reference

- Auth routes: `server/routes.ts` — search for `AUTH` section (~line 64)
- User creation: `storage.createUserWithPassword(email, password)` — bcrypt rounds: 12
- Session store: `connect-pg-simple` → `user_sessions` table
- Session secret: `SESSION_SECRET` env variable (defaults to `"dev-secret-change-in-production"`)
- Session cookie: `httpOnly: true`, `secure: true` in production, `sameSite: "lax"`, 30-day maxAge
- `requireAuth` middleware: exported from `server/routes.ts`, applied to all workflow and session routes

---

## Out of Scope

- Role-based access control (all authenticated users have the same permissions)
- SSO / OAuth (not planned)
- Per-session sharing with external stakeholders
