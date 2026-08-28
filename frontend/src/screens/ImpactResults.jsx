import { useState } from "react";

const SEVERITY_COLORS = {
  high: { bg: "bg-error-container/20", text: "text-on-error-container", border: "border-error/20" },
  medium: { bg: "bg-surface-variant", text: "text-on-surface", border: "border-outline-variant" },
  low: { bg: "bg-surface-container-low", text: "text-on-surface-variant", border: "border-outline-variant" },
};

export default function ImpactResults({ result, onBack }) {
  const [selectedImpact, setSelectedImpact] = useState(result?.impacts?.[0] || null);

  if (!result) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-body-sm text-on-surface-variant">No results to display.</p>
        <button onClick={onBack} className="btn-primary mt-4">Run Analysis</button>
      </div>
    );
  }

  const sev = (s) => SEVERITY_COLORS[s] || SEVERITY_COLORS.low;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1 text-body-xs text-secondary mb-4 hover:underline">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        New Analysis
      </button>

      {/* Summary Strip */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded p-4 flex flex-col gap-2 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <span className="font-label-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Impact Assessment</span>
            <h2 className="text-headline-md font-heading font-semibold text-on-surface mt-1">
              {result.changed_element} (${Number(result.old_value).toLocaleString()} → ${Number(result.new_value).toLocaleString()})
            </h2>
          </div>
          <div className={`px-3 py-1 ${result.high_severity > 0 ? "bg-error-container/20 text-on-error-container border border-error/20" : result.medium_severity > 0 ? "bg-surface-variant text-on-surface border border-outline-variant" : "bg-surface-container-low text-on-surface-variant border border-outline-variant"} rounded flex items-center gap-1.5`}>
            <span className="material-symbols-outlined text-sm">warning</span>
            <span className="font-label-bold text-[12px] uppercase">
              {result.high_severity > 0 ? "High Impact" : result.medium_severity > 0 ? "Medium Impact" : "Low Impact"}
            </span>
          </div>
        </div>
        <div className="flex gap-6 mt-2 pt-2 border-t border-outline-variant/50">
          <div className="flex flex-col">
            <span className="font-label-mono text-[11px] text-on-surface-variant">Documents</span>
            <span className="text-headline-md font-heading font-semibold text-on-surface">{result.documents_affected}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-mono text-[11px] text-on-surface-variant">Downstream Elements</span>
            <span className="text-headline-md font-heading font-semibold text-on-surface">{result.total_impacts}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-mono text-[11px] text-on-surface-variant">High Severity</span>
            <span className="text-headline-md font-heading font-semibold text-error">{result.high_severity}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-mono text-[11px] text-on-surface-variant">Medium</span>
            <span className="text-headline-md font-heading font-semibold text-amber-600">{result.medium_severity}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Affected Elements Table */}
        <div className="flex-1 bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low/50">
            <h3 className="font-label-bold text-[12px] text-on-surface uppercase">Affected Elements List</h3>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant font-label-mono text-[11px] text-on-surface-variant">
                <th className="py-2 px-4 font-medium uppercase w-1/3">Element Name</th>
                <th className="py-2 px-4 font-medium uppercase w-1/3">Document</th>
                <th className="py-2 px-4 font-medium uppercase w-1/6">Impact</th>
                <th className="py-2 px-4 font-medium uppercase w-16 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody className="text-body-sm">
              {result.impacts.map((impact, i) => {
                const s = sev(impact.severity);
                const isSelected = selectedImpact?.affected_element === impact.affected_element;
                return (
                  <tr
                    key={i}
                    onClick={() => setSelectedImpact(impact)}
                    className={`border-b border-outline-variant hover:bg-surface-container-lowest/50 cursor-pointer transition-colors ${isSelected ? "bg-surface-container-low/30 border-l-2 border-l-secondary" : ""}`}
                  >
                    <td className="py-2.5 px-4 font-semibold text-on-surface">{impact.affected_element}</td>
                    <td className="py-2.5 px-4 text-on-surface-variant">{impact.affected_doc_filename}</td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 ${s.bg} ${s.text} text-xs rounded font-medium`}>{impact.severity}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-label-mono text-[11px]">{Math.round(impact.confidence * 100)}%</td>
                  </tr>
                );
              })}
              {result.impacts.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-on-surface-variant text-body-xs">No impacts detected</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Explainability Panel */}
        <aside className="w-80 bg-surface-container-low border border-outline-variant rounded flex flex-col shrink-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-high/50 flex justify-between items-center">
            <h3 className="font-label-bold text-[12px] text-on-surface uppercase">Explainability</h3>
          </div>
          <div className="p-4 flex-1 overflow-auto flex flex-col gap-6">
            {selectedImpact ? (
              <>
                <div>
                  <div className="font-label-mono text-[11px] text-on-surface-variant mb-2">TARGET ELEMENT</div>
                  <div className="text-body-sm font-semibold text-on-surface mb-1">{selectedImpact.affected_element}</div>
                  <div className="text-body-xs text-on-surface-variant">Document: {selectedImpact.affected_doc_filename}</div>
                </div>

                <div>
                  <div className="font-label-mono text-[11px] text-on-surface-variant mb-3">EVIDENCE PATH</div>
                  <div className="flex flex-col gap-2 relative before:absolute before:left-2.5 before:top-4 before:bottom-4 before:w-px before:bg-outline-variant">
                    {selectedImpact.evidence_path?.map((step, i) => (
                      <div key={i} className="flex items-center gap-3 relative z-10">
                        <div className={`w-5 h-5 rounded-full bg-surface-container-lowest border ${i === selectedImpact.evidence_path.length - 1 ? "border-secondary" : "border-outline-variant"} flex items-center justify-center shrink-0`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${i === selectedImpact.evidence_path.length - 1 ? "bg-secondary" : "bg-on-surface"}`}></div>
                        </div>
                        <div className={`text-body-xs bg-surface-container-lowest border ${i === selectedImpact.evidence_path.length - 1 ? "border-secondary" : "border-outline-variant"} px-2 py-1 rounded w-full truncate ${i === selectedImpact.evidence_path.length - 1 ? "font-semibold text-secondary" : ""}`}>
                          {step.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedImpact.affected_source && (
                  <div>
                    <div className="font-label-mono text-[11px] text-on-surface-variant mb-2 flex items-center justify-between">
                      <span>SOURCE SNIPPET</span>
                    </div>
                    <div className="bg-surface-container-lowest border border-outline-variant rounded p-3 text-body-xs text-on-surface-variant leading-relaxed italic">
                      "{selectedImpact.affected_source}"
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-4 border-t border-outline-variant/50">
                  <button className="w-full bg-primary text-on-primary text-body-sm py-2 px-4 rounded hover:bg-primary/90 transition-colors">
                    Acknowledge Impact
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-on-surface-variant">
                <span className="material-symbols-outlined text-[32px] mb-2 text-outline">touch_app</span>
                <p className="text-body-xs">Select an element to view details</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
