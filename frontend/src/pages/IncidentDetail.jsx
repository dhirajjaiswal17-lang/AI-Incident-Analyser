import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles, ShieldCheck, AlertTriangle, Wrench, GitBranch, TrendingUp, KeyRound, Gauge } from "lucide-react";
import { toast } from "sonner";
import { AnalysisFeedback } from "@/components/AnalysisFeedback";
import { PostToServiceNow } from "@/components/PostToServiceNow";
import { LinkedEvidence } from "@/components/LinkedEvidence";
import { SimilarIncidents } from "@/components/SimilarIncidents";
import { openSNCredentials, SN_CREDS_SAVED } from "@/components/ServiceNowCredentialsDialog";

function val(v) {
  if (v == null) return "";
  if (typeof v === "object") return v.display_value || v.value || "";
  return String(v);
}

const confidenceStyle = {
  High: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Medium: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  Low: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

export default function IncidentDetail() {
  const { sysId } = useParams();
  const nav = useNavigate();
  const [inc, setInc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [quota, setQuota] = useState(null);
  const [needCreds, setNeedCreds] = useState(false);
  const [demo, setDemo] = useState(true);

  const loadQuota = () => api.get("/analyses/quota").then(r => setQuota(r.data)).catch(() => {});

  useEffect(() => {
    api.get("/me/servicenow").then(r => setDemo(!r.data.configured)).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true); setNeedCreds(false);
      try {
        const { data } = await api.get(`/incidents/${sysId}`);
        setInc(data);
      } catch (e) {
        if (e?.response?.status === 428) setNeedCreds(true);
        else toast.error(e?.response?.data?.detail || "Failed to load incident");
      } finally {
        setLoading(false);
      }
    };
    load(); loadQuota();
    window.addEventListener(SN_CREDS_SAVED, load);
    return () => window.removeEventListener(SN_CREDS_SAVED, load);
  }, [sysId]);

  const analyze = async () => {
    setAnalyzing(true); setAnalysis(null); setAnalysisId(null); setEvidence(null);
    try {
      const { data } = await api.post(`/incidents/${sysId}/analyze`);
      setAnalysis(data.analysis);
      setAnalysisId(data.analysis_id);
      setEvidence(data.evidence || null);
      toast.success("AI analysis complete");
    } catch (e) {
      if (e?.response?.status === 429) toast.error(e.response.data.detail, { duration: 8000 });
      else if (e?.response?.status !== 428) toast.error(e?.response?.data?.detail || "Analysis failed");
    } finally {
      setAnalyzing(false); loadQuota();
    }
  };

  if (loading) return <div className="p-10 text-slate-400">Loading incident…</div>;
  if (needCreds) return (
    <div className="p-10 max-w-lg mx-auto text-center" data-testid="incident-needs-creds">
      <KeyRound className="h-8 w-8 text-amber-400 mx-auto" />
      <h2 className="mt-3 font-semibold text-lg">ServiceNow login required</h2>
      <p className="mt-2 text-sm text-slate-400">Enter your ServiceNow username and password to load this incident.</p>
      <Button onClick={openSNCredentials} className="mt-4 bg-cyan-600 hover:bg-cyan-500 text-white" data-testid="incident-open-creds-btn">Enter credentials</Button>
    </div>
  );
  if (!inc) return <div className="p-10 text-slate-400">Incident not found</div>;
  const exhausted = quota?.limit > 0 && quota.remaining === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <Button variant="ghost" data-testid="back-btn" onClick={() => nav(-1)} className="text-slate-300 -ml-3">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Incidents
      </Button>

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
            onClick={analyze}
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

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card title="Incident Details">
            <KV k="Number" v={val(inc.number)} mono />
            <KV k="Category" v={val(inc.category)} />
            <KV k="Subcategory" v={val(inc.subcategory)} />
            <KV k="Priority" v={val(inc.priority)} />
            <KV k="Impact" v={val(inc.impact)} />
            <KV k="Urgency" v={val(inc.urgency)} />
            <KV k="Assignment Group" v={val(inc.assignment_group)} />
            <KV k="State" v={val(inc.state)} />
            <KV k="Opened" v={val(inc.opened_at)} mono />
            <KV k="Last Updated" v={val(inc.sys_updated_on)} mono />
          </Card>

          <Card title="Description">
            <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{val(inc.description) || "—"}</div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {!analysis && !analyzing && (
            <div className="space-y-5">
              <SimilarIncidents sysId={sysId} />
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center">
                <Sparkles className="h-8 w-8 text-cyan-400 mx-auto" />
                <h3 className="mt-3 font-semibold text-lg">Run AI Analysis</h3>
                <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">
                  Correlates this incident with internal RCA, KB and historical patterns to produce
                  a structured root cause, impact and action plan.
                </p>
              </div>
            </div>
          )}

          {analyzing && (
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-10 text-center">
              <div className="mx-auto h-10 w-10 rounded-full border-2 border-cyan-400/60 border-t-transparent animate-spin" />
              <h3 className="mt-4 font-semibold text-lg text-cyan-200">Correlating internal knowledge & running LLM…</h3>
              <p className="mt-2 text-sm text-slate-400">This typically takes 5–20 seconds.</p>
            </div>
          )}

          {analysis && (
            <div className="space-y-5">
              <Section icon={<AlertTriangle className="h-4 w-4" />} title="Likely Root Cause" testid="rca-section">
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{analysis.likely_root_cause}</p>
                <p className="mt-3 text-[11px] uppercase tracking-[0.15em] text-amber-300/80">AI-assisted probable RCA — validate against logs & telemetry before confirmation.</p>
              </Section>
              <Section icon={<TrendingUp className="h-4 w-4" />} title="Business Impact" testid="impact-section">
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{analysis.business_impact}</p>
              </Section>
              <Section icon={<Wrench className="h-4 w-4" />} title="Recommended Immediate Action" testid="immediate-section">
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{analysis.recommended_immediate_action}</p>
              </Section>
              <Section icon={<GitBranch className="h-4 w-4" />} title="Preventive Action" testid="preventive-section">
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{analysis.preventive_action}</p>
              </Section>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 flex items-start gap-4" data-testid="confidence-section">
                <ShieldCheck className="h-5 w-5 text-cyan-400 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">Confidence</div>
                    <Badge className={`border ${confidenceStyle[analysis.confidence] || confidenceStyle.Medium}`} data-testid="confidence-badge">
                      {analysis.confidence || "Medium"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{analysis.confidence_explanation}</p>
                </div>
              </div>
              {analysisId && <LinkedEvidence evidence={evidence} />}
              {analysisId && (
                <div className="flex items-center justify-between gap-4 flex-wrap rounded-xl border border-slate-800 bg-slate-950/70 px-5 py-4" data-testid="analysis-actions">
                  <div className="text-xs text-slate-400">Share this analysis with the ticket owner</div>
                  <PostToServiceNow key={analysisId} analysisId={analysisId} demo={demo} />
                </div>
              )}
              {analysisId && <AnalysisFeedback key={analysisId} analysisId={analysisId} />}
            </div>
          )}
        </div>
      </div>
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
function Section({ icon, title, testid, children }) {
  return (
    <div data-testid={testid} className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
        {icon} {title}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
