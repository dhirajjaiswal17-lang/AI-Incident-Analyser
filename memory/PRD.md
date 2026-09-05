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

- 2026-09-05: v1.2 — Feedback Analytics, ServiceNow write-back, bulk import (testing agent: 33/33 new + 78/78 regression, frontend pass).
  - `GET /api/admin/feedback/analytics?days=` → helpful rate, coverage, daily trend, by model/application/confidence, negative comments; page `/admin/feedback` (recharts).
  - `POST /api/analyses/{id}/post-to-servicenow` → PATCH work_notes on the incident with the caller's SN creds (owner/admin; 400 in demo mode; 428 no creds). Verified live on INC0010002. Button on incident detail.
  - `POST /api/admin/{historical|kb|rca}/import` — JSON array / {items} / multipart .json/.csv; flexible aliases (incident_id, service, description, root_cause, resolution, confidence→tag); upsert by number/title via bulk_write (1000 rows ≈ 0.8s; cap 20000, overflow reported in errors). "Bulk Import" dialog on the three admin pages. User's INC001–INC003 imported.
  - RAG: token stemming, weighted title/application match, list caps 20000; prompt instructs verbatim quoting of matched internal resolutions with source citation.
  - CRUD DELETE now 404s on unknown id; admin tables cap render at 200 rows with count footer.

- 2026-09-05: v1.3 — Resolved-incident sync + Linked Evidence (testing agent: 21/21 new + 111/111 regression, frontend pass).
  - `GET/PUT /api/admin/servicenow/sync`, `POST /api/admin/servicenow/sync/run`; asyncio scheduler runs daily at `hour_utc` with the binding admin's SN creds; maps close_notes→resolution, close_code→root_cause, tag `source:servicenow-sync`. Live: 23 resolved incidents synced from dev414250; enabled nightly 02:00 UTC, 365-day lookback, bound to dhirajjaiswal17@gmail.com.
  - Analyze response + record now carry `evidence` (historical/kb/rca ids+titles+scores); `GET /api/evidence/{kind}/{id}` read-only for any user. LinkedEvidence panel on incident detail and expandable rows in Analysis History / My Analysis with drill-down dialog.
  - Owner dhirajjaiswal17@gmail.com promoted to admin (ADMIN_EMAILS in backend/.env).

## Deferred / Backlog
- P2: KB upload de-duplication by source_file; stream size check before buffering
- P2: Vector-based semantic RAG (embeddings)
- P2: Split server.py into APIRouters; migrate on_event → lifespan
- P3: Real-time updates via WebSockets/SSE

## Next Actions
- Export analytics / analysis history as CSV
- Similar-incidents panel before Analyze
- Migrate on_event → lifespan
