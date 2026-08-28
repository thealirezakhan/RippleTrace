import { useCallback, useMemo, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const DOC_TYPE_COLORS = {
  regulation: { bg: "#7c3aed", icon: "gavel", label: "Regulation" },
  policy: { bg: "#1e3a5f", icon: "policy", label: "Policy" },
  control: { bg: "#047857", icon: "security", label: "Control" },
  procedure: { bg: "#b45309", icon: "engineering", label: "Procedure" },
  technical: { bg: "#be123c", icon: "code", label: "Technical" },
  configuration: { bg: "#475569", icon: "settings", label: "Configuration" },
};

const TYPE_COLORS = {
  threshold: { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  constraint: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  variable: { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
  condition: { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
};

const EDGE_STYLES = {
  DEPENDS_ON: { stroke: "#f59e0b", label: "depends on", dash: false },
  REFERENCES: { stroke: "#3b82f6", label: "references", dash: false },
  HAS_POLICY: { stroke: "#10b981", label: "defines", dash: false },
  HAS_SECTION: { stroke: "#94a3b8", label: "has section", dash: false },
  CONFLICTS_WITH: { stroke: "#ef4444", label: "conflicts", dash: true },
  SUPERSEDED_BY: { stroke: "#6366f1", label: "superseded by", dash: true },
};

function getDocType(filename) {
  const f = filename?.toLowerCase() || "";
  if (f.includes("nist") || f.includes("regulation") || f.includes("sp800")) return "regulation";
  if (f.includes("policy") || f.includes("security_policy")) return "policy";
  if (f.includes("control") || f.includes("mfa")) return "control";
  if (f.includes("procedure") || f.includes("iam_procedure")) return "procedure";
  if (f.includes("technical") || f.includes("tech")) return "technical";
  if (f.includes("config") || f.includes("system")) return "configuration";
  return "policy";
}

function computeLayout(nodes) {
  if (nodes.length === 0) return [];

  const docNodes = nodes.filter((n) => n.type === "Document");
  const chunkNodes = nodes.filter((n) => n.type === "Chunk");
  const polNodes = nodes.filter((n) => n.type === "PolicyElement");

  const docSpacing = 650;
  const docStartX = 60;
  const docY = 40;
  const chunkStartY = 200;
  const chunkSpacing = 40;
  const polStartY = 200;
  const polSpacingX = 200;
  const polSpacingY = 72;
  const polsPerCol = 6;

  const positioned = new Map();

  docNodes.forEach((doc, i) => {
    positioned.set(doc.id, { x: docStartX + i * docSpacing, y: docY });
  });

  const docChunks = new Map();
  chunkNodes.forEach((ch) => {
    const docId = ch.data?.doc_id ? `doc-${ch.data.doc_id}` : null;
    if (docId) {
      if (!docChunks.has(docId)) docChunks.set(docId, []);
      docChunks.get(docId).push(ch);
    }
  });

  docChunks.forEach((chunks, docId) => {
    const docPos = positioned.get(docId);
    if (!docPos) return;
    chunks.forEach((ch, j) => {
      positioned.set(ch.id, { x: docPos.x + 20, y: docPos.y + chunkStartY + j * chunkSpacing });
    });
  });

  const docPols = new Map();
  polNodes.forEach((pol) => {
    const docId = pol.data?.doc_id ? `doc-${pol.data.doc_id}` : null;
    if (docId) {
      if (!docPols.has(docId)) docPols.set(docId, []);
      docPols.get(docId).push(pol);
    }
  });

  docPols.forEach((pols, docId) => {
    const docPos = positioned.get(docId);
    if (!docPos) return;
    pols.forEach((pol, j) => {
      const col = Math.floor(j / polsPerCol);
      const row = j % polsPerCol;
      positioned.set(pol.id, {
        x: docPos.x + 220 + col * polSpacingX,
        y: docPos.y + polStartY + row * polSpacingY,
      });
    });
  });

  nodes.forEach((n) => {
    if (!positioned.has(n.id)) {
      positioned.set(n.id, { x: 100, y: 600 });
    }
  });

  return nodes.map((n) => ({
    ...n,
    position: positioned.get(n.id) || { x: 0, y: 0 },
  }));
}

function ChunkNode({ data, selected }) {
  return (
    <div
      className="rounded-md border-2 px-3 py-1.5 transition-all duration-150 cursor-pointer min-w-[120px] max-w-[160px]"
      style={{
        background: "#f8fafc",
        borderColor: selected ? "#3b82f6" : "#cbd5e1",
        boxShadow: selected
          ? "0 0 0 3px rgba(59,130,246,0.25), 0 2px 8px rgba(0,0,0,0.08)"
          : "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="flex items-center gap-1 mb-0.5">
        <span className="material-symbols-outlined text-[11px] text-slate-400">section</span>
        <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400">Section</span>
      </div>
      <div className="text-[11px] font-medium text-slate-700 leading-tight truncate">
        {data.label || "Section"}
      </div>
    </div>
  );
}

function PolicyNode({ data, selected }) {
  const typeStyle = TYPE_COLORS[data.element_type] || TYPE_COLORS.threshold;
  return (
    <div
      className="rounded-lg border-2 px-3 py-2 transition-all duration-150 cursor-pointer group relative"
      style={{
        background: "white",
        borderColor: selected ? "#3b82f6" : typeStyle.border,
        boxShadow: selected
          ? "0 0 0 3px rgba(59,130,246,0.3), 0 4px 12px rgba(0,0,0,0.1)"
          : "0 1px 3px rgba(0,0,0,0.08)",
        minWidth: 150,
        maxWidth: 170,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: typeStyle.bg, color: typeStyle.text }}
        >
          {data.element_type || "policy"}
        </span>
        {data.value && (
          <span className="text-[9px] font-mono text-slate-500 truncate max-w-[60px]">
            {String(data.value).slice(0, 12)}
          </span>
        )}
      </div>
      <div className="text-xs font-semibold text-slate-800 leading-tight truncate">
        {data.label || data.name}
      </div>
      {data.doc_filename && (
        <div className="text-[10px] text-slate-400 mt-1 truncate">
          {data.doc_filename}
        </div>
      )}
      <div className="absolute z-50 hidden group-hover:block left-1/2 -translate-x-1/2 -top-2 -translate-y-full pointer-events-none">
        <div className="bg-slate-900 text-white text-[10px] rounded-lg px-3 py-2 shadow-xl max-w-[220px]">
          <div className="font-semibold mb-1">{data.label || data.name}</div>
          <div className="opacity-70">Type: {data.element_type}</div>
          {data.value && <div className="opacity-70">Value: {String(data.value)}</div>}
          {data.doc_filename && <div className="opacity-70">Doc: {data.doc_filename}</div>}
          {data.source_text && (
            <div className="opacity-50 mt-1 italic border-t border-slate-700 pt-1">
              "{String(data.source_text).slice(0, 100)}..."
            </div>
          )}
          <div className="text-[9px] opacity-50 mt-1">Click to inspect</div>
        </div>
      </div>
    </div>
  );
}

function DocumentNode({ data, selected }) {
  const docType = getDocType(data.label);
  const typeStyle = DOC_TYPE_COLORS[docType] || DOC_TYPE_COLORS.policy;
  return (
    <div
      className="rounded-xl border-2 px-5 py-3 transition-all duration-150"
      style={{
        background: `linear-gradient(135deg, ${typeStyle.bg} 0%, ${typeStyle.bg}dd 100%)`,
        borderColor: selected ? "#60a5fa" : typeStyle.bg,
        boxShadow: selected
          ? "0 0 0 3px rgba(59,130,246,0.4), 0 4px 12px rgba(30,58,95,0.3)"
          : "0 2px 8px rgba(30,58,95,0.2)",
        minWidth: 200,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="text-white">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="material-symbols-outlined text-[12px] opacity-70">{typeStyle.icon}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider opacity-60">{typeStyle.label}</span>
        </div>
        <div className="text-sm font-bold leading-tight">
          {data.label || "Untitled"}
        </div>
        {data.chunk_count != null && (
          <div className="text-[10px] opacity-70 mt-1.5 flex gap-3">
            <span>{data.chunk_count} sections</span>
            <span>{data.policy_count} elements</span>
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  Document: DocumentNode,
  Chunk: ChunkNode,
  PolicyElement: PolicyNode,
};

export default function GraphView({
  graphData,
  filters,
  onNodeClick,
  onEdgeClick,
  impactResult,
  view,
  searchQuery,
  selectedNodeId: externalSelected,
  onNodeSelect,
}) {
  const [internalSelected, setInternalSelected] = useState(null);
  const [searchHighlights, setSearchHighlights] = useState(new Set());
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const { fitView } = useReactFlow();

  const selectedNodeId = externalSelected !== undefined ? externalSelected : internalSelected;
  const setSelectedNodeId = onNodeSelect || setInternalSelected;

  const impactedNames = useMemo(() => {
    if (!impactResult?.impacts) return new Set();
    return new Set(impactResult.impacts.map((i) => i.affected_element));
  }, [impactResult]);

  useEffect(() => {
    if (!searchQuery) {
      setSearchHighlights(new Set());
      return;
    }
    const q = searchQuery.toLowerCase();
    const highlights = new Set();
    graphData.nodes.forEach((n) => {
      const label = (n.data?.label || "").toLowerCase();
      const name = (n.data?.name || "").toLowerCase();
      if (label.includes(q) || name.includes(q)) highlights.add(n.id);
    });
    setSearchHighlights(highlights);
  }, [searchQuery, graphData.nodes]);

  const selectedNeighbors = useMemo(() => {
    if (!selectedNodeId) return new Set();
    const neighbors = new Set([selectedNodeId]);
    graphData.edges.forEach((e) => {
      if (e.source === selectedNodeId) neighbors.add(e.target);
      if (e.target === selectedNodeId) neighbors.add(e.source);
    });
    return neighbors;
  }, [selectedNodeId, graphData.edges]);

  const computedNodes = useMemo(() => {
    const layoutNodes = computeLayout(graphData.nodes);
    return layoutNodes.map((n) => {
      const isSelected = selectedNodeId === n.id;
      const isNeighbor = selectedNeighbors.has(n.id);
      const isDimmed = selectedNodeId && !isNeighbor;
      const isImpacted = impactedNames.has(n.data?.name);
      const isSearched = searchHighlights.has(n.id);

      let borderColor;
      if (isSelected) borderColor = "#3b82f6";
      else if (isImpacted) borderColor = "#ef4444";
      else if (isSearched) borderColor = "#f59e0b";

      return {
        id: n.id,
        type: n.type,
        data: {
          ...n.data,
          label: n.data?.label || n.id,
          selected: isSelected,
        },
        position: n.position,
        style: {
          opacity: isDimmed ? 0.12 : 1,
          transition: "opacity 0.2s ease",
          ...(borderColor ? { outline: `2px solid ${borderColor}`, outlineOffset: 2 } : {}),
        },
      };
    });
  }, [graphData.nodes, impactedNames, selectedNodeId, selectedNeighbors, searchHighlights]);

  const computedEdges = useMemo(() => {
    return graphData.edges.map((e, i) => {
      const edgeStyle = EDGE_STYLES[e.type] || { stroke: "#94a3b8", label: e.type, dash: false };
      const isDimmed = selectedNodeId && !selectedNeighbors.has(e.source) && !selectedNeighbors.has(e.target);
      const isRelatedToSelected = selectedNodeId && (e.source === selectedNodeId || e.target === selectedNodeId);
      const isCrossDoc = ["DEPENDS_ON", "REFERENCES", "CONFLICTS_WITH", "SUPERSEDED_BY"].includes(e.type);

      const color = isDimmed ? "#e2e8f0" : edgeStyle.stroke;

      return {
        id: e.id,
        source: String(e.source),
        target: String(e.target),
        type: "smoothstep",
        animated: false,
        style: {
          stroke: color,
          strokeWidth: isDimmed ? 0.5 : isRelatedToSelected ? 2.5 : isCrossDoc ? 1.5 : 1,
          opacity: isDimmed ? 0.1 : isCrossDoc ? 0.6 : 0.8,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 12,
          height: 12,
        },
      };
    });
  }, [graphData.edges, selectedNodeId, selectedNeighbors]);

  const filteredNodeIds = useMemo(() => {
    return new Set(
      graphData.nodes
        .filter((n) => filters[n.type] ?? true)
        .map((n) => n.id)
    );
  }, [graphData.nodes, filters]);

  const filteredNodes = useMemo(() => {
    return computedNodes.filter((n) => filteredNodeIds.has(n.id));
  }, [computedNodes, filteredNodeIds]);

  const filteredEdges = useMemo(() => {
    return computedEdges.filter((e) => {
      if (!filteredNodeIds.has(e.source) || !filteredNodeIds.has(e.target)) return false;
      const origEdge = graphData.edges.find(
        (ge) => ge.id === e.id || (ge.source === e.source && ge.target === e.target)
      );
      return filters[origEdge?.type] ?? true;
    });
  }, [computedEdges, graphData.edges, filteredNodeIds, filters]);

  useEffect(() => {
    setNodes(filteredNodes);
    setEdges(filteredEdges);
  }, [filteredNodes, filteredEdges]);

  useEffect(() => {
    if (filteredNodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.15, duration: 400 });
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [graphData, fitView]);

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const handleNodeClick = useCallback(
    (event, node) => {
      setSelectedNodeId(node.id);
      const nodeData = graphData.nodes.find((n) => n.id === node.id);
      if (nodeData && onNodeClick) onNodeClick(nodeData);
    },
    [graphData.nodes, onNodeClick, setSelectedNodeId]
  );

  const handleEdgeClick = useCallback(
    (event, edge) => {
      if (onEdgeClick) {
        const edgeData = graphData.edges.find(
          (ge) => ge.source === edge.source && ge.target === edge.target && ge.type === edge.type
        );
        onEdgeClick(edgeData || edge);
      }
    },
    [graphData.edges, onEdgeClick]
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  if (!graphData.nodes.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-3">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-[32px] text-slate-300">account_tree</span>
        </div>
        <p className="font-medium text-slate-500">No graph data yet</p>
        <p className="text-xs text-slate-400 max-w-xs text-center">
          Click <strong>Run Demo</strong> on the Overview page to load the preloaded regulatory scenario, or ingest documents manually.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
      >
        <Background color="#f1f5f9" gap={24} size={1} />
        <Controls
          position="bottom-left"
          style={{ marginBottom: 8, marginLeft: 8 }}
        />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === "Document") {
              const dt = getDocType(n.data?.label);
              return DOC_TYPE_COLORS[dt]?.bg || "#1e3a5f";
            }
            if (n.type === "Chunk") return "#94a3b8";
            const t = n.data?.element_type;
            return TYPE_COLORS[t]?.border || "#10b981";
          }}
          maskColor="rgba(0,0,0,0.06)"
          pannable
          zoomable
          position="bottom-right"
          style={{ marginBottom: 8, marginRight: 8 }}
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 px-3 py-2 text-[10px] max-h-[calc(100%-24px)] overflow-y-auto">
        <div className="font-semibold text-slate-600 mb-1.5">Legend</div>

        <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-1">Document Types</div>
        <div className="flex flex-col gap-1 mb-2">
          {Object.entries(DOC_TYPE_COLORS).map(([type, style]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: style.bg }} />
              <span className="text-slate-500">{style.label}</span>
            </div>
          ))}
        </div>

        <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-1">Element Types</div>
        <div className="flex flex-col gap-1 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300" />
            <span className="text-slate-500">Section</span>
          </div>
          {Object.entries(TYPE_COLORS).map(([type, style]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border" style={{ background: style.bg, borderColor: style.border }} />
              <span className="text-slate-500 capitalize">{type}</span>
            </div>
          ))}
        </div>

        <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-1">Relationships</div>
        <div className="flex flex-col gap-1">
          {Object.entries(EDGE_STYLES).map(([type, style]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span
                className="w-4 h-0"
                style={{
                  borderTop: `2px ${style.dash ? "dashed" : "solid"} ${style.stroke}`,
                }}
              />
              <span className="text-slate-500">{style.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
