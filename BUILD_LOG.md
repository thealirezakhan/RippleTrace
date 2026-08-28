# RippleTrace — Build Log

## Why RippleTrace Exists
Manual regulatory change impact analysis takes compliance teams weeks. Existing tools (RAG, knowledge graphs, diff tools) find *related* documents but don't compute *what breaks*. RippleTrace solves the causal reasoning problem: change one number, see the enterprise-wide ripple with evidence trails.

---

## Phase 1: Project Scaffolding

**What**: Created directory structure, `docker-compose.yml`, PostgreSQL init script.

**Why Docker Compose**: One command starts all 4 services (Postgres, Neo4j, backend, frontend). Hackathon judges see `docker-compose up` and it just works. No manual service coordination.

**Why pgvector**: Vector search for semantic dependency discovery. We store embeddings of document chunks and use cosine similarity to find related policy elements across documents — this supplements the explicit graph edges.

**Why Neo4j Community**: Native graph traversal is critical for our propagation engine. BFS/DFS over `DEPENDS_ON` and `REFERENCES` edges is the core algorithm. SQL recursive CTEs work but are painful and slow for deep traversals. Neo4j is purpose-built for this.

```
rippletrace/
├── docker-compose.yml      # 4 services: postgres, neo4j, backend, frontend
├── init.sql                # pgvector extension + schema
├── backend/                # FastAPI app
├── frontend/               # React + React Flow
└── sample_docs/            # 5 demo documents
```

---

## Phase 2: Document Ingestion

**What**: `ingestion.py` — uploads PDFs/MDs, parses with Docling, chunks by section, stores in PostgreSQL.

**Why Docling (IBM)**: Best open-source document parser for complex layouts. Handles tables, lists, headers — things that break naive text splitters. The architecture doc validated this choice.

**Why section-based chunking**: Policy documents are hierarchical. A threshold in "Section 4.2.1" means something different than the same number in "Section 2.3". Section headers give us semantic boundaries for chunks.

**Flow**: Upload → Docling parse → Markdown export → Split on `## ` headers → Store chunks with document reference.

---

## Phase 3: Policy State Extraction

**What**: `extraction.py` — sends each chunk to local Ollama model, extracts structured policy state (variables, thresholds, conditions, constraints).

**Why Ollama (local)**: Zero cost, no API key needed, works offline. The user has qwen2.5-coder:7b installed which handles structured JSON extraction well. Ollama exposes an OpenAI-compatible API at `localhost:11434/v1`, so we keep the `openai` Python library and just swap the base URL — minimal code change.

**Why structured extraction**: The whole innovation is treating documents as *stateful systems*, not text. We need machine-readable `max_transaction_limit = 10000`, not just "the document mentions a limit."

**Extraction schema**:
```json
{
  "element_type": "threshold",
  "name": "max_transaction_limit",
  "value": 10000,
  "unit": "USD",
  "source_text": "The maximum transaction limit shall not exceed $10,000"
}
```

---

## Phase 4: Dependency Graph

**What**: `graph.py` — builds Neo4j graph from extracted policy states. Creates nodes (Document → Chunk → PolicyElement) and semantic edges (REFERENCES, DEPENDS_ON).

**Why graph-first**: The propagation engine needs to traverse relationships. A flat database can't efficiently answer "what depends on this element 3 hops away?" Neo4j handles this natively.

**Edge creation logic**:
- Same `name` across different documents → `REFERENCES` edge
- Related `element_type` pairs (threshold↔constraint, variable↔threshold) → `DEPENDS_ON` edge

**Why this is minimal**: For hackathon, we create edges based on name matching and type relationships. Production would use LLM-based relationship extraction. This is the deliberate simplification.

---

## Phase 5: Causal Propagation Engine

**What**: `propagation.py` — the core innovation. BFS from a changed element, traversing DEPENDS_ON and REFERENCES edges up to 4 hops, computing confidence decay and violation detection.

**Why BFS**: Breadth-first search gives us distance from the source element. Confidence decays exponentially with distance: `confidence = 0.8^distance`. This is the counterfactual decay model from the architecture doc.

