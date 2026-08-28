import json
import re
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
        await _create_version_lineage(session)
        await _create_conflict_edges(session)

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
        for s2 in states[i + 1:]:
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


async def _create_version_lineage(session):
    """Detect v1/v2 documents and create SUPERSEDED_BY edges."""
    result = await session.run("MATCH (d:Document) RETURN d.id AS id, d.filename AS filename")
    docs = [dict(r) async for r in result]

    version_map = {}
    for doc in docs:
        fname = doc["filename"].lower()
        match = re.search(r"[_\s]?v(\d+)", fname)
        if match:
            base = re.sub(r"[_\s]?v\d+.*", "", fname)
            ver = int(match.group(1))
            if base not in version_map:
                version_map[base] = []
            version_map[base].append({"id": doc["id"], "version": ver, "filename": doc["filename"]})

    count = 0
    for base, versions in version_map.items():
        versions.sort(key=lambda x: x["version"])
        for i in range(len(versions) - 1):
            older = versions[i]
            newer = versions[i + 1]
            await session.run(
                """MATCH (a:Document {id: $older_id}), (b:Document {id: $newer_id})
                   MERGE (a)-[:SUPERSEDED_BY {reason: $reason, older_version: $older_ver, newer_version: $newer_ver}]->(b)""",
                older_id=older["id"],
                newer_id=newer["id"],
                reason=f"Document version {older['version']} superseded by version {newer['version']}",
                older_ver=str(older["version"]),
                newer_ver=str(newer["version"]),
            )
            count += 1
    return count


