import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Activity, LogOut, ShieldCheck, LayoutDashboard, Database, BookOpen, Layers, Cpu, History, ScrollText, Settings, ExternalLink, ClipboardList, FileText, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ServiceNowCredentialsDialog, SN_CREDS_REQUIRED, SN_CREDS_SAVED } from "@/components/ServiceNowCredentialsDialog";
import { api } from "@/lib/api";

const linkBase = "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors";
const linkActive = ({ isActive }) => `${linkBase} ${isActive ? "bg-slate-800 text-white border border-slate-700" : ""}`;

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const [snOpen, setSnOpen] = useState(false);
  const [snStatus, setSnStatus] = useState(null);

  useEffect(() => {
    const refresh = () => api.get("/me/servicenow").then(r => setSnStatus(r.data)).catch(() => {});
    refresh();
    const onReq = () => setSnOpen(true);
    window.addEventListener(SN_CREDS_REQUIRED, onReq);
    window.addEventListener(SN_CREDS_SAVED, refresh);
    return () => { window.removeEventListener(SN_CREDS_REQUIRED, onReq); window.removeEventListener(SN_CREDS_SAVED, refresh); };
  }, []);

  const endUserNav = [
    { to: "/incidents", label: "Open Incidents", icon: Activity, testid: "nav-incidents" },
    { to: "/my-analysis", label: "My Analysis", icon: FileText, testid: "nav-my-analysis" },
  ];
  const adminNav = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, testid: "nav-admin-dashboard", end: true },
    { to: "/admin/historical", label: "Historical Incidents", icon: History, testid: "nav-historical" },
    { to: "/admin/kb", label: "Knowledge Base", icon: BookOpen, testid: "nav-kb" },
    { to: "/admin/rca", label: "RCA Repository", icon: ClipboardList, testid: "nav-rca" },
    { to: "/admin/applications", label: "Applications", icon: Layers, testid: "nav-applications" },
    { to: "/admin/servicenow", label: "ServiceNow", icon: Database, testid: "nav-servicenow" },
    { to: "/admin/ai", label: "AI Configuration", icon: Cpu, testid: "nav-ai" },
    { to: "/admin/analyses", label: "Analysis History", icon: FileText, testid: "nav-analyses" },
    { to: "/admin/audit", label: "Audit Logs", icon: ScrollText, testid: "nav-audit" },
    { to: "/admin/guide", label: "Integration Guide", icon: ExternalLink, testid: "nav-guide" },
  ];

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex">
      <aside className="w-64 shrink-0 border-r border-slate-800/80 bg-slate-950/60 backdrop-blur-md flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-cyan-500 to-indigo-500 flex items-center justify-center">
              <Activity className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight leading-none">Incident AI</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-1">Analyzer</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">End User</div>
          {endUserNav.map((it) => (
            <NavLink key={it.to} to={it.to} data-testid={it.testid} className={linkActive}>
              <it.icon className="h-4 w-4" /> {it.label}
            </NavLink>
          ))}
          <button onClick={() => setSnOpen(true)} data-testid="nav-sn-credentials" className={`${linkBase} w-full`}>
            <KeyRound className="h-4 w-4" /> ServiceNow Login
            <span className={`ml-auto h-2 w-2 rounded-full ${snStatus?.has_credentials ? "bg-emerald-400" : "bg-amber-400"}`} data-testid="sn-creds-indicator" />
          </button>
          {isAdmin && (
            <>
              <div className="mt-4 px-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">Admin</div>
              {adminNav.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} data-testid={it.testid} className={linkActive}>
                  <it.icon className="h-4 w-4" /> {it.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="border-t border-slate-800/80 p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-slate-700">
              <AvatarImage src={user?.picture} />
              <AvatarFallback className="bg-slate-800 text-slate-200 text-xs">
                {(user?.name || user?.email || "U").slice(0,1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate" data-testid="current-user-name">{user?.name || user?.email}</div>
              <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                <Badge variant="outline" className="bg-slate-800/60 border-slate-700 text-slate-300 text-[9px] px-1.5 py-0" data-testid="current-user-role">
                  {user?.role}
                </Badge>
              </div>
            </div>
            <Button size="icon" variant="ghost" data-testid="logout-btn" onClick={async () => { await logout(); navigate("/login"); }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
      <ServiceNowCredentialsDialog open={snOpen} onOpenChange={setSnOpen} />
    </div>
  );
}
