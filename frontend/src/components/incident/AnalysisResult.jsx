import React from "react";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, Wrench, GitBranch, TrendingUp } from "lucide-react";
import { AnalysisFeedback } from "@/components/AnalysisFeedback";
import { PostToServiceNow } from "@/components/PostToServiceNow";
import { LinkedEvidence } from "@/components/LinkedEvidence";

const CONFIDENCE_STYLE = {
  High: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Medium: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  Low: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

const SECTIONS = [
  { key: "likely_root_cause", title: "Likely Root Cause", testid: "rca-section", icon: AlertTriangle, note: "AI-assisted probable RCA — validate against logs & telemetry before confirmation." },
  { key: "business_impact", title: "Business Impact", testid: "impact-section", icon: TrendingUp },
  { key: "recommended_immediate_action", title: "Recommended Immediate Action", testid: "immediate-section", icon: Wrench },
  { key: "preventive_action", title: "Preventive Action", testid: "preventive-section", icon: GitBranch },
];

export function AnalysisResult({ analysis, analysisId, evidence, demo, hidePost = false }) {
  return (
    <div className="space-y-5">
      {SECTIONS.map(s => (
        <Section key={s.key} icon={<s.icon className="h-4 w-4" />} title={s.title} testid={s.testid}>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{analysis[s.key]}</p>
          {s.note && <p className="mt-3 text-[11px] uppercase tracking-[0.15em] text-amber-300/80">{s.note}</p>}
        </Section>
      ))}
      <ConfidenceCard analysis={analysis} />
      {analysisId && <LinkedEvidence evidence={evidence} />}
      {analysisId && !hidePost && (
        <div className="flex items-center justify-between gap-4 flex-wrap rounded-xl border border-slate-800 bg-slate-950/70 px-5 py-4" data-testid="analysis-actions">
          <div className="text-xs text-slate-400">Share this analysis with the ticket owner</div>
          <PostToServiceNow key={analysisId} analysisId={analysisId} demo={demo} />
        </div>
      )}
      {analysisId && <AnalysisFeedback key={analysisId} analysisId={analysisId} />}
    </div>
  );
}

function ConfidenceCard({ analysis }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 flex items-start gap-4" data-testid="confidence-section">
      <ShieldCheck className="h-5 w-5 text-cyan-400 mt-0.5" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="font-semibold">Confidence</div>
          <Badge className={`border ${CONFIDENCE_STYLE[analysis.confidence] || CONFIDENCE_STYLE.Medium}`} data-testid="confidence-badge">
            {analysis.confidence || "Medium"}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-slate-300">{analysis.confidence_explanation}</p>
      </div>
    </div>
  );
}

function Section({ icon, title, testid, children }) {
  return (
    <div data-testid={testid} className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">{icon} {title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