async def _create_conflict_edges(session):
    """Detect value conflicts between policy elements across documents and create CONFLICTS_WITH edges."""
    result = await session.run("""
        MATCH (a:PolicyElement)<-[:HAS_POLICY]-(ca:Chunk)<-[:HAS_SECTION]-(da:Document)
        MATCH (b:PolicyElement)<-[:HAS_POLICY]-(cb:Chunk)<-[:HAS_SECTION]-(db:Document)
        WHERE a.name = b.name AND da.id < db.id
          AND a.value IS NOT NULL AND b.value IS NOT NULL
          AND a.value <> b.value
        RETURN a.id AS a_id, a.name AS name, a.value AS a_val, a.source_text AS a_src,
               b.id AS b_id, b.value AS b_val, b.source_text AS b_src,
               da.filename AS a_doc, db.filename AS b_doc
    """)
    conflicts = [dict(r) async for r in result]

    count = 0
    for c in conflicts:
        await session.run(
            """MATCH (a:PolicyElement {id: $a_id}), (b:PolicyElement {id: $b_id})
               MERGE (a)-[r:CONFLICTS_WITH]->(b)
               SET r.reason = $reason, r.a_value = $a_val, r.b_value = $b_val,
                   r.a_source = $a_src, r.b_source = $b_src,
                   r.a_document = $a_doc, r.b_document = $b_doc""",
            a_id=c["a_id"],
            b_id=c["b_id"],
            reason=f"Conflicting values for '{c['name']}': {c['a_val']} vs {c['b_val']}",
            a_val=str(c["a_val"]),
            b_val=str(c["b_val"]),
            a_src=c["a_src"] or "",
            b_src=c["b_src"] or "",
            a_doc=c["a_doc"],
            b_doc=c["b_doc"],
        )
        count += 1
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
    """Full graph with 4-level hierarchy, version lineage, conflicts, and edge metadata."""
    driver = await get_neo4j()
    async with driver.session() as session:
        result = await session.run("""
            MATCH (d:Document)
            OPTIONAL MATCH (d)-[:HAS_SECTION]->(c:Chunk)
            OPTIONAL MATCH (c)-[:HAS_POLICY]->(p:PolicyElement)
            RETURN d.id AS id, d.filename AS filename,
                   collect(DISTINCT {id: c.id, section: c.section}) AS chunks,
                   collect(DISTINCT {id: p.id, name: p.name, element_type: p.element_type,
                            value: p.value, unit: p.unit, source_text: p.source_text}) AS policies
        """)
        doc_records = [dict(r) async for r in result]

        nodes = []
        all_edges = []

        for doc in doc_records:
            doc_id = doc["id"]
            nodes.append({
                "id": f"doc-{doc_id}",
                "type": "Document",
                "data": {
                    "label": doc["filename"],
                    "doc_id": doc_id,
                    "chunk_count": len(doc["chunks"]),
                    "policy_count": len(doc["policies"]),
                },
            })

            for chunk in doc["chunks"]:
                if chunk["id"] is not None:
                    chunk_node_id = f"chunk-{chunk['id']}"
                    nodes.append({
                        "id": chunk_node_id,
                        "type": "Chunk",
                        "data": {
                            "label": chunk["section"] or "Section",
                            "chunk_id": chunk["id"],
                            "doc_id": doc_id,
                            "doc_filename": doc["filename"],
                        },
                    })
                    all_edges.append({
                        "id": f"e-doc-{doc_id}-chunk-{chunk['id']}",
                        "source": f"doc-{doc_id}",
                        "target": chunk_node_id,
                        "type": "HAS_SECTION",
                    })

            for pol in doc["policies"]:
                if pol["id"] is not None:
                    pol_node_id = f"policy-{pol['id']}"
                    parent_chunk_id = None
                    for chunk in doc["chunks"]:
                        if chunk["id"] is not None:
                            parent_chunk_id = chunk["id"]
                            break

                    nodes.append({
                        "id": pol_node_id,
                        "type": "PolicyElement",
                        "data": {
                            "label": pol["name"],
                            "name": pol["name"],
                            "element_type": pol["element_type"],
                            "value": pol.get("value"),
                            "unit": pol.get("unit"),
                            "source_text": pol.get("source_text"),
                            "policy_id": pol["id"],
                            "doc_id": doc_id,
                            "doc_filename": doc["filename"],
                        },
                    })
                    if parent_chunk_id is not None:
                        all_edges.append({
                            "id": f"e-chunk-{parent_chunk_id}-policy-{pol['id']}",
                            "source": f"chunk-{parent_chunk_id}",
                            "target": pol_node_id,
                            "type": "HAS_POLICY",
                        })

        # Get all semantic edges with metadata
        result = await session.run("""
            MATCH (a)-[r]->(b)
            WHERE (a:PolicyElement AND b:PolicyElement)
               OR (a:Document AND b:Document)
            RETURN a.id AS source_id, b.id AS target_id, type(r) AS rel_type,
                   r.reason AS reason, r.a_value AS a_val, r.b_value AS b_val,
                   r.a_source AS a_src, r.b_source AS b_src,
                   r.a_document AS a_doc, r.b_document AS b_doc,
                   r.older_version AS older_ver, r.newer_version AS newer_ver,
                   labels(a)[0] AS source_label, labels(b)[0] AS target_label
        """)
        rel_edges = [dict(r) async for r in result]

        # Map IDs to node IDs
        for e in rel_edges:
            src_label = e.get("source_label", "")
            tgt_label = e.get("target_label", "")

            if src_label == "Document":
                src_id = f"doc-{e['source_id']}"
            elif src_label == "PolicyElement":
                src_id = f"policy-{e['source_id']}"
            else:
                continue

            if tgt_label == "Document":
                tgt_id = f"doc-{e['target_id']}"
            elif tgt_label == "PolicyElement":
                tgt_id = f"policy-{e['target_id']}"
            else:
                continue

            edge_data = {
                "id": f"e-{e['source_id']}-{e['target_id']}-{e['rel_type']}",
                "source": src_id,
                "target": tgt_id,
                "type": e["rel_type"],
            }

            if e.get("reason"):
                edge_data["reason"] = e["reason"]
            if e.get("a_val"):
                edge_data["a_value"] = e["a_val"]
            if e.get("b_val"):
                edge_data["b_value"] = e["b_val"]
            if e.get("a_src"):
                edge_data["a_source"] = e["a_src"]
            if e.get("b_src"):
                edge_data["b_source"] = e["b_src"]
            if e.get("a_doc"):
                edge_data["a_document"] = e["a_doc"]
            if e.get("b_doc"):
                edge_data["b_document"] = e["b_doc"]
            if e.get("older_ver"):
                edge_data["older_version"] = e["older_ver"]
            if e.get("newer_ver"):
                edge_data["newer_version"] = e["newer_ver"]

            all_edges.append(edge_data)

    # Compute stats
    doc_count = sum(1 for n in nodes if n["type"] == "Document")
    pol_count = sum(1 for n in nodes if n["type"] == "PolicyElement")
    chunk_count = sum(1 for n in nodes if n["type"] == "Chunk")
    conflict_count = sum(1 for e in all_edges if e["type"] == "CONFLICTS_WITH")
    version_count = sum(1 for e in all_edges if e["type"] == "SUPERSEDED_BY")
    dep_count = sum(1 for e in all_edges if e["type"] == "DEPENDS_ON")
    ref_count = sum(1 for e in all_edges if e["type"] == "REFERENCES")
    section_count = sum(1 for e in all_edges if e["type"] == "HAS_SECTION")
    policy_edge_count = sum(1 for e in all_edges if e["type"] == "HAS_POLICY")

    return {
        "nodes": nodes,
        "edges": all_edges,
        "stats": {
            "documents": doc_count,
            "sections": chunk_count,
            "policy_elements": pol_count,
            "total_edges": len(all_edges),
            "conflicts": conflict_count,
            "version_lineages": version_count,
            "dependencies": dep_count,
            "references": ref_count,
            "has_section": section_count,
            "has_policy": policy_edge_count,
        },
    }


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
                   collect(DISTINCT {id: c.id, section: c.section}) AS chunks,
                   collect(DISTINCT {id: p.id, name: p.name, element_type: p.element_type,
                            value: p.value, unit: p.unit, source_text: p.source_text}) AS policies
        """, doc_id=doc_id)
        record = dict(await result.single())

        nodes = []
        edges = []

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
                        "value": pol.get("value"),
                        "unit": pol.get("unit"),
                        "source_text": pol.get("source_text"),
                        "policy_id": pol["id"],
                        "doc_id": doc_id,
                    },
                })

        result = await session.run("""
            MATCH (a:PolicyElement)-[r]->(b:PolicyElement)
            WHERE a.id IN $policy_ids AND b.id IN $policy_ids
            RETURN a.id AS source, b.id AS target, type(r) AS type,
                   r.reason AS reason
        """, policy_ids=list(policy_ids))
        internal_edges = [dict(r) async for r in result]
        for e in internal_edges:
            edge_data = {
                "id": f"e-pol-{e['source']}-{e['target']}",
                "source": f"policy-{e['source']}",
                "target": f"policy-{e['target']}",
                "type": e["type"],
            }
            if e.get("reason"):
                edge_data["reason"] = e["reason"]
            edges.append(edge_data)

        result = await session.run("""
            MATCH (a:PolicyElement)-[r:REFERENCES|DEPENDS_ON|CONFLICTS_WITH]->(b:PolicyElement)
            WHERE a.id IN $policy_ids AND NOT b.id IN $policy_ids
            MATCH (b)<-[:HAS_POLICY]-(cb:Chunk)<-[:HAS_SECTION]-(db:Document)
            RETURN b.id AS target_id, b.name AS target_name, b.element_type AS target_type,
                   db.id AS target_doc_id, db.filename AS target_filename,
                   type(r) AS type, a.name AS source_name,
                   r.reason AS reason
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
    """N-hop neighborhood around any node (Document, Chunk, or PolicyElement), returns graph data."""
    driver = await get_neo4j()
    async with driver.session() as session:
        # Determine node type
        result = await session.run(
            "MATCH (n) WHERE (n:Document AND n.id = $id) OR (n:Chunk AND n.id = $id) OR (n:PolicyElement AND n.id = $id) RETURN labels(n)[0] AS label, n.id AS id",
            id=node_id,
        )
        node_info = await result.single()
        if not node_info:
            raise HTTPException(status_code=404, detail="Node not found")

        node_label = node_info["label"]

        if node_label == "Document":
            return await _neighborhood_document(session, node_id, hops)
        elif node_label == "Chunk":
            return await _neighborhood_chunk(session, node_id, hops)
        else:
            return await _neighborhood_policy(session, node_id, hops)


