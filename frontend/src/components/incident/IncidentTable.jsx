import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight, KeyRound } from "lucide-react";
import { openSNCredentials } from "@/components/ServiceNowCredentialsDialog";
import { val, priorityBadge } from "@/lib/format";

const PRIORITY_FILTERS = [
  { k: "all", label: "All" }, { k: "1", label: "P1" }, { k: "2", label: "P2" }, { k: "3", label: "P3" }, { k: "4", label: "P4" },
];

export function IncidentFilters({ query, onQueryChange, onSearch, priorityFilter, onPriorityChange }) {
  return (
    <div className="mt-6 flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[280px] max-w-xl">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <Input
          data-testid="incident-search-input"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Search by number, description, or CI…"
          className="pl-9 bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-500"
        />
      </div>
      <Button data-testid="search-btn" onClick={onSearch} className="bg-cyan-600 hover:bg-cyan-500 text-white">Search</Button>
      <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 p-1 text-xs">
        {PRIORITY_FILTERS.map((f) => (
          <button key={f.k} data-testid={`filter-${f.k}`} onClick={() => onPriorityChange(f.k)}
                  className={`px-2.5 py-1 rounded ${priorityFilter === f.k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CredentialsBanner() {
  return (
    <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 flex items-center gap-4" data-testid="sn-creds-banner">
      <KeyRound className="h-6 w-6 text-amber-300 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold text-amber-100">ServiceNow login required</div>
        <div className="text-sm text-amber-200/80 mt-0.5">Incidents are fetched with your own ServiceNow account. Enter your username and password to continue.</div>
      </div>
      <Button onClick={openSNCredentials} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold" data-testid="sn-creds-banner-btn">Enter credentials</Button>
    </div>
  );
}

export function IncidentTable({ items, loading, onOpen }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/70 text-slate-400 text-xs uppercase tracking-wider">
          <tr>
            <Th>Incident</Th><Th>Short Description</Th><Th>Application</Th>
            <Th>Priority</Th><Th>Impact</Th><Th>Assignment</Th><Th>State</Th><Th>Opened</Th><Th></Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {loading && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Loading incidents…</td></tr>}
          {!loading && items.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No open incidents found.</td></tr>}
          {!loading && items.map((it) => <IncidentRow key={it.sys_id} it={it} onOpen={onOpen} />)}
        </tbody>
      </table>
    </div>
  );
}

function IncidentRow({ it, onOpen }) {
  return (
    <tr data-testid={`incident-row-${val(it.number)}`} className="hover:bg-slate-900/50 cursor-pointer transition-colors" onClick={() => onOpen(it.sys_id)}>
      <Td><span className="font-mono text-cyan-300 text-xs">{val(it.number)}</span></Td>
      <Td className="max-w-[420px] truncate text-slate-200">{val(it.short_description)}</Td>
      <Td className="text-slate-300">{val(it.cmdb_ci)}</Td>
      <Td><Badge className={`border ${priorityBadge(it.priority)} font-medium whitespace-nowrap`}>{val(it.priority) || "—"}</Badge></Td>
      <Td className="text-slate-300">{val(it.impact) || "—"}</Td>
      <Td className="text-slate-300">{val(it.assignment_group) || "—"}</Td>
      <Td className="text-slate-300">{val(it.state) || "—"}</Td>
      <Td className="text-slate-400 font-mono text-xs">{val(it.opened_at)}</Td>
      <Td>
        <Button size="sm" variant="ghost" data-testid={`analyze-open-btn-${val(it.number)}`}
                onClick={(e) => { e.stopPropagation(); onOpen(it.sys_id); }} className="text-cyan-300 hover:text-cyan-200 hover:bg-slate-800">
          Open →
        </Button>
      </Td>
    </tr>
  );
}

export function Pagination({ shown, total, page, totalPages, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
      <div>Showing <span className="text-slate-200">{shown}</span> of <span className="text-slate-200">{total}</span></div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" data-testid="prev-page-btn" disabled={page <= 1} onClick={onPrev} className="text-slate-300"><ChevronLeft className="h-4 w-4" /> Prev</Button>
        <div className="font-mono">Page {page} / {totalPages}</div>
        <Button size="sm" variant="ghost" data-testid="next-page-btn" disabled={page >= totalPages} onClick={onNext} className="text-slate-300">Next <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

const Th = ({ children }) => <th className="px-4 py-3 text-left font-semibold">{children}</th>;
const Td = ({ children, className = "" }) => <td className={`px-4 py-3 ${className}`}>{children}</td>;
