import { useState, useEffect, useCallback } from "react";

export default function DocumentRepo({ openDocument }) {
  const [documents, setDocuments] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const fetchDocs = useCallback(() => {
    fetch("/api/documents/").then((r) => r.json()).then(setDocuments).catch(() => {});
  }, []);

  useEffect(() => {
    fetchDocs();
    fetch("/api/dashboard/metrics").then((r) => r.json()).then(setMetrics).catch(() => {});
  }, [fetchDocs]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await fetch("/api/documents/upload", { method: "POST", body: form });
      fetchDocs();
    } catch (err) { console.error(err); }
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async (docId) => {
    if (!confirm("Delete this document and all its graph data?")) return;
    setDeleting(docId);
    try {
      await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      fetchDocs();
    } catch (err) { console.error(err); }
    setDeleting(null);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-display-lg font-heading font-semibold text-on-surface tracking-tight">Document Repository</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">All ingested regulatory documents and their analysis status.</p>
        </div>
        <label className="bg-primary-container text-white font-label-bold text-[12px] px-4 py-2 rounded flex items-center gap-2 hover:bg-tertiary-container transition-colors shadow-sm cursor-pointer">
          <span className="material-symbols-outlined text-white text-[16px]">add</span>
          {uploading ? "Uploading..." : "Upload document"}
          <input type="file" accept=".md,.txt,.pdf,.docx" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {/* Metric strips */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="border border-outline-variant bg-surface-container-lowest p-4 rounded flex flex-col gap-1">
          <span className="font-label-mono text-[11px] text-on-surface-variant uppercase">Documents</span>
          <span className="text-headline-md font-heading font-semibold text-on-surface">{metrics?.documents ?? "—"}</span>
        </div>
        <div className="border border-outline-variant bg-surface-container-lowest p-4 rounded flex flex-col gap-1">
          <span className="font-label-mono text-[11px] text-on-surface-variant uppercase">Policy Elements</span>
          <span className="text-headline-md font-heading font-semibold text-on-surface">{metrics?.policy_elements ?? "—"}</span>
        </div>
        <div className="border border-outline-variant bg-surface-container-lowest p-4 rounded flex flex-col gap-1">
          <span className="font-label-mono text-[11px] text-on-surface-variant uppercase">Relationships</span>
          <span className="text-headline-md font-heading font-semibold text-on-surface">{metrics?.relationships ?? "—"}</span>
        </div>
        <div className="border border-outline-variant bg-surface-container-lowest p-4 rounded flex flex-col gap-1">
          <span className="font-label-mono text-[11px] text-on-surface-variant uppercase">Graph Health</span>
          <span className="text-headline-md font-heading font-semibold text-on-surface">{metrics?.graph_health ?? "—"}%</span>
        </div>
      </div>

      {/* Documents table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low/50 flex justify-between items-center">
          <h3 className="font-label-bold text-[12px] text-on-surface uppercase">All Documents</h3>
          <span className="font-label-mono text-[11px] text-on-surface-variant">{documents.length} total</span>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-outline-variant font-label-mono text-[11px] text-on-surface-variant">
              <th className="py-2 px-4 font-medium uppercase">Filename</th>
              <th className="py-2 px-4 font-medium uppercase">Chunks</th>
              <th className="py-2 px-4 font-medium uppercase">Policy Elements</th>
              <th className="py-2 px-4 font-medium uppercase">Created</th>
              <th className="py-2 px-4 font-medium uppercase w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="text-body-sm">
            {documents.map((doc) => (
              <tr key={doc.id} className="border-b border-outline-variant hover:bg-surface-container-lowest/50 cursor-pointer group" onClick={() => openDocument(doc.id)}>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">description</span>
                    <span className="font-semibold text-on-surface group-hover:text-secondary transition-colors">{doc.filename}</span>
                  </div>
                </td>
                <td className="py-2.5 px-4 font-label-mono text-[11px] text-on-surface-variant">{doc.chunk_count}</td>
                <td className="py-2.5 px-4 font-label-mono text-[11px] text-on-surface-variant">{doc.policy_count}</td>
                <td className="py-2.5 px-4 text-body-xs text-on-surface-variant">{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : "—"}</td>
                <td className="py-2.5 px-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                    disabled={deleting === doc.id}
                    className="text-on-surface-variant hover:text-error transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr><td colSpan={5} className="py-12 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[40px] text-outline mb-2 block">folder_open</span>
                <p className="text-body-sm font-heading">No documents uploaded</p>
                <p className="text-body-xs text-outline mt-1">Upload regulatory documents to begin analysis.</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
