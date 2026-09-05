import { Layers, BookOpen, ClipboardList, History } from "lucide-react";
import { KBUploadZone } from "@/components/KBUploadZone";

export const CRUD_PAGES = {
  applications: {
    title: "Applications", subtitle: "Business applications monitored.", icon: Layers, endpoint: "applications", testidPrefix: "app",
    schema: [
      { key: "name", label: "Name" },
      { key: "tier", label: "Tier" },
      { key: "owner", label: "Owner" },
      { key: "sla_minutes", label: "SLA Minutes", type: "number" },
    ],
    listColumns: [{ key: "name", label: "Name" }, { key: "tier", label: "Tier" }, { key: "owner", label: "Owner" }, { key: "sla_minutes", label: "SLA (min)" }],
  },
  kb: {
    title: "Knowledge Base", subtitle: "Runbooks and playbooks used as AI grounding.", icon: BookOpen, endpoint: "kb", testidPrefix: "kb", extra: KBUploadZone, importable: true,
    schema: [
      { key: "title", label: "Title" },
      { key: "application", label: "Application" },
      { key: "tags", label: "Tags (comma separated)", type: "tags" },
      { key: "content", label: "Content", type: "textarea", rows: 8 },
    ],
    listColumns: [{ key: "title", label: "Title" }, { key: "application", label: "Application" }, { key: "tags", label: "Tags" }],
  },
  rca: {
    title: "RCA Repository", subtitle: "Historical root-cause analyses correlated with incidents.", icon: ClipboardList, endpoint: "rca", testidPrefix: "rca", importable: true,
    schema: [
      { key: "title", label: "Title" },
      { key: "incident_number", label: "Incident Number" },
      { key: "application", label: "Application" },
      { key: "tags", label: "Tags", type: "tags" },
      { key: "root_cause", label: "Root Cause", type: "textarea", rows: 5 },
      { key: "resolution", label: "Resolution", type: "textarea", rows: 5 },
    ],
    listColumns: [{ key: "title", label: "Title" }, { key: "application", label: "Application" }, { key: "incident_number", label: "Incident" }],
  },
  historical: {
    title: "Historical Incidents", subtitle: "Resolved incidents used for pattern matching.", icon: History, endpoint: "historical", testidPrefix: "hist", importable: true,
    schema: [
      { key: "number", label: "Incident Number" },
      { key: "short_description", label: "Short Description" },
      { key: "application", label: "Application" },
      { key: "priority", label: "Priority" },
      { key: "tags", label: "Tags", type: "tags" },
      { key: "description", label: "Description", type: "textarea", rows: 4 },
      { key: "root_cause", label: "Root Cause", type: "textarea", rows: 4 },
      { key: "resolution", label: "Resolution", type: "textarea", rows: 4 },
      { key: "resolved_at", label: "Resolved At" },
    ],
    listColumns: [{ key: "number", label: "Number" }, { key: "short_description", label: "Description" }, { key: "application", label: "Application" }, { key: "priority", label: "Priority" }],
  },
};
