import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Cpu, PlugZap } from "lucide-react";

const MODELS = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-5", "gpt-5-mini"],
  anthropic: ["claude-sonnet-4-5-20250929", "claude-3-5-sonnet-latest", "claude-haiku-4-5-latest"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro"],
};

export default function AIConfig() {
  const [cfg, setCfg] = useState(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { api.get("/admin/ai/config").then(r => setCfg(r.data)); }, []);

  const save = async () => {
    try { const { data } = await api.put("/admin/ai/config", cfg); setCfg(data); toast.success("AI configuration saved"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };
  const test = async () => {
    setTesting(true); setResult(null);
    try {
      const { data } = await api.post("/admin/ai/test");
      setResult(data);
      data.ok ? toast.success("AI reachable") : toast.error(data.message);
    } catch (e) { toast.error(e?.response?.data?.detail || "Test failed"); }
    finally { setTesting(false); }
  };

  if (!cfg) return <div className="p-10 text-slate-400">Loading…</div>;
  const models = MODELS[cfg.provider] || [];

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Integration</div>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight flex items-center gap-3"><Cpu className="h-7 w-7 text-cyan-400" />AI Configuration</h1>
      <p className="mt-2 text-sm text-slate-400">Provider-agnostic. Uses the Emergent Universal LLM Key by default.</p>

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Provider">
            <Select value={cfg.provider} onValueChange={(v) => setCfg({ ...cfg, provider: v, model: MODELS[v][0] })}>
              <SelectTrigger className="bg-slate-900 border-slate-800" data-testid="ai-provider-select"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="gemini">Google (Gemini)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Model">
            <Select value={cfg.model} onValueChange={(v) => setCfg({ ...cfg, model: v })}>
              <SelectTrigger className="bg-slate-900 border-slate-800" data-testid="ai-model-select"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                {models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
          <div>
            <div className="text-sm font-medium">Use Emergent Universal LLM Key</div>
            <div className="text-xs text-slate-500">When off, provide your own provider API key below.</div>
          </div>
          <Switch checked={cfg.use_emergent_key} onCheckedChange={(v) => setCfg({ ...cfg, use_emergent_key: v })} data-testid="ai-emergent-toggle" />
        </div>
        {!cfg.use_emergent_key && (
          <Field label="Provider API Key">
            <Input type="password" value={cfg.api_key} onChange={e => setCfg({ ...cfg, api_key: e.target.value })} className="bg-slate-900 border-slate-800" data-testid="ai-key-input" />
          </Field>
        )}
        <Field label={`Temperature (${cfg.temperature.toFixed(2)})`}>
          <Slider value={[cfg.temperature]} min={0} max={1} step={0.05} onValueChange={([v]) => setCfg({ ...cfg, temperature: v })} data-testid="ai-temp-slider" />
        </Field>
        <Field label="Max Tokens">
          <Input type="number" value={cfg.max_tokens} onChange={e => setCfg({ ...cfg, max_tokens: parseInt(e.target.value || "0") })} className="bg-slate-900 border-slate-800" data-testid="ai-maxtokens-input" />
        </Field>
        <Field label="Analyses per user per hour (0 = unlimited, admins exempt)">
          <Input type="number" min={0} value={cfg.rate_limit_per_hour ?? 10} onChange={e => setCfg({ ...cfg, rate_limit_per_hour: parseInt(e.target.value || "0") })} className="bg-slate-900 border-slate-800" data-testid="ai-ratelimit-input" />
        </Field>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save} className="bg-cyan-600 hover:bg-cyan-500 text-white" data-testid="ai-save-btn">Save Configuration</Button>
          <Button variant="outline" onClick={test} disabled={testing} className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" data-testid="ai-test-btn">
            <PlugZap className="h-4 w-4 mr-2" /> {testing ? "Testing…" : "Test AI Connection"}
          </Button>
        </div>
        {result && (
          <div className={`rounded-lg border p-3 text-sm ${result.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`} data-testid="ai-test-result">
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (<div><Label className="text-xs uppercase tracking-wider text-slate-400">{label}</Label><div className="mt-1.5">{children}</div></div>);
}
