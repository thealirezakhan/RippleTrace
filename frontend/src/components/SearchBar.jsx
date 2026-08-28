import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, Loader2 } from "lucide-react";

export default function SearchBar({ onSearch, onClear, onNodeSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = useCallback(
    (q) => {
      setQuery(q);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!q.trim()) {
        setResults([]);
        setShowResults(false);
        onClear();
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/graph/search?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          setResults(data.results.slice(0, 20));
          setShowResults(true);
        } catch (err) {
          console.error("Search failed:", err);
        }
        setLoading(false);
      }, 300);
    },
    [onClear]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleSelectResult = (result) => {
    if (onNodeSelect && result.id) {
      onNodeSelect(`policy-${result.id}`);
    }
    setShowResults(false);
  };

  const handleFilterAll = () => {
    onSearch(query);
    setShowResults(false);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setShowResults(false);
    onClear();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search policy elements..."
          className="w-72 pl-10 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white text-gray-900"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto z-50">
          <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100">
            {results.length} result{results.length !== 1 ? "s" : ""} found
          </div>
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelectResult(r)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
            >
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-gray-900 truncate">{r.name}</span>
                <span className="text-xs text-gray-500 truncate max-w-[200px]">
                  {r.source_text?.substring(0, 80)}
                </span>
                <span className="text-[10px] text-gray-400">{r.doc_filename}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0 ml-2">
                {r.element_type}
              </span>
            </button>
          ))}
          <button
            onClick={handleFilterAll}
            className="w-full px-3 py-2 text-left text-sm text-brand-600 hover:bg-brand-50 font-medium border-t border-gray-100"
          >
            Filter graph to show all matches
          </button>
        </div>
      )}

      {showResults && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-center text-sm text-gray-500">
          No results found for "{query}"
        </div>
      )}

      {loading && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Searching...
        </div>
      )}
    </div>
  );
}
