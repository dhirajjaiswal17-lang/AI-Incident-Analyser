import React, { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, FileJson, Loader2 } from "lucide-react";
import { toast } from "sonner";

const HINTS = {
  historical: `[{"incident_id":"INC001","service":"Payments","description":"Gateway timeout during checkout","root_cause":"API overload","resolution":"Restart payment gateway service","confidence":0.92}]`,
  kb: `[{"title":"Runbook: Kafka lag","application":"Fraud Scoring","tags":"kafka,lag","content":"1) ... 2) ..."}]`,
  rca: `[{"title":"RCA - INC001","incident_number":"INC001","application":"Payments","root_cause":"...","resolution":"..."}]`,
};

export function BulkImportButton({ endpoint, onImported }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const finish = (data) => {
    setResult(data);
    toast.success(`Imported ${data.inserted} new, updated ${data.updated}${data.error_count ? `, ${data.error_count} errors` : ""}`);
    onImported?.();
  };

  const importFile = async (file) => {
    if (!file) return;
    setBusy(true); setResult(null);
    const fd = new FormData(); fd.append("file", file);
    try { const { data } = await api.post(`/admin/${endpoint}/import`, fd); finish(data); }
    catch (e) { toast.error(e?.response?.data?.detail || "Import failed"); }
    finally { setBusy(false); }
  };

  const importText = async () => {
    let items;
    try { items = JSON.parse(text); } catch { toast.error("Invalid JSON — paste an array of objects"); return; }
    setBusy(true); setResult(null);
    try { const { data } = await api.post(`/admin/${endpoint}/import`, Array.isArray(items) ? { items } : items); finish(data); }
    catch (e) { toast.error(e?.response?.data?.detail || "Import failed"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Button variant="outline" onClick={() => { setOpen(true); setResult(null); }} data-testid={`${endpoint}-import-btn`}
              className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800">
        <Upload className="h-4 w-4 mr-2" /> Bulk Import
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-2xl" data-testid={`${endpoint}-import-dialog`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileJson className="h-5 w-5 text-cyan-400" /> Bulk import</DialogTitle>
            <DialogDescription className="text-slate-400">
              Upload a JSON or CSV file (thousands of rows OK) or paste JSON. Column names are matched flexibly
              (e.g. <code className="text-cyan-300">incident_id</code>, <code className="text-cyan-300">service</code>, <code className="text-cyan-300">root_cause</code>, <code className="text-cyan-300">resolution</code>). Existing records with the same key are updated, not duplicated.
            </DialogDescription>
          </DialogHeader>
          <input ref={inputRef} type="file" accept=".json,.csv" className="hidden" data-testid={`${endpoint}-import-file`} onChange={e => { importFile(e.target.files?.[0]); e.target.value = ""; }} />
          <div onClick={() => !busy && inputRef.current?.click()}
               onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); importFile(e.dataTransfer.files?.[0]); }}
               className="cursor-pointer rounded-lg border border-dashed border-slate-700 hover:border-cyan-500/60 bg-slate-900/40 px-4 py-5 text-center text-sm text-slate-300" data-testid={`${endpoint}-import-drop`}>
            {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Importing…</span> : "Drop or click to choose a .json / .csv file"}
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 text-center">or paste JSON</div>
          <Textarea rows={7} value={text} onChange={e => setText(e.target.value)} placeholder={HINTS[endpoint]} className="bg-slate-900 border-slate-800 font-mono text-xs" data-testid={`${endpoint}-import-text`} />
          {result && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-1" data-testid={`${endpoint}-import-result`}>
              <div className="text-slate-200">Received {result.received} · <span className="text-emerald-300">{result.inserted} inserted</span> · <span className="text-cyan-300">{result.updated} updated</span> · <span className={result.error_count ? "text-rose-300" : "text-slate-400"}>{result.error_count} errors</span></div>
              {result.errors?.slice(0, 5).map(er => <div key={er.row} className="text-rose-300/80 font-mono">row {er.row}: {er.error}</div>)}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-700 bg-slate-900 text-slate-200">Close</Button>
            <Button onClick={importText} disabled={busy || !text.trim()} className="bg-cyan-600 hover:bg-cyan-500 text-white" data-testid={`${endpoint}-import-submit`}>Import pasted JSON</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
