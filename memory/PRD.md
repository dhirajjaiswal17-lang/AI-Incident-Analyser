# AI Incident Analyzer — PRD

## Original Problem Statement
Build a production-ready AI Incident Analyzer web app that integrates ServiceNow REST API and an AI/LLM API. End Users see open/active ServiceNow incidents, select one, click "Analyze Incident", and receive AI-generated Likely Root Cause, Business Impact, Recommended Immediate Action, Preventive Action, and Confidence. Admins have a separate dashboard for ServiceNow config, AI config, Knowledge Base, RCA Repository, Applications, Historical Incidents, Analysis History, Audit Logs and an Integration & Deployment Guide. Auth via Emergent Google OAuth. Role-based authorization enforced server-side.

## User Personas
- **End User (SRE / production support)** — needs fast triage of active incidents.
- **Admin (platform lead)** — manages integrations and internal knowledge.

## Core Requirements (Static)
- Emergent Google OAuth (Admin/EndUser roles)
- Live incident list from ServiceNow (or demo dataset when unconfigured)
- Server-side role enforcement
- AI-generated 5-section analysis with confidence
- Internal KB / RCA / Historical never exposed to End Users
- Admin CRUD for KB, RCA, Applications, Historical
- Test Connection for ServiceNow & AI
- Integration & Deployment Guide (admin only)
- Production HTTPS deployable

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`) + MongoDB (motor). All routes prefixed `/api`.
- **Frontend**: React + shadcn/ui + Tailwind. Router with OAuth hash handling.
- **LLM**: `emergentintegrations` LlmChat with Emergent Universal LLM Key. Provider/model configurable in Admin → AI.
- **RAG**: keyword scoring over Historical Incidents + KB + RCA (top-5 each, only positive scores).

## Implementation Log (Feb 2026)
- 2026-02-05: v1.0 shipped.
  - Auth: Emergent Google OAuth; roles admin/end_user; first user auto-admin; ADMIN_EMAILS allowlist.
  - End User: `/incidents` list (search, priority filter, pagination) + `/incidents/:sysId` detail + Analyze.
  - Admin: dashboard, ServiceNow config + test, AI config + test, CRUD (Applications, KB, RCA, Historical), Analysis History, Audit Logs, Integration Guide.
  - Seeded demo: 8 active incidents (banking scenarios), 7 historical, 7 KB, 3 RCA, 7 applications.
  - Testing agent: 51/51 backend + 100% frontend pass. Fixed ObjectId injection in CRUD create; PUT returns 404 on missing id; priority badge nowrap.

## Deferred / Backlog
- P1: File/KB document upload (drop zone → parsed text into KB)
- P1: Per-user rate limiting on analyze
- P2: Vector-based semantic RAG (embeddings) with pgvector or FAISS
- P2: Analyst feedback (thumbs up/down) on AI analyses
- P2: Migrate FastAPI startup handlers to lifespan context manager
- P3: Real-time updates via WebSockets/SSE

## Next Actions (post-MVP)
- Analyst feedback loop → improves prompt over time
- Real ServiceNow smoke tests once instance URL is supplied
- Auto-attach a matching RCA/KB link inside the analysis for one-click drill down