async def _neighborhood_document(session, doc_id, hops):
    result = await session.run("""
        MATCH (d:Document {id: $doc_id})
        OPTIONAL MATCH (d)-[:HAS_SECTION]->(c:Chunk)
        OPTIONAL MATCH (c)-[:HAS_POLICY]->(p:PolicyElement)
        OPTIONAL MATCH (d)-[v:SUPERSEDED_BY]->(d2:Document)
        RETURN d.filename AS filename,
               collect(DISTINCT {id: c.id, section: c.section}) AS chunks,
               collect(DISTINCT {id: p.id, name: p.name, element_type: p.element_type,
                        value: p.value, unit: p.unit, source_text: p.source_text}) AS policies,
               collect(DISTINCT {id: d2.id, filename: d2.filename, reason: v.reason,
                        older_version: v.older_version, newer_version: v.newer_version}) AS versions
    """, doc_id=doc_id)
    record = dict(await result.single())

    nodes = []
    edges = []

    nodes.append({
        "id": f"doc-{doc_id}",
        "type": "Document",
        "data": {"label": record["filename"], "doc_id": doc_id},
    })

    for chunk in record["chunks"]:
        if chunk["id"] is not None:
            nodes.append({"id": f"chunk-{chunk['id']}", "type": "Chunk",
                          "data": {"label": chunk["section"], "chunk_id": chunk["id"], "doc_id": doc_id}})
            edges.append({"id": f"e-doc-{doc_id}-chunk-{chunk['id']}", "source": f"doc-{doc_id}",
                          "target": f"chunk-{chunk['id']}", "type": "HAS_SECTION"})

    for pol in record["policies"]:
        if pol["id"] is not None:
            nodes.append({"id": f"policy-{pol['id']}", "type": "PolicyElement",
                          "data": {"label": pol["name"], "name": pol["name"], "element_type": pol["element_type"],
                                   "value": pol.get("value"), "unit": pol.get("unit"),
                                   "source_text": pol.get("source_text"), "policy_id": pol["id"], "doc_id": doc_id}})

    for ver in record["versions"]:
        if ver["id"] is not None:
            nodes.append({"id": f"doc-{ver['id']}", "type": "Document",
                          "data": {"label": ver["filename"], "doc_id": ver["id"]}})
            edges.append({"id": f"e-doc-{doc_id}-supersedes-doc-{ver['id']}", "source": f"doc-{doc_id}",
                          "target": f"doc-{ver['id']}", "type": "SUPERSEDED_BY",
                          "reason": ver.get("reason"), "older_version": ver.get("older_version"),
                          "newer_version": ver.get("newer_version")})

    # Get policy element edges
    policy_ids = [p["id"] for p in record["policies"] if p.get("id")]
    if policy_ids:
        result = await session.run("""
            MATCH (a:PolicyElement)-[r]->(b:PolicyElement)
            WHERE a.id IN $ids AND b.id IN $ids
            RETURN a.id AS source, b.id AS target, type(r) AS type, r.reason AS reason
        """, ids=policy_ids)
        async for r in result:
            rd = dict(r)
            edge_data = {"id": f"e-pol-{rd['source']}-{rd['target']}",
                         "source": f"policy-{rd['source']}", "target": f"policy-{rd['target']}",
                         "type": rd["type"]}
            if rd.get("reason"):
                edge_data["reason"] = rd["reason"]
            edges.append(edge_data)

    return {"center": doc_id, "center_type": "Document", "hops": hops,
            "graph": {"nodes": nodes, "edges": edges}}


