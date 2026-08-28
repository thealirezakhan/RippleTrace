import json
import logging
from fastapi import APIRouter, Query, HTTPException
from db import get_neo4j, get_pool

router = APIRouter()
log = logging.getLogger("graph")


@router.post("/build/{document_id}")
async def build_graph(document_id: int):
    driver = await get_neo4j()
    pool = await get_pool()

    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            "SELECT id, filename FROM documents WHERE id = $1", document_id
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        chunks = await conn.fetch(
            "SELECT id, content, section FROM chunks WHERE document_id = $1 ORDER BY chunk_index",
            document_id,
        )
        states = await conn.fetch(
            """SELECT ps.id, ps.element_type, ps.name, ps.value, ps.unit, ps.source_text,
                      c.id as chunk_id, c.section
               FROM policy_states ps JOIN chunks c ON ps.chunk_id = c.id
               WHERE c.document_id = $1""",
            document_id,
        )

    log.info("Building graph for doc %d (%s): %d chunks, %d states", document_id, doc["filename"], len(chunks), len(states))

    async with driver.session() as session:
        await session.run(
            "MERGE (d:Document {id: $doc_id}) SET d.filename = $filename",
            doc_id=document_id,
            filename=doc["filename"],
        )
        if chunks:
            chunk_batch = [{"id": c["id"], "section": c["section"]} for c in chunks]
            await session.run(
                """UNWIND $chunks AS chunk
                   MATCH (d:Document {id: $doc_id})
                   MERGE (c:Chunk {id: chunk.id})
                   SET c.section = chunk.section, c.document_id = $doc_id
                   MERGE (d)-[:HAS_SECTION]->(c)""",
                chunks=chunk_batch,
                doc_id=document_id,
            )
        if states:
            state_batch = []
            for state in states:
                value = state["value"]
                if hasattr(value, "__str__"):
                    value_str = str(value)
                else:
                    value_str = json.dumps(value) if value is not None else "null"
                state_batch.append({
                    "id": state["id"],
                    "name": state["name"],
                    "element_type": state["element_type"],
                    "value": value_str,
                    "unit": state["unit"],
                    "source_text": state["source_text"],
                    "chunk_id": state["chunk_id"],
                })
            await session.run(
                """UNWIND $states AS s
                   MATCH (c:Chunk {id: s.chunk_id})
                   MERGE (p:PolicyElement {id: s.id})
                   SET p.name = s.name, p.element_type = s.element_type,
                       p.value = s.value, p.unit = s.unit, p.source_text = s.source_text
                   MERGE (c)-[:HAS_POLICY]->(p)""",
                states=state_batch,
            )
        edges = await _create_semantic_edges(session, states)

    return {
        "document_id": document_id,
        "nodes_created": len(chunks) + len(states),
        "edges_created": edges,
    }


async def _create_semantic_edges(session, states) -> int:
    if len(states) < 2:
        return 0

    refs = []
    deps = []
    for i, s1 in enumerate(states):
        for s2 in states[i + 1 :]:
            if s1["name"] == s2["name"] and s1["id"] != s2["id"]:
                refs.append({"a_id": s1["id"], "b_id": s2["id"]})
            elif _types_related(s1["element_type"], s2["element_type"]):
                deps.append({"a_id": s1["id"], "b_id": s2["id"]})

    count = 0
    if refs:
        await session.run(
            """UNWIND $refs AS ref
               MATCH (a:PolicyElement {id: ref.a_id}), (b:PolicyElement {id: ref.b_id})
               MERGE (a)-[:REFERENCES]->(b)""",
            refs=refs,
        )
        count += len(refs)

    if deps:
        await session.run(
            """UNWIND $deps AS dep
               MATCH (a:PolicyElement {id: dep.a_id}), (b:PolicyElement {id: dep.b_id})
               MERGE (a)-[:DEPENDS_ON]->(b)""",
            deps=deps,
        )
        count += len(deps)

    return count


def _types_related(t1: str, t2: str) -> bool:
    pairs = {
        ("threshold", "constraint"),
        ("variable", "threshold"),
        ("condition", "constraint"),
        ("threshold", "condition"),
        ("variable", "constraint"),
    }
    return (t1, t2) in pairs or (t2, t1) in pairs


# --- Graph queries ---


