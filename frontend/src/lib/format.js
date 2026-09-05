export function val(v) {
  if (v == null) return "";
  if (typeof v === "object") return v.display_value || v.value || "";
  return String(v);
}

export function priorityBadge(p) {
  const s = String(p || "").toLowerCase();
  if (s.includes("1") || s.includes("critical")) return "bg-rose-500/15 text-rose-300 border-rose-500/40";
  if (s.includes("2") || s.includes("high")) return "bg-orange-500/15 text-orange-300 border-orange-500/40";
  if (s.includes("3") || s.includes("moderate")) return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
}