async def _neighborhood_chunk(session, chunk_id, hops):
    result = await session.run("""
        MATCH (c:Chunk {id: $chunk_id})<-[:HAS_SECTION]-(d:Document)
        OPTIONAL MATCH (c)-[:HAS_POLICY]->(p:PolicyElement)
        RETURN d.id AS doc_id, d.filename AS filename, c.section AS section,
               collect(DISTINCT {id: p.id, name: p.name, element_type: p.element_type,
                        value: p.value, unit: p.unit, source_text: p.source_text}) AS policies
    """, chunk_id=chunk_id)
    record = dict(await result.single())
    if not record:
        raise HTTPException(status_code=404, detail="Chunk not found")

    nodes = [
        {"id": f"doc-{record['doc_id']}", "type": "Document",
         "data": {"label": record["filename"], "doc_id": record["doc_id"]}},
        {"id": f"chunk-{chunk_id}", "type": "Chunk",
         "data": {"label": record["section"], "chunk_id": chunk_id, "doc_id": record["doc_id"]}},
    ]
    edges = [
        {"id": f"e-doc-{record['doc_id']}-chunk-{chunk_id}", "source": f"doc-{record['doc_id']}",
         "target": f"chunk-{chunk_id}", "type": "HAS_SECTION"},
    ]

    for pol in record["policies"]:
        if pol["id"] is not None:
            nodes.append({"id": f"policy-{pol['id']}", "type": "PolicyElement",
                          "data": {"label": pol["name"], "name": pol["name"], "element_type": pol["element_type"],
                                   "value": pol.get("value"), "unit": pol.get("unit"),
                                   "source_text": pol.get("source_text"), "policy_id": pol["id"],
                                   "doc_id": record["doc_id"]}})
            edges.append({"id": f"e-chunk-{chunk_id}-pol-{pol['id']}", "source": f"chunk-{chunk_id}",
                          "target": f"policy-{pol['id']}", "type": "HAS_POLICY"})

    return {"center": chunk_id, "center_type": "Chunk", "hops": hops,
            "graph": {"nodes": nodes, "edges": edges}}


