import { useState, useEffect, useCallback } from "react";
import { X, ExternalLink, ChevronRight, Loader2, AlertTriangle } from "lucide-react";

const TYPE_STYLES = {
  threshold: { bg: "#dbeafe", text: "#1e40af", border: "#3b82f6" },
  constraint: { bg: "#fef3c7", text: "#92400e", border: "#f59e0b" },
  variable: { bg: "#ede9fe", text: "#5b21b6", border: "#8b5cf6" },
  condition: { bg: "#d1fae5", text: "#065f46", border: "#10b981" },
};

const REL_COLORS = {
  DEPENDS_ON: { color: "#f59e0b", label: "depends on" },
  REFERENCES: { color: "#3b82f6", label: "references" },
};

export default function NodeInspector({ nodeId, onClose, onNavigate }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRels, setExpandedRels] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!nodeId) return;
    setLoading(true);
    setError(null);
    try {
      const numericId = nodeId.replace("policy-", "");
      const res = await fetch(`/api/graph/node/${numericId}`);
      if (!res.ok) throw new Error(`Not found: ${res.status}`);
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [nodeId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (!nodeId) return null;

  const node = detail?.node;
  const relationships = detail?.relationships || [];
  const typeStyle = TYPE_STYLES[node?.element_type] || TYPE_STYLES.threshold;

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col overflow-hidden shrink-0 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Inspector</h3>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-sm text-red-600">
            <AlertTriangle className="w-5 h-5 mx-auto mb-2" />
            {error}
          </div>
        </div>
      )}

      {!loading && !error && node && (
        <div className="flex-1 overflow-y-auto">
          {/* Identity */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: typeStyle.bg, color: typeStyle.text }}
              >
                {node.element_type}
              </span>
            </div>
            <h4 className="font-bold text-slate-900 text-sm leading-snug">{node.name}</h4>
            {node.value && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Value</span>
                <span className="font-mono text-sm font-semibold text-slate-700">
                  {String(node.value)}
                </span>
                {node.unit && (
                  <span className="text-xs text-slate-400">{node.unit}</span>
                )}
              </div>
            )}
          </div>

          {/* Source Text */}
          {node.source_text && (
            <div className="p-4 border-b border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
                Source Evidence
              </div>
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-md p-2.5 border border-slate-100">
                "{node.source_text}"
              </p>
            </div>
          )}

          {/* Document */}
          <div className="p-4 border-b border-slate-100">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
              Source Document
            </div>
            <button
              onClick={() => onNavigate && onNavigate("doc", node.doc_id)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {node.doc_filename || `Document ${node.doc_id}`}
            </button>
          </div>

          {/* Relationships */}
          <div className="p-4">
            <button
              onClick={() => setExpandedRels(!expandedRels)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors w-full"
            >
              <ChevronRight
                className={`w-3 h-3 transition-transform duration-150 ${
                  expandedRels ? "rotate-90" : ""
                }`}
              />
              <span>Relationships</span>
              <span className="ml-auto text-[10px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                {relationships.length}
              </span>
            </button>

            {expandedRels && (
              <div className="mt-2 space-y-0.5">
                {relationships.length === 0 ? (
                  <div className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-md">
                    No relationships found
                  </div>
                ) : (
                  relationships.map((rel, i) => {
                    const relStyle = REL_COLORS[rel.rel_type] || { color: "#94a3b8", label: rel.rel_type };
                    return (
                      <button
                        key={i}
                        onClick={() => onNavigate && onNavigate("policy", rel.id)}
                        className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-slate-50 transition-colors group"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: relStyle.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-slate-700 truncate group-hover:text-slate-900">
                            {rel.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            <span style={{ color: relStyle.color }}>{relStyle.label}</span>
                            {" \u00b7 "}
                            {rel.doc_filename}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
