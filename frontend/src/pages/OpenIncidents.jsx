import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity } from "lucide-react";
import { toast } from "sonner";
import { SN_CREDS_SAVED } from "@/components/ServiceNowCredentialsDialog";
import { IncidentFilters, CredentialsBanner, IncidentTable, Pagination } from "@/components/incident/IncidentTable";
import { val } from "@/lib/format";

const PAGE_SIZE = 25;

function useIncidentList() {
  const [state, setState] = useState({ items: [], total: 0, demo: false, loading: true, needCreds: false });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const submittedQuery = useRef("");

  const load = useCallback(async (p) => {
    setState(s => ({ ...s, loading: true, needCreds: false }));
    try {
      const { data } = await api.get("/incidents", { params: { q: submittedQuery.current || undefined, page: p, page_size: PAGE_SIZE } });
      setState({ items: data.items || [], total: data.total || 0, demo: !!data.demo, loading: false, needCreds: false });
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.detail || "Failed to load incidents";
      const needCreds = status === 428 || (status === 424 && msg.toLowerCase().includes("authentication"));
      if (status !== 428) toast.error(msg, { duration: status === 424 ? 8000 : 4000 });
      setState(s => ({ ...s, items: [], total: 0, loading: false, needCreds }));
    }
  }, []);

  useEffect(() => {
    load(page);
    const onSaved = () => load(page);
    window.addEventListener(SN_CREDS_SAVED, onSaved);
    return () => window.removeEventListener(SN_CREDS_SAVED, onSaved);
  }, [page, load]);

  const search = useCallback(() => {
    submittedQuery.current = query;
    if (page === 1) load(1); else setPage(1);
  }, [query, page, load]);

  return { ...state, page, setPage, query, setQuery, search, refresh: () => load(page) };
}

export default function OpenIncidents() {
  const nav = useNavigate();
  const { items, total, demo, loading, needCreds, page, setPage, query, setQuery, search, refresh } = useIncidentList();
  const [priorityFilter, setPriorityFilter] = useState("all");

  const filtered = useMemo(
    () => (priorityFilter === "all" ? items : items.filter((i) => val(i.priority).startsWith(priorityFilter))),
    [items, priorityFilter]
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const open = useCallback((sysId) => nav(`/incidents/${sysId}`), [nav]);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Live Feed</div>
          <h1 className="mt-1 text-3xl lg:text-4xl font-extrabold tracking-tight flex items-center gap-3">
            <Activity className="h-7 w-7 text-cyan-400" /> Open / Active Incidents
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Server-side paginated. {demo && <span className="ml-1 text-cyan-400">Demo dataset — connect ServiceNow in Admin → ServiceNow.</span>}
          </p>
        </div>
        <Button variant="outline" data-testid="refresh-btn" onClick={refresh} className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <IncidentFilters query={query} onQueryChange={setQuery} onSearch={search} priorityFilter={priorityFilter} onPriorityChange={setPriorityFilter} />
      {needCreds && <CredentialsBanner />}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
        <IncidentTable items={filtered} loading={loading} onOpen={open} />
        <Pagination shown={filtered.length} total={total} page={page} totalPages={totalPages}
                    onPrev={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      </div>
    </div>
  );
}