**Confidence decay formula**:
- Distance 1: 0.8 (high confidence — direct dependency)
- Distance 2: 0.64 (medium — depends on a dependency)
- Distance 3: 0.512 (medium-low — three hops away)
- Distance 4: 0.4096 (low — may be coincidental)
- Below 0.3: filtered out (too distant to be meaningful)

**Violation detection**: Simple heuristic — if element type is "constraint" and source text contains "must/shall/maximum/limit", flag as violation. For hackathon, this covers the common cases.

**Why not use GPT for propagation**: The propagation must be deterministic and fast (< 5 seconds for demo). LLM calls would be slow and non-deterministic. The algorithm is graph traversal + math — no LLM needed.

---

## Phase 6: FastAPI Endpoints

**What**: `main.py` + module routers — REST API for all operations.

**Why FastAPI**: Async native, auto-generates OpenAPI docs, type-safe with Pydantic. Hackathon judges can hit `/docs` and see the full API. Fast enough for our throughput.

**Endpoints**:
- `POST /api/documents/upload` — upload and parse document
- `POST /api/extraction/extract/{doc_id}` — extract policy state
- `POST /api/graph/build/{doc_id}` — build graph
- `POST /api/simulate/impact` — run propagation
- `GET /api/graph/nodes` and `/edges` — visualization data

---

## Phase 7: Frontend

**What**: React + React Flow + Tailwind CSS dashboard.

**Why React Flow**: Industry-standard for graph visualization. Handles node positioning, zooming, panning, edge rendering. Writing this from scratch would take days.

**Why Tailwind**: Rapid prototyping. Utility classes mean no CSS files, no design system setup. Hackathon speed matters.

**Components**:
- `DocumentPanel` — upload + list documents
- `SimulatePanel` — input element name, old/new values, trigger simulation
- `GraphView` — React Flow canvas with nodes colored by type, impacted nodes highlighted
- `ImpactReport` — severity cards with evidence trails

---

## Phase 8: Demo Data

**What**: 5 sample policy documents covering financial services regulatory domain.

**Why these specific documents**: They demonstrate the core use case — changing a transaction limit ($10,000) cascades into:
- Technical spec validation rules (doc 2)
- Compliance framework thresholds (doc 3)
- Operational runbook alert thresholds (doc 4)
- Audit framework review criteria (doc 5)

This is the "wow moment" from the demo script: one number change, 5 documents affected.

---

## Phase 9: Bulk Ingestion

**What**: `ingestion.py` rewritten — `POST /api/documents/scan` scans entire `DOCS_DIR` for .md/.txt/.pdf/.docx files, auto-ingests all.

**Why bulk scan**: Regulatory environments have hundreds of documents. Manual upload one-by-one is impractical. Single scan button ingests everything.

**Duplicate detection**: Filename-based dedup prevents re-processing. Existing documents skipped with `cached: true` response.

---

## Phase 10: Hierarchical Graph Queries

**What**: `graph.py` rewritten — separate endpoints for different zoom levels.

**Endpoints**:
- `GET /api/graph/overview` — document-level nodes only (shows cross-doc edges)
- `GET /api/graph/doc/{doc_id}` — expand document (chunks + policies + internal edges)
- `GET /api/graph/neighborhood/{node_id}?hops=N` — N-hop focus around policy element
- `GET /api/graph/search?q=...` — search policy elements by name

**Why hierarchical**: Dumping 500+ nodes on canvas is unusable. Progressive disclosure: overview → document → neighborhood → focus. Each level loads only what's needed.

**Why separate endpoints**: Overview returns doc-level aggregation. Document expansion returns full detail. Neighborhood returns focused subgraph. Single endpoint would over-fetch or under-fetch.

---

## Phase 11: Production Frontend

**What**: Complete frontend rewrite — Sidebar, SearchBar, GraphView with professional UI/UX.

