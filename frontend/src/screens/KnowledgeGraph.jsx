import { useState, useCallback, useEffect, useMemo } from "react";
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const TYPE_COLORS = {
  Document: { bg: "#131b2e", border: "#0f172a", text: "#ffffff", icon: "description" },
  threshold: { bg: "#f0f3ff", border: "#4b41e1", text: "#111c2d", icon: "gavel" },
  constraint: { bg: "#fef3c7", border: "#d97706", text: "#111c2d", icon: "gavel" },
  variable: { bg: "#ede9fe", border: "#7c3aed", text: "#111c2d", icon: "gavel" },
  condition: { bg: "#d1fae5", border: "#059669", text: "#111c2d", icon: "gavel" },
};

const EDGE_COLORS = {
  DEPENDS_ON: "#4b41e1",
  REFERENCES: "#76777d",
  HAS_POLICY: "#059669",
  HAS_SECTION: "#c6c6cd",
};

function computeLayout(nodes) {
  if (nodes.length === 0) return [];
  const docNodes = nodes.filter((n) => n.type === "Document");
  const polNodes = nodes.filter((n) => n.type === "PolicyElement");
  const positioned = new Map();
  const docSpacing = 400;
  docNodes.forEach((doc, i) => positioned.set(doc.id, { x: 80 + i * docSpacing, y: 40 }));
  const docPols = new Map();
  polNodes.forEach((p) => {
    const did = p.data?.doc_id ? `doc-${p.data.doc_id}` : null;
    if (did) { if (!docPols.has(did)) docPols.set(did, []); docPols.get(did).push(p); }
  });
  docPols.forEach((pols, did) => {
    const dp = positioned.get(did);
    if (!dp) return;
    pols.forEach((p, j) => {
      const col = Math.floor(j / 6);
      const row = j % 6;
      positioned.set(p.id, { x: dp.x + col * 170, y: dp.y + 160 + row * 72 });
    });
  });
  nodes.forEach((n) => { if (!positioned.has(n.id)) positioned.set(n.id, { x: 100, y: 400 }); });
  return nodes.map((n) => ({ ...n, position: positioned.get(n.id) || { x: 0, y: 0 } }));
}

function PolicyNode({ data }) {
  const ts = TYPE_COLORS[data.element_type] || TYPE_COLORS.threshold;
  return (
    <div className="rounded border-2 px-3 py-2 bg-white min-w-[140px] max-w-[160px]" style={{ borderColor: ts.border }}>
      <div className="flex items-center gap-1 mb-1">
        <span className="material-symbols-outlined text-[14px]" style={{ color: ts.border }}>{ts.icon}</span>
        <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: ts.text }}>{data.element_type || "policy"}</span>
      </div>
      <div className="text-body-xs font-heading font-semibold text-on-surface leading-tight truncate">{data.label || data.name}</div>
      {data.doc_filename && <div className="text-[10px] text-on-surface-variant mt-1 truncate">{data.doc_filename}</div>}
    </div>
  );
}

function DocumentNode({ data }) {
  return (
    <div className="rounded border-2 px-4 py-3 bg-inverse-surface min-w-[200px]">
      <div className="text-[9px] font-mono uppercase tracking-wider text-inverse-on-surface/60 mb-1">Document</div>
      <div className="text-body-sm font-heading font-semibold text-inverse-on-surface leading-tight">{data.label || "Untitled"}</div>
      {data.chunk_count != null && (
        <div className="text-[10px] text-inverse-on-surface/70 mt-1.5 flex gap-3">
          <span>{data.chunk_count} sections</span>
          <span>{data.policy_count} elements</span>
        </div>
      )}
    </div>
  );
}

const nodeTypes = { Document: DocumentNode, PolicyElement: PolicyNode };

