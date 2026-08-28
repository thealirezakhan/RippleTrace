import { useState, useEffect, useRef, useCallback } from "react";

export default function GlobalSearch({ onClose, openDocument, onNavigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/graph/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => { setResults(d.results || []); setActiveIndex(0); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && results[activeIndex]) {
      const r = results[activeIndex];
      if (r.doc_id) { openDocument(r.doc_id); onClose(); }
    }
  }, [results, activeIndex, onClose, openDocument]);

  const highlightMatch = (text, q) => {
    if (!q || !text) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="font-semibold text-secondary bg-secondary/10 px-0.5 rounded">{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="absolute inset-0 z-50 flex justify-center items-start pt-[72px] bg-tertiary-container/10 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-2xl mx-4 bg-surface-container-lowest border-2 border-primary-container shadow-[4px_4px_0_0_rgba(19,27,46,0.2)] rounded flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Search Input */}
        <div className="flex items-center px-4 py-4 border-b border-outline-variant">
          <span className="material-symbols-outlined text-outline mr-3 text-[20px]">search</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-[14px] text-on-surface font-label-mono outline-none placeholder:text-outline-variant placeholder:font-label-mono"
            placeholder="Search documents, policy elements, controls..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center gap-1.5 ml-3">
            <kbd className="font-label-mono text-[10px] text-outline border border-outline-variant px-1.5 py-0.5 rounded bg-surface">ESC</kbd>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 max-h-[500px] overflow-y-auto p-2 pb-4">
          {loading && results.length === 0 && (
            <div className="py-8 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[24px] animate-spin">progress_activity</span>
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="py-8 text-center text-on-surface-variant text-body-xs">No results for "{query}"</div>
          )}

          {results.length > 0 && (
            <div className="mb-4">
              <h3 className="font-label-mono text-[11px] text-outline uppercase tracking-wider px-3 py-2">Policy Elements</h3>
              <div className="flex flex-col gap-1">
                {results.map((r, i) => (
                  <div
                    key={r.id}
                    onClick={() => { if (r.doc_id) { openDocument(r.doc_id); onClose(); } }}
                    className={`group relative flex flex-col p-3 pl-4 border-l-2 cursor-pointer rounded-r transition-colors ${
                      i === activeIndex ? "border-secondary bg-surface-container-low" : "border-transparent hover:border-outline-variant hover:bg-surface"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1.5 gap-4">
                      <div className="flex items-center gap-2.5">
                        <span className={`material-symbols-outlined text-[18px] ${i === activeIndex ? "text-secondary" : "text-outline group-hover:text-on-surface"}`}>gavel</span>
                        <span className="font-label-bold text-[12px] text-on-surface">{highlightMatch(r.name, query)}</span>
                      </div>
                      <span className="shrink-0 font-label-mono text-[9px] text-on-surface-variant border border-outline-variant px-2 py-0.5 rounded-full uppercase tracking-wide">{r.element_type}</span>
                    </div>
                    <div className="ml-[28px]">
                      {r.source_text && (
                        <p className="text-body-sm text-on-surface-variant line-clamp-1">{highlightMatch(r.source_text, query)}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 opacity-50 group-hover:opacity-80 transition-opacity">
                        <span className="material-symbols-outlined text-[12px] text-outline">description</span>
                        <span className="font-label-mono text-[10px] text-outline">{r.doc_filename}</span>
                      </div>
                    </div>
                    {i === activeIndex && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <span className="font-label-mono text-[10px] text-secondary">Jump</span>
                        <kbd className="font-label-mono text-[10px] text-secondary border border-secondary/30 px-1 py-0.5 rounded bg-surface">↵</kbd>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!query && (
            <div className="py-8 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] text-outline mb-2 block">search</span>
              <p className="text-body-sm font-heading">Search across all documents and policy elements</p>
              <p className="text-body-xs text-outline mt-1">Type to search by name, content, or regulation reference</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-outline-variant p-2 flex justify-between items-center bg-surface">
          <div className="flex items-center gap-4 text-outline font-label-mono text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                <kbd className="border border-outline-variant rounded px-1 py-0.5 bg-surface-container-lowest flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px] leading-none">keyboard_arrow_up</span>
                </kbd>
                <kbd className="border border-outline-variant rounded px-1 py-0.5 bg-surface-container-lowest flex items-center justify-center">
                  <span className="material-symbols-outlined text-[12px] leading-none">keyboard_arrow_down</span>
                </kbd>
              </div>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="border border-outline-variant rounded px-1.5 py-0.5 bg-surface-container-lowest flex items-center justify-center leading-none">↵</kbd>
              <span>Select</span>
            </div>
          </div>
          <span className="font-label-mono text-[10px] text-outline-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">dataset</span>
            Global Scope
          </span>
        </div>
      </div>
    </div>
  );
}
