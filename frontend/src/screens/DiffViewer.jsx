import { useState, useEffect, useCallback } from "react";

const CHANGE_COLORS = {
  added: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  deleted: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700" },
  modified: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" },
  extended: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" },
  reworded: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", badge: "bg-slate-100 text-slate-700" },
};

export default function DiffViewer({ onNavigate }) {
  const [diffResult, setDiffResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedChange, setSelectedChange] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    // Fetch both versions and compute diff
    Promise.all([
      fetch("/api/documents/").then((r) => r.json()),
    ]).then(([docs]) => {
      const v1 = docs.find((d) => d.filename?.includes("v1"));
      const v2 = docs.find((d) => d.filename?.includes("v2"));
      if (v1 && v2) {
        Promise.all([
          fetch(`/api/documents/${v1.id}`).then((r) => r.json()),
          fetch(`/api/documents/${v2.id}`).then((r) => r.json()),
        ]).then(([d1, d2]) => {
          fetch("/api/diff/diff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              old_text: d1.chunks?.map((c) => c.content).join("\n\n") || "",
              new_text: d2.chunks?.map((c) => c.content).join("\n\n") || "",
              document_name: "Information Security Policy",
            }),
          })
            .then((r) => r.json())
            .then(setDiffResult)
            .catch(() => {});
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  const changes = diffResult?.changes || [];
  const filtered = filter === "all" ? changes : changes.filter((c) => c.change_type === filter);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <button onClick={() => onNavigate("overview")} className="flex items-center gap-1 text-body-xs text-secondary mb-4 hover:underline">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Dashboard
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-display-lg font-heading font-semibold text-on-surface tracking-tight">Clause-Level Diff</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Comparing Information Security Policy v1.0 → v2.0
          </p>
        </div>
        {diffResult && (
          <div className="flex gap-2">
            {["all", "modified", "extended", "added", "deleted"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[10px] font-medium rounded-full border transition-colors ${
                  filter === f
                    ? "bg-inverse-surface text-inverse-on-surface border-inverse-surface"
                    : "bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:bg-surface-container-low"
                }`}
              >
                {f === "all" ? `All (${changes.length})` : f.charAt(0).toUpperCase() + f.slice(1) + ` (${changes.filter((c) => c.change_type === f).length})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary Strip */}
      {diffResult && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <SummaryStat label="Total Changes" value={diffResult.total_changes} icon="difference" />
          <SummaryStat label="Modified" value={diffResult.modified} icon="edit" color="text-amber-600" />
          <SummaryStat label="Extended" value={diffResult.extended} icon="add_circle" color="text-blue-600" />
          <SummaryStat label="Added" value={diffResult.added} icon="note_add" color="text-emerald-600" />
          <SummaryStat label="Deleted" value={diffResult.deleted} icon="delete" color="text-red-600" />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined text-[24px] animate-spin mr-2">refresh</span>
          Computing diff...
        </div>
      )}

      {/* Changes List */}
      <div className="space-y-3">
        {filtered.map((change, i) => {
          const style = CHANGE_COLORS[change.change_type] || CHANGE_COLORS.reworded;
          const isSelected = selectedChange?.clause_id === change.clause_id;
          return (
            <button
              key={change.clause_id + i}
              onClick={() => setSelectedChange(isSelected ? null : change)}
              className={`w-full text-left ${style.bg} border ${style.border} rounded-lg p-4 transition-all duration-150 ${
                isSelected ? "ring-2 ring-secondary shadow-sm" : "hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded shrink-0 ${style.badge}`}>
                    {change.change_type}
                  </span>
                  <span className="text-body-sm font-heading font-semibold text-on-surface truncate">{change.heading}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {change.similarity > 0 && (
                    <span className="text-[10px] text-on-surface-variant">{Math.round(change.similarity * 100)}% similar</span>
                  )}
                  <span className={`w-2 h-2 rounded-full ${change.impact_level === "high" ? "bg-red-500" : change.impact_level === "medium" ? "bg-amber-500" : "bg-blue-500"}`} />
                </div>
              </div>
              <p className={`text-body-xs ${style.text} leading-relaxed`}>{change.explanation}</p>
              {change.value_changes?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {change.value_changes.map((vc, j) => (
                    <span key={j} className="text-[10px] font-mono bg-white/50 px-2 py-0.5 rounded shrink-0">
                      {vc.old_value} → {vc.new_value} {vc.unit || ""}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail Panel - Overlay */}
      {selectedChange && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40 transition-opacity"
            onClick={() => setSelectedChange(null)}
          />
          <aside className="fixed right-0 top-0 bottom-0 w-[420px] max-w-[90vw] bg-surface-container-lowest border-l border-outline-variant flex flex-col z-50 shadow-2xl animate-slide-in-right">
            <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low/50 flex justify-between items-center shrink-0">
              <h3 className="font-label-bold text-[12px] text-on-surface uppercase">Clause Detail</h3>
              <button onClick={() => setSelectedChange(null)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container-low transition-colors text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto space-y-4">
              <div>
                <div className="font-label-mono text-[10px] text-on-surface-variant mb-1">HEADING</div>
                <div className="text-body-sm font-semibold">{selectedChange.heading}</div>
              </div>

              {selectedChange.old_content && (
                <div>
                  <div className="font-label-mono text-[10px] text-red-500 mb-1 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-400" /> OLD VERSION
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded p-3 text-[11px] text-on-surface-variant leading-relaxed max-h-48 overflow-auto whitespace-pre-wrap break-words">
                    {selectedChange.old_content}
                  </div>
                </div>
              )}

              {selectedChange.new_content && (
                <div>
                  <div className="font-label-mono text-[10px] text-emerald-600 mb-1 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> NEW VERSION
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded p-3 text-[11px] text-on-surface-variant leading-relaxed max-h-48 overflow-auto whitespace-pre-wrap break-words">
                    {selectedChange.new_content}
                  </div>
                </div>
              )}

              {selectedChange.value_changes?.length > 0 && (
                <div>
                  <div className="font-label-mono text-[10px] text-on-surface-variant mb-2">VALUE CHANGES</div>
                  {selectedChange.value_changes.map((vc, i) => (
                    <div key={i} className="bg-surface-container-low rounded p-2 mb-1 flex items-center justify-between">
                      <span className="text-[10px] text-on-surface-variant truncate mr-2">{vc.parameter}</span>
                      <span className="font-mono text-[11px] font-semibold shrink-0">
                        <span className="text-red-500">{vc.old_value}</span>
                        <span className="mx-1">→</span>
                        <span className="text-emerald-600">{vc.new_value}</span>
                        <span className="text-on-surface-variant ml-1">{vc.unit || ""}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="font-label-mono text-[10px] text-on-surface-variant mb-1">IMPACT LEVEL</div>
                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                  selectedChange.impact_level === "high" ? "bg-red-100 text-red-700" :
                  selectedChange.impact_level === "medium" ? "bg-amber-100 text-amber-700" :
                  "bg-blue-100 text-blue-700"
                }`}>
                  {selectedChange.impact_level}
                </span>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value, icon, color = "text-on-surface" }) {
  return (
    <div className="metric-card flex items-center gap-3">
      <span className={`material-symbols-outlined text-[20px] ${color}`}>{icon}</span>
      <div>
        <div className={`text-[24px] font-heading font-bold leading-none ${color}`}>{value ?? 0}</div>
        <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">{label}</div>
      </div>
    </div>
  );
}
