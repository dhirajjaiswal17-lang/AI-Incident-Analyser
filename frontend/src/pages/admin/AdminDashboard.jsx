import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { Activity, BookOpen, ClipboardList, Layers, FileText, Users, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/dashboard").then(r => setData(r.data)); }, []);
  const stats = [
    { k: "users", label: "Users", icon: Users },
    { k: "analyses", label: "Analyses", icon: FileText },
    { k: "helpful_rate", label: "Helpful Rate", icon: ThumbsUp, fmt: (v, d) => v == null ? "—" : `${v}%`, sub: (d) => d?.feedback_total ? `${d.feedback_up}/${d.feedback_total} rated` : "no ratings yet" },
    { k: "kb", label: "KB Articles", icon: BookOpen },
    { k: "rca", label: "RCA Entries", icon: ClipboardList },
    { k: "applications", label: "Applications", icon: Layers },
    { k: "historical", label: "Historical", icon: Activity },
  ];
  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Command Center</div>
      <h1 className="mt-1 text-3xl lg:text-4xl font-extrabold tracking-tight">Admin Dashboard</h1>
      <p className="mt-2 text-slate-400 text-sm">Health of the AI Incident Analyzer platform.</p>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        {stats.map((s) => (
          <div key={s.k} className="rounded-xl border border-slate-800 bg-slate-950/60 p-5" data-testid={`stat-${s.k}`}>
            <s.icon className="h-5 w-5 text-cyan-400" />
            <div className="mt-3 text-2xl font-bold tracking-tight">{s.fmt ? s.fmt(data?.[s.k], data) : (data?.[s.k] ?? "—")}</div>
            <div className="mt-1 text-xs text-slate-400 uppercase tracking-wider">{s.label}</div>
            {s.sub && <div className="mt-0.5 text-[10px] text-slate-500">{s.sub(data)}</div>}
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-950/50">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="font-semibold">Recent AI Analyses</div>
          <Link to="/admin/analyses" className="text-xs text-cyan-300 hover:underline">View all →</Link>
        </div>
        <div className="divide-y divide-slate-800/80">
          {(data?.recent_analyses || []).length === 0 && (
            <div className="px-5 py-8 text-center text-slate-500 text-sm">No analyses yet.</div>
          )}
          {(data?.recent_analyses || []).map((a) => (
            <div key={a.id} className="px-5 py-3 flex items-center gap-4 text-sm">
              <span className="font-mono text-cyan-300 text-xs">{a.incident_number}</span>
              <span className="flex-1 truncate text-slate-300">{a.user_email}</span>
              <Badge className="bg-slate-800 border border-slate-700 text-slate-200 text-[10px]">{a.model}</Badge>
              <Badge className="bg-slate-800 border border-slate-700 text-slate-200 text-[10px]">{a.confidence}</Badge>
              <span className="text-xs text-slate-500 font-mono">{a.created_at?.slice(0,19).replace("T"," ")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
