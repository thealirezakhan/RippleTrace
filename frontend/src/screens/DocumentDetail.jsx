import { useState, useEffect } from "react";

const TYPE_COLORS = {
  threshold: { bg: "bg-secondary/10", text: "text-secondary", border: "border-secondary" },
  constraint: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-500" },
  variable: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-500" },
  condition: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-500" },
};

export default function DocumentDetail({ docId, onBack, onNavigate }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/documents/${docId}`)
      .then((r) => r.json())
      .then(setDoc)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [docId]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <span className="material-symbols-outlined text-[32px] text-secondary animate-spin">progress_activity</span>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-body-sm text-on-surface-variant">Document not found.</p>
        <button onClick={onBack} className="btn-primary mt-4">Back</button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Back + Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-body-xs text-secondary mb-4 hover:underline">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Document Repository
      </button>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-headline-md font-heading font-semibold text-on-surface">{doc.filename}</h2>
          <p className="text-body-xs text-on-surface-variant mt-1">{doc.chunk_count} sections · {doc.policy_count} policy elements</p>
        </div>
        <button onClick={() => onNavigate("ingestion")} className="btn-secondary text-[12px]">
          <span className="material-symbols-outlined text-[14px]">input</span>
          Re-extract
        </button>
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          {/* Sections */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low/50">
              <h3 className="font-label-bold text-[12px] text-on-surface uppercase">Document Sections</h3>
            </div>
            <div className="divide-y divide-outline-variant">
              {doc.chunks.map((chunk) => (
                <div key={chunk.id} className="px-4 py-3 hover:bg-surface-container-lowest/50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-bold text-[12px] text-on-surface">{chunk.section}</span>
                    <span className="font-label-mono text-[10px] text-on-surface-variant">#{chunk.chunk_index}</span>
                  </div>
                  <p className="text-body-xs text-on-surface-variant line-clamp-3 leading-relaxed">{chunk.content}</p>
                  {chunk.policy_count > 0 && (
                    <div className="mt-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px] text-secondary">gavel</span>
                      <span className="font-label-mono text-[10px] text-secondary">{chunk.policy_count} elements</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Inspector sidebar */}
        <aside className="w-80 bg-surface-container-low border border-outline-variant rounded flex flex-col shrink-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-high/50">
            <h3 className="font-label-bold text-[12px] text-on-surface uppercase">Policy Elements</h3>
          </div>
          <div className="flex-1 overflow-auto">
            {doc.policies.length === 0 ? (
              <div className="p-4 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[24px] text-outline mb-1 block">gavel</span>
                <p className="text-body-xs">No elements extracted yet</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant">
                {doc.policies.map((pol) => {
                  const tc = TYPE_COLORS[pol.element_type] || TYPE_COLORS.variable;
                  return (
                    <div key={pol.id} className="px-4 py-3 hover:bg-surface-container-lowest/50 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-1.5 py-0.5 text-[9px] font-label-mono uppercase rounded ${tc.bg} ${tc.text}`}>{pol.element_type}</span>
                      </div>
                      <div className="text-body-xs font-semibold text-on-surface mb-1">{pol.name}</div>
                      {pol.source_text && (
                        <p className="text-[10px] text-on-surface-variant italic leading-relaxed line-clamp-2">"{pol.source_text}"</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        {pol.value != null && <span className="font-label-mono text-[10px] text-on-surface-variant">Value: {String(pol.value)}</span>}
                        {pol.unit && <span className="font-label-mono text-[10px] text-on-surface-variant">Unit: {pol.unit}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
