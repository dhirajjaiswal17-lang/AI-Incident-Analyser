import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { History, BookOpen, ClipboardList, Radar, ChevronRight } from "lucide-react";
import { EvidenceDialog } from "@/components/LinkedEvidence";
import { toast } from "sonner";

export function SimilarIncidents({ sysId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    setData(null); setError(false);
    api.get(`/incidents/${sysId}/similar`).then(r => setData(r.data)).catch(e => {
      setError(true);
      if (e?.response?.status !== 428) console.error("Similar incidents lookup failed:", e);
    });
  }, [sysId]);

  const show = async (kind, id) => {
    try { const { data: doc } = await api.get(`/evidence/${kind}/${id}`); setOpen({ kind, doc }); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not load record"); }
  };

  const total = data ? data.historical.length + data.kb.length + data.rca.length : 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 overflow-hidden" data-testid="similar-panel">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold"><Radar className="h-4 w-4 text-cyan-400" /> Similar past incidents</div>
        <span className="text-xs text-slate-500" data-testid="similar-count">
          {data ? `${total} match${total === 1 ? "" : "es"} in internal knowledge` : error ? "unavailable" : "searching…"}
        </span>
      </div>

      {data && total === 0 && (
        <div className="px-5 py-6 text-sm text-slate-500" data-testid="similar-empty">Nothing similar found yet. Run the analysis, or import related incidents to strengthen future matches.</div>
      )}

      {data && data.historical.length > 0 && (
        <div className="divide-y divide-slate-800/80" data-testid="similar-historical">
          {data.historical.map(h => (
            <button key={h.id} onClick={() => show("historical", h.id)} data-testid={`similar-hist-${h.id}`}
                    className="w-full text-left px-5 py-3.5 hover:bg-slate-900/60 transition-colors group">
              <div className="flex items-start gap-3">
                <History className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-cyan-300">{h.number}</span>
                    <span className="text-sm text-slate-100 truncate">{h.title}</span>
                    {h.application && <Badge className="bg-slate-800 border border-slate-700 text-slate-300 text-[10px]">{h.application}</Badge>}
                    {h.resolved_at && <span className="ml-auto text-[10px] text-slate-500 font-mono">{h.resolved_at.slice(0, 10)}</span>}
                  </div>
                  {h.resolution ? (
                    <div className="mt-1.5 text-xs text-emerald-200/90 line-clamp-2"><span className="text-emerald-400/80 uppercase tracking-wider text-[10px] mr-1.5">Fix</span>{h.resolution}</div>
                  ) : h.root_cause ? (
                    <div className="mt-1.5 text-xs text-slate-400 line-clamp-2"><span className="uppercase tracking-wider text-[10px] mr-1.5">Cause</span>{h.root_cause}</div>
                  ) : null}
                </div>
                <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-cyan-400 shrink-0 mt-0.5" />
              </div>
            </button>
          ))}
        </div>
      )}

      {data && (data.kb.length > 0 || data.rca.length > 0) && (
        <div className="px-5 py-3.5 border-t border-slate-800 flex flex-wrap gap-2" data-testid="similar-docs">
          {data.kb.map(k => (
            <button key={k.id} onClick={() => show("kb", k.id)} data-testid={`similar-kb-${k.id}`} title={k.snippet}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200 hover:border-cyan-500/60 hover:text-white transition-colors">
              <BookOpen className="h-3 w-3 text-cyan-400" /> {k.title}
            </button>
          ))}
          {data.rca.map(r => (
            <button key={r.id} onClick={() => show("rca", r.id)} data-testid={`similar-rca-${r.id}`} title={r.root_cause}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200 hover:border-cyan-500/60 hover:text-white transition-colors">
              <ClipboardList className="h-3 w-3 text-amber-400" /> {r.title}
            </button>
          ))}
        </div>
      )}
      <EvidenceDialog open={open} onClose={() => setOpen(null)} />
    </div>
  );
}
