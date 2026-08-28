import { useState, useCallback, useEffect, useMemo } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import GraphView from "../components/GraphView";

const TYPE_COLORS = {
  threshold: { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  constraint: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  variable: { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
  condition: { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
};

const EDGE_LABELS = {
  DEPENDS_ON: { label: "Depends On", color: "#f59e0b", icon: "link" },
  REFERENCES: { label: "References", color: "#3b82f6", icon: "reference" },
  HAS_POLICY: { label: "Defines", color: "#10b981", icon: "policy" },
  HAS_SECTION: { label: "Has Section", color: "#94a3b8", icon: "section" },
  CONFLICTS_WITH: { label: "Conflicts", color: "#ef4444", icon: "warning" },
  SUPERSEDED_BY: { label: "Superseded", color: "#6366f1", icon: "history" },
};

function StatPill({ value, label, color }) {
  return (
    <div className="flex flex-col items-center py-1.5 px-1 rounded bg-slate-50 border border-slate-100">
      <span className="text-base font-bold" style={{ color }}>{value}</span>
      <span className="text-[9px] text-slate-400 uppercase tracking-wider leading-tight">{label}</span>
    </div>
  );
}

function ProvenancePanel({ node, onClose, onNavigateToImpact }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!node?.data?.policy_id) return;
    setLoading(true);
    fetch(`/api/graph/node/${node.data.policy_id}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [node?.data?.policy_id]);

  if (!node) return null;

  const data = node.data || {};
  const typeStyle = TYPE_COLORS[data.element_type] || TYPE_COLORS.threshold;

  return (
    <div className="w-[320px] border-l border-slate-200 bg-white overflow-y-auto shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Inspector</span>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100">
          <span className="material-symbols-outlined text-[16px] text-slate-400">close</span>
        </button>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: typeStyle.bg, color: typeStyle.text }}>
            {data.element_type || "policy"}
          </span>
          <span className="text-[10px] text-slate-400">{node.type}</span>
        </div>
        <h3 className="text-sm font-bold text-slate-800 mb-3 leading-tight">{data.label || data.name || node.id}</h3>

        <Section title="Source Document">
          <div className="flex items-center gap-1.5 text-xs text-slate-700">
            <span className="material-symbols-outlined text-[13px] text-slate-400">description</span>
            <span className="font-medium">{data.doc_filename || "Unknown"}</span>
          </div>
        </Section>

        {data.source_text && (
          <Section title="Extracted Evidence">
            <p className="text-[11px] text-slate-600 italic leading-relaxed border-l-2 border-slate-300 pl-2">
              "{String(data.source_text).slice(0, 200)}"
            </p>
          </Section>
        )}

        {data.value && (
          <Section title="Current Value">
            <div className="text-sm font-mono font-semibold text-slate-800">
              {String(data.value)}
              {data.unit && <span className="text-slate-400 font-normal ml-1">{data.unit}</span>}
            </div>
          </Section>
        )}

        {detail?.relationships?.length > 0 && (
          <Section title={`Relationships (${detail.relationships.length})`}>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {detail.relationships.map((rel, i) => {
                const edgeInfo = EDGE_LABELS[rel.rel_type] || { label: rel.rel_type, color: "#94a3b8", icon: "link" };
                return (
                  <div key={i} className="flex items-start gap-2 text-[11px] p-1.5 rounded bg-white border border-slate-100">
                    <span className="material-symbols-outlined text-[11px] mt-0.5" style={{ color: edgeInfo.color }}>{edgeInfo.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-slate-700 truncate">{rel.name}</span>
                        <span className="text-[8px] px-1 rounded" style={{ background: `${edgeInfo.color}15`, color: edgeInfo.color }}>{edgeInfo.label}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{rel.doc_filename}</div>
                      {rel.reason && <div className="text-[10px] text-slate-500 mt-0.5 italic">{rel.reason}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <Section title="Metadata">
          <div className="space-y-1 text-[11px]">
            <MetaRow label="Node ID" value={node.id} />
            {data.policy_id && <MetaRow label="Policy ID" value={`PE-${data.policy_id}`} />}
            {detail?.relationship_count != null && <MetaRow label="Direct Links" value={detail.relationship_count} />}
          </div>
        </Section>

        {node.type === "PolicyElement" && onNavigateToImpact && (
          <button
            onClick={() => onNavigateToImpact(data.label || data.name || node.id)}
            className="w-full mt-2 bg-blue-600 text-white text-[12px] font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">analytics</span>
            Simulate Impact
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-600 truncate max-w-[140px]">{value}</span>
    </div>
  );
}

function EdgeDetailPanel({ edge, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!edge) return;
    setLoading(true);
    const params = new URLSearchParams({ source: edge.source, target: edge.target, rel_type: edge.type });
    fetch(`/api/graph/edge-detail?${params}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [edge]);

  if (!edge) return null;
  const edgeInfo = EDGE_LABELS[edge.type] || { label: edge.type, color: "#94a3b8", icon: "link" };

  return (
    <div className="w-[320px] border-l border-slate-200 bg-white overflow-y-auto shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Edge Detail</span>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100">
          <span className="material-symbols-outlined text-[16px] text-slate-400">close</span>
        </button>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[16px]" style={{ color: edgeInfo.color }}>{edgeInfo.icon}</span>
          <span className="text-sm font-bold text-slate-800">{edgeInfo.label}</span>
        </div>

        <Section title="Connection">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-slate-700 truncate flex-1">{detail?.source?.name || edge.source}</span>
            <span className="material-symbols-outlined text-[14px] text-slate-300">arrow_forward</span>
            <span className="font-medium text-slate-700 truncate flex-1">{detail?.target?.name || edge.target}</span>
          </div>
        </Section>

        {detail?.explanation && (
          <Section title="Explanation">
            <p className="text-[11px] text-slate-600 leading-relaxed">{detail.explanation}</p>
          </Section>
        )}

        {detail?.evidence && (
          <Section title="Evidence">
            <div className="space-y-1.5 text-[11px]">
              {detail.evidence.a_value && <MetaRow label="Source value" value={detail.evidence.a_value} />}
              {detail.evidence.b_value && <MetaRow label="Target value" value={detail.evidence.b_value} />}
              {detail.evidence.a_document && <MetaRow label="Source doc" value={detail.evidence.a_document} />}
              {detail.evidence.b_document && <MetaRow label="Target doc" value={detail.evidence.b_document} />}
            </div>
          </Section>
        )}

        <Section title="Edge Properties">
          <div className="space-y-1 text-[11px]">
            <MetaRow label="Type" value={edge.type} />
            {edge.reason && (
              <div>
                <span className="text-slate-400">Reason</span>
                <p className="text-[11px] text-slate-600 mt-0.5 italic">{edge.reason}</p>
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

export default function KnowledgeGraph({ onNavigateToImpact }) {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [], stats: {} });
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [nodeFilters, setNodeFilters] = useState({ Document: true, Chunk: false, PolicyElement: true });
  const [edgeFilters, setEdgeFilters] = useState({
    DEPENDS_ON: true, REFERENCES: true, HAS_POLICY: true,
    HAS_SECTION: true, CONFLICTS_WITH: true, SUPERSEDED_BY: true,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/graph/overview")
      .then((r) => r.json())
      .then((d) => setGraphData({ nodes: d.nodes || [], edges: d.edges || [], stats: d.stats || {} }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filters = useMemo(() => {
    const f = {};
    Object.entries(nodeFilters).forEach(([k, v]) => { f[k] = v; });
    Object.entries(edgeFilters).forEach(([k, v]) => { f[k] = v; });
    return f;
  }, [nodeFilters, edgeFilters]);

  const handleNodeClick = useCallback((nodeData) => { setSelectedNode(nodeData); setSelectedEdge(null); }, []);
  const handleEdgeClick = useCallback((edgeData) => { setSelectedEdge(edgeData); setSelectedNode(null); }, []);
  const handleNodeSelect = useCallback((nodeId) => {
    setSelectedNodeId(nodeId);
    if (!nodeId) { setSelectedNode(null); setSelectedEdge(null); }
  }, []);

  const stats = graphData.stats || {};

  const toggleEdgeFilter = (type) => setEdgeFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  const toggleNodeFilter = (type) => setNodeFilters((prev) => ({ ...prev, [type]: !prev[type] }));

  return (
    <div className="h-full flex relative">
      {/* Sidebar */}
      <div
        className="border-r border-slate-200 bg-white shrink-0 overflow-y-auto transition-all duration-300 flex flex-col"
        style={{ width: sidebarOpen ? 220 : 0, minWidth: sidebarOpen ? 220 : 0, opacity: sidebarOpen ? 1 : 0 }}
      >
        {sidebarOpen && (
          <div className="p-3 flex flex-col h-full min-w-[220px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-slate-400">account_tree</span>
                <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Graph</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="w-5 h-5 flex items-center justify rounded hover:bg-slate-100" title="Collapse">
                <span className="material-symbols-outlined text-[14px] text-slate-400">chevron_left</span>
              </button>
            </div>

            {/* Stats - compact row */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              <StatPill value={stats.documents || 0} label="Docs" color="#1e3a5f" />
              <StatPill value={stats.policy_elements || 0} label="Items" color="#10b981" />
              <StatPill value={stats.total_edges || 0} label="Edges" color="#3b82f6" />
              {stats.conflicts > 0 && <StatPill value={stats.conflicts} label="Conflicts" color="#ef4444" />}
              {stats.version_lineages > 0 && <StatPill value={stats.version_lineages} label="Versions" color="#6366f1" />}
              <StatPill value={stats.sections || 0} label="Sections" color="#94a3b8" />
            </div>

            {/* Search */}
            <div className="mb-3">
              <div className="relative">
                <span className="material-symbols-outlined text-[13px] text-slate-300 absolute left-2 top-1/2 -translate-y-1/2">search</span>
                <input
                  type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full text-[11px] pl-7 pr-2 py-1.5 rounded border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {/* Node Types */}
            <FilterSection title="Node Types">
              {[
                { type: "Document", icon: "description" },
                { type: "Chunk", icon: "section" },
                { type: "PolicyElement", icon: "gavel" },
              ].map(({ type, icon }) => (
                <label key={type} className="flex items-center gap-1.5 text-[11px] text-slate-600 py-0.5 cursor-pointer">
                  <input type="checkbox" checked={nodeFilters[type]} onChange={() => toggleNodeFilter(type)} className="rounded border-slate-300 w-3 h-3" />
                  <span className="material-symbols-outlined text-[12px] text-slate-400">{icon}</span>
                  <span className="truncate">{type === "PolicyElement" ? "Elements" : type}</span>
                  <span className="ml-auto text-[9px] text-slate-400">{graphData.nodes.filter((n) => n.type === type).length}</span>
                </label>
              ))}
            </FilterSection>

            {/* Edge Types */}
            <FilterSection title="Relationships">
              {Object.entries(EDGE_LABELS).map(([type, info]) => (
                <label key={type} className="flex items-center gap-1.5 text-[11px] text-slate-600 py-0.5 cursor-pointer">
                  <input type="checkbox" checked={edgeFilters[type]} onChange={() => toggleEdgeFilter(type)} className="rounded border-slate-300 w-3 h-3" />
                  <span className="w-3 h-0 border-t-2 shrink-0" style={{ borderColor: info.color, borderStyle: ["CONFLICTS_WITH", "SUPERSEDED_BY"].includes(type) ? "dashed" : "solid" }} />
                  <span className="truncate">{info.label}</span>
                </label>
              ))}
            </FilterSection>
          </div>
        )}
      </div>

      {/* Sidebar toggle when collapsed */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 border-l-0 rounded-r-lg px-1 py-3 shadow-sm hover:bg-slate-50 transition-colors"
          title="Expand sidebar"
        >
          <span className="material-symbols-outlined text-[16px] text-slate-400">chevron_right</span>
        </button>
      )}

      {/* Graph */}
      <div className="flex-1 relative min-w-0">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-3" />
            <p className="text-xs">Loading graph...</p>
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <span className="material-symbols-outlined text-[48px] mb-3 text-slate-300">account_tree</span>
            <p className="text-sm font-medium text-slate-500">No graph data</p>
            <p className="text-xs text-slate-400 mt-1">Run the demo or ingest documents to build the graph.</p>
          </div>
        ) : (
          <ReactFlowProvider>
            <GraphView
              graphData={graphData}
              filters={filters}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              selectedNodeId={selectedNodeId}
              onNodeSelect={handleNodeSelect}
              searchQuery={searchQuery}
            />
          </ReactFlowProvider>
        )}
      </div>

      {/* Detail panels */}
      {selectedNode && <ProvenancePanel node={selectedNode} onClose={() => { setSelectedNode(null); setSelectedNodeId(null); }} onNavigateToImpact={onNavigateToImpact} />}
      {selectedEdge && !selectedNode && <EdgeDetailPanel edge={selectedEdge} onClose={() => setSelectedEdge(null)} />}
    </div>
  );
}

function FilterSection({ title, children }) {
  return (
    <div className="mb-3">
      <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-1">{title}</div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
