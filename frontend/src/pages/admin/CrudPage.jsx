import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

/**
 * Generic admin CRUD page.
 * schema: [{key,label,type: "text"|"number"|"textarea"|"tags"}]
 */
export default function CrudPage({ title, subtitle, icon: Icon, endpoint, schema, testidPrefix, listColumns }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await api.get(`/admin/${endpoint}`);
    setItems(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const startCreate = () => {
    const blank = {};
    schema.forEach(s => { blank[s.key] = s.type === "number" ? 0 : s.type === "tags" ? [] : ""; });
    setEditing(blank); setOpen(true);
  };
  const startEdit = (it) => { setEditing({ ...it, _id: it.id }); setOpen(true); };

  const save = async () => {
    const payload = { ...editing };
    schema.forEach(s => {
      if (s.type === "tags" && typeof payload[s.key] === "string") {
        payload[s.key] = payload[s.key].split(",").map(x => x.trim()).filter(Boolean);
      }
      if (s.type === "number") payload[s.key] = Number(payload[s.key] || 0);
    });
    try {
      if (payload._id) {
        await api.put(`/admin/${endpoint}/${payload._id}`, payload);
      } else {
        await api.post(`/admin/${endpoint}`, payload);
      }
      toast.success("Saved");
      setOpen(false); setEditing(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try { await api.delete(`/admin/${endpoint}/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };

  const filtered = items.filter(it => {
    if (!q) return true;
    const hay = JSON.stringify(it).toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Admin</div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight flex items-center gap-3">
            {Icon && <Icon className="h-7 w-7 text-cyan-400" />}
            {title}
          </h1>
          <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
        </div>
        <Button onClick={startCreate} className="bg-cyan-600 hover:bg-cyan-500 text-white" data-testid={`${testidPrefix}-add-btn`}>
          <Plus className="h-4 w-4 mr-2" /> New
        </Button>
      </div>

      <div className="mt-6 relative max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="pl-9 bg-slate-900 border-slate-800" data-testid={`${testidPrefix}-search`} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/70 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              {listColumns.map(c => <th key={c.key} className="px-4 py-3 text-left font-semibold">{c.label}</th>)}
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filtered.length === 0 && (
              <tr><td colSpan={listColumns.length + 1} className="px-4 py-8 text-center text-slate-500">No records.</td></tr>
            )}
            {filtered.map(it => (
              <tr key={it.id} className="hover:bg-slate-900/50">
                {listColumns.map(c => (
                  <td key={c.key} className="px-4 py-3 text-slate-200 align-top max-w-[380px]">
                    <div className="truncate">
                      {Array.isArray(it[c.key]) ? it[c.key].join(", ") : (it[c.key] ?? "—")}
                    </div>
                  </td>
                ))}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(it)} data-testid={`${testidPrefix}-edit-${it.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(it.id)} data-testid={`${testidPrefix}-delete-${it.id}`} className="text-rose-400 hover:text-rose-300"><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 max-w-2xl">
          <DialogHeader><DialogTitle>{editing?._id ? "Edit" : "Create"} {title}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-2">
              {schema.map(s => (
                <div key={s.key}>
                  <Label className="text-xs uppercase tracking-wider text-slate-400">{s.label}</Label>
                  <div className="mt-1.5">
                    {s.type === "textarea" ? (
                      <Textarea rows={s.rows || 4} value={editing[s.key] || ""} onChange={e => setEditing({ ...editing, [s.key]: e.target.value })} className="bg-slate-900 border-slate-800" data-testid={`${testidPrefix}-input-${s.key}`} />
                    ) : s.type === "number" ? (
                      <Input type="number" value={editing[s.key] ?? 0} onChange={e => setEditing({ ...editing, [s.key]: e.target.value })} className="bg-slate-900 border-slate-800" data-testid={`${testidPrefix}-input-${s.key}`} />
                    ) : s.type === "tags" ? (
                      <Input value={Array.isArray(editing[s.key]) ? editing[s.key].join(",") : (editing[s.key] || "")} onChange={e => setEditing({ ...editing, [s.key]: e.target.value })} placeholder="tag1, tag2" className="bg-slate-900 border-slate-800" data-testid={`${testidPrefix}-input-${s.key}`} />
                    ) : (
                      <Input value={editing[s.key] || ""} onChange={e => setEditing({ ...editing, [s.key]: e.target.value })} className="bg-slate-900 border-slate-800" data-testid={`${testidPrefix}-input-${s.key}`} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="border-slate-700 bg-slate-900 text-slate-200">Cancel</Button>
            <Button onClick={save} className="bg-cyan-600 hover:bg-cyan-500 text-white" data-testid={`${testidPrefix}-save-btn`}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
