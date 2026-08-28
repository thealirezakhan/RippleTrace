import { useState, useEffect } from "react";

export default function ImpactAnalysis({ onResults }) {
  const [documents, setDocuments] = useState([]);
  const [elements, setElements] = useState([]);
  const [selectedElement, setSelectedElement] = useState("");
  const [oldValue, setOldValue] = useState("");
  const [newValue, setNewValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/documents/").then((r) => r.json()).then(setDocuments).catch(() => {});
  }, []);

  useEffect(() => {
    if (!documents.length) return;
    const allElements = [];
    for (const doc of documents) {
      if (doc.policy_count > 0) {
        fetch(`/api/extraction/states/${doc.id}`)
          .then((r) => r.json())
          .then((states) => {
            states.forEach((s) => allElements.push({ ...s, doc_filename: doc.filename }));
            setElements([...allElements]);
          })
          .catch(() => {});
      }
    }
  }, [documents]);

  const handleAssess = async () => {
    if (!selectedElement.trim()) { setError("Select an element"); return; }
    const oldN = parseFloat(oldValue), newN = parseFloat(newValue);
    if (isNaN(oldN) || isNaN(newN)) { setError("Values must be numbers"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulate/impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ element_name: selectedElement, old_value: oldN, new_value: newN }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      onResults(await res.json());
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const currentElement = elements.find((e) => e.name === selectedElement);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-display-lg font-heading font-semibold text-on-surface tracking-tight">Impact Analysis</h2>
        <p className="text-body-sm text-on-surface-variant mt-1">Trace how a regulatory or policy change propagates across the compliance graph.</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Form Area */}
        <div className="col-span-12 lg:col-span-5 space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded p-6 shadow-sm">
            <h3 className="text-headline-md font-heading font-semibold text-on-surface mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">tune</span>
              Configure Parameter
            </h3>

            <div className="space-y-5">
              <div>
                <label className="block font-label-mono text-[11px] text-on-surface-variant mb-2 uppercase tracking-wider">Element Selection</label>
                <div className="relative">
                  <select
                    value={selectedElement}
                    onChange={(e) => {
                      setSelectedElement(e.target.value);
                      const el = elements.find((el) => el.name === e.target.value);
                      if (el) setOldValue(String(el.value));
                    }}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 text-body-sm text-on-surface appearance-none focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-all"
                  >
                    <option value="">Select element...</option>
                    {elements.map((el, i) => (
                      <option key={`${el.id || i}-${el.name}`} value={el.name}>{el.name} ({el.doc_filename})</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">expand_more</span>
                </div>
              </div>

              <div>
                <label className="block font-label-mono text-[11px] text-on-surface-variant mb-2 uppercase tracking-wider">Current Value</label>
                <input
                  className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 font-label-mono text-[11px] text-on-surface opacity-70 cursor-not-allowed"
                  disabled
                  type="text"
                  value={oldValue ? `$${Number(oldValue).toLocaleString()}` : ""}
                  placeholder="$0"
                />
              </div>

              <div>
                <label className="block font-label-mono text-[11px] text-on-surface-variant mb-2 uppercase tracking-wider">Proposed Value</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-label-mono text-[11px]">$</span>
                  <input
                    className="w-full bg-surface-container-lowest border border-secondary rounded pl-6 pr-3 py-2 font-label-mono text-[11px] text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary transition-all shadow-sm"
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="25,000"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 text-body-xs text-error bg-error-container/20 px-3 py-2 rounded">{error}</div>
            )}

            <div className="mt-8 pt-6 border-t border-outline-variant flex items-center justify-between">
              <button
                onClick={() => { setSelectedElement(""); setOldValue(""); setNewValue(""); setError(null); }}
                className="bg-surface-container-lowest border border-outline-variant text-on-surface font-label-bold text-[12px] px-4 py-2 rounded hover:bg-surface-container-low transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleAssess}
                disabled={loading}
                className="bg-primary-container text-white text-on-primary font-label-bold text-[12px] px-6 py-2 rounded flex items-center gap-2 hover:bg-tertiary-container transition-colors shadow-sm disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">analytics</span>
                {loading ? "Assessing..." : "Assess Impact"}
              </button>
            </div>
          </div>
        </div>

        {/* Propagation Preview */}
        <div className="col-span-12 lg:col-span-7">
          <div className="bg-surface-container-lowest border border-outline-variant rounded p-6 h-full min-h-[400px] flex flex-col shadow-sm relative overflow-hidden">
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-[16px]">info</span>
              <span className="font-label-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Propagation Preview</span>
            </div>
            <div className="flex-1 flex items-center justify-center relative w-full h-full mt-8">
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 rounded-full border-2 border-secondary bg-surface-container-lowest flex items-center justify-center relative shadow-sm">
                  <span className="material-symbols-outlined text-secondary text-[24px]">account_balance</span>
                </div>
                <div className="mt-3 bg-surface-container-lowest border border-outline-variant px-3 py-1 rounded font-label-mono text-[10px] text-on-surface shadow-sm">
                  {selectedElement ? `$${Number(newValue || 0).toLocaleString()}` : "Select element"}
                </div>
              </div>
              {/* Downstream nodes */}
              <div className="absolute top-[30%] right-[20%] flex flex-col items-center">
                <div className="w-10 h-10 rounded border border-outline bg-surface-container-lowest flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-outline text-[18px]">description</span>
                </div>
                <span className="mt-2 font-label-mono text-[9px] text-on-surface-variant">KYC Policy</span>
              </div>
              <div className="absolute bottom-[30%] left-[30%] flex flex-col items-center">
                <div className="w-10 h-10 rounded border border-outline bg-surface-container-lowest flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-outline text-[18px]">gavel</span>
                </div>
                <span className="mt-2 font-label-mono text-[9px] text-on-surface-variant">AML Controls</span>
              </div>
              <div className="absolute bottom-[30%] right-[30%] flex flex-col items-center">
                <div className="w-10 h-10 rounded border border-outline bg-surface-container-lowest flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-outline text-[18px]">monitoring</span>
                </div>
                <span className="mt-2 font-label-mono text-[9px] text-on-surface-variant">Audit Logs</span>
              </div>
            </div>
          </div>

          {/* Contextual Hint */}
          <div className="bg-surface-variant border-l-4 border-secondary p-4 rounded-r mt-4">
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-secondary text-[20px] mt-0.5">lightbulb</span>
              <div>
                <h4 className="font-label-bold text-[12px] text-on-surface mb-1">Graph Propagation Engine</h4>
                <p className="text-body-sm text-on-surface-variant">Select an element and propose a new value to simulate downstream impact across the compliance graph.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
