import logging
import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import get_pool, get_neo4j, close_connections
from ingestion import router as ingestion_router
from extraction import router as extraction_router
from graph import router as graph_router
from propagation import router as propagation_router
from dashboard import router as dashboard_router
from diff_engine import router as diff_router
from contradiction import router as contradiction_router
from demo import router as demo_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await get_neo4j()
    yield
    await close_connections()


app = FastAPI(title="RippleTrace", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingestion_router, prefix="/api/documents", tags=["ingestion"])
app.include_router(extraction_router, prefix="/api/extraction", tags=["extraction"])
app.include_router(graph_router, prefix="/api/graph", tags=["graph"])
app.include_router(propagation_router, prefix="/api/simulate", tags=["propagation"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(diff_router, prefix="/api/diff", tags=["diff"])
app.include_router(contradiction_router, prefix="/api/contradictions", tags=["contradictions"])
app.include_router(demo_router, prefix="/api/demo", tags=["demo"])


@app.get("/api/health")
async def health():
    status = {"backend": "ok", "postgres": "ok", "neo4j": "ok", "ollama": "unknown"}
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
    except Exception as e:
        status["postgres"] = f"error: {e}"
    try:
        driver = await get_neo4j()
        async with driver.session() as s:
            await s.run("RETURN 1")
    except Exception as e:
        status["neo4j"] = f"error: {e}"
    try:
        async with httpx.AsyncClient(timeout=5) as http:
            r = await http.get("http://host.docker.internal:11434/api/tags")
            if r.status_code == 200:
                models = [m["name"] for m in r.json().get("models", [])]
                status["ollama"] = f"ok — {', '.join(models) if models else 'none'}"
            else:
                status["ollama"] = f"error: {r.status_code}"
    except Exception as e:
        status["ollama"] = f"unreachable: {e}"
    return status