export default function KnowledgeGraph() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [nodeTypes_, setNodeTypes] = useState({ Document: true, PolicyElement: true });
  const [relTypes, setRelTypes] = useState({ DEPENDS_ON: true, REFERENCES: true, HAS_POLICY: true, HAS_SECTION: true });
  const [inspector, setInspector] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const { fitView } = useReactFlow();

  useEffect(() => {
    fetch("/api/graph/overview").then((r) => r.json()).then((d) => {
      setGraphData({ nodes: d.nodes || [], edges: d.edges || [] });
    }).catch(() => {});
  }, []);

  const filteredNodeIds = useMemo(() => {
    return new Set(graphData.nodes.filter((n) => nodeTypes_[n.type] ?? true).map((n) => n.id));
  }, [graphData.nodes, nodeTypes_]);

  const computedNodes = useMemo(() => {
    const layout = computeLayout(graphData.nodes.filter((n) => filteredNodeIds.has(n.id)));
    return layout.map((n) => ({
      id: n.id,
      type: n.type === "Document" ? "Document" : "PolicyElement",
      data: { ...n.data, label: n.data?.label || n.id },
      position: n.position,
      style: { opacity: selectedNodeId && n.id !== selectedNodeId ? 0.15 : 1, transition: "opacity 0.2s" },
    }));
  }, [graphData.nodes, filteredNodeIds, selectedNodeId]);

  const computedEdges = useMemo(() => {
    return graphData.edges
      .filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target))
      .filter((e) => relTypes[e.type] ?? true)
      .map((e, i) => ({
        id: `e-${i}`,
        source: String(e.source),
        target: String(e.target),
        type: (e.type === "DEPENDS_ON" || e.type === "REFERENCES") ? "default" : "smoothstep",
        animated: selectedNodeId && (e.source === selectedNodeId || e.target === selectedNodeId),
        style: {
          stroke: EDGE_COLORS[e.type] || "#c6c6cd",
          strokeWidth: selectedNodeId && (e.source === selectedNodeId || e.target === selectedNodeId) ? 2 : 1,
          opacity: selectedNodeId && !(e.source === selectedNodeId || e.target === selectedNodeId) ? 0.15 : (e.type === "DEPENDS_ON" || e.type === "REFERENCES") ? 0.5 : 0.8,
        },
        markerEnd: (e.type === "DEPENDS_ON" || e.type === "REFERENCES") ? { type: "arrowclosed", color: EDGE_COLORS[e.type] || "#c6c6cd", width: 12, height: 12 } : undefined,
      }));
  }, [graphData.edges, filteredNodeIds, selectedNodeId, relTypes]);

  useEffect(() => { setNodes(computedNodes); setEdges(computedEdges); }, [computedNodes, computedEdges]);

  useEffect(() => {
    if (nodes.length > 0) { const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 200); return () => clearTimeout(t); }
  }, [graphData, fitView]);

  const onNodesChange = useCallback((c) => setNodes((nds) => applyNodeChanges(c, nds)), []);
  const onEdgesChange = useCallback((c) => setEdges((eds) => applyEdgeChanges(c, eds)), []);

  const handleNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id);
    const nd = graphData.nodes.find((n) => n.id === node.id);
    if (nd?.type === "PolicyElement") {
      const pid = nd.data?.policy_id || node.id.replace("policy-", "");
      fetch(`/api/graph/node/${pid}`).then((r) => r.json()).then(setInspector).catch(() => {});
    } else {
      setInspector(null);
    }
  }, [graphData.nodes]);

  return (
    <div className="h-full flex">
      {/* Config sidebar */}
      <div className="w-[220px] border-r border-outline-variant bg-surface-container-lowest p-4 shrink-0 overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">filter_list</span>
          <span className="text-label-bold text-on-surface">Graph Configuration</span>
        </div>

        <div className="mb-4">
          <div className="text-label-mono text-on-surface-variant uppercase tracking-widest text-[9px] mb-2">Node Types</div>
          {Object.entries({ Document: graphData.nodes.filter((n) => n.type === "Document").length, PolicyElement: graphData.nodes.filter((n) => n.type === "PolicyElement").length }).map(([type, count]) => (
            <label key={type} className="flex items-center gap-2 text-body-xs text-on-surface py-1 cursor-pointer">
              <input type="checkbox" checked={nodeTypes_[type]} onChange={() => setNodeTypes({ ...nodeTypes_, [type]: !nodeTypes_[type] })} className="rounded border-outline-variant accent-secondary" />
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">{type === "Document" ? "description" : "gavel"}</span>
              {type}
            </label>
          ))}
        </div>

        <div className="mb-4">
          <div className="text-label-mono text-on-surface-variant uppercase tracking-widest text-[9px] mb-2">Relationships</div>
          {["DEPENDS_ON", "REFERENCES", "HAS_POLICY", "HAS_SECTION"].map((type) => (
            <label key={type} className="flex items-center gap-2 text-body-xs text-on-surface py-1 cursor-pointer">
              <input type="checkbox" checked={relTypes[type]} onChange={() => setRelTypes({ ...relTypes, [type]: !relTypes[type] })} className="rounded border-outline-variant accent-secondary" />
              {type.replace(/_/g, " ")}
            </label>
          ))}
        </div>

        <div>
          <div className="text-label-mono text-on-surface-variant uppercase tracking-widest text-[9px] mb-2">Layout</div>
          <select className="input-field text-body-xs">
            <option>Force-Directed</option>
            <option>Hierarchical</option>
          </select>
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 relative">
        {graphData.nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] mb-3 text-outline">account_tree</span>
            <p className="text-body-sm font-heading">No graph data</p>
            <p className="text-body-xs text-outline mt-1">Ingest documents and build the graph from the sidebar.</p>
          </div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={handleNodeClick} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.1} maxZoom={2}>
            <Background color="#e7eeff" gap={24} size={1} />
            <Controls position="bottom-left" />
            <MiniMap nodeColor={(n) => { if (n.type === "Document") return "#131b2e"; return TYPE_COLORS[n.data?.element_type]?.border || "#4b41e1"; }} maskColor="rgba(0,0,0,0.06)" position="bottom-right" />
          </ReactFlow>
        )}

        {/* Inspector drawer */}
        {inspector && (
          <div className="absolute top-0 right-0 w-[320px] h-full bg-surface-container-low border-l border-outline-variant overflow-y-auto z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
              <span className="text-label-bold text-on-surface uppercase tracking-wider">Inspector</span>
              <button onClick={() => setInspector(null)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            {inspector.node && (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[14px] text-secondary">gavel</span>
                  <span className="badge bg-secondary/10 text-secondary">{inspector.node.element_type}</span>
                  <span className="badge bg-amber-50 text-amber-700">High Sensitivity</span>
                </div>
                <h3 className="text-headline-md font-heading font-semibold text-on-surface mb-3">{inspector.node.name}</h3>

                <div className="card p-3 mb-3">
                  <div className="text-label-mono text-on-surface-variant uppercase tracking-widest text-[9px] mb-1">Primary Source</div>
                  <div className="flex items-center gap-1 text-body-xs text-secondary">
                    <span className="material-symbols-outlined text-[14px]">description</span>
                    {inspector.node.doc_filename}
                  </div>
                </div>

                <div className="card p-3 mb-3">
                  <div className="text-label-mono text-on-surface-variant uppercase tracking-widest text-[9px] mb-1">Extracted Evidence</div>
                  <p className="text-body-xs text-on-surface italic leading-relaxed">"{inspector.node.source_text}"</p>
                </div>

                <div className="card p-3 mb-3">
                  <div className="text-label-mono text-on-surface-variant uppercase tracking-widest text-[9px] mb-2">Graph Connections</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-body-xs">
                      <span className="text-on-surface-variant flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">linear_scale</span>Direct Links</span>
                      <span className="font-mono font-semibold">{inspector.relationship_count || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="card p-3">
                  <div className="text-label-mono text-on-surface-variant uppercase tracking-widest text-[9px] mb-2">Metadata Properties</div>
                  <div className="space-y-1.5 text-body-xs">
                    <div className="flex justify-between"><span className="text-on-surface-variant">ID</span><span className="font-mono">PE-{inspector.node.id}</span></div>
                    <div className="flex justify-between"><span className="text-on-surface-variant">Confidence</span><span className="font-mono">98.4% (AI Assessed)</span></div>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button className="btn-secondary flex-1 text-[10px]">
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span> Open source
                  </button>
                  <button className="btn-ghost flex-1 text-[10px]">
                    <span className="material-symbols-outlined text-[14px]">analytics</span> Assess impact
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
