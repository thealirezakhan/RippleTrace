# RippleTrace

Intelligent Change-Impact Analysis for Interdependent Policy and Technical Documents.

Detects how a single regulatory change propagates across policies, controls, procedures, and technical configurations — and explains exactly what needs to change and why.

## What It Does

1. **Ingests** regulatory and organizational documents (PDF, DOCX, Markdown)
2. **Extracts** policy state elements (thresholds, constraints, conditions, variables)
3. **Builds** a semantic dependency knowledge graph in Neo4j
4. **Propagates** changes through the graph to find affected artifacts
5. **Detects** contradictions and requirement drift across documents
6. **Explains** each impact with evidence paths and confidence scores

## Architecture

```
Frontend (React + React Flow)  →  Backend (FastAPI)  →  PostgreSQL + Neo4j
       :3000                           :8000              :5432      :7474
```

- **Frontend:** React 18, React Flow v12, Tailwind CSS, Vite
- **Backend:** FastAPI, asyncpg, Neo4j driver, OpenAI-compatible API
- **Database:** PostgreSQL 16 with pgvector, Neo4j 5 Community
- **Orchestration:** Docker Compose (4 services)

## Quick Start

```bash
docker-compose up --build
```

Open http://localhost:3000, click **Run Demo**.

## Demo Scenario

Preloaded regulatory chain: NIST SP 800-53 → Info Security Policy v1/v2 → Access Control Policy → MFA Control → IAM Procedure → IAM Technical Standard → System Configuration.

Single change: MFA requirement upgraded from single-factor to multi-factor for all remote access. The system traces this change across 7 documents, flags contradictions and drift, and generates a change plan.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Service health check |
| POST | `/api/documents/scan` | Scan sample_docs directory |
| POST | `/api/documents/upload` | Upload a document |
| GET | `/api/documents/` | List all documents |
| GET | `/api/documents/{id}` | Get document detail |
| DELETE | `/api/documents/{id}` | Delete a document |
| POST | `/api/extraction/extract/{id}` | Extract policy states |
| GET | `/api/extraction/states/{id}` | Get extracted states |
| POST | `/api/graph/build/{id}` | Build graph for document |
| GET | `/api/graph/overview` | Full graph overview |
| GET | `/api/graph/doc/{doc_id}` | Expand single document |
| GET | `/api/graph/neighborhood/{id}` | N-hop neighborhood |
| GET | `/api/graph/node/{id}` | Node detail + relationships |
| GET | `/api/graph/search` | Search policy elements |
| POST | `/api/simulate/impact` | Run impact propagation |
| GET | `/api/dashboard/metrics` | Dashboard metrics |
| POST | `/api/diff/diff` | Clause-level document diff |
| POST | `/api/contradictions/detect` | Contradiction + drift detection |
| POST | `/api/demo/run` | Run full demo pipeline |

## Project Structure

```
rippletrace/
├── backend/
│   ├── main.py              # FastAPI app + routers
│   ├── db.py                # PostgreSQL + Neo4j connection pool
│   ├── ingestion.py         # Document parsing + chunking
│   ├── extraction.py        # Regex + LLM policy extraction
│   ├── graph.py             # Neo4j graph construction + queries
│   ├── propagation.py       # BFS impact propagation engine
│   ├── dashboard.py         # Metrics endpoint
│   ├── diff_engine.py       # Clause-level diff engine
│   ├── contradiction.py     # Cross-document contradiction detection
│   ├── demo.py              # Demo pipeline orchestration
│   └── test_core.py         # Unit tests
├── frontend/
│   └── src/
│       ├── App.jsx           # Router + navigation
│       ├── screens/
│       │   ├── Overview.jsx          # Dashboard with impact score
│       │   ├── KnowledgeGraph.jsx    # Interactive graph view
│       │   ├── ImpactAnalysis.jsx    # Impact simulation form
│       │   ├── ImpactResults.jsx     # Results + explainability
│       │   ├── DiffViewer.jsx        # Clause-level diff view
│       │   ├── ContradictionViewer.jsx  # Contradictions + drift
│       │   ├── DocumentRepo.jsx      # Document management
│       │   ├── DocumentDetail.jsx    # Single document view
│       │   └── Ingestion.jsx         # Pipeline visualization
│       └── components/
│           ├── GraphView.jsx         # React Flow canvas
│           ├── NodeInspector.jsx     # Node detail panel
│           ├── Sidebar.jsx           # Controls panel
│           ├── SearchBar.jsx         # Search component
│           ├── GlobalSearch.jsx      # Cmd+K search modal
│           ├── ImpactReport.jsx      # Impact cards
│           ├── Dashboard.jsx         # Metrics dashboard
│           └── SimulatePanel.jsx     # Simulation form
├── sample_docs/              # Demo document dataset
├── skills/                   # Development skill guides
├── docker-compose.yml        # 4-service orchestration
├── init.sql                  # Database schema
└── .env.example              # Environment variables
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend API | FastAPI 0.115 |
| Graph Database | Neo4j 5 Community |
| Relational DB | PostgreSQL 16 + pgvector |
| Frontend | React 18 + React Flow 12 |
| Styling | Tailwind CSS 3.4 |
| Build Tool | Vite 6 |
| Containerization | Docker Compose |

## Running Without Docker

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

Requires PostgreSQL and Neo4j running locally. Set environment variables in `.env`.

## License

Internal project — not licensed for distribution.
