import React, { useRef, useState } from "react";
import { api } from "@/lib/api";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ACCEPT = ".pdf,.md,.markdown,.txt";

export function KBUploadZone({ onUploaded }) {
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(null);
  const inputRef = useRef(null);

  const upload = async (files) => {
    for (const file of Array.from(files || [])) {
      setUploading(file.name);
      const fd = new FormData();
      fd.append("file", file);
      try {
        const { data } = await api.post("/admin/kb/upload", fd);
        toast.success(`Ingested "${data.title}" (${data.content.length.toLocaleString()} chars)`);
        onUploaded?.(data);
      } catch (e) {
        toast.error(`${file.name}: ${e?.response?.data?.detail || "Upload failed"}`);
      }
    }
    setUploading(null);
  };

  return (
    <div
      data-testid="kb-upload-zone"
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`mt-6 cursor-pointer rounded-xl border border-dashed px-6 py-6 flex items-center gap-5 transition-colors
        ${drag ? "border-cyan-400 bg-cyan-500/10" : "border-slate-700 bg-slate-950/40 hover:border-slate-500 hover:bg-slate-900/40"}`}
    >
      <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" data-testid="kb-upload-input"
             onChange={e => { upload(e.target.files); e.target.value = ""; }} />
      <div className="h-12 w-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
        {uploading ? <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" /> : <UploadCloud className="h-5 w-5 text-cyan-400" />}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-sm" data-testid="kb-upload-status">
          {uploading ? `Ingesting ${uploading}…` : "Drop runbooks here to ingest into the Knowledge Base"}
        </div>
        <div className="mt-1 text-xs text-slate-400 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> PDF, Markdown or TXT · up to 10 MB · title taken from filename, editable afterwards
        </div>
      </div>
    </div>
  );
}
