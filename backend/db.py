import os
import asyncio
import logging
import asyncpg
from neo4j import AsyncGraphDatabase

log = logging.getLogger("db")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://rippletrace:rippletrace@localhost:5432/rippletrace")
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "rippletrace")

_pool = None
_neo4j_driver = None


async def get_pool():
    global _pool
    if _pool is None:
        for attempt in range(10):
            try:
                _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=5)
                log.info("PostgreSQL connected")
                return _pool
            except Exception as e:
                log.warning("PostgreSQL not ready (attempt %d/10): %s", attempt + 1, e)
                await asyncio.sleep(2)
        raise RuntimeError("Could not connect to PostgreSQL")
    return _pool


async def get_neo4j():
    global _neo4j_driver
    if _neo4j_driver is None:
        for attempt in range(10):
            try:
                _neo4j_driver = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
                await _neo4j_driver.verify_connectivity()
                log.info("Neo4j connected")
                return _neo4j_driver
            except Exception as e:
                log.warning("Neo4j not ready (attempt %d/10): %s", attempt + 1, e)
                _neo4j_driver = None
                await asyncio.sleep(2)
        raise RuntimeError("Could not connect to Neo4j")
    return _neo4j_driver


async def close_connections():
    global _pool, _neo4j_driver
    if _pool:
        await _pool.close()
    if _neo4j_driver:
        await _neo4j_driver.close()
