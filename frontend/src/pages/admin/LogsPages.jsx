import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { FileText, ScrollText, History } from "lucide-react";

export function AnalysisHistory({ endpoint = "/admin/analyses", title = "Analysis History" }) {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get(endpoint).then(r => setItems(r.data)); }, [endpoint]);
  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Log</div>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight flex items-center gap-3"><FileText className="h-7 w-7 text-cyan-400" />{title}</h1>
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/70 text-slate-400 text-xs uppercase tracking-wider">
            <tr><th className="px-4 py-3 text-left">Incident</th><th className="px-4 py-3 text-left">User</th><th className="px-4 py-3 text-left">Model</th><th className="px-4 py-3 text-left">Confidence</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Date</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {items.length === 0 && (<tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No records.</td></tr>)}
            {items.map(a => (
              <tr key={a.id} className="hover:bg-slate-900/50" data-testid={`analysis-row-${a.id}`}>
                <td className="px-4 py-3 font-mono text-cyan-300 text-xs">{a.incident_number}</td>
                <td className="px-4 py-3 text-slate-300">{a.user_email}</td>
                <td className="px-4 py-3 text-slate-300">{a.model}</td>
                <td className="px-4 py-3"><Badge className="bg-slate-800 border border-slate-700 text-slate-200">{a.confidence}</Badge></td>
                <td className="px-4 py-3"><Badge className={a.status === "success" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 border" : "bg-rose-500/15 text-rose-300 border-rose-500/40 border"}>{a.status}</Badge></td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{a.created_at?.slice(0,19).replace("T"," ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AuditLogs() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/admin/audit").then(r => setItems(r.data)); }, []);
  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Security</div>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight flex items-center gap-3"><ScrollText className="h-7 w-7 text-cyan-400" />Audit Logs</h1>
      <p className="mt-2 text-sm text-slate-400">Never contains passwords or API keys.</p>
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/70 text-slate-400 text-xs uppercase tracking-wider">
            <tr><th className="px-4 py-3 text-left">Time</th><th className="px-4 py-3 text-left">Action</th><th className="px-4 py-3 text-left">User</th><th className="px-4 py-3 text-left">Meta</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {items.length === 0 && (<tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No records.</td></tr>)}
            {items.map(a => (
              <tr key={a.id} className="hover:bg-slate-900/50">
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{a.ts?.slice(0,19).replace("T"," ")}</td>
                <td className="px-4 py-3"><Badge className="bg-slate-800 border border-slate-700 text-slate-200 font-mono text-[10px]">{a.action}</Badge></td>
                <td className="px-4 py-3 text-slate-300">{a.user_email}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs max-w-[560px] truncate">{JSON.stringify(a.meta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
