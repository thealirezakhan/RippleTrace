import { useState, useCallback, useEffect } from "react";
import {
  RefreshCw, Filter, RotateCcw, ChevronDown, ChevronRight, ChevronLeft,
  FileText, Loader2, AlertCircle, CheckCircle, Play, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";

const DEFAULT_FILTERS = {
  Document: true, Chunk: false, PolicyElement: true,
  DEPENDS_ON: true, REFERENCES: true, HAS_SECTION: true, HAS_POLICY: true,
};

export default function Sidebar({ onGraphData, onFetchOverview, onImpact, filters, setFilters, collapsed, onToggleCollapse }) {
  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(null);

  const [simElement, setSimElement] = useState("limit_50000_usd");
  const [simOld, setSimOld] = useState("10000");
  const [simNew, setSimNew] = useState("25000");
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("rippletrace-filters");
    if (saved) { try { setFilters(JSON.parse(saved)); } catch (e) {} }
  }, []);

  useEffect(() => {
    localStorage.setItem("rippletrace-filters", JSON.stringify(filters));
  }, [filters]);

  const handleResetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), [setFilters]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents/");
      setDocuments(await res.json());
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setStatus({ type: "ok", msg: "Scanning..." });
    try {
      const res = await fetch("/api/documents/scan", { method: "POST" });
      const data = await res.json();
      setStatus({ type: data.errors?.length ? "warn" : "ok", msg: `Scanned ${data.scanned} docs (${data.total_chunks} chunks)` });
      await fetchDocuments();
    } catch (err) { setStatus({ type: "error", msg: err.message }); }
    setScanning(false);
  }, [fetchDocuments]);

  const handleLoadGraph = useCallback(async () => {
    setLoading(true);
    try { await onFetchOverview(); } catch (err) { console.error(err); }
    setLoading(false);
  }, [onFetchOverview]);

  const handleExtractAndBuild = useCallback(async (docId) => {
    setProcessing(docId);
    setStatus({ type: "ok", msg: "Extracting..." });
    try {
      const extRes = await fetch(`/api/extraction/extract/${docId}`, { method: "POST" });
      if (!extRes.ok) throw new Error(`Extraction failed: ${extRes.statusText}`);
      const extData = await extRes.json();
      setStatus({ type: "ok", msg: `Extracted ${extData.extracted}. Building graph...` });
      const graphRes = await fetch(`/api/graph/build/${docId}`, { method: "POST" });
      if (!graphRes.ok) throw new Error(`Graph build failed: ${graphRes.statusText}`);
      const graph = await graphRes.json();
      setStatus({ type: "ok", msg: `Built: ${graph.nodes_created} nodes, ${graph.edges_created} edges` });
      await fetchDocuments();
    } catch (err) { setStatus({ type: "error", msg: err.message }); }
    setProcessing(null);
  }, [fetchDocuments]);

  const handleExtractAll = useCallback(async () => {
    setProcessing("all");
    setStatus({ type: "ok", msg: "Processing all documents..." });
    let totalE = 0, totalN = 0, totalEg = 0, errs = 0;
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
      } catch { errs++; }
    }
    setStatus({ type: errs ? "warn" : "ok", msg: `Done: ${totalE} elements, ${totalN} nodes, ${totalEg} edges` });
    await fetchDocuments();
    setProcessing(null);
  }, [documents, fetchDocuments]);

  const handleSimulate = useCallback(async () => {
    if (!simElement.trim()) { setSimError("Element name required"); return; }
    const oldN = parseFloat(simOld), newN = parseFloat(simNew);
    if (isNaN(oldN) || isNaN(newN)) { setSimError("Values must be numbers"); return; }
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await fetch("/api/simulate/impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ element_name: simElement, old_value: oldN, new_value: newN }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      onImpact(await res.json());
    } catch (err) { setSimError(err.message); }
    setSimLoading(false);
  }, [simElement, simOld, simNew, onGraphData]);

  const nodeCounts = {
    Document: documents.length,
    Chunk: documents.reduce((s, d) => s + (d.chunk_count || 0), 0),
    PolicyElement: documents.reduce((s, d) => s + (d.policy_count || 0), 0),
  };
  const hasUnprocessed = documents.some((d) => (d.policy_count || 0) === 0 && (d.chunk_count || 0) > 0);

  if (collapsed) {
    return (
      <div className="w-10 bg-white border-r border-slate-200 flex flex-col items-center py-3 shrink-0">
        <button onClick={onToggleCollapse} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors mb-4" title="Expand sidebar">
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <div className="flex flex-col gap-3 items-center mt-2">
          <button onClick={handleLoadGraph} disabled={loading} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Load graph">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={handleScan} disabled={scanning} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Scan documents">
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleSimulate} disabled={simLoading} className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Simulate impact">
            <Play className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 bg-white border-r border-slate-200 flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50">
        <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Control Panel</h2>
        <button onClick={onToggleCollapse} className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors" title="Collapse sidebar">
          <PanelLeftClose className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Documents */}
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-600">Documents</h3>
            <button onClick={() => setExpandedDocs(!expandedDocs)} className="text-[10px] text-slate-400 hover:text-slate-600">
              {expandedDocs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          </div>
          <div className="flex gap-1.5 mb-2">
            <button onClick={handleScan} disabled={scanning} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-600 text-white text-[10px] font-semibold rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 uppercase tracking-wider">
              {scanning ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
              {scanning ? "Scanning..." : "Scan"}
            </button>
            {hasUnprocessed && (
              <button onClick={handleExtractAll} disabled={processing === "all"} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-600 text-white text-[10px] font-semibold rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 uppercase tracking-wider">
                {processing === "all" ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
                {processing === "all" ? "Working..." : "Extract All"}
              </button>
            )}
          </div>
          {expandedDocs && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {documents.length === 0 ? (
                <div className="text-[10px] text-slate-400 text-center py-2">No documents</div>
              ) : documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between px-2 py-1 bg-slate-50 rounded text-[11px] group">
                  <span className="flex items-center gap-1 text-slate-600 truncate min-w-0">
                    <FileText className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                    <span className="truncate">{doc.filename}</span>
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] text-slate-400">{doc.chunk_count}c/{doc.policy_count}p</span>
                    {(doc.policy_count || 0) === 0 && (doc.chunk_count || 0) > 0 && (
                      <button onClick={() => handleExtractAndBuild(doc.id)} disabled={processing === doc.id} className="text-[9px] text-blue-600 hover:text-blue-700 font-semibold">
                        {processing === doc.id ? <Loader2 className="w-2 h-2 animate-spin inline" /> : "Build"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {status && (
            <div className={`mt-2 text-[10px] px-2 py-1.5 rounded ${
              status.type === "error" ? "bg-red-50 text-red-600" :
              status.type === "warn" ? "bg-amber-50 text-amber-600" :
              "bg-emerald-50 text-emerald-600"
            }`}>
              {status.msg}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Filter className="w-3 h-3" /> Filters
            </h3>
            <button onClick={handleResetFilters} className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5">
              <RotateCcw className="w-2.5 h-2.5" /> Reset
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Nodes</div>
              {["Document", "Chunk", "PolicyElement"].map((type) => (
                <label key={type} className="flex items-center justify-between text-[11px] text-slate-600 py-0.5 cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <input type="checkbox" checked={filters[type]} onChange={() => setFilters({ ...filters, [type]: !filters[type] })} className="rounded border-slate-300 text-blue-600 w-3 h-3" />
                    {type}
                  </div>
                  <span className="text-[9px] text-slate-400">{nodeCounts[type] || 0}</span>
                </label>
              ))}
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Edges</div>
              {["DEPENDS_ON", "REFERENCES", "HAS_SECTION", "HAS_POLICY"].map((type) => (
                <label key={type} className="flex items-center text-[11px] text-slate-600 py-0.5 cursor-pointer">
                  <input type="checkbox" checked={filters[type]} onChange={() => setFilters({ ...filters, [type]: !filters[type] })} className="rounded border-slate-300 text-blue-600 w-3 h-3 mr-1.5" />
                  {type.replace(/_/g, " ")}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Simulate */}
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold text-slate-600 mb-2">Simulate Change</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">Element Name</label>
              <input value={simElement} onChange={(e) => setSimElement(e.target.value)} className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="e.g. limit_50000_usd" />
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <label className="block text-[10px] text-slate-400 mb-0.5">Old</label>
                <input type="number" value={simOld} onChange={(e) => setSimOld(e.target.value)} className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-slate-400 mb-0.5">New</label>
                <input type="number" value={simNew} onChange={(e) => setSimNew(e.target.value)} className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
            </div>
            {simError && (
              <div className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded">{simError}</div>
            )}
            <button onClick={handleSimulate} disabled={simLoading} className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-amber-500 text-white text-[10px] font-semibold rounded-md hover:bg-amber-600 transition-colors disabled:opacity-50 uppercase tracking-wider">
              {simLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
              {simLoading ? "Computing..." : "Simulate Impact"}
            </button>
          </div>
        </div>
      </div>

      {/* Load Graph */}
      <div className="px-4 py-2.5 border-t border-slate-200">
        <button onClick={handleLoadGraph} disabled={loading} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-[10px] font-semibold rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 uppercase tracking-wider">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Loading..." : "Load Graph"}
        </button>
      </div>
    </div>
  );
}
