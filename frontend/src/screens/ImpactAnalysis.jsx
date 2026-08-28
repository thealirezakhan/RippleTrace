import { useState, useEffect, useMemo, useCallback } from "react";

const SUGGESTED = [
  { name: "mfa_requirement", label: "MFA Required", type: "constraint" },
  { name: "password_length_12_count", label: "Password Length", type: "threshold" },
  { name: "lockout_15_minutes", label: "Lockout Duration", type: "constraint" },
  { name: "session_timeout_30_minutes", label: "Session Timeout", type: "constraint" },
  { name: "rotation_24_hours", label: "Key Rotation", type: "constraint" },
  { name: "retention_period_24_months", label: "Data Retention", type: "constraint" },
];

const CHANGE_TYPES = [
  { key: "modify", label: "Modify", icon: "edit" },
  { key: "add", label: "Add", icon: "add_circle" },
  { key: "remove", label: "Remove", icon: "remove_circle" },
];

function StageIndicator({ current }) {
  const stages = ["Select Change", "Simulate", "Impact", "Recommendations"];
  return (
    <div className="flex items-center gap-2 mb-8">
      {stages.map((s, i) => {
        const isActive = i === current;
        const isDone = i < current;
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all ${
              isActive ? "bg-blue-600 text-white shadow-md" :
              isDone ? "bg-emerald-500 text-white" :
              "bg-slate-100 text-slate-400 border border-slate-200"
            }`}>
              {isDone ? <span className="material-symbols-outlined text-[14px]">check</span> : i + 1}
            </div>
            <span className={`text-[11px] font-medium hidden sm:inline ${isActive ? "text-blue-600" : isDone ? "text-emerald-600" : "text-slate-400"}`}>{s}</span>
            {i < stages.length - 1 && <div className={`w-8 h-px ${isDone ? "bg-emerald-300" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function SearchBox({ value, onChange, onSelect, elements }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query) return SUGGESTED;
    const q = query.toLowerCase();
    return elements.filter(e =>
      e.name?.toLowerCase().includes(q) ||
      e.doc_filename?.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query, elements]);

  return (
    <div className="relative">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
      <input
        type="text"
        value={query || value || ""}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Search policies, clauses, requirements..."
        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-72 overflow-y-auto">
          {!query && (
            <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 bg-slate-50">Recent / Suggested</div>
          )}
          {filtered.map((el, i) => (
            <button
              key={i}
              onMouseDown={() => { onSelect(el); setQuery(""); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 flex items-center gap-3 transition-colors border-b border-slate-50 last:border-0"
            >
              <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[10px] text-slate-500">
                <span className="material-symbols-outlined text-[14px]">gavel</span>
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{el.name}</div>
                {el.doc_filename && <div className="text-[11px] text-slate-400 truncate">{el.doc_filename}</div>}
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{el.element_type || el.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ImpactAnalysis({ onResults, preselectedElement }) {
  const [documents, setDocuments] = useState([]);
  const [elements, setElements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [changeType, setChangeType] = useState("modify");
  const [newValue, setNewValue] = useState("");
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedImpact, setSelectedImpact] = useState(null);

  useEffect(() => {
    fetch("/api/documents/").then(r => r.json()).then(setDocuments).catch(() => {});
  }, []);

  useEffect(() => {
    if (!documents.length) return;
    const all = [];
    const pending = documents.filter(d => d.policy_count > 0).map(d =>
      fetch(`/api/extraction/states/${d.id}`).then(r => r.json()).then(states => {
        states.forEach(s => all.push({ ...s, doc_filename: d.filename }));
      }).catch(() => {})
    );
    Promise.all(pending).then(() => setElements(all));
  }, [documents]);

  useEffect(() => {
    if (preselectedElement) {
      const el = elements.find(e => e.name === preselectedElement);
      if (el) {
        setSelected(el);
        setStage(1);
      }
    }
  }, [preselectedElement, elements]);

  const handleSelect = useCallback((el) => {
    setSelected(el);
    setNewValue("");
    setStage(1);
    setError(null);
  }, []);

  const handleAnalyze = async () => {
    if (!selected) return;
    if (changeType === "modify" && !newValue) { setError("Enter a new value"); return; }
    setLoading(true);
    setError(null);
    try {
      const oldVal = parseFloat(selected.value) || 0;
      const newVal = changeType === "remove" ? 0 : changeType === "modify" ? parseFloat(newValue) || 0 : oldVal;
      const res = await fetch("/api/simulate/impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ element_name: selected.name, old_value: oldVal, new_value: newVal }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
      setStage(2);
      if (onResults) onResults(data);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleReset = () => {
    setSelected(null);
    setNewValue("");
    setStage(0);
    setResult(null);
    setError(null);
    setSelectedImpact(null);
  };

  const riskLevel = result ? (
    result.high_severity > 0 ? { label: "HIGH", color: "text-red-600", bg: "bg-red-50", bar: "bg-red-500", pct: 85 } :
    result.medium_severity > 3 ? { label: "MEDIUM", color: "text-amber-600", bg: "bg-amber-50", bar: "bg-amber-500", pct: 60 } :
    { label: "LOW", color: "text-emerald-600", bg: "bg-emerald-50", bar: "bg-emerald-500", pct: 30 }
  ) : null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Impact Analysis</h1>
        <p className="text-sm text-slate-500 mt-1">Simulate a regulatory change and trace its impact across policies, clauses, controls, and dependencies.</p>
      </div>

      <StageIndicator current={stage} />

      {/* STAGE 0: Select Change */}
      {stage === 0 && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-blue-600 text-[20px]">search</span>
              <h2 className="text-lg font-semibold text-slate-800">Select Change</h2>
            </div>
            <SearchBox value={selected?.name} onSelect={handleSelect} elements={elements} />
          </div>
        </div>
      )}

      {/* STAGE 1: Simulate */}
      {stage === 1 && selected && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-[20px]">tune</span>
                <h2 className="text-lg font-semibold text-slate-800">Simulate Change</h2>
              </div>
              <button onClick={handleReset} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">arrow_back</span> Change selection
              </button>
            </div>

            {/* Selected element info */}
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-600 text-[20px]">gavel</span>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{selected.name}</div>
                  <div className="text-[11px] text-slate-500">{selected.doc_filename} &middot; {selected.element_type}</div>
                </div>
              </div>
            </div>

            {/* Change Type */}
            <div className="mb-5">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">Change Type</label>
              <div className="flex gap-2">
                {CHANGE_TYPES.map(ct => (
                  <button
                    key={ct.key}
                    onClick={() => setChangeType(ct.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      changeType === ct.key
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{ct.icon}</span>
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Values */}
            {changeType !== "add" && (
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">Current Value</label>
                  <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-mono text-sm">
                    {selected.value || "N/A"}
                    {selected.unit && <span className="text-slate-400 ml-1">{selected.unit}</span>}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                    {changeType === "remove" ? "Action" : "New Value"}
                  </label>
                  {changeType === "remove" ? (
                    <div className="w-full px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-600 font-medium text-sm">
                      Remove element
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="Enter new value..."
                      className="w-full px-4 py-3 bg-white border-2 border-blue-300 rounded-lg text-slate-800 font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  )}
                </div>
              </div>
            )}

            {changeType === "add" && (
              <div className="mb-5">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">New Requirement</label>
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Describe the new requirement..."
                  className="w-full px-4 py-3 bg-white border-2 border-blue-300 rounded-lg text-slate-800 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
            )}

            {error && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-lg">{error}</div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={loading || (changeType === "modify" && !newValue)}
              className="w-full bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">analytics</span>
              {loading ? "Analyzing Impact..." : "Analyze Impact"}
            </button>
          </div>
        </div>
      )}

      {/* STAGE 2 & 3: Impact Results + Recommendations */}
      {stage >= 2 && result && (
        <div>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <SummaryCard icon="hub" label="Affected Elements" value={result.total_impacts} color="blue" />
            <SummaryCard icon="description" label="Documents" value={result.documents_affected} color="slate" />
            <SummaryCard icon="warning" label="High Severity" value={result.high_severity} color="red" />
            <SummaryCard icon="info" label="Medium" value={result.medium_severity} color="amber" />
          </div>

          {/* Risk Assessment */}
          {riskLevel && (
            <div className={`${riskLevel.bg} border border-slate-200 rounded-xl p-5 mb-6`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]" style={{ color: riskLevel.pct > 60 ? "#dc2626" : riskLevel.pct > 40 ? "#d97706" : "#059669" }}>shield</span>
                  <span className="text-sm font-semibold text-slate-700">Risk Assessment</span>
                </div>
                <span className={`text-lg font-bold ${riskLevel.color}`}>{riskLevel.label}</span>
              </div>
              <div className="w-full bg-white/60 rounded-full h-2 mb-3">
                <div className={`${riskLevel.bar} h-2 rounded-full transition-all duration-700`} style={{ width: `${riskLevel.pct}%` }} />
              </div>
              <div className="text-xs text-slate-600">
                {result.high_severity > 0 && <div>&bull; {result.high_severity} downstream elements with high-severity impact</div>}
                {result.medium_severity > 0 && <div>&bull; {result.medium_severity} elements require review</div>}
                {result.documents_affected > 0 && <div>&bull; {result.documents_affected} document{result.documents_affected > 1 ? "s" : ""} contain dependent clauses</div>}
              </div>
            </div>
          )}

          {/* Change Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex items-center gap-4 shadow-sm">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono uppercase text-slate-400 mb-1">Current</span>
                <span className="px-3 py-1.5 bg-slate-100 rounded font-mono text-sm font-semibold text-slate-700">{result.old_value}</span>
              </div>
              <span className="material-symbols-outlined text-slate-300 text-[20px]">arrow_forward</span>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono uppercase text-slate-400 mb-1">Proposed</span>
                <span className="px-3 py-1.5 bg-blue-100 border border-blue-200 rounded font-mono text-sm font-semibold text-blue-700">{result.new_value}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase text-slate-400">Element</div>
              <div className="text-sm font-semibold text-slate-800">{result.changed_element}</div>
            </div>
          </div>

          {/* Main content: Impacted Elements + Detail Panel */}
          <div className="flex gap-4">
            {/* Impacted Elements */}
            <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Impacted Elements</h3>
                <span className="text-[11px] text-slate-400">{result.impacts.length} elements</span>
              </div>
              <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
                {result.impacts.map((imp, i) => {
                  const isSelected = selectedImpact?.affected_element === imp.affected_element;
                  const sevColor = imp.severity === "high" ? "text-red-600 bg-red-50" :
                                   imp.severity === "medium" ? "text-amber-600 bg-amber-50" :
                                   "text-slate-500 bg-slate-50";
                  return (
                    <button
                      key={i}
                      onClick={() => { setSelectedImpact(imp); setStage(3); }}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50/50 transition-colors flex items-center gap-3 ${isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${imp.severity === "high" ? "bg-red-500" : imp.severity === "medium" ? "bg-amber-500" : "bg-slate-300"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{imp.affected_element}</div>
                        <div className="text-[11px] text-slate-400 truncate">{imp.affected_doc_filename}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${sevColor}`}>{imp.severity}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{Math.round(imp.confidence * 100)}%</span>
                      </div>
                    </button>
                  );
                })}
                {result.impacts.length === 0 && (
                  <div className="py-12 text-center text-sm text-slate-400">No impacts detected</div>
                )}
              </div>
            </div>

            {/* Detail Panel */}
            <div className="w-80 bg-white border border-slate-200 rounded-xl flex flex-col shrink-0 overflow-hidden shadow-sm">
              {selectedImpact ? (
                <>
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-sm font-semibold text-slate-700">Why is this impacted?</h3>
                  </div>
                  <div className="p-4 flex-1 overflow-auto space-y-4">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Target Element</div>
                      <div className="text-sm font-semibold text-slate-800">{selectedImpact.affected_element}</div>
                      <div className="text-[11px] text-slate-500">{selectedImpact.affected_doc_filename}</div>
                    </div>

                    {selectedImpact.evidence_path?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">Propagation Path</div>
                        <div className="relative pl-4 space-y-2 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                          {selectedImpact.evidence_path.map((step, i) => {
                            const isLast = i === selectedImpact.evidence_path.length - 1;
                            return (
                              <div key={i} className="relative">
                                <div className={`absolute -left-4 top-1.5 w-3 h-3 rounded-full border-2 ${isLast ? "border-blue-500 bg-blue-100" : "border-slate-300 bg-white"}`} />
                                <div className={`text-[11px] px-2 py-1 rounded ${isLast ? "bg-blue-50 border border-blue-200 text-blue-800 font-medium" : "bg-slate-50 border border-slate-100 text-slate-600"}`}>
                                  {step.name}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Relationship</div>
                      <div className="text-xs text-slate-600">DEPENDS_ON</div>
                    </div>

                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Confidence</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.round(selectedImpact.confidence * 100)}%` }} />
                        </div>
                        <span className="text-xs font-mono text-slate-600">{Math.round(selectedImpact.confidence * 100)}%</span>
                      </div>
                    </div>

                    {selectedImpact.affected_source && (
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Source Evidence</div>
                        <div className="text-[11px] text-slate-600 italic border-l-2 border-slate-200 pl-2 leading-relaxed">
                          "{String(selectedImpact.affected_source).slice(0, 150)}..."
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6">
                  <span className="material-symbols-outlined text-[32px] mb-2 text-slate-300">touch_app</span>
                  <p className="text-xs text-center">Select an impacted element to view why it's affected</p>
                </div>
              )}
            </div>
          </div>

          {/* Recommendations (Stage 3) */}
          {stage >= 3 && (
            <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-amber-600 text-[20px]">recommend</span>
                <h3 className="text-sm font-semibold text-slate-700">Recommended Actions</h3>
              </div>
              <div className="space-y-2">
                {result.high_severity > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                    <span className="material-symbols-outlined text-red-500 text-[18px] mt-0.5">warning</span>
                    <div>
                      <div className="text-sm font-medium text-red-800">High Impact Detected</div>
                      <div className="text-xs text-red-600 mt-0.5">{result.high_severity} elements with high severity require immediate review</div>
                    </div>
                  </div>
                )}
                {result.documents_affected > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                    <span className="material-symbols-outlined text-amber-500 text-[18px] mt-0.5">description</span>
                    <div>
                      <div className="text-sm font-medium text-amber-800">Review Affected Documents</div>
                      <div className="text-xs text-amber-600 mt-0.5">{result.documents_affected} document{result.documents_affected > 1 ? "s" : ""} contain dependent clauses that need verification</div>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <span className="material-symbols-outlined text-blue-500 text-[18px] mt-0.5">fact_check</span>
                  <div>
                    <div className="text-sm font-medium text-blue-800">Validate Downstream Dependencies</div>
                    <div className="text-xs text-blue-600 mt-0.5">{result.total_impacts} policy elements depend on this change and should be validated</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button onClick={handleReset} className="px-5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              New Analysis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, color }) {
  const colors = {
    blue: "bg-blue-50 border-blue-100 text-blue-600",
    slate: "bg-slate-50 border-slate-100 text-slate-600",
    red: "bg-red-50 border-red-100 text-red-600",
    amber: "bg-amber-50 border-amber-100 text-amber-600",
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[18px] opacity-70">{icon}</span>
        <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
