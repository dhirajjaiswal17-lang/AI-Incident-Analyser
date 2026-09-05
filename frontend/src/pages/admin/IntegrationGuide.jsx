import React from "react";
import { ExternalLink } from "lucide-react";

const Section = ({ title, children }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-6">
    <h2 className="text-xl font-bold tracking-tight text-cyan-300">{title}</h2>
    <div className="mt-4 space-y-3 text-sm text-slate-300 leading-relaxed">{children}</div>
  </div>
);
const Code = ({ children }) => (
  <pre className="mt-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3 overflow-x-auto text-xs font-mono text-cyan-200">{children}</pre>
);

export default function IntegrationGuide() {
  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Guide</div>
        <h1 className="mt-1 text-3xl lg:text-4xl font-extrabold tracking-tight flex items-center gap-3">
          <ExternalLink className="h-7 w-7 text-cyan-400" />
          Integration &amp; Deployment Guide
        </h1>
        <p className="mt-2 text-slate-400">Step-by-step configuration for ServiceNow, the AI provider and production deployment.</p>
      </div>

      <Section title="A. ServiceNow Setup">
        <ol className="list-decimal ml-5 space-y-2">
          <li>Obtain your ServiceNow instance URL (e.g. <code className="text-cyan-300">https://acme.service-now.com</code>).</li>
          <li>Ensure each analyst has a ServiceNow account with the <code className="text-cyan-300">itil</code> (read-only preferred) role and REST access to the <code className="text-cyan-300">incident</code> table.</li>
          <li>Open <b>Admin → ServiceNow</b> and enter the Instance URL. No shared service account is stored — each user authenticates with their own credentials.</li>
          <li>Configure the incident query — the active/open filter used by the app.</li>
          <li>Configure the list of fields to retrieve.</li>
          <li>Click <b>ServiceNow Login</b> in the sidebar and enter <i>your</i> ServiceNow username/password (encrypted at rest, never visible to admins).</li>
          <li>Click <b>Test Connection</b>. A green success indicates the app can reach ServiceNow with your credentials.</li>
          <li>End users are prompted for their own credentials the first time they open the incident list.</li>
        </ol>
        <Code>{`GET https://<instance>.service-now.com/api/now/table/incident?sysparm_query=active=true^stateNOT IN6,7,8&sysparm_limit=25`}</Code>
        <p className="text-slate-400">The Table API supports pagination via <code>sysparm_limit</code> and <code>sysparm_offset</code>, and filtering via <code>sysparm_query</code>. Fields returned are controlled via <code>sysparm_fields</code>.</p>
      </Section>

      <Section title="B. AI API Setup">
        <ol className="list-decimal ml-5 space-y-2">
          <li>Open <b>Admin → AI Configuration</b>.</li>
          <li>Select the Provider (OpenAI / Anthropic / Gemini) and Model.</li>
          <li>By default the <b>Emergent Universal LLM Key</b> is used — no key required.</li>
          <li>To use your own key, disable "Use Emergent Universal LLM Key" and paste your provider API key.</li>
          <li>Tune Temperature and Max Tokens if needed.</li>
          <li>Click <b>Test AI Connection</b>.</li>
        </ol>
        <p className="text-slate-400">The application sends: the selected incident summary + top matched historical incidents, KB and RCA entries — and asks the LLM for a strict-JSON structured analysis. Only the final analysis is returned to end users.</p>
      </Section>

      <Section title="C. Environment Variables">
        <p>Set these on your production server (never commit real values):</p>
        <Code>{`# Backend
MONGO_URL=mongodb://<host>:27017
DB_NAME=incident_analyzer
CORS_ORIGINS=https://your-app.example.com
EMERGENT_LLM_KEY=<provided-by-Emergent>
ADMIN_EMAILS=you@yourbank.com,admin@yourbank.com

# Frontend
REACT_APP_BACKEND_URL=https://your-app.example.com`}</Code>
        <p className="text-slate-400">ServiceNow and AI provider credentials are stored via the Admin UI and persisted server-side — never in the frontend.</p>
      </Section>

      <Section title="D. Deployment">
        <ol className="list-decimal ml-5 space-y-2">
          <li><b>Build frontend</b>: <code className="text-cyan-300">yarn build</code> inside <code>/app/frontend</code>.</li>
          <li><b>Backend</b>: served by supervisor on port <code>8001</code> — Kubernetes ingress routes <code>/api/*</code> to backend.</li>
          <li><b>Database</b>: MongoDB via <code>MONGO_URL</code>. Ensure it is reachable from backend.</li>
          <li><b>HTTPS</b>: obtain via your ingress or platform (Emergent Deploy → HTTPS by default).</li>
          <li><b>Domain</b>: point CNAME to platform provided host; update <code>REACT_APP_BACKEND_URL</code>.</li>
          <li><b>Health check</b>: <code>GET /api/health</code> returns <code>{'{"status":"ok"}'}</code>.</li>
          <li><b>Production testing</b>: sign in, load incidents, click Analyze — inspect Audit Logs.</li>
        </ol>
        <p className="text-slate-400">The application is production-ready and does not require any localhost service to run.</p>
      </Section>
    </div>
  );
}