async def _neighborhood_policy(session, node_id, hops):
    center = await session.run(
        """MATCH (p:PolicyElement {id: $node_id})
           MATCH (p)<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
           RETURN p.name AS name, p.element_type AS element_type,
                  p.value AS value, p.source_text AS source_text, p.unit AS unit,
                  d.id AS doc_id, d.filename AS doc_filename, c.id AS chunk_id, c.section AS section""",
        node_id=node_id,
    )
    center_record = await center.single()
    if not center_record:
        raise HTTPException(status_code=404, detail="Policy element not found")
    center_dict = dict(center_record)

    # N-hop traversal through ALL relationship types
    result = await session.run(
        f"""MATCH path = (start:PolicyElement {{id: $node_id}})-[:DEPENDS_ON|REFERENCES|CONFLICTS_WITH*1..{hops}]->(target:PolicyElement)
            WITH DISTINCT target, length(path) AS dist, [r IN relationships(path) | type(r)] AS rel_types
            RETURN target.id AS id, target.name AS name, target.element_type AS element_type,
                   target.value AS value, target.source_text AS source_text, target.unit AS unit,
                   dist, rel_types
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
               RETURN a.id AS source, b.id AS target, type(r) AS type,
                      r.reason AS reason, r.a_value AS a_val, r.b_value AS b_val,
                      r.a_document AS a_doc, r.b_document AS b_doc""",
            ids=all_ids,
        )
        async for r in result:
            rd = dict(r)
            edge_data = {"id": f"e-pol-{rd['source']}-{rd['target']}",
                         "source": f"policy-{rd['source']}", "target": f"policy-{rd['target']}",
                         "type": rd["type"]}
            for k in ["reason", "a_val", "b_val", "a_doc", "b_doc"]:
                if rd.get(k):
                    edge_data[k] = rd[k]
            edges.append(edge_data)

    doc_context = []
    for pid in all_ids[:15]:
        result = await session.run(
            """MATCH (p:PolicyElement {id: $pid})<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
               RETURN $pid AS policy_id, d.id AS doc_id, d.filename AS doc_filename,
                      c.section AS section, c.id AS chunk_id""",
            pid=pid,
        )
        async for r in result:
            doc_context.append(dict(r))

    # Build graph nodes
    graph_nodes = []
    added_ids = set()

    def add_node(nid, ntype, ndata):
        if nid not in added_ids:
            added_ids.add(nid)
            graph_nodes.append({"id": nid, "type": ntype, "data": ndata})

    add_node(f"policy-{node_id}", "PolicyElement", {
        "label": center_dict["name"], "name": center_dict["name"],
        "element_type": center_dict["element_type"], "value": center_dict.get("value"),
        "unit": center_dict.get("unit"), "source_text": center_dict.get("source_text"),
        "policy_id": node_id, "doc_id": center_dict["doc_id"],
        "doc_filename": center_dict["doc_filename"],
    })

    add_node(f"doc-{center_dict['doc_id']}", "Document", {
        "label": center_dict["doc_filename"], "doc_id": center_dict["doc_id"],
    })
    graph_edges = [{"id": f"e-doc-{center_dict['doc_id']}-pol-{node_id}",
                    "source": f"doc-{center_dict['doc_id']}", "target": f"policy-{node_id}",
                    "type": "HAS_POLICY"}]

    if center_dict.get("chunk_id"):
        add_node(f"chunk-{center_dict['chunk_id']}", "Chunk", {
            "label": center_dict.get("section", "Section"),
            "chunk_id": center_dict["chunk_id"], "doc_id": center_dict["doc_id"],
        })
        graph_edges.append({"id": f"e-doc-{center_dict['doc_id']}-chunk-{center_dict['chunk_id']}",
                            "source": f"doc-{center_dict['doc_id']}",
                            "target": f"chunk-{center_dict['chunk_id']}", "type": "HAS_SECTION"})
        graph_edges.append({"id": f"e-chunk-{center_dict['chunk_id']}-pol-{node_id}",
                            "source": f"chunk-{center_dict['chunk_id']}",
                            "target": f"policy-{node_id}", "type": "HAS_POLICY"})

    for n in neighbors:
        add_node(f"policy-{n['id']}", "PolicyElement", {
            "label": n["name"], "name": n["name"], "element_type": n["element_type"],
            "value": n.get("value"), "unit": n.get("unit"),
            "source_text": n.get("source_text"), "policy_id": n["id"],
            "distance": n["dist"],
        })

    for ctx in doc_context:
        if ctx["doc_id"] not in added_ids:
            add_node(f"doc-{ctx['doc_id']}", "Document", {
                "label": ctx["doc_filename"], "doc_id": ctx["doc_id"],
            })
        if ctx.get("chunk_id") and f"chunk-{ctx['chunk_id']}" not in added_ids:
            add_node(f"chunk-{ctx['chunk_id']}", "Chunk", {
                "label": ctx.get("section", "Section"),
                "chunk_id": ctx["chunk_id"], "doc_id": ctx["doc_id"],
            })

    for e in edges:
        graph_edges.append({
            "id": f"e-pol-{e['source']}-{e['target']}",
            "source": f"policy-{e['source']}", "target": f"policy-{e['target']}",
            "type": e["type"], **{k: v for k, v in e.items() if k not in ("source", "target", "type")},
        })

    for ctx in doc_context:
        if ctx.get("chunk_id"):
            graph_edges.append({"id": f"e-doc-{ctx['doc_id']}-chunk-{ctx['chunk_id']}",
                                "source": f"doc-{ctx['doc_id']}",
                                "target": f"chunk-{ctx['chunk_id']}", "type": "HAS_SECTION"})
        graph_edges.append({"id": f"e-chunk-{ctx.get('chunk_id', 0)}-pol-{ctx['policy_id']}",
                            "source": f"chunk-{ctx.get('chunk_id', 0)}",
                            "target": f"policy-{ctx['policy_id']}", "type": "HAS_POLICY"})

    deduped = []
    seen = set()
    for e in graph_edges:
        key = (e["source"], e["target"], e["type"])
        if key not in seen:
            seen.add(key)
            deduped.append(e)

    return {"center": node_id, "center_type": "PolicyElement", "hops": hops,
            "center_info": center_dict, "neighbors": neighbors, "doc_context": doc_context,
            "graph": {"nodes": graph_nodes, "edges": deduped}}


