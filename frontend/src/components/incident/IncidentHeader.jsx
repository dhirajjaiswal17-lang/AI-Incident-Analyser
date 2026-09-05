import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Gauge } from "lucide-react";
import { val } from "@/lib/format";

export function IncidentHeader({ inc, analyzing, exhausted, quota, onAnalyze }) {
  return (
    <div className="mt-4 flex items-start justify-between gap-6 flex-wrap">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-mono">{val(inc.number)}</div>
        <h1 className="mt-2 text-2xl lg:text-3xl font-bold tracking-tight max-w-3xl" data-testid="incident-title">
          {val(inc.short_description)}
        </h1>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge className="bg-slate-800 border border-slate-700 text-slate-200">{val(inc.cmdb_ci) || "Unassigned CI"}</Badge>
          <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/40 border">{val(inc.priority)}</Badge>
          <Badge className="bg-slate-800 border border-slate-700 text-slate-200">State: {val(inc.state)}</Badge>
          <Badge className="bg-slate-800 border border-slate-700 text-slate-200">{val(inc.assignment_group)}</Badge>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <Button
          data-testid="analyze-incident-btn"
          disabled={analyzing || exhausted}
          onClick={onAnalyze}
          className="bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold h-11 px-6 shadow-lg shadow-cyan-500/20"
        >
          <Sparkles className={`h-4 w-4 mr-2 ${analyzing ? "animate-spin" : ""}`} />
          {analyzing ? "Analyzing…" : "Analyze Incident"}
        </Button>
        {quota?.limit > 0 && (
          <div className={`flex items-center gap-1.5 text-[11px] font-mono ${exhausted ? "text-rose-300" : "text-slate-400"}`} data-testid="analyze-quota">
            <Gauge className="h-3 w-3" /> {quota.remaining} of {quota.limit} analyses left this hour
          </div>
        )}
      </div>
    </div>
  );
}

const DETAIL_FIELDS = [
  ["Number", "number", true], ["Category", "category"], ["Subcategory", "subcategory"], ["Priority", "priority"],
  ["Impact", "impact"], ["Urgency", "urgency"], ["Assignment Group", "assignment_group"], ["State", "state"],
  ["Opened", "opened_at", true], ["Last Updated", "sys_updated_on", true],
];

export function IncidentSidebar({ inc }) {
  return (
    <div className="lg:col-span-1 space-y-4">
      <Card title="Incident Details">
        {DETAIL_FIELDS.map(([label, key, mono]) => <KV key={key} k={label} v={val(inc[key])} mono={mono} />)}
      </Card>
      <Card title="Description">
        <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{val(inc.description) || "—"}</div>
      </Card>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">{title}</div>
      <div className="mt-3 space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ k, v, mono }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-slate-400 shrink-0">{k}</span>
      <span className={`text-right text-slate-200 ${mono ? "font-mono text-xs" : ""}`}>{v || "—"}</span>
    </div>
  );
}