@router.get("/overview")
async def graph_overview():
    """Full graph: documents + chunks + policy elements with all edges."""
    driver = await get_neo4j()
    async with driver.session() as session:
        result = await session.run("""
            MATCH (d:Document)
            OPTIONAL MATCH (d)-[:HAS_SECTION]->(c:Chunk)
            OPTIONAL MATCH (c)-[:HAS_POLICY]->(p:PolicyElement)
            RETURN d.id AS id, d.filename AS filename,
                   collect(DISTINCT c.id) AS chunk_ids,
                   collect(DISTINCT {id: p.id, name: p.name, element_type: p.element_type}) AS policies
        """)
        doc_records = [dict(r) async for r in result]

        nodes = []
        doc_ids = set()
        for doc in doc_records:
            doc_id = doc["id"]
            doc_ids.add(doc_id)
            nodes.append({
                "id": f"doc-{doc_id}",
                "type": "Document",
                "data": {
                    "label": doc["filename"],
                    "doc_id": doc_id,
                    "chunk_count": len(doc["chunk_ids"]),
                    "policy_count": len(doc["policies"]),
                },
            })
            for pol in doc["policies"]:
                if pol["id"] is not None:
                    nodes.append({
                        "id": f"policy-{pol['id']}",
                        "type": "PolicyElement",
                        "data": {
                            "label": pol["name"],
                            "name": pol["name"],
                            "element_type": pol["element_type"],
                            "policy_id": pol["id"],
                            "doc_id": doc_id,
                        },
                    })

        edges = []

        for doc in doc_records:
            doc_id = doc["id"]
            for pol in doc["policies"]:
                if pol["id"] is not None:
                    edges.append({
                        "id": f"e-doc-{doc_id}-pol-{pol['id']}",
                        "source": f"doc-{doc_id}",
                        "target": f"policy-{pol['id']}",
                        "type": "HAS_POLICY",
                    })

        result = await session.run("""
            MATCH (a:PolicyElement)-[r:REFERENCES|DEPENDS_ON]->(b:PolicyElement)
            RETURN a.id AS source, b.id AS target, type(r) AS type
        """)
        rel_edges = [dict(r) async for r in result]
        for e in rel_edges:
            edges.append({
                "id": f"e-pol-{e['source']}-{e['target']}-{e['type']}",
                "source": f"policy-{e['source']}",
                "target": f"policy-{e['target']}",
                "type": e["type"],
            })

    return {"nodes": nodes, "edges": edges}


@router.get("/doc/{doc_id}")
async def graph_document(doc_id: int):
    """Expand a document: chunks + policies + internal/cross edges."""
    driver = await get_neo4j()
    async with driver.session() as session:
        result = await session.run("""
            MATCH (d:Document {id: $doc_id})
            OPTIONAL MATCH (d)-[:HAS_SECTION]->(c:Chunk)
            OPTIONAL MATCH (c)-[:HAS_POLICY]->(p:PolicyElement)
            RETURN d.filename AS filename,
                   collect(DISTINCT {id: c.id, section: c.section, chunk_id: c.id}) AS chunks,
                   collect(DISTINCT {id: p.id, name: p.name, element_type: p.element_type,
                            value: p.value, unit: p.unit, source_text: p.source_text,
                            chunk_id: p.id}) AS policies
        """, doc_id=doc_id)
        record = dict(await result.single())

        nodes = []
        nodes.append({
            "id": f"doc-{doc_id}",
            "type": "Document",
            "data": {"label": record["filename"], "doc_id": doc_id},
        })

        chunk_ids = set()
        for chunk in record["chunks"]:
            if chunk["id"] is not None and chunk["id"] not in chunk_ids:
                chunk_ids.add(chunk["id"])
                nodes.append({
                    "id": f"chunk-{chunk['id']}",
                    "type": "Chunk",
                    "data": {"label": chunk["section"], "chunk_id": chunk["id"], "doc_id": doc_id},
                })
                edges.append_defer if False else None

        edges = []
        for chunk in record["chunks"]:
            if chunk["id"] is not None:
                edges.append({
                    "id": f"e-doc-{doc_id}-chunk-{chunk['id']}",
                    "source": f"doc-{doc_id}",
                    "target": f"chunk-{chunk['id']}",
                    "type": "HAS_SECTION",
                })

        policy_ids = set()
        for pol in record["policies"]:
            if pol["id"] is not None and pol["id"] not in policy_ids:
                policy_ids.add(pol["id"])
                nodes.append({
                    "id": f"policy-{pol['id']}",
                    "type": "PolicyElement",
                    "data": {
                        "label": pol["name"],
                        "name": pol["name"],
                        "element_type": pol["element_type"],
                        "value": pol["value"],
                        "unit": pol["unit"],
                        "source_text": pol["source_text"],
                        "policy_id": pol["id"],
                        "doc_id": doc_id,
                    },
                })

        result = await session.run("""
            MATCH (a:PolicyElement)-[r]->(b:PolicyElement)
            WHERE a.id IN $policy_ids AND b.id IN $policy_ids
            RETURN a.id AS source, b.id AS target, type(r) AS type
        """, policy_ids=list(policy_ids))
        internal_edges = [dict(r) async for r in result]
        for e in internal_edges:
            edges.append({
                "id": f"e-pol-{e['source']}-{e['target']}",
                "source": f"policy-{e['source']}",
                "target": f"policy-{e['target']}",
                "type": e["type"],
            })

        result = await session.run("""
            MATCH (a:PolicyElement)-[r:REFERENCES|DEPENDS_ON]->(b:PolicyElement)
            WHERE a.id IN $policy_ids AND NOT b.id IN $policy_ids
            MATCH (b)<-[:HAS_POLICY]-(cb:Chunk)<-[:HAS_SECTION]-(db:Document)
            RETURN b.id AS target_id, b.name AS target_name, b.element_type AS target_type,
                   db.id AS target_doc_id, db.filename AS target_filename,
                   type(r) AS type, a.name AS source_name
        """, policy_ids=list(policy_ids))
        cross_doc = [dict(r) async for r in result]

    return {
        "doc_id": doc_id,
        "nodes": nodes,
        "edges": edges,
        "cross_doc_edges": cross_doc,
    }


