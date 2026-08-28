import { useState, useEffect } from "react";
import { RefreshCw, FileText, Layers, GitBranch, AlertTriangle, TrendingUp, Loader2 } from "lucide-react";

const METRIC_CARDS = [
  { key: "documents", label: "Documents", icon: FileText, color: "#1e3a5f", bg: "#e8eef6" },
  { key: "chunks", label: "Text Chunks", icon: Layers, color: "#475569", bg: "#f1f5f9" },
  { key: "policy_elements", label: "Policy Elements", icon: GitBranch, color: "#059669", bg: "#d1fae5" },
  { key: "relationships", label: "Relationships", icon: TrendingUp, color: "#d97706", bg: "#fef3c7" },
  { key: "cross_document_references", label: "Cross-Doc Refs", icon: GitBranch, color: "#2563eb", bg: "#dbeafe" },
  { key: "cross_document_depends", label: "Cross-Doc Deps", icon: TrendingUp, color: "#7c3aed", bg: "#ede9fe" },
];

export default function Dashboard({ onViewChange }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/metrics");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={fetchMetrics} className="mt-3 text-sm text-blue-600 hover:text-blue-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const healthPercent = metrics.graph_health || 0;
  const healthColor = healthPercent > 80 ? "#10b981" : healthPercent > 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="h-full overflow-y-auto p-6 bg-slate-50">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Compliance Universe</h2>
            <p className="text-xs text-slate-500 mt-0.5">Regulatory knowledge graph overview</p>
          </div>
          <button
            onClick={fetchMetrics}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-3 gap-3">
          {METRIC_CARDS.map(({ key, label, icon: Icon, color, bg }) => (
            <div key={key} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: bg }}
                >
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900">{metrics[key] ?? 0}</div>
                  <div className="text-[11px] text-slate-500">{label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Graph Health */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
            Graph Health
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-slate-100 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${healthPercent}%`, background: healthColor }}
              />
            </div>
            <span className="text-sm font-bold" style={{ color: healthColor }}>
              {healthPercent}%
            </span>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-4 text-center">
            {[
              { label: "Documents", value: metrics.documents },
              { label: "Chunks", value: metrics.chunks },
              { label: "Elements", value: metrics.policy_elements },
              { label: "Relationships", value: metrics.relationships },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-lg font-bold text-slate-900">{value}</div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Data Quality + Cross-Doc */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
              Data Quality
            </h3>
            <div className="space-y-2.5">
              {[
                { label: "Orphan elements", value: metrics.orphan_elements, warn: metrics.orphan_elements > 0 },
                { label: "Orphan chunks", value: metrics.orphan_chunks, warn: metrics.orphan_chunks > 0 },
                { label: "Empty documents", value: metrics.empty_documents, warn: metrics.empty_documents > 0 },
              ].map(({ label, value, warn }) => (
                <div key={label} className="flex items-center justify-between py-1">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: warn ? "#fef3c7" : "#d1fae5",
                      color: warn ? "#92400e" : "#065f46",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
              Cross-Document Connectivity
            </h3>
            <div className="space-y-2.5">
              {[
                { label: "REFERENCES edges", value: metrics.cross_document_references, color: "#3b82f6" },
                { label: "DEPENDS_ON edges", value: metrics.cross_document_depends, color: "#f59e0b" },
                { label: "Total cross-doc", value: metrics.cross_doc_relationships, color: "#8b5cf6" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between py-1">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className="text-xs font-bold" style={{ color }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Document Pipeline */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
            Document Pipeline
          </h3>
          <div className="flex items-center gap-2 text-sm">
            {[
              { label: "Ingested", value: metrics.documents, color: "#1e3a5f", bg: "#e8eef6" },
              { label: "Chunked", value: metrics.chunks, color: "#475569", bg: "#f1f5f9" },
              { label: "Extracted", value: metrics.policy_elements, color: "#059669", bg: "#d1fae5" },
              { label: "Connected", value: metrics.relationships, color: "#d97706", bg: "#fef3c7" },
            ].map(({ label, value, color, bg }, i) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                {i > 0 && <span className="text-slate-300 text-lg">→</span>}
                <div
                  className="flex-1 text-center py-3 rounded-lg"
                  style={{ background: bg }}
                >
                  <div className="text-lg font-bold" style={{ color }}>{value}</div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: `${color}99` }}>
                    {label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