**Layout decisions**:
- **Fixed 256px left sidebar**: Persistent controls, always visible. No collapsing — users need constant access to filters and document list.
- **Search bar in header**: Central position, always accessible. Not hidden in sidebar.
- **Full-width graph canvas**: Maximum visualization space. Sidebar takes fixed 256px, rest is canvas.
- **Simulate panel at bottom**: Fixed position, always available. Doesn't interfere with graph interaction.

**Graph visualization**:
- **Type-based colors**: Document (indigo), Chunk (gray), PolicyElement (green). Consistent across all views.
- **Focus mode**: Click a node → dim non-connected nodes to 30% opacity, zoom to fit 1-hop neighbors. Click empty canvas → clear focus.
- **Search highlight**: Search filters graph to show only matching nodes. Blue highlight on matches.
- **Impact highlighting**: Simulated impacted nodes get red background and border.
- **Auto-zoom**: Graph fits to view on data change. Smooth 300ms animation.

**Filter persistence**:
- Filters saved to `localStorage` on every change
- Loaded from `localStorage` on mount
- Reset button restores defaults
- Filter counts shown next to each type (e.g., "Document 5", "Chunk 23")

**Search UX**:
- 300ms debounce prevents excessive API calls
- 20 result limit prevents overwhelming dropdown
- Dropdown shows name, source text preview, element type
- "Filter graph to show all matches" button applies search to graph
- Clear button resets to full graph view

---

## Phase 12: React Flow v12 Integration

**What**: GraphView.jsx rewritten using React Flow v12.4.4 with controlled nodes/edges.

**Key issue fixed**: `useNodesState` only initializes once — doesn't update when data changes. Solution: use `useState` + `applyNodeChanges`/`applyEdgeChanges` for controlled mode.

**Data contract**:
- App.jsx sends: `{ nodes: [{ id, type, data: { label } }], edges: [{ id, source, target, type }] }`
- GraphView reads: `n.type` for coloring, `n.data.label` for display text
- Fixed from original broken contract: `n.labels[0]` and `n.props?.name`

**ReactFlowProvider**: Must wrap entire app in App.jsx so `useReactFlow()` works in GraphView.

---

## Tech Stack Justification Summary

| Choice | Why | Alternative Rejected |
|--------|-----|---------------------|
| FastAPI | Async, auto-docs, type-safe | Flask (sync, no auto-docs) |
| Docling | Best OSS document parser | PyPDF2 (breaks on complex layouts) |
| Ollama + qwen2.5-coder | Free, local, no API key | OpenAI GPT-4o-mini (costs money) |
| Neo4j | Native graph traversal | PostgreSQL recursive CTEs (slow, painful) |
| pgvector | Integrated with Postgres | Pinecone/Weaviate (extra service, overkill) |
| React Flow v12 | Industry-standard graph viz, controlled mode | D3.js (too low-level), vis.js (less React-native) |
| Tailwind | Rapid prototyping | CSS modules (slower iteration) |
| Docker Compose | One-command startup | Manual service management |
| localStorage | Filter persistence, no backend needed | Database-backed prefs (overkill for filters) |

---

## Production Architecture Decisions

### Why Regex Extraction as Default
Ollama on CPU takes minutes per document. Regex is instant. Ollama kept optional via `?use_llm=true` query param. Production would use GPU-accelerated inference or cloud API.

### Why Hierarchical Graph (Not Flat)
Dumping 500+ nodes on canvas is unusable. Progressive disclosure: overview → document → neighborhood. Each level loads only what's needed. Semantic zoom reveals detail at appropriate zoom levels.

### Why BFS for Propagation (Not DFS)
BFS gives distance from source element. Confidence decays with distance: `0.8^distance`. DFS would miss shorter paths and give incorrect confidence scores.

### Why No Auto-Layout Algorithm
React Flow's built-in layout is sufficient for demo. Production would use dagre or elkjs for hierarchical layout. Auto-layout adds complexity without proportional benefit for hackathon.

### Why Fixed Sidebar (Not Collapsible)
Users need constant access to filters and document list. Collapsible sidebar requires extra click to access controls. Fixed 256px is small enough to not waste canvas space.

### Why localStorage for Filters
Filters are view preferences, not data. localStorage is simple, fast, and persists across sessions. Database-backed preferences would add unnecessary complexity.

