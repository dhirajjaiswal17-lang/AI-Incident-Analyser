import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { BarChart3, ThumbsUp, ThumbsDown, Target, AlertOctagon } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const RANGES = [7, 30, 90];
const CHART_MARGIN = { top: 5, right: 10, left: -20, bottom: 0 };
const AXIS_TICK = { fill: "#64748b", fontSize: 10 };
const RATE_DOMAIN = [0, 100];
const TOOLTIP_STYLE = { background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 };
const TOOLTIP_LABEL = { color: "#cbd5e1" };
const shortDate = (d) => d.slice(5);

export default function FeedbackAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);

  useEffect(() => { setData(null); api.get("/admin/feedback/analytics", { params: { days } }).then(r => setData(r.data)); }, [days]);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto" data-testid="feedback-analytics-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Quality</div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight flex items-center gap-3"><BarChart3 className="h-7 w-7 text-cyan-400" />Feedback Analytics</h1>
          <p className="mt-2 text-sm text-slate-400">Where the AI is trusted — and where analysts push back. Rated analyses only.</p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 p-1 text-xs">
          {RANGES.map(r => (
            <button key={r} data-testid={`range-${r}`} onClick={() => setDays(r)}
                    className={`px-3 py-1 rounded ${days === r ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>{r}d</button>
          ))}
        </div>
      </div>

      {!data ? <div className="mt-10 text-slate-400">Loading…</div> : (
        <>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat testid="fa-helpful-rate" icon={ThumbsUp} label="Helpful rate" value={data.helpful_rate == null ? "—" : `${data.helpful_rate}%`} sub={`${data.up} helpful · ${data.down} off`} tone={data.helpful_rate == null ? "" : data.helpful_rate >= 70 ? "text-emerald-300" : data.helpful_rate >= 40 ? "text-amber-300" : "text-rose-300"} />
            <Stat testid="fa-rated" icon={Target} label="Rated analyses" value={data.rated} sub={`of ${data.total_analyses} in ${data.days}d`} />
            <Stat testid="fa-coverage" icon={BarChart3} label="Feedback coverage" value={data.coverage == null ? "—" : `${data.coverage}%`} sub="analyses that received a rating" />
            <Stat testid="fa-down" icon={ThumbsDown} label="Off-the-mark" value={data.down} sub="analyst corrections captured" tone={data.down ? "text-rose-300" : ""} />
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-5" data-testid="fa-trend">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Daily trend — rated volume &amp; helpful rate</div>
            <div className="mt-4 h-56 min-h-[224px] w-full">
              <ResponsiveContainer width="100%" height={224} minWidth={0}>
                <ComposedChart data={data.trend} margin={CHART_MARGIN}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS_TICK} tickFormatter={shortDate} interval="preserveStartEnd" />
                  <YAxis yAxisId="l" tick={AXIS_TICK} allowDecimals={false} />
                  <YAxis yAxisId="r" orientation="right" domain={RATE_DOMAIN} tick={AXIS_TICK} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} />
                  <Bar yAxisId="l" dataKey="up" stackId="a" fill="#10b981" name="Helpful" />
                  <Bar yAxisId="l" dataKey="total" stackId="b" fill="#334155" name="Rated" opacity={0.35} />
                  <Line yAxisId="r" type="monotone" dataKey="rate" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls name="Helpful %" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Breakdown title="By model" rows={data.by_model} testid="fa-by-model" />
            <Breakdown title="By application" rows={data.by_application} testid="fa-by-application" />
            <Breakdown title="By AI confidence" rows={data.by_confidence} testid="fa-by-confidence" />
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50" data-testid="fa-negatives">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2 font-semibold"><AlertOctagon className="h-4 w-4 text-rose-400" /> Analyst corrections (off-the-mark)</div>
            {data.negatives.length === 0 && <div className="px-5 py-8 text-center text-slate-500 text-sm">No negative feedback in this window.</div>}
            <div className="divide-y divide-slate-800/80">
              {data.negatives.map(n => (
                <div key={n.analysis_id} className="px-5 py-4 text-sm" data-testid={`fa-negative-${n.analysis_id}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-cyan-300 text-xs">{n.incident_number}</span>
                    <Badge className="bg-slate-800 border border-slate-700 text-slate-200 text-[10px]">{n.application}</Badge>
                    <Badge className="bg-slate-800 border border-slate-700 text-slate-200 text-[10px]">{n.model}</Badge>
                    <span className="ml-auto text-[11px] text-slate-500 font-mono">{n.ts?.slice(0, 16).replace("T", " ")} · {n.by}</span>
                  </div>
                  {n.comment ? <p className="mt-2 text-rose-200/90">“{n.comment}”</p> : <p className="mt-2 text-slate-500 italic">No comment left.</p>}
                  <p className="mt-1.5 text-xs text-slate-500 line-clamp-2"><span className="text-slate-400">AI said:</span> {n.ai_root_cause}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, tone = "", testid }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5" data-testid={testid}>
      <Icon className="h-5 w-5 text-cyan-400" />
      <div className={`mt-3 text-2xl font-bold tracking-tight ${tone}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}

function Breakdown({ title, rows, testid }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-5" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">{title}</div>
      {rows.length === 0 && <div className="mt-4 text-sm text-slate-500">No rated analyses.</div>}
      <div className="mt-4 space-y-3">
        {rows.map(r => {
          const pct = r.rate ?? 0;
          const color = r.rate == null ? "bg-slate-700" : r.rate >= 70 ? "bg-emerald-500" : r.rate >= 40 ? "bg-amber-500" : "bg-rose-500";
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between text-sm gap-3">
                <span className="truncate text-slate-200">{r.key}</span>
                <span className="shrink-0 font-mono text-xs text-slate-400">{r.up}/{r.total} · <span className="text-slate-200">{r.rate == null ? "—" : `${r.rate}%`}</span></span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className={`h-full ${color} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
