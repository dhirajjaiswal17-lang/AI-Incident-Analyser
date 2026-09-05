import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

function priorityBadge(p) {
  const s = String(p || "").toLowerCase();
  if (s.includes("1") || s.includes("critical")) return "bg-rose-500/15 text-rose-300 border-rose-500/40";
  if (s.includes("2") || s.includes("high")) return "bg-orange-500/15 text-orange-300 border-orange-500/40";
  if (s.includes("3") || s.includes("moderate")) return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
}

function val(v) {
  if (v == null) return "";
  if (typeof v === "object") return v.display_value || v.value || "";
  return String(v);
}

export default function OpenIncidents() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const nav = useNavigate();

  const load = async (q = query, p = page) => {
    setLoading(true);
    try {
      const { data } = await api.get("/incidents", { params: { q: q || undefined, page: p, page_size: pageSize } });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setDemo(!!data.demo);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load incidents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page]);

  const filtered = useMemo(() => {
    if (priorityFilter === "all") return items;
    return items.filter((i) => val(i.priority).startsWith(priorityFilter));
  }, [items, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Live Feed</div>
          <h1 className="mt-1 text-3xl lg:text-4xl font-extrabold tracking-tight flex items-center gap-3">
            <Activity className="h-7 w-7 text-cyan-400" />
            Open / Active Incidents
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Server-side paginated. {demo && <span className="ml-1 text-cyan-400">Demo dataset — connect ServiceNow in Admin → ServiceNow.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" data-testid="refresh-btn" onClick={() => load()} className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[280px] max-w-xl">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            data-testid="incident-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), load(query, 1))}
            placeholder="Search by number, description, or CI…"
            className="pl-9 bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <Button data-testid="search-btn" onClick={() => { setPage(1); load(query, 1); }} className="bg-cyan-600 hover:bg-cyan-500 text-white">Search</Button>
        <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 p-1 text-xs">
          {[
            { k: "all", label: "All" },
            { k: "1", label: "P1" },
            { k: "2", label: "P2" },
            { k: "3", label: "P3" },
            { k: "4", label: "P4" },
          ].map((f) => (
            <button
              key={f.k}
              data-testid={`filter-${f.k}`}
              onClick={() => setPriorityFilter(f.k)}
              className={`px-2.5 py-1 rounded ${priorityFilter === f.k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <Th>Incident</Th><Th>Short Description</Th><Th>Application</Th>
                <Th>Priority</Th><Th>Impact</Th><Th>Assignment</Th><Th>State</Th><Th>Opened</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Loading incidents…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No open incidents found.</td></tr>
              )}
              {!loading && filtered.map((it) => (
                <tr
                  key={it.sys_id}
                  data-testid={`incident-row-${val(it.number)}`}
                  className="hover:bg-slate-900/50 cursor-pointer transition-colors"
                  onClick={() => nav(`/incidents/${it.sys_id}`)}
                >
                  <Td><span className="font-mono text-cyan-300 text-xs">{val(it.number)}</span></Td>
                  <Td className="max-w-[420px] truncate text-slate-200">{val(it.short_description)}</Td>
                  <Td className="text-slate-300">{val(it.cmdb_ci)}</Td>
                  <Td><Badge className={`border ${priorityBadge(it.priority)} font-medium whitespace-nowrap`}>{val(it.priority) || "—"}</Badge></Td>
                  <Td className="text-slate-300">{val(it.impact) || "—"}</Td>
                  <Td className="text-slate-300">{val(it.assignment_group) || "—"}</Td>
                  <Td className="text-slate-300">{val(it.state) || "—"}</Td>
                  <Td className="text-slate-400 font-mono text-xs">{val(it.opened_at)}</Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`analyze-open-btn-${val(it.number)}`}
                      onClick={(e) => { e.stopPropagation(); nav(`/incidents/${it.sys_id}`); }}
                      className="text-cyan-300 hover:text-cyan-200 hover:bg-slate-800"
                    >
                      Open →
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
          <div>Showing <span className="text-slate-200">{filtered.length}</span> of <span className="text-slate-200">{total}</span></div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" data-testid="prev-page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-slate-300"><ChevronLeft className="h-4 w-4" /> Prev</Button>
            <div className="font-mono">Page {page} / {totalPages}</div>
            <Button size="sm" variant="ghost" data-testid="next-page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="text-slate-300">Next <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const Th = ({ children }) => <th className="px-4 py-3 text-left font-semibold">{children}</th>;
const Td = ({ children, className = "" }) => <td className={`px-4 py-3 ${className}`}>{children}</td>;
