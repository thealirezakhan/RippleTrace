# How to Run RippleTrace

## Prerequisites

1. **Docker Desktop** — running
2. **Ollama** — running locally with a model pulled (optional for demo)

## Step 1: Start Everything

```bash
cd rippletrace
docker-compose up --build
```

Wait for all 4 services to start:
- `rippletrace-postgres-1` → ready
- `rippletrace-neo4j-1` → ready
- `rippletrace-backend-1` → Uvicorn running on 0.0.0.0:8000
- `rippletrace-frontend-1` → Vite running on 0.0.0.0:3000

## Step 2: Open the Dashboard

Go to **http://localhost:3000**

## Step 3: Run the Demo

### One-Click Demo (Recommended for Judges)

1. Click the **"Run Demo"** button on the Overview page
2. Wait ~10 seconds for the pipeline to complete
3. The dashboard will show:
   - Impact Score (0-100)
   - Changed Clauses
   - Affected Artifacts
   - Contradictions Detected
   - Blast Radius visualization
4. Click **"View Clause Changes"** to see the diff
5. Click **"View Contradictions"** to see conflicts and drift

### What the Demo Shows

The preloaded scenario simulates a **CERT-In mandated MFA requirement change**:

**Single change:** MFA upgraded from single-factor to multi-factor for ALL remote access

**Cascade across 7 documents:**
- NIST SP 800-53 Regulation (source)
- Information Security Policy v1 → v2 (changed)
- Access Control Policy (affected)
- MFA Control (affected)
- IAM Procedure (affected)
- IAM Technical Standard (affected)
- System Configuration (affected)

### Demo Flow

```
Select Regulation/Policy
→ Compare Old vs New (Clause-Level Diff)
→ Detect Changed Clauses
→ Trace Dependencies (Knowledge Graph)
→ Show Impact Graph
→ Detect Contradictions/Drift
→ Calculate Impact & Blast Radius
→ Explain Each Impact
→ Generate Recommended Change Plan
```

### Option B: Manual Workflow

1. Click **Ingestion** → Scan documents
2. Click **Extract** for each document
3. Click **Build Graph** for each document
4. Click **Impact Analysis** → Select element → Simulate
5. Click **Clause Diff** → View before/after comparison
6. Click **Contradictions** → View conflicts and drift

### Option C: Use the API

```bash
# Run the full demo pipeline
curl -X POST http://localhost:8000/api/demo/run

# Or run individual steps:
# Upload a doc
curl -X POST http://localhost:8000/api/documents/upload \
  -F "file=@sample_docs/01_info_security_policy_v1.md"

# Extract policy states
curl -X POST http://localhost:8000/api/extraction/extract/1

# Build graph
curl -X POST http://localhost:8000/api/graph/build/1

# Simulate impact
curl -X POST http://localhost:8000/api/simulate/impact \
  -H "Content-Type: application/json" \
  -d '{"element_name":"mfa_requirement","old_value":1,"new_value":2}'

# Run clause diff
curl -X POST http://localhost:8000/api/diff/diff \
  -H "Content-Type: application/json" \
  -d '{"old_text":"...","new_text":"...","document_name":"Test"}'

# Detect contradictions
curl -X POST http://localhost:8000/api/contradictions/detect \
  -H "Content-Type: application/json" \
  -d '{"documents":[{"filename":"test.md","content":"...","clauses":[]}]}'
```

### Option D: Interactive API Docs

Go to **http://localhost:8000/docs** — FastAPI auto-generates Swagger UI.

## Ports

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Neo4j Browser | http://localhost:7474 (user: neo4j, pass: rippletrace) |
| PostgreSQL | localhost:5432 |

## Demo Documents

| File | Type | Role |
|------|------|------|
| `00_nist_sp80053_baseline.md` | Regulation | Source regulation (NIST) |
| `01_info_security_policy_v1.md` | Policy | Current internal policy |
| `01_info_security_policy_v2.md` | Policy | Updated policy (triggers cascade) |
| `02_access_control_policy.md` | Policy | Downstream access control |
| `03_mfa_control.md` | Control | MFA technical control |
| `04_iam_procedure.md` | Procedure | IAM operational procedure |
| `05_iam_technical_standard.md` | Technical | IAM technical standard |
| `06_system_configuration.md` | Configuration | System config standard |

## Troubleshooting

**Backend crash on start?**
```bash
docker-compose logs backend
docker-compose restart backend
```

**Reset everything:**
```bash
docker-compose down -v
docker-compose up --build
```