@router.get("/neighborhood/{node_id}")
async def graph_neighborhood(node_id: int, hops: int = Query(2, ge=1, le=4)):
    """N-hop neighborhood around a policy element, returns graph data."""
    driver = await get_neo4j()
    async with driver.session() as session:
        center = await session.run(
            """MATCH (p:PolicyElement {id: $node_id})
               MATCH (p)<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
               RETURN p.name AS name, p.element_type AS element_type,
                      p.value AS value, p.source_text AS source_text,
                      d.id AS doc_id, d.filename AS doc_filename""",
            node_id=node_id,
        )
        center_record = await center.single()
        if not center_record:
            raise HTTPException(status_code=404, detail="Policy element not found")
        center_dict = dict(center_record)

        result = await session.run(
            f"""MATCH path = (start:PolicyElement {{id: $node_id}})-[:DEPENDS_ON|REFERENCES*1..{hops}]->(target:PolicyElement)
                WITH DISTINCT target, length(path) AS dist
                RETURN target.id AS id, target.name AS name, target.element_type AS element_type,
                       target.value AS value, target.source_text AS source_text, dist
                ORDER BY dist""",
            node_id=node_id,
        )
        neighbors = [dict(r) async for r in result]

        neighbor_ids = [n["id"] for n in neighbors]
        all_ids = [node_id] + neighbor_ids

        edges = []
        if len(all_ids) > 1:
            result = await session.run(
                """MATCH (a:PolicyElement)-[r]->(b:PolicyElement)
                   WHERE a.id IN $ids AND b.id IN $ids
                   RETURN a.id AS source, b.id AS target, type(r) AS type""",
                ids=all_ids,
            )
            edges = [dict(r) async for r in result]

        doc_context = []
        for pid in all_ids[:10]:
            result = await session.run(
                """MATCH (p:PolicyElement {id: $pid})<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
                   RETURN $pid AS policy_id, d.id AS doc_id, d.filename AS doc_filename, c.section AS section""",
                pid=pid,
            )
            async for r in result:
                doc_context.append(dict(r))

    graph_nodes = []
    graph_nodes.append({
        "id": f"policy-{node_id}",
        "type": "PolicyElement",
        "data": {
            "label": center_dict["name"],
            "name": center_dict["name"],
            "element_type": center_dict["element_type"],
            "value": center_dict["value"],
            "source_text": center_dict["source_text"],
            "policy_id": node_id,
            "doc_id": center_dict["doc_id"],
            "doc_filename": center_dict["doc_filename"],
        },
    })

    doc_added = {center_dict["doc_id"]}
    graph_nodes.append({
        "id": f"doc-{center_dict['doc_id']}",
        "type": "Document",
        "data": {"label": center_dict["doc_filename"], "doc_id": center_dict["doc_id"]},
    })
    graph_edges = [{
        "id": f"e-doc-{center_dict['doc_id']}-pol-{node_id}",
        "source": f"doc-{center_dict['doc_id']}",
        "target": f"policy-{node_id}",
        "type": "HAS_POLICY",
    }]

    for n in neighbors:
        graph_nodes.append({
            "id": f"policy-{n['id']}",
            "type": "PolicyElement",
            "data": {
                "label": n["name"],
                "name": n["name"],
                "element_type": n["element_type"],
                "value": n["value"],
                "source_text": n["source_text"],
                "policy_id": n["id"],
                "distance": n["dist"],
            },
        })
        for ctx in doc_context:
            if ctx["policy_id"] == n["id"] and ctx["doc_id"] not in doc_added:
                doc_added.add(ctx["doc_id"])
                graph_nodes.append({
                    "id": f"doc-{ctx['doc_id']}",
                    "type": "Document",
                    "data": {"label": ctx["doc_filename"], "doc_id": ctx["doc_id"]},
                })

    for e in edges:
        graph_edges.append({
            "id": f"e-pol-{e['source']}-{e['target']}",
            "source": f"policy-{e['source']}",
            "target": f"policy-{e['target']}",
            "type": e["type"],
        })

    for ctx in doc_context:
        if ctx["policy_id"] in all_ids:
            graph_edges.append({
                "id": f"e-doc-{ctx['doc_id']}-pol-{ctx['policy_id']}",
                "source": f"doc-{ctx['doc_id']}",
                "target": f"policy-{ctx['policy_id']}",
                "type": "HAS_POLICY",
            })

    deduped_edges = []
    seen_edges = set()
    for e in graph_edges:
        key = (e["source"], e["target"], e["type"])
        if key not in seen_edges:
            seen_edges.add(key)
            deduped_edges.append(e)

    return {
        "center": node_id,
        "center_info": center_dict,
        "hops": hops,
        "neighbors": neighbors,
        "doc_context": doc_context,
        "graph": {"nodes": graph_nodes, "edges": deduped_edges},
    }


