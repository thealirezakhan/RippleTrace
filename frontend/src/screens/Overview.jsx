import { useState, useEffect, useCallback } from "react";

export default function Overview({ onNavigate, openDocument }) {
  const [metrics, setMetrics] = useState(null);
  const [demoResult, setDemoResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [demoRunning, setDemoRunning] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/metrics")
      .then((r) => r.json())
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const runDemo = useCallback(async () => {
    setDemoRunning(true);
    try {
      const res = await fetch("/api/demo/run", { method: "POST" });
      const data = await res.json();
      setDemoResult(data);
      // Refresh metrics
      const m = await fetch("/api/dashboard/metrics").then((r) => r.json());
      setMetrics(m);
    } catch (e) {
      console.error("Demo failed:", e);
    }
    setDemoRunning(false);
  }, []);

  const m = metrics || {};
  const s = demoResult?.summary || {};

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-display-lg font-heading font-semibold text-on-surface tracking-tight">
            Compliance Intelligence
          </h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Detect → Understand → Trace → Explain → Prioritize → Act
          </p>
        </div>
        <button
          onClick={runDemo}
          disabled={demoRunning}
          className="bg-inverse-surface text-inverse-on-surface px-5 py-2.5 text-body-sm font-semibold rounded-lg cursor-pointer transition-all duration-150 inline-flex items-center gap-2 shadow-lg hover:shadow-xl disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[18px]">
            {demoRunning ? "hourglass_top" : "play_circle"}
          </span>
          {demoRunning ? "Running Demo..." : "Run Demo"}
        </button>
      </div>

      {/* Impact Score Hero */}
      {s.impact_score !== undefined && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 mb-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-red-500/20 to-transparent rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="relative z-10 flex items-center gap-8">
            <div className="text-center">
              <div className="text-[56px] font-heading font-bold leading-none">{s.impact_score}</div>
              <div className="text-[10px] uppercase tracking-widest opacity-60 mt-1">Impact Score</div>
            </div>
            <div className="flex-1 grid grid-cols-4 gap-4">
              <StatBox label="Documents" value={s.documents_analyzed} icon="description" />
              <StatBox label="Changed Clauses" value={s.changed_clauses} icon="diff" color="text-amber-400" />
              <StatBox label="Affected Artifacts" value={s.affected_artifacts} icon="radar" color="text-red-400" />
              <StatBox label="Contradictions" value={s.contradictions_detected + s.drift_items} icon="warning" color="text-orange-400" />
            </div>
          </div>
          {/* Blast Radius Bar */}
          <div className="relative z-10 mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-widest opacity-60">Blast Radius</span>
              <span className="text-[10px] opacity-60">
                {s.blast_radius?.documents_affected || 0} documents · {s.blast_radius?.max_propagation_distance || 0} hops max
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 via-red-400 to-red-600 rounded-full transition-all duration-700"
                style={{ width: `${Math.min((s.affected_artifacts || 0) * 8, 100)}%` }}
              />
            </div>
            <div className="flex gap-4 mt-2">
              {s.blast_radius?.document_list?.map((doc, i) => (
                <span key={i} className="text-[10px] opacity-50">{doc}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard label="Documents" value={m.documents} sub="+ analyzed" color="text-blue-600" />
        <MetricCard label="Policy Elements" value={m.policy_elements} sub="extracted" color="text-emerald-600" />
        <MetricCard label="Relationships" value={m.relationships} sub="in graph" color="text-purple-600" />
        <MetricCard
          label="Graph Health"
          value={m.total_documents > 0 ? `${Math.round(((m.total_documents || 0) / Math.max(m.total_documents, 1)) * 100)}%` : "—"}
          sub="connected"
          color="text-amber-600"
        />
      </div>

      {/* Severity Breakdown + Demo Flow */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        {/* Severity */}
        <div className="col-span-5 bg-surface-container-lowest border border-outline-variant rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[18px] text-on-surface">gauge</span>
            <span className="text-body-sm font-heading font-semibold">Severity Breakdown</span>
          </div>
          <div className="space-y-3">
            <SeverityBar label="High" count={s.severity_breakdown?.high || 0} total={Math.max((s.severity_breakdown?.high || 0) + (s.severity_breakdown?.medium || 0) + (s.severity_breakdown?.low || 0), 1)} color="bg-red-500" />
            <SeverityBar label="Medium" count={s.severity_breakdown?.medium || 0} total={Math.max((s.severity_breakdown?.high || 0) + (s.severity_breakdown?.medium || 0) + (s.severity_breakdown?.low || 0), 1)} color="bg-amber-500" />
            <SeverityBar label="Low" count={s.severity_breakdown?.low || 0} total={Math.max((s.severity_breakdown?.high || 0) + (s.severity_breakdown?.medium || 0) + (s.severity_breakdown?.low || 0), 1)} color="bg-blue-500" />
          </div>
        </div>

        {/* Demo Pipeline Status */}
        <div className="col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[18px] text-on-surface">schema</span>
            <span className="text-body-sm font-heading font-semibold">Analysis Pipeline</span>
          </div>
          <div className="flex items-center gap-2">
            {["Ingest", "Extract", "Graph", "Impact", "Diff", "Detect"].map((stage, i) => {
              const stageData = demoResult?.stages?.[i];
              const isComplete = stageData?.status === "complete";
              const hasError = stageData?.error;
              return (
                <div key={stage} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                    hasError ? "bg-red-100 text-red-600" : isComplete ? "bg-emerald-100 text-emerald-600" : "bg-surface-container-low text-on-surface-variant"
                  }`}>
                    {hasError ? "!" : isComplete ? "✓" : i + 1}
                  </div>
                  <span className="text-[10px] text-on-surface-variant">{stage}</span>
                  {i < 5 && <span className="material-symbols-outlined text-[12px] text-outline mx-1">chevron_right</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <QuickAction
          icon="difference"
          label="Clause-Level Diff"
          description="Compare old vs. new policy versions"
          onClick={() => onNavigate("diff")}
        />
        <QuickAction
          icon="report_problem"
          label="Contradictions"
          description="Detect conflicts and policy drift"
          onClick={() => onNavigate("contradictions")}
        />
        <QuickAction
          icon="account_tree"
          label="Knowledge Graph"
          description="Visualize document dependency graph"
          onClick={() => onNavigate("graph")}
        />
      </div>

      {/* Demo Scenario Callout */}
      {demoResult && (
        <div className="bg-surface-variant border-l-4 border-secondary rounded-r p-5">
          <div className="flex gap-4">
            <span className="material-symbols-outlined text-secondary text-[24px] mt-0.5">auto_awesome</span>
            <div>
              <h4 className="font-heading font-semibold text-on-surface mb-2">Demo Scenario Complete</h4>
              <p className="text-body-sm text-on-surface-variant leading-relaxed">
                <strong>Critical change detected:</strong> MFA requirement upgraded from single-factor to multi-factor authentication for ALL remote access.
                This single change cascades across {s.affected_artifacts || 0} downstream artifacts spanning policies, controls, procedures, and technical standards.
              </p>
              <div className="flex gap-3 mt-3">
                <button onClick={() => onNavigate("diff")} className="btn-secondary text-[10px]">
                  <span className="material-symbols-outlined text-[14px]">difference</span>
                  View Clause Changes
                </button>
                <button onClick={() => onNavigate("contradictions")} className="btn-secondary text-[10px]">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  View Contradictions
                </button>
                <button onClick={() => onNavigate("impact")} className="btn-secondary text-[10px]">
                  <span className="material-symbols-outlined text-[14px]">analytics</span>
                  Run Impact Analysis
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="metric-card">
      <div className="text-label-mono text-on-surface-variant uppercase tracking-widest mb-2 text-[10px]">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`text-[32px] font-heading font-bold leading-none ${color}`}>{value ?? "—"}</span>
        <span className="text-body-xs text-on-surface-variant">{sub}</span>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon, color = "text-white" }) {
  return (
    <div className="bg-white/5 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`material-symbols-outlined text-[14px] ${color}`}>{icon}</span>
        <span className="text-[9px] uppercase tracking-widest opacity-50">{label}</span>
      </div>
      <div className={`text-[28px] font-heading font-bold leading-none ${color}`}>{value ?? 0}</div>
    </div>
  );
}

function SeverityBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-body-xs text-on-surface-variant">{label}</span>
        <span className="text-body-xs font-heading font-semibold">{count}</span>
      </div>
      <div className="h-1.5 bg-surface-container-low rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QuickAction({ icon, label, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 text-left hover:border-secondary hover:bg-surface-container-low transition-all duration-150 group"
    >
      <span className="material-symbols-outlined text-[24px] text-secondary group-hover:text-secondary mb-2 block">{icon}</span>
      <div className="text-body-sm font-heading font-semibold text-on-surface mb-1">{label}</div>
      <div className="text-body-xs text-on-surface-variant">{description}</div>
    </button>
  );
}
