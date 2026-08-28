import { useState, useEffect } from "react";

export default function ContradictionViewer({ onNavigate }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("contradictions");

  useEffect(() => {
    setLoading(true);
    fetch("/api/documents/")
      .then((r) => r.json())
      .then(async (docs) => {
        const docData = [];
        for (const doc of docs) {
          const detail = await fetch(`/api/documents/${doc.id}`).then((r) => r.json());
          docData.push({
            filename: detail.filename,
            content: detail.chunks?.map((c) => c.content).join("\n\n") || "",
            clauses: detail.chunks?.map((c, i) => ({
              id: `${doc.id}-${i}`,
              heading: c.section || `Section ${i}`,
              content: c.content,
            })) || [],
          });
        }
        const res = await fetch("/api/contradictions/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documents: docData }),
        });
        return res.json();
      })
      .then(setResult)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const contradictions = result?.contradictions || [];
  const drifts = result?.drifts || [];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <button onClick={() => onNavigate("overview")} className="flex items-center gap-1 text-body-xs text-secondary mb-4 hover:underline">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Dashboard
      </button>

      <div className="mb-6">
        <h2 className="text-display-lg font-heading font-semibold text-on-surface tracking-tight">Contradictions & Drift</h2>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Cross-document conflict detection and requirement drift analysis
        </p>
      </div>

      {/* Summary */}
      {result && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="metric-card">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Documents Analyzed</div>
            <div className="text-[28px] font-heading font-bold text-blue-600">{result.documents_analyzed}</div>
          </div>
          <div className="metric-card">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Contradictions</div>
            <div className="text-[28px] font-heading font-bold text-red-600">{result.total_contradictions}</div>
          </div>
          <div className="metric-card">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Drift Items</div>
            <div className="text-[28px] font-heading font-bold text-amber-600">{result.total_drifts}</div>
          </div>
          <div className="metric-card">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">High Severity</div>
            <div className="text-[28px] font-heading font-bold text-red-600">{result.high_severity}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface-container-low rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("contradictions")}
          className={`px-4 py-2 text-[11px] font-medium rounded transition-colors ${
            tab === "contradictions" ? "bg-surface-container-lowest shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Contradictions ({contradictions.length})
        </button>
        <button
          onClick={() => setTab("drifts")}
          className={`px-4 py-2 text-[11px] font-medium rounded transition-colors ${
            tab === "drifts" ? "bg-surface-container-lowest shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Policy Drift ({drifts.length})
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined text-[24px] animate-spin mr-2">refresh</span>
          Analyzing documents...
        </div>
      )}

      {/* Contradictions */}
      {tab === "contradictions" && !loading && (
        <div className="space-y-4">
          {contradictions.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant">
              <span className="material-symbols-outlined text-[48px] text-emerald-400 block mb-3">check_circle</span>
              <p className="text-body-sm">No contradictions detected between documents.</p>
            </div>
          ) : (
            contradictions.map((c, i) => (
              <div key={i} className={`border rounded-lg p-4 ${
                c.severity === "high" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
              }`}>
                <div className="flex items-start gap-3">
                  <span className={`material-symbols-outlined text-[20px] mt-0.5 ${
                    c.severity === "high" ? "text-red-500" : "text-amber-500"
                  }`}>
                    {c.severity === "high" ? "error" : "warning"}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                        c.severity === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {c.severity}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">{c.conflict_type?.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-body-sm text-on-surface leading-relaxed mb-2">{c.explanation}</p>
                    <div className="flex gap-4 text-[10px] text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">description</span>
                        {c.document_a}
                      </span>
                      <span className="text-on-surface-variant">vs</span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">description</span>
                        {c.document_b}
                      </span>
                    </div>
                    {c.constraint_a && c.constraint_b && (
                      <div className="flex gap-4 mt-2 font-mono text-[10px]">
                        <span className="bg-white/60 px-2 py-0.5 rounded">{c.constraint_a.raw}</span>
                        <span className="text-on-surface-variant">vs</span>
                        <span className="bg-white/60 px-2 py-0.5 rounded">{c.constraint_b.raw}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Drifts */}
      {tab === "drifts" && !loading && (
        <div className="space-y-3">
          {drifts.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant">
              <span className="material-symbols-outlined text-[48px] text-emerald-400 block mb-3">check_circle</span>
              <p className="text-body-sm">No policy drift detected.</p>
            </div>
          ) : (
            drifts.map((d, i) => (
              <div key={i} className="bg-surface-container-lowest border border-outline-variant rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-amber-500 mt-0.5">history</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-100 text-amber-700">drift</span>
                      <span className="text-body-sm font-heading font-semibold text-on-surface">{d.heading}</span>
                    </div>
                    <p className="text-body-xs text-on-surface-variant mb-2">{d.explanation}</p>
                    <div className="flex items-center gap-3 text-[10px] text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">description</span>
                        {d.document}
                      </span>
                      <span className="bg-surface-container-low px-2 py-0.5 rounded font-mono">{d.drifted_requirement}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
