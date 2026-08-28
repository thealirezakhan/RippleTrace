import { useState, useEffect, useCallback } from "react";

export default function Ingestion() {
  const [documents, setDocuments] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [status, setStatus] = useState(null);

  const fetchDocs = useCallback(() => {
    fetch("/api/documents/").then((r) => r.json()).then(setDocuments).catch(() => {});
  }, []);

  const fetchMetrics = useCallback(() => {
    fetch("/api/dashboard/metrics").then((r) => r.json()).then(setMetrics).catch(() => {});
  }, []);

  useEffect(() => { fetchDocs(); fetchMetrics(); }, [fetchDocs, fetchMetrics]);

  const handleScan = async () => {
    setScanning(true);
    setStatus({ type: "ok", msg: "Scanning directory..." });
    try {
      const res = await fetch("/api/documents/scan", { method: "POST" });
      const data = await res.json();
      setStatus({ type: data.errors?.length ? "warn" : "ok", msg: `Scanned ${data.scanned} docs (${data.total_chunks} chunks)` });
      fetchDocs();
      fetchMetrics();
    } catch (err) { setStatus({ type: "error", msg: err.message }); }
    setScanning(false);
  };

  const handleExtractAndBuild = async (docId) => {
    setProcessing(docId);
    setStatus({ type: "ok", msg: "Extracting policy elements..." });
    try {
      const extRes = await fetch(`/api/extraction/extract/${docId}`, { method: "POST" });
      if (!extRes.ok) throw new Error(`Extraction failed: ${extRes.statusText}`);
      const extData = await extRes.json();
      setStatus({ type: "ok", msg: `Extracted ${extData.extracted} elements. Building graph...` });
      const graphRes = await fetch(`/api/graph/build/${docId}`, { method: "POST" });
      if (!graphRes.ok) throw new Error(`Graph build failed: ${graphRes.statusText}`);
      const graph = await graphRes.json();
      setStatus({ type: "ok", msg: `Built: ${graph.nodes_created} nodes, ${graph.edges_created} edges` });
      fetchDocs();
      fetchMetrics();
    } catch (err) { setStatus({ type: "error", msg: err.message }); }
    setProcessing(null);
  };

  const handleExtractAll = async () => {
    setProcessing("all");
    setStatus({ type: "ok", msg: "Processing all documents..." });
    let totalE = 0, totalN = 0, totalEg = 0;
    for (const doc of documents) {
      try {
        const extRes = await fetch(`/api/extraction/extract/${doc.id}`, { method: "POST" });
        if (!extRes.ok) continue;
        totalE += (await extRes.json()).extracted || 0;
        const graphRes = await fetch(`/api/graph/build/${doc.id}`, { method: "POST" });
        if (!graphRes.ok) continue;
        const g = await graphRes.json();
        totalN += g.nodes_created || 0;
        totalEg += g.edges_created || 0;
      } catch {}
    }
    setStatus({ type: "ok", msg: `Done: ${totalE} elements, ${totalN} nodes, ${totalEg} edges` });
    fetchDocs();
    fetchMetrics();
    setProcessing(null);
  };

  const hasUnprocessed = documents.some((d) => (d.policy_count || 0) === 0 && (d.chunk_count || 0) > 0);

  const pipelineStages = [
    { label: "Parse", icon: "description", count: documents.length, done: true },
    { label: "Structure", icon: "schema", done: true },
    { label: "Chunk", icon: "segment", count: documents.reduce((s, d) => s + (d.chunk_count || 0), 0), done: true },
    { label: "Extract", icon: "save_as", count: documents.reduce((s, d) => s + (d.policy_count || 0), 0), done: hasUnprocessed ? false : documents.length > 0 },
    { label: "Link", icon: "hub", count: metrics?.relationships || 0, done: hasUnprocessed ? false : documents.length > 0 },
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-display-lg font-heading font-semibold text-on-surface tracking-tight">Document Ingestion</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">Build and maintain the regulatory knowledge graph from source documents.</p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="bg-primary-container text-white text-on-primary font-label-bold text-[12px] px-4 py-2 rounded flex items-center gap-2 hover:bg-tertiary-container transition-colors shadow-sm disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">{scanning ? "progress_activity" : "document_scanner"}</span>
          {scanning ? "Scanning..." : "Scan directory"}
        </button>
      </div>

      {/* Pipeline Visualization */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded p-6 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-label-bold text-[12px] text-on-surface uppercase tracking-wider">Ingestion Pipeline Status</h3>
          {processing && (
            <span className="font-label-mono text-[11px] text-secondary bg-secondary/10 px-2 py-1 rounded flex items-center gap-1 border border-secondary/30">
              <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span> Processing...
            </span>
          )}
        </div>
        <div className="relative py-6 overflow-x-auto">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-outline-variant"></div>
          <div className="flex justify-between min-w-[700px] px-4 relative">
            {pipelineStages.map((stage, i) => (
              <div key={i} className="flex flex-col items-center gap-2 w-32 relative z-10">
                <div className={`w-10 h-10 bg-surface-container-lowest border-2 ${stage.done ? "border-secondary" : "border-outline-variant border-dashed"} rounded flex items-center justify-center shadow-sm`}>
                  <span className={`material-symbols-outlined text-lg ${stage.done ? "text-secondary" : "text-on-surface-variant"}`}>{stage.icon}</span>
                </div>
                <div className="text-center">
                  <div className="font-label-bold text-[12px] text-on-surface">{stage.label}</div>
                  {stage.count != null && (
                    <div className="font-label-mono text-[10px] text-on-surface-variant mt-1">{stage.count.toLocaleString()}</div>
                  )}
                  <div className={`font-label-mono text-[10px] flex items-center justify-center gap-0.5 mt-0.5 ${stage.done ? "text-emerald-600" : "text-on-surface-variant"}`}>
                    <span className="material-symbols-outlined text-[10px]">{stage.done ? "check_circle" : "pending"}</span>
                    {stage.done ? "Complete" : "Pending"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div className={`mb-6 text-body-xs px-4 py-3 rounded ${
          status.type === "error" ? "bg-error-container/20 text-on-error-container" :
          status.type === "warn" ? "bg-amber-50 text-amber-700" :
          "bg-emerald-50 text-emerald-700"
        }`}>
          {status.msg}
        </div>
      )}

      <div className="flex gap-6">
        {/* Document list */}
        <div className="flex-1 bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low/50 flex justify-between items-center">
            <h3 className="font-label-bold text-[12px] text-on-surface uppercase">Documents</h3>
            {hasUnprocessed && (
              <button
                onClick={handleExtractAll}
                disabled={processing === "all"}
                className="bg-emerald-600 text-white text-[10px] font-semibold px-3 py-1.5 rounded flex items-center gap-1 hover:bg-emerald-700 transition-colors disabled:opacity-50 uppercase tracking-wider"
              >
                {processing === "all" ? "Working..." : "Extract All"}
              </button>
            )}
          </div>
          <div className="divide-y divide-outline-variant">
            {documents.map((doc) => {
              const processed = (doc.policy_count || 0) > 0;
              return (
                <div key={doc.id} className="px-4 py-3 hover:bg-surface-container-lowest/50 transition-colors flex items-center justify-between group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">description</span>
                    <div className="min-w-0">
                      <div className="text-body-xs font-semibold text-on-surface truncate">{doc.filename}</div>
                      <div className="font-label-mono text-[10px] text-on-surface-variant">{doc.chunk_count} chunks · {doc.policy_count} elements</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {processed ? (
                      <span className="px-2 py-0.5 text-[10px] font-label-mono bg-emerald-50 text-emerald-700 rounded">Processed</span>
                    ) : (
                      <button
                        onClick={() => handleExtractAndBuild(doc.id)}
                        disabled={processing === doc.id}
                        className="bg-secondary text-white text-[10px] font-semibold px-3 py-1.5 rounded hover:bg-secondary/90 transition-colors disabled:opacity-50 uppercase tracking-wider flex items-center gap-1"
                      >
                        {processing === doc.id ? "Building..." : "Extract & Build"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {documents.length === 0 && (
              <div className="py-12 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[40px] text-outline mb-2 block">folder_open</span>
                <p className="text-body-sm font-heading">No documents found</p>
                <p className="text-body-xs text-outline mt-1">Scan the directory or upload documents to begin.</p>
              </div>
            )}
          </div>
        </div>

        {/* Health sidebar */}
        <aside className="w-72 bg-surface-container-low border border-outline-variant rounded flex flex-col shrink-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-lowest">
            <h3 className="font-label-bold text-[12px] text-on-surface uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">health_and_safety</span>
              Knowledge Graph Health
            </h3>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {[
              { label: "Nodes", value: (metrics?.documents || 0) + (metrics?.policy_elements || 0) },
              { label: "Relationships", value: metrics?.relationships || 0 },
              { label: "Documents", value: metrics?.documents || 0 },
              { label: "Policy Elements", value: metrics?.policy_elements || 0 },
              { label: "Orphan Elements", value: metrics?.orphan_elements || 0, warn: (metrics?.orphan_elements || 0) > 0 },
              { label: "Graph Health", value: `${metrics?.graph_health || 0}%` },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center pb-3 border-b border-outline-variant/50">
                <span className="font-label-mono text-[11px] text-on-surface-variant">{item.label}</span>
                <span className={`font-label-bold text-body-sm ${item.warn ? "text-amber-600" : "text-on-surface"}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
