import React, { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PenLine, Sparkles } from "lucide-react";
import { AnalysisResult } from "@/components/incident/AnalysisResult";
import { useAnalysisQuota } from "@/hooks/useIncident";

export default function ManualAnalysis() {
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const { quota, loadQuota, exhausted } = useAnalysisQuota();

  const canSubmit = shortDescription.trim().length > 0 && !analyzing && !exhausted;

  const analyze = async () => {
    if (!canSubmit) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const { data } = await api.post("/analyses/manual", {
        short_description: shortDescription.trim(),
        description: description.trim(),
      });
      setResult({ analysis: data.analysis, analysisId: data.analysis_id, evidence: data.evidence || null });
      toast.success("AI analysis complete");
    } catch (e) {
      const status = e?.response?.status;
      toast.error(e?.response?.data?.detail || "Analysis failed", { duration: status === 429 ? 8000 : 4000 });
    } finally {
      setAnalyzing(false);
      loadQuota();
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto" data-testid="manual-analysis-page">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">No ServiceNow needed</div>
        <h1 className="mt-1 text-3xl lg:text-4xl font-extrabold tracking-tight flex items-center gap-3">
          <PenLine className="h-7 w-7 text-cyan-400" /> Analyze My Issue
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Describe any issue in your own words. The AI correlates it with the internal RCA, Knowledge Base and
          historical incidents to produce a structured root cause, impact and action plan.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/50 p-5 h-fit">
          <div className="space-y-2">
            <Label htmlFor="short-desc" className="text-slate-300">Short Description <span className="text-rose-400">*</span></Label>
            <Input
              id="short-desc"
              data-testid="manual-short-description"
              placeholder="e.g. Payment API returning 500 errors intermittently"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100"
              disabled={analyzing}
            />
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor="desc" className="text-slate-300">Detailed Description</Label>
            <Textarea
              id="desc"
              data-testid="manual-description"
              placeholder="Add any details: when it started, affected users/services, error messages, recent changes…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="bg-slate-900 border-slate-700 text-slate-100 resize-y"
              disabled={analyzing}
            />
          </div>
          {exhausted && (
            <p className="mt-3 text-xs text-amber-300" data-testid="manual-quota-exhausted">
              Hourly analysis limit reached. Try again later.
            </p>
          )}
          {quota?.limit > 0 && !exhausted && (
            <p className="mt-3 text-xs text-slate-500" data-testid="manual-quota">
              {quota.remaining} of {quota.limit} analyses left this hour
            </p>
          )}
          <Button
            data-testid="manual-analyze-btn"
            onClick={analyze}
            disabled={!canSubmit}
            className="mt-4 w-full bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4 mr-2" /> {analyzing ? "Analyzing…" : "Run AI Analysis"}
          </Button>
        </div>

        <div className="lg:col-span-3">
          {analyzing && <AnalyzingState />}
          {!analyzing && !result && <EmptyState />}
          {!analyzing && result && (
            <div data-testid="manual-analysis-result">
              <AnalysisResult analysis={result.analysis} analysisId={result.analysisId} evidence={result.evidence} hidePost />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-10 text-center h-full flex flex-col items-center justify-center" data-testid="manual-empty-state">
      <Sparkles className="h-8 w-8 text-cyan-400" />
      <h3 className="mt-3 font-semibold text-lg">Your analysis will appear here</h3>
      <p className="mt-2 text-sm text-slate-400 max-w-md">
        Fill in the issue on the left and run the analysis to get an AI-assisted root cause, business impact and
        preventive action.
      </p>
    </div>
  );
}

function AnalyzingState() {
  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-10 text-center" data-testid="manual-analyzing-state">
      <div className="mx-auto h-10 w-10 rounded-full border-2 border-cyan-400/60 border-t-transparent animate-spin" />
      <h3 className="mt-4 font-semibold text-lg text-cyan-200">Correlating internal knowledge & running LLM…</h3>
      <p className="mt-2 text-sm text-slate-400">This typically takes 5–20 seconds.</p>
    </div>
  );
}
