import React, { useState } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ClipboardList, History, Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const GROUPS = [
  { key: "historical", label: "Historical incidents", icon: History, title: e => `${e.number} · ${e.title}` },
  { key: "kb", label: "Knowledge base", icon: BookOpen, title: e => e.title },
  { key: "rca", label: "RCA repository", icon: ClipboardList, title: e => e.incident_number ? `${e.title} (${e.incident_number})` : e.title },
];

export function LinkedEvidence({ evidence }) {
  const [open, setOpen] = useState(null);
  const total = GROUPS.reduce((n, g) => n + (evidence?.[g.key]?.length || 0), 0);

  const show = async (kind, item) => {
    try { const { data } = await api.get(`/evidence/${kind}/${item.id}`); setOpen({ kind, doc: data }); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not load evidence"); }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5" data-testid="linked-evidence">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold flex items-center gap-2"><Link2 className="h-3.5 w-3.5" /> Linked evidence</div>
        <span className="text-xs text-slate-500" data-testid="linked-evidence-count">{total} internal source{total === 1 ? "" : "s"} grounded this analysis</span>
      </div>
      {total === 0 && <p className="mt-3 text-sm text-slate-500" data-testid="linked-evidence-empty">No internal records matched — this analysis relied on general knowledge. Consider importing related incidents or runbooks.</p>}
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        {GROUPS.map(g => {
          const items = evidence?.[g.key] || [];
          if (!items.length) return null;
          return (
            <div key={g.key} data-testid={`evidence-group-${g.key}`}>
              <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-2"><g.icon className="h-3.5 w-3.5 text-cyan-400" /> {g.label}</div>
              <ul className="space-y-1.5">
                {items.map(e => (
                  <li key={e.id}>
                    <button onClick={() => show(g.key, e)} data-testid={`evidence-item-${e.id}`}
                            className="w-full text-left rounded-md border border-slate-800 bg-slate-900/60 hover:border-cyan-500/50 hover:bg-slate-900 px-3 py-2 text-sm text-slate-200 transition-colors group">
                      <div className="flex items-start gap-2">
                        <span className="flex-1 leading-snug">{g.title(e)}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-slate-600 group-hover:text-cyan-400 shrink-0 mt-0.5" />
                      </div>
                      {e.application && <div className="mt-1 text-[10px] text-slate-500 uppercase tracking-wider">{e.application}</div>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <EvidenceDialog open={open} onClose={() => setOpen(null)} />
    </div>
  );
}

export function EvidenceDialog({ open, onClose }) {
  const d = open?.doc;
  const kind = open?.kind;
  return (
    <Dialog open={!!open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="evidence-dialog">
        {d && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {kind === "historical" && <span className="font-mono text-cyan-300 text-sm">{d.number}</span>}
                <span data-testid="evidence-dialog-title">{kind === "historical" ? d.short_description : d.title}</span>
              </DialogTitle>
              <DialogDescription className="text-slate-400 flex items-center gap-2 flex-wrap">
                {d.application && <Badge className="bg-slate-800 border border-slate-700 text-slate-200">{d.application}</Badge>}
                {d.incident_number && <Badge className="bg-slate-800 border border-slate-700 text-slate-200 font-mono">{d.incident_number}</Badge>}
                {d.resolved_at && <span className="text-xs">resolved {d.resolved_at}</span>}
                {(d.tags || []).map(t => <Badge key={t} className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-[10px]">{t}</Badge>)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm" data-testid="evidence-dialog-body">
              {kind === "kb" && <Section label="Content"><pre className="whitespace-pre-wrap font-sans text-slate-200">{d.content}</pre></Section>}
              {kind !== "kb" && d.description && <Section label="Description">{d.description}</Section>}
              {d.root_cause && <Section label="Root cause">{d.root_cause}</Section>}
              {d.resolution && <Section label="Resolution" highlight>{d.resolution}</Section>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children, highlight }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800 bg-slate-900/50"}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">{label}</div>
      <div className="mt-2 text-slate-200 leading-relaxed">{children}</div>
    </div>
  );
}