@router.get("/node/{node_id}")
async def get_node_detail(node_id: int):
    """Full detail for a single policy element: identity, relationships, document context, provenance."""
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
                      type(r) AS rel_type, d.filename AS doc_filename, d.id AS doc_id,
                      r.reason AS reason, r.a_value AS a_val, r.b_value AS b_val
               UNION
               MATCH (other:PolicyElement)-[r]->(p:PolicyElement {id: $node_id})
               MATCH (other)<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
               RETURN other.id AS id, other.name AS name, other.element_type AS element_type,
                      type(r) AS rel_type, d.filename AS doc_filename, d.id AS doc_id,
                      r.reason AS reason, r.a_value AS a_val, r.b_value AS b_val""",
            node_id=node_id,
        )
        relationships = [dict(r) async for r in result]

    return {
        "node": info,
        "relationships": relationships,
        "relationship_count": len(relationships),
    }


@router.get("/edge-detail")
async def get_edge_detail(source: str = Query(...), target: str = Query(...), rel_type: str = Query(...)):
    """Get detailed explanation for a specific edge."""
    driver = await get_neo4j()
    async with driver.session() as session:
        # Parse IDs
        src_type, src_id = _parse_node_id(source)
        tgt_type, tgt_id = _parse_node_id(target)

        if src_type == "PolicyElement" and tgt_type == "PolicyElement":
            result = await session.run(
                f"""MATCH (a:PolicyElement {{id: $src_id}})-[r:{rel_type}]->(b:PolicyElement {{id: $tgt_id}})
                    RETURN a.name AS src_name, a.element_type AS src_type, a.source_text AS src_text,
                           b.name AS tgt_name, b.element_type AS tgt_type, b.source_text AS tgt_text,
                           r.reason AS reason, r.a_value AS a_val, r.b_value AS b_val,
                           r.a_source AS a_src, r.b_source AS b_src,
                           r.a_document AS a_doc, r.b_document AS b_doc""",
                src_id=src_id, tgt_id=tgt_id,
            )
            record = await result.single()
            if record:
                rd = dict(record)
                return {
                    "edge_type": rel_type,
                    "source": {"id": source, "name": rd["src_name"], "type": rd["src_type"], "text": rd.get("src_text")},
                    "target": {"id": target, "name": rd["tgt_name"], "type": rd["tgt_type"], "text": rd.get("tgt_text")},
                    "explanation": _explain_edge(rel_type, rd),
                    "evidence": {
                        "a_value": rd.get("a_val"),
                        "b_value": rd.get("b_val"),
                        "a_source": rd.get("a_src"),
                        "b_source": rd.get("b_src"),
                        "a_document": rd.get("a_doc"),
                        "b_document": rd.get("b_doc"),
                    },
                }
        elif src_type == "Document" and tgt_type == "Document":
            result = await session.run(
                f"""MATCH (a:Document {{id: $src_id}})-[r:{rel_type}]->(b:Document {{id: $tgt_id}})
                    RETURN a.filename AS src_name, b.filename AS tgt_name,
                           r.reason AS reason, r.older_version AS older_ver, r.newer_version AS newer_ver""",
                src_id=src_id, tgt_id=tgt_id,
            )
            record = await result.single()
            if record:
                rd = dict(record)
                return {
                    "edge_type": rel_type,
                    "source": {"id": source, "name": rd["src_name"]},
                    "target": {"id": target, "name": rd["tgt_name"]},
                    "explanation": rd.get("reason", f"{rel_type.replace('_', ' ').title()} relationship"),
                    "evidence": {"older_version": rd.get("older_ver"), "newer_version": rd.get("newer_ver")},
                }

    return {"edge_type": rel_type, "source": {"id": source}, "target": {"id": target},
            "explanation": f"{rel_type.replace('_', ' ').title()} relationship between nodes."}


def _parse_node_id(node_id: str):
    if node_id.startswith("doc-"):
        return "Document", int(node_id.replace("doc-", ""))
    elif node_id.startswith("chunk-"):
        return "Chunk", int(node_id.replace("chunk-", ""))
    elif node_id.startswith("policy-"):
        return "PolicyElement", int(node_id.replace("policy-", ""))
    return "Unknown", node_id


def _explain_edge(rel_type: str, data: dict) -> str:
    if rel_type == "DEPENDS_ON":
        return (f"'{data['src_name']}' ({data['src_type']}) depends on '{data['tgt_name']}' ({data['tgt_type']}). "
                f"The downstream element references or requires the upstream element to function correctly.")
    if rel_type == "REFERENCES":
        return (f"'{data['src_name']}' references '{data['tgt_name']}'. "
                f"Both elements address the same requirement or control area across different documents.")
    if rel_type == "CONFLICTS_WITH":
        a_val = data.get("a_val", "N/A")
        b_val = data.get("b_val", "N/A")
        return (f"CONFLICT: '{data['src_name']}' has value {a_val} in {data.get('a_doc', 'Document A')} "
                f"but '{data['tgt_name']}' has value {b_val} in {data.get('b_doc', 'Document B')}. "
                f"These values are incompatible and must be reconciled.")
    return f"{rel_type.replace('_', ' ').title()} relationship."


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
