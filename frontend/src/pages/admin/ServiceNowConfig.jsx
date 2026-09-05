import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Database, PlugZap } from "lucide-react";

export default function ServiceNowConfig() {
  const [cfg, setCfg] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => { api.get("/admin/servicenow/config").then(r => setCfg(r.data)); }, []);

  const save = async () => {
    const payload = { ...cfg, fields: typeof cfg.fields === "string" ? cfg.fields.split(",").map(s => s.trim()).filter(Boolean) : cfg.fields };
    try { await api.put("/admin/servicenow/config", payload); toast.success("ServiceNow configuration saved"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };
  const test = async () => {
    setTesting(true);
    try {
      const { data } = await api.post("/admin/servicenow/test");
      data.ok ? toast.success(`Connected — ${data.message}`) : toast.error(data.message || "Connection failed");
    } catch (e) { toast.error(e?.response?.data?.detail || "Test failed"); }
    finally { setTesting(false); }
  };
  if (!cfg) return <div className="p-10 text-slate-400">Loading…</div>;

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Integration</div>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight flex items-center gap-3"><Database className="h-7 w-7 text-cyan-400" />ServiceNow</h1>
      <p className="mt-2 text-sm text-slate-400">Configure the ServiceNow instance used to fetch active incidents. Credentials stay server-side.</p>

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-6 space-y-4">
        <Field label="Instance URL" testid="sn-url">
          <Input value={cfg.instance_url} onChange={e => setCfg({ ...cfg, instance_url: e.target.value })}
                 placeholder="https://your-instance.service-now.com" className="bg-slate-900 border-slate-800" data-testid="sn-url-input" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Username">
            <Input value={cfg.username} onChange={e => setCfg({ ...cfg, username: e.target.value })} className="bg-slate-900 border-slate-800" data-testid="sn-username-input" />
          </Field>
          <Field label="Password / API Token">
            <Input type="password" value={cfg.password} onChange={e => setCfg({ ...cfg, password: e.target.value })} className="bg-slate-900 border-slate-800" data-testid="sn-password-input" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Table">
            <Input value={cfg.table} onChange={e => setCfg({ ...cfg, table: e.target.value })} className="bg-slate-900 border-slate-800" data-testid="sn-table-input" />
          </Field>
          <Field label="Active Query">
            <Input value={cfg.active_query} onChange={e => setCfg({ ...cfg, active_query: e.target.value })} className="bg-slate-900 border-slate-800 font-mono text-xs" data-testid="sn-query-input" />
          </Field>
        </div>
        <Field label="Fields (comma-separated)">
          <Textarea rows={3} value={Array.isArray(cfg.fields) ? cfg.fields.join(",") : cfg.fields}
                    onChange={e => setCfg({ ...cfg, fields: e.target.value })}
                    className="bg-slate-900 border-slate-800 font-mono text-xs" data-testid="sn-fields-input" />
        </Field>
        <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
          <div>
            <div className="text-sm font-medium">Expose work notes/comments to End Users</div>
            <div className="text-xs text-slate-500">Off by default. Enable only if permitted by policy.</div>
          </div>
          <Switch checked={cfg.show_work_notes} onCheckedChange={(v) => setCfg({ ...cfg, show_work_notes: v })} data-testid="sn-worknotes-toggle" />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save} className="bg-cyan-600 hover:bg-cyan-500 text-white" data-testid="sn-save-btn">Save Configuration</Button>
          <Button variant="outline" onClick={test} disabled={testing} className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" data-testid="sn-test-btn">
            <PlugZap className="h-4 w-4 mr-2" /> {testing ? "Testing…" : "Test Connection"}
          </Button>
        </div>
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (<div><Label className="text-xs uppercase tracking-wider text-slate-400">{label}</Label><div className="mt-1.5">{children}</div></div>);
}
