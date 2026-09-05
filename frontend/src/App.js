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
import { CRUD_PAGES } from "@/lib/crudPages";
import FeedbackAnalytics from "@/pages/admin/FeedbackAnalytics";

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
        {Object.entries(CRUD_PAGES).map(([key, props]) => (
          <Route key={key} path={`/admin/${key}`} element={<Protected adminOnly><CrudPage {...props} /></Protected>} />
        ))}
        <Route path="/admin/analyses" element={<Protected adminOnly><AnalysisHistory /></Protected>} />
        <Route path="/admin/feedback" element={<Protected adminOnly><FeedbackAnalytics /></Protected>} />
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
