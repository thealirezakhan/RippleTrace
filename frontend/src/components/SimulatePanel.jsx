import { useState } from "react";
import { Play, Loader2, AlertTriangle } from "lucide-react";

export default function SimulatePanel({ onImpact }) {
  const [elementName, setElementName] = useState("limit_10000_usd");
  const [oldVal, setOldVal] = useState("10000");
  const [newVal, setNewVal] = useState("25000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSimulate = async () => {
    if (!elementName.trim()) {
      setError("Element name is required");
      return;
    }
    const oldNum = parseFloat(oldVal);
    const newNum = parseFloat(newVal);
    if (isNaN(oldNum) || isNaN(newNum)) {
      setError("Values must be numbers");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulate/impact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          element_name: elementName,
          old_value: oldNum,
          new_value: newNum,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onImpact(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="p-4 border-t border-gray-200 bg-white">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Simulate Change</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Element Name</label>
          <input
            value={elementName}
            onChange={(e) => setElementName(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            placeholder="e.g. limit_10000_usd"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Old Value</label>
            <input
              type="number"
              value={oldVal}
              onChange={(e) => setOldVal(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">New Value</label>
            <input
              type="number"
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {error}
          </div>
        )}
        <button
          onClick={handleSimulate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {loading ? "Computing..." : "Simulate Impact"}
        </button>
      </div>
    </div>
  );
}
