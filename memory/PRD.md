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
- **RAG**: keyword scoring over Historical Incidents + KB + RCA (top-5 each) + past analyst feedback (top-3).
- **ServiceNow auth model**: Admin sets instance URL only; each user stores their OWN SN username/password (Fernet-encrypted, `CREDENTIALS_SECRET` in backend/.env) in `sn_credentials`. Missing → HTTP 428; rejected → HTTP 424 (502 is swallowed by ingress).

## Implementation Log
- 2026-02-05: v1.0 shipped.
  - Auth: Emergent Google OAuth; roles admin/end_user; first user auto-admin; ADMIN_EMAILS allowlist.
  - End User: `/incidents` list (search, priority filter, pagination) + `/incidents/:sysId` detail + Analyze.
  - Admin: dashboard, ServiceNow config + test, AI config + test, CRUD (Applications, KB, RCA, Historical), Analysis History, Audit Logs, Integration Guide.
  - Seeded demo: 8 active incidents (banking scenarios), 7 historical, 7 KB, 3 RCA, 7 applications.
  - Testing agent: 51/51 backend + 100% frontend pass.
- 2026-09-05: v1.1 — live ServiceNow + feedback + KB upload + rate limit (testing agent: 78/78 backend, frontend pass).
  - Real ServiceNow connected: `https://dev414250.service-now.com` (41 active incidents). URL normalizer strips `/api/now/...`.
  - Per-user SN credentials: `GET/PUT/DELETE /api/me/servicenow`, `POST /api/me/servicenow/test`; sidebar "ServiceNow Login" dialog auto-opens on 428; work_notes/comments stripped from list unless enabled.
  - Analyst feedback: `POST /api/analyses/{id}/feedback` (up/down + comment, owner-only); Feedback column in Analysis History; Helpful Rate on dashboard; injected into prompt as "PAST ANALYST FEEDBACK".
  - KB upload: `POST /api/admin/kb/upload` (PDF via pypdf / MD / TXT, ≤10MB) + drop zone on Admin → KB.
  - Rate limit: `rate_limit_per_hour` in AI config (default 10, 0 = unlimited, admins exempt, failed AI runs don't count); `GET /api/analyses/quota`; 429 with reset time; quota shown on incident detail.

## Deferred / Backlog
- P2: KB upload de-duplication by source_file; stream size check before buffering
- P2: Vector-based semantic RAG (embeddings)
- P2: Split server.py into APIRouters; migrate on_event → lifespan
- P3: Real-time updates via WebSockets/SSE

## Next Actions
- Auto-attach matching RCA/KB links inside the analysis for one-click drill down
- Feedback analytics page (helpful rate by model / application over time)
- Push analysis back to ServiceNow as a work note
