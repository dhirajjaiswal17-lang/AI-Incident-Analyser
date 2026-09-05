import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Zap, Play } from "lucide-react";
import { toast } from "sonner";

const errText = (e, fallback) => e?.response?.data?.detail || fallback;

function useAutoAnalyzeConfig() {
  const [cfg, setCfg] = useState(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/auto-analyze").then(r => setCfg(r.data)).catch(e => toast.error(errText(e, "Could not load auto-analyze settings")));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const { data } = await api.put("/admin/auto-analyze", { enabled: cfg.enabled, poll_minutes: cfg.poll_minutes, max_per_cycle: cfg.max_per_cycle });
      setCfg(c => ({ ...c, ...data }));
      toast.success(data.enabled ? `Auto-analyze enabled — checks every ${data.poll_minutes} min, up to ${data.max_per_cycle} P1s/cycle` : "Auto-analyze disabled");
    } catch (e) {
      if (e?.response?.status !== 428) toast.error(errText(e, "Save failed"));
      else toast.error(errText(e, "Configure the Resolved Incident Sync first"), { duration: 8000 });
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data } = await api.post("/admin/auto-analyze/run");
      if (data.ok) toast.success(`Checked ${data.fetched} P1s — analyzed ${data.analyzed} new${data.errors ? `, ${data.errors} errored` : ""}`);
      else toast.error(data.error || "Run failed", { duration: 8000 });
      load();
    } catch (e) { toast.error(errText(e, "Run failed")); }
    finally { setRunning(false); }
  };

  return { cfg, setCfg, running, save, runNow };
}

export function AutoAnalyzePanel() {
  const { cfg, setCfg, running, save, runNow } = useAutoAnalyzeConfig();
  if (!cfg) return null;
  return (
    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-6 space-y-5" data-testid="auto-analyze-panel">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" /> Auto-Analyze New P1s</div>
          <div className="text-xs text-slate-400 mt-1 max-w-xl">
            Continuously watches ServiceNow for new priority-1 (critical) incidents and runs the AI analysis automatically, so a root-cause draft is waiting the moment the on-call opens the ticket. Uses the same ServiceNow service account as the Resolved Incident Sync, and your current AI configuration (consumes credits per incident).
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Enabled</span>
          <Switch checked={cfg.enabled} onCheckedChange={v => setCfg({ ...cfg, enabled: v })} data-testid="auto-enabled-toggle" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-400">Check interval (minutes)</Label>
          <Input type="number" min={5} max={180} value={cfg.poll_minutes}
                 onChange={e => setCfg({ ...cfg, poll_minutes: parseInt(e.target.value || "15") })}
                 className="mt-1.5 bg-slate-900 border-slate-800" data-testid="auto-interval-input" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-400">Max P1s per cycle</Label>
          <Input type="number" min={1} max={50} value={cfg.max_per_cycle}
                 onChange={e => setCfg({ ...cfg, max_per_cycle: parseInt(e.target.value || "10") })}
                 className="mt-1.5 bg-slate-900 border-slate-800" data-testid="auto-max-input" />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={save} className="bg-cyan-600 hover:bg-cyan-500 text-white" data-testid="auto-save-btn">Save Auto-Analyze Settings</Button>
        <Button variant="outline" onClick={runNow} disabled={running} className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" data-testid="auto-run-btn">
          <Play className={`h-4 w-4 mr-2 ${running ? "animate-pulse" : ""}`} /> {running ? "Analyzing…" : "Run now"}
        </Button>
        <AutoLastResult last={cfg.last_result} />
      </div>
    </div>
  );
}

function AutoLastResult({ last }) {
  if (!last) return null;
  const badge = last.ok ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-rose-500/15 text-rose-300 border-rose-500/40";
  return (
    <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap" data-testid="auto-last-result">
      <Badge className={`border ${badge}`}>{last.ok ? "OK" : "Failed"}</Badge>
      <span className="font-mono">{last.ts?.slice(0, 16).replace("T", " ")} UTC · {last.trigger} · </span>
      {last.ok ? <span>checked {last.fetched} · {last.analyzed} analyzed{last.errors ? ` · ${last.errors} errored` : ""}</span> : <span className="text-rose-300">{last.error}</span>}
    </div>
  );
}
