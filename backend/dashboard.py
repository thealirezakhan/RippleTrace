import logging
from fastapi import APIRouter
from db import get_neo4j, get_pool

router = APIRouter()
log = logging.getLogger("dashboard")


@router.get("/metrics")
async def get_metrics():
    pool = await get_pool()
    metrics = {}

    async with pool.acquire() as conn:
        metrics["documents"] = await conn.fetchval("SELECT COUNT(*) FROM documents")
        metrics["chunks"] = await conn.fetchval("SELECT COUNT(*) FROM chunks")
        metrics["policy_elements"] = await conn.fetchval("SELECT COUNT(*) FROM policy_states")
        metrics["empty_documents"] = await conn.fetchval("""
            SELECT COUNT(*) FROM documents d
            WHERE NOT EXISTS (SELECT 1 FROM chunks c WHERE c.document_id = d.id)
        """)
        metrics["orphan_chunks"] = await conn.fetchval("""
            SELECT COUNT(*) FROM chunks c
            WHERE NOT EXISTS (SELECT 1 FROM policy_states ps WHERE ps.chunk_id = c.id)
        """)

    try:
        driver = await get_neo4j()
        async with driver.session() as session:
            result = await session.run("MATCH (r:PolicyElement)-[rel]->(t:PolicyElement) RETURN count(rel) AS count")
            record = await result.single()
            metrics["relationships"] = record["count"] if record else 0

            result = await session.run("""
                MATCH (p:PolicyElement)
                WHERE NOT (p)<-[:HAS_POLICY]-()
                RETURN count(p) AS count
            """)
            record = await result.single()
            metrics["orphan_elements"] = record["count"] if record else 0

            result = await session.run("""
                MATCH (a:PolicyElement)-[r]->(b:PolicyElement)
                WHERE NOT a.id = b.id
                RETURN count(DISTINCT r) AS count
            """)
            record = await result.single()
            metrics["cross_doc_relationships"] = record["count"] if record else 0

            result = await session.run("""
                MATCH (a:PolicyElement)-[r:REFERENCES]->(b:PolicyElement)
                MATCH (a)<-[:HAS_POLICY]-(ca:Chunk)<-[:HAS_SECTION]-(da:Document)
                MATCH (b)<-[:HAS_POLICY]-(cb:Chunk)<-[:HAS_SECTION]-(db:Document)
                WHERE da.id <> db.id
                RETURN count(r) AS count
            """)
            record = await result.single()
            metrics["cross_document_references"] = record["count"] if record else 0

            result = await session.run("""
                MATCH (a:PolicyElement)-[r:DEPENDS_ON]->(b:PolicyElement)
                MATCH (a)<-[:HAS_POLICY]-(ca:Chunk)<-[:HAS_SECTION]-(da:Document)
                MATCH (b)<-[:HAS_POLICY]-(cb:Chunk)<-[:HAS_SECTION]-(db:Document)
                WHERE da.id <> db.id
                RETURN count(r) AS count
            """)
            record = await result.single()
            metrics["cross_document_depends"] = record["count"] if record else 0

    except Exception as e:
        log.warning("Neo4j metrics query failed: %s", e)
        metrics["relationships"] = 0
        metrics["orphan_elements"] = 0
        metrics["cross_doc_relationships"] = 0
        metrics["cross_document_references"] = 0
        metrics["cross_document_depends"] = 0

    total_elements = max(metrics["policy_elements"], 1)
    connected = total_elements - metrics["orphan_elements"]
    metrics["graph_health"] = round((connected / total_elements) * 100, 1) if total_elements > 0 else 0

    return metrics