@router.get("/node/{node_id}")
async def get_node_detail(node_id: int):
    """Full detail for a single policy element: identity, relationships, document context."""
    driver = await get_neo4j()
    async with driver.session() as session:
        result = await session.run(
            """MATCH (p:PolicyElement {id: $node_id})
               MATCH (p)<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
               RETURN p.id AS id, p.name AS name, p.element_type AS element_type,
                      p.value AS value, p.unit AS unit, p.source_text AS source_text,
                      d.id AS doc_id, d.filename AS doc_filename,
                      c.id AS chunk_id, c.section AS section""",
            node_id=node_id,
        )
        record = await result.single()
        if not record:
            raise HTTPException(status_code=404, detail="Policy element not found")
        info = dict(record)

        result = await session.run(
            """MATCH (p:PolicyElement {id: $node_id})-[r]->(other:PolicyElement)
               MATCH (other)<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
               RETURN other.id AS id, other.name AS name, other.element_type AS element_type,
                      type(r) AS rel_type, d.filename AS doc_filename, d.id AS doc_id
               UNION
               MATCH (other:PolicyElement)-[r]->(p:PolicyElement {id: $node_id})
               MATCH (other)<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
               RETURN other.id AS id, other.name AS name, other.element_type AS element_type,
                      type(r) AS rel_type, d.filename AS doc_filename, d.id AS doc_id""",
            node_id=node_id,
        )
        relationships = [dict(r) async for r in result]

    return {
        "node": info,
        "relationships": relationships,
        "relationship_count": len(relationships),
    }


@router.get("/search")
async def graph_search(q: str = Query(..., min_length=1)):
    """Search policy elements by name, return results with document context."""
    driver = await get_neo4j()
    async with driver.session() as session:
        result = await session.run(
            """MATCH (p:PolicyElement)
               WHERE toLower(p.name) CONTAINS toLower($q)
                  OR toLower(p.source_text) CONTAINS toLower($q)
               MATCH (p)<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
               RETURN p.id AS id, p.name AS name, p.element_type AS element_type,
                      p.value AS value, p.source_text AS source_text,
                      d.id AS doc_id, d.filename AS doc_filename
               LIMIT 30""",
            q=q,
        )
        matches = [dict(r) async for r in result]

    return {"query": q, "results": matches, "count": len(matches)}
