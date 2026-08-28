import { AlertTriangle, CheckCircle, Info, FileText } from "lucide-react";

const severityConfig = {
  high: { bg: "bg-red-50", border: "border-red-200", icon: AlertTriangle, color: "text-red-600" },
  medium: { bg: "bg-amber-50", border: "border-amber-200", icon: Info, color: "text-amber-600" },
  low: { bg: "bg-green-50", border: "border-green-200", icon: CheckCircle, color: "text-green-600" },
};

export default function ImpactReport({ result }) {
  if (!result) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm gap-3">
        <div className="text-4xl">🔍</div>
        <p>Run a simulation to see the impact report.</p>
        <p className="text-xs text-gray-400">Use the panel below to simulate a value change and trace its cascading effects.</p>
      </div>
    );
  }

  if (result.impacts && result.impacts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm gap-3">
        <div className="text-4xl">✅</div>
        <p>No impacts found for this change.</p>
        <p className="text-xs text-gray-400">
          Changing <span className="font-mono text-gray-600">{result.changed_element}</span> from{" "}
          <span className="font-mono text-gray-600">{result.old_value}</span> to{" "}
          <span className="font-mono text-gray-600">{result.new_value}</span> did not affect any downstream elements.
        </p>
      </div>
    );
  }

  const docsByImpact = {};
  if (result.impacts) {
    result.impacts.forEach((impact) => {
      const docName = impact.affected_doc_filename || "Unknown";
      if (!docsByImpact[docName]) docsByImpact[docName] = [];
      docsByImpact[docName].push(impact);
    });
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Impact Analysis</h2>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900">{result.total_impacts}</div>
              <div className="text-xs text-gray-500">Total Impacts</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-600">{result.documents_affected || 0}</div>
              <div className="text-xs text-gray-500">Documents Affected</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-600">{result.high_severity}</div>
              <div className="text-xs text-gray-500">High Severity</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-amber-600">{result.medium_severity}</div>
              <div className="text-xs text-gray-500">Medium Severity</div>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            Changing <span className="font-mono font-semibold">{result.changed_element}</span> from{" "}
            <span className="font-mono">{result.old_value}</span> to{" "}
            <span className="font-mono">{result.new_value}</span> affects{" "}
            {result.total_impacts} downstream element(s) across{" "}
            {result.documents_affected || 0} document(s).
          </p>
          {result.source_documents && result.source_documents.length > 0 && (
            <div className="mt-2 text-xs text-gray-500">
              Source: {result.source_documents.map((d) => d.filename).join(", ")}
            </div>
          )}
        </div>

        {Object.keys(docsByImpact).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Affected Documents</h3>
            <div className="space-y-2">
              {Object.entries(docsByImpact).map(([docName, impacts]) => (
                <div key={docName} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">{docName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{impacts.length} element(s)</span>
                    {impacts.some((i) => i.severity === "high") && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">HIGH</span>
                    )}
                    {impacts.every((i) => i.severity !== "high") && impacts.some((i) => i.severity === "medium") && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">MEDIUM</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {result.impacts.map((impact, i) => {
            const cfg = severityConfig[impact.severity] || severityConfig.low;
            const Icon = cfg.icon;
            return (
              <div key={i} className={`${cfg.bg} ${cfg.border} border rounded-xl p-4`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                    <span className="font-semibold text-sm text-gray-900">{impact.affected_element}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/50 text-gray-600">
                      {impact.affected_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {impact.affected_doc_filename && (
                      <span className="text-xs text-gray-500">{impact.affected_doc_filename}</span>
                    )}
                    <span className="text-xs font-mono text-gray-500">
                      {(impact.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                {impact.violation && (
                  <div className="mt-2 text-xs text-red-700 bg-red-100 rounded-lg px-3 py-1.5">
                    VIOLATION — constraint or threshold breached
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-600">{impact.affected_source}</p>
                {impact.evidence_path && impact.evidence_path.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10px] text-gray-400 mb-1">Evidence Path:</div>
                    <div className="flex flex-wrap gap-1">
                      {impact.evidence_path.map((step, j) => (
                        <span key={j} className="text-[10px] px-2 py-0.5 bg-white rounded-full border border-gray-200 text-gray-500">
                          {step.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400">
                  <span>Distance: {impact.distance}</span>
                  <span>·</span>
                  <span>Severity: {impact.severity}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
