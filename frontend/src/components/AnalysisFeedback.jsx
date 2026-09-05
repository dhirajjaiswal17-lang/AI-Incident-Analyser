import React, { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { toast } from "sonner";

export function AnalysisFeedback({ analysisId }) {
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (r = rating) => {
    setBusy(true);
    try {
      await api.post(`/analyses/${analysisId}/feedback`, { rating: r, comment });
      setDone(r);
      toast.success("Thanks — feedback recorded");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save feedback"); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3 text-sm text-emerald-200" data-testid="feedback-done">
        <Check className="h-4 w-4" /> Marked as {done === "up" ? "helpful" : "not helpful"}. Future analyses on similar incidents will take this into account.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5" data-testid="feedback-section">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm font-semibold">Was this analysis helpful?</div>
          <div className="text-xs text-slate-400 mt-0.5">Your rating tunes future analyses for similar incidents.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" data-testid="feedback-up-btn" disabled={busy}
                  onClick={() => (rating === "up" ? submit("up") : setRating("up"))}
                  className={`border-slate-700 bg-slate-900 hover:bg-emerald-500/10 hover:border-emerald-500/50 ${rating === "up" ? "border-emerald-500/60 text-emerald-300" : "text-slate-200"}`}>
            <ThumbsUp className="h-4 w-4 mr-1.5" /> Helpful
          </Button>
          <Button size="sm" variant="outline" data-testid="feedback-down-btn" disabled={busy}
                  onClick={() => (rating === "down" ? submit("down") : setRating("down"))}
                  className={`border-slate-700 bg-slate-900 hover:bg-rose-500/10 hover:border-rose-500/50 ${rating === "down" ? "border-rose-500/60 text-rose-300" : "text-slate-200"}`}>
            <ThumbsDown className="h-4 w-4 mr-1.5" /> Off the mark
          </Button>
        </div>
      </div>
      {rating && (
        <div className="mt-4 space-y-2">
          <Textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} data-testid="feedback-comment"
                    placeholder={rating === "down" ? "What did the AI get wrong? What was the actual cause? (optional but very valuable)" : "Anything worth noting? (optional)"}
                    className="bg-slate-900 border-slate-800 text-sm" />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => submit()} disabled={busy} className="bg-cyan-600 hover:bg-cyan-500 text-white" data-testid="feedback-submit-btn">
              {busy ? "Saving…" : "Submit feedback"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
