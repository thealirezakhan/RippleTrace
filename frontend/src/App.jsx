import { useState, useCallback, useEffect } from "react";
import Overview from "./screens/Overview";
import KnowledgeGraph from "./screens/KnowledgeGraph";
import ImpactAnalysis from "./screens/ImpactAnalysis";
import DocumentRepo from "./screens/DocumentRepo";
import Ingestion from "./screens/Ingestion";
import DocumentDetail from "./screens/DocumentDetail";
import ImpactResults from "./screens/ImpactResults";
import DiffViewer from "./screens/DiffViewer";
import ContradictionViewer from "./screens/ContradictionViewer";
import GlobalSearch from "./components/GlobalSearch";

const NAV_ITEMS = [
  { key: "overview", icon: "dashboard", label: "Overview" },
  { key: "graph", icon: "account_tree", label: "Knowledge Graph" },
  { key: "impact", icon: "analytics", label: "Impact Analysis" },
  { key: "diff", icon: "difference", label: "Clause Diff" },
  { key: "contradictions", icon: "report_problem", label: "Contradictions" },
  { key: "documents", icon: "folder_open", label: "Documents" },
  { key: "ingestion", icon: "input", label: "Ingestion" },
];

const BOTTOM_NAV = [
  { icon: "notifications", label: "Notifications" },
  { icon: "help_outline", label: "Help" },
  { icon: "account_circle", label: "Profile" },
];

export default function App() {
  const [activeScreen, setActiveScreen] = useState("overview");
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [impactResult, setImpactResult] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const navigateTo = useCallback((screen) => {
    setActiveScreen(screen);
    setSelectedDocId(null);
    setImpactResult(null);
  }, []);

  const openDocument = useCallback((docId) => {
    setSelectedDocId(docId);
    setActiveScreen("document-detail");
  }, []);

  const showImpactResults = useCallback((result) => {
    setImpactResult(result);
    setActiveScreen("impact-results");
  }, []);

  const renderScreen = () => {
    if (activeScreen === "document-detail" && selectedDocId) {
      return <DocumentDetail docId={selectedDocId} onBack={() => navigateTo("documents")} onNavigate={navigateTo} openDocument={openDocument} />;
    }
    if (activeScreen === "impact-results" && impactResult) {
      return <ImpactResults result={impactResult} onBack={() => navigateTo("impact")} />;
    }
    switch (activeScreen) {
      case "overview": return <Overview onNavigate={navigateTo} openDocument={openDocument} />;
      case "graph": return <KnowledgeGraph />;
      case "impact": return <ImpactAnalysis onResults={showImpactResults} />;
      case "diff": return <DiffViewer onNavigate={navigateTo} />;
      case "contradictions": return <ContradictionViewer onNavigate={navigateTo} />;
      case "documents": return <DocumentRepo openDocument={openDocument} />;
      case "ingestion": return <Ingestion />;
      default: return <Overview onNavigate={navigateTo} openDocument={openDocument} />;
    }
  };

  return (
    <div className="h-screen flex bg-surface font-body text-on-surface">
      {/* Sidebar */}
      <aside className="w-[240px] bg-surface-container-lowest border-r border-outline-variant flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-outline-variant">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-inverse-surface text-inverse-on-surface rounded flex items-center justify-center text-heading-md font-heading font-bold">
              R
            </div>
            <div>
              <div className="text-body-xs font-heading font-semibold text-on-surface">RippleTrace</div>
              <div className="text-label-mono text-on-surface-variant">Regulatory Intelligence</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => navigateTo(item.key)}
              className={`nav-item w-full text-left ${activeScreen === item.key ? "active" : ""}`}
            >
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="px-2 py-3 border-t border-outline-variant space-y-0.5">
          {BOTTOM_NAV.map((item) => (
            <button key={item.icon} className="nav-item w-full text-left">
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-12 border-b border-outline-variant bg-surface-container-lowest flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-low border border-outline-variant rounded text-body-xs text-on-surface-variant cursor-pointer hover:bg-surface-container transition-colors flex-1 max-w-md"
          >
            <span className="material-symbols-outlined text-[16px]">search</span>
            Search...
            <kbd className="ml-auto text-label-mono text-outline bg-surface-container-lowest px-1.5 py-0.5 rounded border border-outline-variant text-[10px]">⌘K</kbd>
          </button>
          <div className="flex items-center gap-1 ml-auto">
            <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">settings_ethernet</span>
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">sync</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {renderScreen()}
        </main>
      </div>

      {/* Global Search Modal */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} openDocument={openDocument} onNavigate={navigateTo} />}
    </div>
  );
}
