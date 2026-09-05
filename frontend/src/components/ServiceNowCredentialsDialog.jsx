import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { KeyRound, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const SN_CREDS_REQUIRED = "sn-creds-required";
export const SN_CREDS_SAVED = "sn-creds-saved";
export const openSNCredentials = () => window.dispatchEvent(new CustomEvent(SN_CREDS_REQUIRED));

export function ServiceNowCredentialsDialog({ open, onOpenChange }) {
  const [status, setStatus] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setResult(null); setPassword("");
    api.get("/me/servicenow").then(r => { setStatus(r.data); setUsername(r.data.username || ""); });
  }, [open]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/me/servicenow", { username, password });
      toast.success("ServiceNow credentials saved");
      window.dispatchEvent(new CustomEvent(SN_CREDS_SAVED));
      onOpenChange(false);
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setResult(null);
    try {
      if (password) await api.put("/me/servicenow", { username, password });
      const { data } = await api.post("/me/servicenow/test");
      setResult(data);
      data.ok ? toast.success("Connected to ServiceNow") : toast.error(data.message);
    } catch (e) { toast.error(e?.response?.data?.detail || "Test failed"); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    try {
      await api.delete("/me/servicenow");
      setStatus(s => ({ ...s, has_credentials: false, username: "" }));
      setUsername(""); setPassword("");
      window.dispatchEvent(new CustomEvent(SN_CREDS_SAVED));
      toast.success("Credentials removed");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not remove credentials"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-md" data-testid="sn-creds-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-cyan-400" /> Your ServiceNow Login</DialogTitle>
          <DialogDescription className="text-slate-400">
            Incidents are fetched with <span className="text-slate-200">your own</span> ServiceNow account. Credentials are encrypted at rest and never shown to admins.
          </DialogDescription>
        </DialogHeader>
        {status && !status.configured && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200" data-testid="sn-creds-not-configured">
            The admin has not set a ServiceNow instance URL yet — demo incidents are shown until then. You can still save your credentials now.
          </div>
        )}
        {status?.configured && (
          <div className="text-xs text-slate-400 font-mono truncate" data-testid="sn-creds-instance">Instance: {status.instance_url}</div>
        )}
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-400">ServiceNow Username</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} className="mt-1.5 bg-slate-900 border-slate-800" data-testid="sn-creds-username" autoComplete="off" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-400">Password / API Token</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1.5 bg-slate-900 border-slate-800"
                   placeholder={status?.has_credentials ? "•••••••• (stored — enter to replace)" : ""} data-testid="sn-creds-password" autoComplete="new-password" />
          </div>
          {result && (
            <div className={`rounded-lg border p-3 text-sm ${result.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`} data-testid="sn-creds-test-result">
              {result.message}
            </div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div>
            {status?.has_credentials && (
              <Button variant="ghost" onClick={remove} className="text-rose-400 hover:text-rose-300" data-testid="sn-creds-remove-btn"><Trash2 className="h-4 w-4 mr-1" /> Remove</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={test} disabled={busy || !username || (!password && !status?.has_credentials)} className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" data-testid="sn-creds-test-btn">
              <PlugZap className="h-4 w-4 mr-2" /> Test
            </Button>
            <Button onClick={save} disabled={busy || !username || !password} className="bg-cyan-600 hover:bg-cyan-500 text-white" data-testid="sn-creds-save-btn">Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
