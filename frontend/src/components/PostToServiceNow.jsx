import React, { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function PostToServiceNow({ analysisId, demo }) {
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(null);

  const post = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/analyses/${analysisId}/post-to-servicenow`);
      setPosted(data.posted_to_sn);
      toast.success(`Work note added to ${data.incident_number}`);
    } catch (e) {
      if (e?.response?.status !== 428) toast.error(e?.response?.data?.detail || "Could not post to ServiceNow", { duration: 8000 });
    } finally { setBusy(false); }
  };

  if (posted) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-300" data-testid="post-sn-done">
        <CheckCircle2 className="h-4 w-4" /> Posted as work note · {posted.ts?.slice(11, 16)} UTC
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <Button size="sm" variant="outline" onClick={post} disabled={busy || demo} data-testid="post-sn-btn"
              className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:border-cyan-500/50">
        <Send className="h-4 w-4 mr-1.5" /> {busy ? "Posting…" : "Post to ServiceNow as work note"}
      </Button>
      {demo && <span className="text-xs text-slate-500" data-testid="post-sn-demo-hint">Unavailable in demo mode</span>}
    </div>
  );
}
