import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { FileText, ScrollText, History, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight } from "lucide-react";
import { LinkedEvidence } from "@/components/LinkedEvidence";

function FeedbackCell({ fb }) {
  if (!fb) return <span className="text-slate-600 text-xs">—</span>;
  const up = fb.rating === "up";
  return (
    <div className="flex items-center gap-2 max-w-[260px]" title={fb.comment || ""}>
      <Badge className={`border ${up ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-rose-500/15 text-rose-300 border-rose-500/40"} gap-1`}>
        {up ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />} {up ? "Helpful" : "Off"}
      </Badge>
      {fb.comment && <span className="truncate text-xs text-slate-400">{fb.comment}</span>}
    </div>
  );
}

export function AnalysisHistory({ endpoint = "/admin/analyses", title = "Analysis History" }) {
  const [items, setItems] = useState([]);
  const [openId, setOpenId] = useState(null);
  useEffect(() => { api.get(endpoint).then(r => setItems(r.data)); }, [endpoint]);
  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Log</div>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight flex items-center gap-3"><FileText className="h-7 w-7 text-cyan-400" />{title}</h1>
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/70 text-slate-400 text-xs uppercase tracking-wider">
            <tr><th className="px-4 py-3 text-left">Incident</th><th className="px-4 py-3 text-left">User</th><th className="px-4 py-3 text-left">Model</th><th className="px-4 py-3 text-left">Confidence</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Feedback</th><th className="px-4 py-3 text-left">Date</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {items.length === 0 && (<tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No records.</td></tr>)}
            {items.map(a => (
              <React.Fragment key={a.id}>
              <tr className="hover:bg-slate-900/50 cursor-pointer" data-testid={`analysis-row-${a.id}`} onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                <td className="px-4 py-3 font-mono text-cyan-300 text-xs flex items-center gap-1.5">{openId === a.id ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}{a.incident_number}</td>
                <td className="px-4 py-3 text-slate-300">{a.user_email}</td>
                <td className="px-4 py-3 text-slate-300">{a.model}</td>
                <td className="px-4 py-3"><Badge className="bg-slate-800 border border-slate-700 text-slate-200">{a.confidence}</Badge></td>
                <td className="px-4 py-3"><Badge className={a.status === "success" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 border" : "bg-rose-500/15 text-rose-300 border-rose-500/40 border"}>{a.status}</Badge></td>
                <td className="px-4 py-3" data-testid={`analysis-feedback-${a.id}`}><FeedbackCell fb={a.feedback} /></td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{a.created_at?.slice(0,19).replace("T"," ")}</td>
              </tr>
              {openId === a.id && (
                <tr data-testid={`analysis-detail-${a.id}`}>
                  <td colSpan={7} className="px-4 py-4 bg-slate-900/40">
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Detail label="Likely root cause">{a.result?.likely_root_cause}</Detail>
                        <Detail label="Recommended immediate action">{a.result?.recommended_immediate_action}</Detail>
                      </div>
                      <LinkedEvidence evidence={a.evidence} />
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">{label}</div>
      <div className="mt-1.5 text-slate-200 leading-relaxed">{children || <span className="text-slate-500">—</span>}</div>
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
