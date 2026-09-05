import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CalendarClock } from "lucide-react";
import { toast } from "sonner";

const pad = (n) => String(n).padStart(2, "0");
const errText = (e, fallback) => e?.response?.data?.detail || fallback;

function useSyncConfig() {
  const [cfg, setCfg] = useState(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/servicenow/sync").then(r => setCfg(r.data)).catch(e => toast.error(errText(e, "Could not load sync settings")));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const { data } = await api.put("/admin/servicenow/sync", { enabled: cfg.enabled, hour_utc: cfg.hour_utc, lookback_days: cfg.lookback_days });
      setCfg(c => ({ ...c, ...data }));
      toast.success(data.enabled ? `Nightly sync enabled — runs at ${pad(data.hour_utc)}:00 UTC with ${data.sync_user_email}` : "Nightly sync disabled");
    } catch (e) { toast.error(errText(e, "Save failed")); }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data } = await api.post("/admin/servicenow/sync/run");
      if (data.ok) toast.success(`Synced ${data.fetched} resolved incidents — ${data.inserted} new, ${data.updated} updated`);
      else toast.error(data.error || "Sync failed", { duration: 8000 });
      load();
    } catch (e) { if (e?.response?.status !== 428) toast.error(errText(e, "Sync failed")); }
    finally { setRunning(false); }
  };

  return { cfg, setCfg, running, save, runNow };
}

export function ResolvedSyncPanel() {
  const { cfg, setCfg, running, save, runNow } = useSyncConfig();
  if (!cfg) return null;
  return (
    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-6 space-y-5" data-testid="sync-panel">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-cyan-400" /> Resolved Incident Sync</div>
          <div className="text-xs text-slate-400 mt-1 max-w-xl">
            Nightly pull of resolved/closed incidents (close notes → resolution, close code → root cause) into Historical Incidents so the AI learns from every fix. Runs with the ServiceNow credentials of the admin who saves these settings.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Enabled</span>
          <Switch checked={cfg.enabled} onCheckedChange={v => setCfg({ ...cfg, enabled: v })} data-testid="sync-enabled-toggle" />
        </div>
      </div>
      <SyncSettingsFields cfg={cfg} setCfg={setCfg} />
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={save} className="bg-cyan-600 hover:bg-cyan-500 text-white" data-testid="sync-save-btn">Save Sync Settings</Button>
        <Button variant="outline" onClick={runNow} disabled={running} className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" data-testid="sync-run-btn">
          <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} /> {running ? "Syncing…" : "Sync now"}
        </Button>
        <SyncLastResult last={cfg.last_result} />
      </div>
    </div>
  );
}

function SyncSettingsFields({ cfg, setCfg }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <Label className="text-xs uppercase tracking-wider text-slate-400">Run at (hour, UTC)</Label>
        <Input type="number" min={0} max={23} value={cfg.hour_utc} onChange={e => setCfg({ ...cfg, hour_utc: parseInt(e.target.value || "0") })} className="mt-1.5 bg-slate-900 border-slate-800" data-testid="sync-hour-input" />
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-slate-400">Lookback window (days)</Label>
        <Input type="number" min={1} max={365} value={cfg.lookback_days} onChange={e => setCfg({ ...cfg, lookback_days: parseInt(e.target.value || "1") })} className="mt-1.5 bg-slate-900 border-slate-800" data-testid="sync-lookback-input" />
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-slate-400">Sync account</Label>
        <div className="mt-1.5 h-10 flex items-center text-sm text-slate-300 font-mono truncate" data-testid="sync-account">{cfg.sync_user_email || "— not set (save to bind your account)"}</div>
      </div>
    </div>
  );
}

function SyncLastResult({ last }) {
  if (!last) return null;
  const badge = last.ok ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-rose-500/15 text-rose-300 border-rose-500/40";
  return (
    <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap" data-testid="sync-last-result">
      <Badge className={`border ${badge}`}>{last.ok ? "OK" : "Failed"}</Badge>
      <span className="font-mono"> {last.ts?.slice(0, 16).replace("T", " ")} UTC · {last.trigger} · </span>
      {last.ok ? <span>fetched {last.fetched} · {last.inserted} new · {last.updated} updated</span> : <span className="text-rose-300">{last.error}</span>}
    </div>
  );
}
