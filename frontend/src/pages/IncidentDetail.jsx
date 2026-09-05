import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, KeyRound } from "lucide-react";
import { SimilarIncidents } from "@/components/SimilarIncidents";
import { openSNCredentials } from "@/components/ServiceNowCredentialsDialog";
import { IncidentHeader, IncidentSidebar } from "@/components/incident/IncidentHeader";
import { AnalysisResult } from "@/components/incident/AnalysisResult";
import { useIncident, useAnalysisQuota, useDemoMode, useAnalyze } from "@/hooks/useIncident";

export default function IncidentDetail() {
  const { sysId } = useParams();
  const nav = useNavigate();
  const { inc, loading, needCreds } = useIncident(sysId);
  const { quota, loadQuota, exhausted } = useAnalysisQuota();
  const demo = useDemoMode();
  const { analyzing, result, analyze } = useAnalyze(sysId, loadQuota);

  if (loading) return <div className="p-10 text-slate-400">Loading incident…</div>;
  if (needCreds) return <NeedsCredentials />;
  if (!inc) return <div className="p-10 text-slate-400">Incident not found</div>;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <Button variant="ghost" data-testid="back-btn" onClick={() => nav(-1)} className="text-slate-300 -ml-3">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Incidents
      </Button>
      <IncidentHeader inc={inc} analyzing={analyzing} exhausted={exhausted} quota={quota} onAnalyze={analyze} />
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <IncidentSidebar inc={inc} />
        <div className="lg:col-span-2">
          {!result && !analyzing && <PreAnalysis sysId={sysId} demo={demo} />}
          {analyzing && <AnalyzingState />}
          {result && <AnalysisResult analysis={result.analysis} analysisId={result.analysisId} evidence={result.evidence} demo={demo} />}
        </div>
      </div>
    </div>
  );
}

function NeedsCredentials() {
  return (
    <div className="p-10 max-w-lg mx-auto text-center" data-testid="incident-needs-creds">
      <KeyRound className="h-8 w-8 text-amber-400 mx-auto" />
      <h2 className="mt-3 font-semibold text-lg">ServiceNow login required</h2>
      <p className="mt-2 text-sm text-slate-400">Enter your ServiceNow username and password to load this incident.</p>
      <Button onClick={openSNCredentials} className="mt-4 bg-cyan-600 hover:bg-cyan-500 text-white" data-testid="incident-open-creds-btn">Enter credentials</Button>
    </div>
  );
}

function PreAnalysis({ sysId, demo }) {
  return (
    <div className="space-y-5">
      <SimilarIncidents sysId={sysId} demo={demo} />
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center">
        <Sparkles className="h-8 w-8 text-cyan-400 mx-auto" />
        <h3 className="mt-3 font-semibold text-lg">Run AI Analysis</h3>
        <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">
          Correlates this incident with internal RCA, KB and historical patterns to produce
          a structured root cause, impact and action plan.
        </p>
      </div>
    </div>
  );
}

function AnalyzingState() {
  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-10 text-center">
      <div className="mx-auto h-10 w-10 rounded-full border-2 border-cyan-400/60 border-t-transparent animate-spin" />
      <h3 className="mt-4 font-semibold text-lg text-cyan-200">Correlating internal knowledge & running LLM…</h3>
      <p className="mt-2 text-sm text-slate-400">This typically takes 5–20 seconds.</p>
    </div>
  );
}
