import React from "react";
import { useLocation, Navigate, BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import "@/App.css";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import AuthCallback from "@/pages/AuthCallback";
import Login from "@/pages/Login";
import AppShell from "@/layout/AppShell";
import OpenIncidents from "@/pages/OpenIncidents";
import IncidentDetail from "@/pages/IncidentDetail";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import ServiceNowConfig from "@/pages/admin/ServiceNowConfig";
import AIConfig from "@/pages/admin/AIConfig";
import CrudPage from "@/pages/admin/CrudPage";
import { AnalysisHistory, AuditLogs } from "@/pages/admin/LogsPages";
import IntegrationGuide from "@/pages/admin/IntegrationGuide";
import { KBUploadZone } from "@/components/KBUploadZone";
import { BookOpen, ClipboardList, Layers, History } from "lucide-react";

function Protected({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/incidents" replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();
  // Handle OAuth return via URL fragment BEFORE any route guards
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route element={<Protected><AppShell /></Protected>}>
        <Route path="/" element={<Navigate to="/incidents" replace />} />
        <Route path="/incidents" element={<OpenIncidents />} />
        <Route path="/incidents/:sysId" element={<IncidentDetail />} />
        <Route path="/my-analysis" element={<AnalysisHistory endpoint="/analyses/mine" title="My Analysis" />} />

        {/* Admin routes */}
        <Route path="/admin" element={<Protected adminOnly><AdminDashboard /></Protected>} />
        <Route path="/admin/servicenow" element={<Protected adminOnly><ServiceNowConfig /></Protected>} />
        <Route path="/admin/ai" element={<Protected adminOnly><AIConfig /></Protected>} />
        <Route path="/admin/applications" element={<Protected adminOnly>
          <CrudPage title="Applications" subtitle="Business applications monitored." icon={Layers} endpoint="applications" testidPrefix="app"
            schema={[
              { key: "name", label: "Name" },
              { key: "tier", label: "Tier" },
              { key: "owner", label: "Owner" },
              { key: "sla_minutes", label: "SLA Minutes", type: "number" },
            ]}
            listColumns={[{key:"name",label:"Name"},{key:"tier",label:"Tier"},{key:"owner",label:"Owner"},{key:"sla_minutes",label:"SLA (min)"}]}
          />
        </Protected>} />
        <Route path="/admin/kb" element={<Protected adminOnly>
          <CrudPage title="Knowledge Base" subtitle="Runbooks and playbooks used as AI grounding." icon={BookOpen} endpoint="kb" testidPrefix="kb" extra={KBUploadZone}
            schema={[
              { key: "title", label: "Title" },
              { key: "application", label: "Application" },
              { key: "tags", label: "Tags (comma separated)", type: "tags" },
              { key: "content", label: "Content", type: "textarea", rows: 8 },
            ]}
            listColumns={[{key:"title",label:"Title"},{key:"application",label:"Application"},{key:"tags",label:"Tags"}]}
          />
        </Protected>} />
        <Route path="/admin/rca" element={<Protected adminOnly>
          <CrudPage title="RCA Repository" subtitle="Historical root-cause analyses correlated with incidents." icon={ClipboardList} endpoint="rca" testidPrefix="rca"
            schema={[
              { key: "title", label: "Title" },
              { key: "incident_number", label: "Incident Number" },
              { key: "application", label: "Application" },
              { key: "tags", label: "Tags", type: "tags" },
              { key: "root_cause", label: "Root Cause", type: "textarea", rows: 5 },
              { key: "resolution", label: "Resolution", type: "textarea", rows: 5 },
            ]}
            listColumns={[{key:"title",label:"Title"},{key:"application",label:"Application"},{key:"incident_number",label:"Incident"}]}
          />
        </Protected>} />
        <Route path="/admin/historical" element={<Protected adminOnly>
          <CrudPage title="Historical Incidents" subtitle="Resolved incidents used for pattern matching." icon={History} endpoint="historical" testidPrefix="hist"
            schema={[
              { key: "number", label: "Incident Number" },
              { key: "short_description", label: "Short Description" },
              { key: "application", label: "Application" },
              { key: "priority", label: "Priority" },
              { key: "tags", label: "Tags", type: "tags" },
              { key: "description", label: "Description", type: "textarea", rows: 4 },
              { key: "root_cause", label: "Root Cause", type: "textarea", rows: 4 },
              { key: "resolution", label: "Resolution", type: "textarea", rows: 4 },
              { key: "resolved_at", label: "Resolved At" },
            ]}
            listColumns={[{key:"number",label:"Number"},{key:"short_description",label:"Description"},{key:"application",label:"Application"},{key:"priority",label:"Priority"}]}
          />
        </Protected>} />
        <Route path="/admin/analyses" element={<Protected adminOnly><AnalysisHistory /></Protected>} />
        <Route path="/admin/audit" element={<Protected adminOnly><AuditLogs /></Protected>} />
        <Route path="/admin/guide" element={<Protected adminOnly><IntegrationGuide /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/incidents" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </AuthProvider>
  );
}