---

## Phase 13: Production Rewrite — Backend

**What**: Complete backend rewrite fixing all critical bugs and adding missing features.

### Root Causes Fixed

1. **Graph nodes showed `doc_1` instead of actual filenames** — `build_graph` now fetches filename from PostgreSQL and stores it in Neo4j.

2. **Double-serialized JSONB values** — `extraction.py` was doing `json.dumps(el.get("value"))` on a value that would be stored in a JSONB column, turning `10000` into the string `"10000"`. Fixed to store proper JSON.

3. **No cross-document traversal** — `graph_neighborhood` only followed edges within the same document. Rewritten to traverse across documents and return connected nodes from multiple documents.

4. **O(n²) Cypher calls for edge creation** — `_create_semantic_edges` ran individual MERGE queries per pair. Rewritten to use `UNWIND` batched queries.

5. **SQL injection via f-string interpolation in Cypher** — `graph_neighborhood` used f-strings for node ID lists. Replaced with parameterized queries using `$ids` list parameter.

6. **Temp file leak in upload** — `upload_document` wrote to `/tmp/` without cleanup. Rewritten to use `tempfile.NamedTemporaryFile` with `finally` cleanup.

7. **No error handling in graph/propagation** — Added HTTPException with proper status codes and error messages.

### New Endpoints

- `GET /api/graph/node/{node_id}` — Full node inspection with relationships
- `GET /api/dashboard/metrics` — Real-time graph health and metrics
- `GET /api/documents/{document_id}` — Document detail with chunks and policies
- `DELETE /api/documents/{document_id}` — Document deletion with Neo4j cleanup
- `POST /api/extraction/extract/{doc_id}?force=true` — Re-extraction support

### Ingestion Improvements

- All `#` header levels (1-6) now create chunk boundaries (was only `#` and `##`)
- Empty documents handled gracefully with error reporting
- Filename sanitized on upload (regex safe characters)
- `.docx` support via Docling (was listed but would crash)
- Metadata extraction (title from first heading)
- Filename uniqueness constraint in PostgreSQL

---

## Phase 14: Production Rewrite — Frontend

**What**: Complete frontend rewrite with proper UX patterns.

### New Components

- **NodeInspector** — Side panel for inspecting policy element details, relationships, and document context
- **Dashboard** — Enterprise-style metrics view with graph health, data quality, cross-document connectivity, and pipeline visualization

### Graph Improvements

- **Automatic layout** — Computes positions based on document grouping (policies cluster under their parent document)
- **Edge coloring** — REFERENCES (blue), DEPENDS_ON (amber), HAS_SECTION (gray), HAS_POLICY (green)
- **MiniMap** — Added for navigation in large graphs
- **Selected node highlighting** — Clicked node gets blue border, neighbors stay visible, unrelated nodes dim to 20% opacity
- **Search highlights** — Search matches get blue background

### Interaction Model

- Clicking a node opens NodeInspector (does NOT navigate away)
- NodeInspector shows: identity, value, source text, document link, expandable relationships
- Clicking a relationship in the inspector navigates to that node
- "Back to corpus" button returns to overview

### Search Improvements

- Search results now navigate to specific nodes (not just filter graph)
- Results show document filename
- Empty results state
- Increased width for better readability

### Error Handling

- SimulatePanel: input validation, error display, loading states
- ImpactReport: empty impacts state, document-affected count
- Sidebar: extract-all button, per-document build buttons, warn status
- GraphView: empty state with guidance text

### Removed Dead Code

- DocumentPanel.jsx (never imported, called non-existent endpoints)

---

## Phase 15: Testing

**What**: Core logic tests for extraction, chunking, propagation, and graph relationships.

16 tests covering:
- Regex extraction (thresholds, percentages, empty text)
- Text chunking (headers, empty, no-headers)
- Type relationship detection
- Severity level calculation
- Violation detection (constraints, thresholds)
- JSON parsing (valid, markdown fences, invalid, dict wrapper)
- Document metadata extraction

All tests pass.
