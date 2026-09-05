import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { SN_CREDS_SAVED } from "@/components/ServiceNowCredentialsDialog";

export function useIncident(sysId) {
  const [inc, setInc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needCreds, setNeedCreds] = useState(false);

  const load = useCallback(async () => {
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
  }, [sysId]);

  useEffect(() => {
    load();
    window.addEventListener(SN_CREDS_SAVED, load);
    return () => window.removeEventListener(SN_CREDS_SAVED, load);
  }, [load]);

  return { inc, loading, needCreds };
}

export function useAnalysisQuota() {
  const [quota, setQuota] = useState(null);
  const loadQuota = useCallback(() => {
    api.get("/analyses/quota").then(r => setQuota(r.data)).catch(e => console.error("Quota fetch failed:", e));
  }, []);
  useEffect(() => { loadQuota(); }, [loadQuota]);
  return { quota, loadQuota, exhausted: quota?.limit > 0 && quota.remaining === 0 };
}

export function useDemoMode() {
  const [demo, setDemo] = useState(true);
  useEffect(() => {
    api.get("/me/servicenow").then(r => setDemo(!r.data.configured)).catch(e => console.error("ServiceNow status fetch failed:", e));
  }, []);
  return demo;
}

export function useAnalyze(sysId, onDone) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);

  const analyze = useCallback(async () => {
    setAnalyzing(true); setResult(null);
    try {
      const { data } = await api.post(`/incidents/${sysId}/analyze`);
      setResult({ analysis: data.analysis, analysisId: data.analysis_id, evidence: data.evidence || null });
      toast.success("AI analysis complete");
    } catch (e) {
      const status = e?.response?.status;
      if (status === 429) toast.error(e.response.data.detail, { duration: 8000 });
      else if (status !== 428) toast.error(e?.response?.data?.detail || "Analysis failed", { duration: 8000 });
    } finally {
      setAnalyzing(false);
      onDone?.();
    }
  }, [sysId, onDone]);

  return { analyzing, result, analyze };
}
