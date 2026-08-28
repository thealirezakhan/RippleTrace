import os
import json
import glob
import logging
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()
log = logging.getLogger("demo")

DOCS_DIR = os.getenv("DOCS_DIR", "/app/sample_docs")


@router.post("/run")
async def run_demo():
    """Run the full demo pipeline: ingest → extract → build graph → run impact → detect contradictions."""
    from db import get_pool, get_neo4j
    from ingestion import _ingest_file, _chunk_text, _parse_document, _extract_metadata
    from extraction import _regex_extract
    from graph import _create_semantic_edges
    from diff_engine import _parse_clauses
    from contradiction import ContradictionRequest
    from fastapi import Request

    pool = await get_pool()
    results = {"stages": []}

    # Stage 1: Ingest all documents
    stage1 = {"name": "Document Ingestion", "status": "running", "documents": []}
    files = [
        p for p in glob.glob(os.path.join(DOCS_DIR, "**", "*"), recursive=True)
        if Path(p).suffix.lower() in {".md", ".txt"} and os.path.isfile(p)
    ]
    for filepath in sorted(files):
        try:
            result = await _ingest_file(pool, filepath)
            stage1["documents"].append(result)
        except Exception as e:
            stage1["documents"].append({"filename": Path(filepath).name, "error": str(e)})
    stage1["status"] = "complete"
    stage1["total_documents"] = len(stage1["documents"])
    results["stages"].append(stage1)

    # Stage 2: Extract policy states
    stage2 = {"name": "Policy Extraction", "status": "running", "extractions": []}
    async with pool.acquire() as conn:
        docs = await conn.fetch("SELECT id, filename FROM documents ORDER BY id")
    for doc in docs:
        try:
            async with pool.acquire() as conn:
                existing = await conn.fetchval(
                    "SELECT COUNT(*) FROM policy_states ps JOIN chunks c ON ps.chunk_id = c.id WHERE c.document_id = $1",
                    doc["id"],
                )
                if existing > 0:
                    stage2["extractions"].append({"doc_id": doc["id"], "filename": doc["filename"], "extracted": existing, "cached": True})
                    continue

                chunks = await conn.fetch(
                    "SELECT id, content, section FROM chunks WHERE document_id = $1 ORDER BY chunk_index",
                    doc["id"],
                )
                total = 0
                for chunk in chunks:
                    elements = _regex_extract(chunk["content"])
                    for el in elements:
                        value = el.get("value")
                        value_json = json.dumps(value) if isinstance(value, (int, float)) else json.dumps(str(value)) if value is not None else "null"
                        await conn.execute(
                            """INSERT INTO policy_states (chunk_id, element_type, name, value, unit, source_text, confidence)
                               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                            chunk["id"], el.get("element_type", "variable"), el.get("name", "unknown"),
                            value_json, el.get("unit"), el.get("source_text", ""), 0.9,
                        )
                        total += 1
                stage2["extractions"].append({"doc_id": doc["id"], "filename": doc["filename"], "extracted": total})
        except Exception as e:
            stage2["extractions"].append({"doc_id": doc["id"], "filename": doc["filename"], "error": str(e)})
    stage2["status"] = "complete"
    results["stages"].append(stage2)

    # Stage 3: Build knowledge graph
    stage3 = {"name": "Knowledge Graph Construction", "status": "running", "graphs": []}
    driver = await get_neo4j()
    async with driver.session() as session:
        await session.run("MATCH (n) DETACH DELETE n")

    for doc in docs:
        try:
            async with pool.acquire() as conn:
                chunks = await conn.fetch(
                    "SELECT id, content, section FROM chunks WHERE document_id = $1 ORDER BY chunk_index",
                    doc["id"],
                )
                states = await conn.fetch(
                    """SELECT ps.id, ps.element_type, ps.name, ps.value, ps.unit, ps.source_text, c.id as chunk_id, c.section
                       FROM policy_states ps JOIN chunks c ON ps.chunk_id = c.id WHERE c.document_id = $1""",
                    doc["id"],
                )

            async with driver.session() as session:
                await session.run(
                    "MERGE (d:Document {id: $doc_id}) SET d.filename = $filename",
                    doc_id=doc["id"], filename=doc["filename"],
                )
                if chunks:
                    chunk_batch = [{"id": c["id"], "section": c["section"]} for c in chunks]
                    await session.run(
                        """UNWIND $chunks AS chunk
                           MATCH (d:Document {id: $doc_id})
                           MERGE (c:Chunk {id: chunk.id})
                           SET c.section = chunk.section, c.document_id = $doc_id
                           MERGE (d)-[:HAS_SECTION]->(c)""",
                        chunks=chunk_batch, doc_id=doc["id"],
                    )
                if states:
                    state_batch = []
                    for state in states:
                        value = state["value"]
                        value_str = str(value) if hasattr(value, "__str__") else json.dumps(value) if value is not None else "null"
                        state_batch.append({
                            "id": state["id"], "name": state["name"], "element_type": state["element_type"],
                            "value": value_str, "unit": state["unit"], "source_text": state["source_text"],
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

            stage3["graphs"].append({"doc_id": doc["id"], "filename": doc["filename"], "nodes": len(chunks) + len(states), "edges": edges})
        except Exception as e:
            stage3["graphs"].append({"doc_id": doc["id"], "filename": doc["filename"], "error": str(e)})
    stage3["status"] = "complete"
    results["stages"].append(stage3)

    # Stage 3b: Version lineage + conflict detection
    stage3b = {"name": "Version Lineage & Conflict Detection", "status": "running"}
    try:
        from graph import _create_version_lineage, _create_conflict_edges
        async with driver.session() as session:
            ver_count = await _create_version_lineage(session)
            conflict_count = await _create_conflict_edges(session)
        stage3b["version_lineages"] = ver_count
        stage3b["conflicts"] = conflict_count
    except Exception as e:
        stage3b["error"] = str(e)
    stage3b["status"] = "complete"
    results["stages"].append(stage3b)

    # Stage 4: Run impact simulation
    stage4 = {"name": "Impact Simulation", "status": "running"}
    try:
        from propagation import SimulateRequest
        impact_req = SimulateRequest(element_name="mfa_requirement", old_value=1, new_value=2)
        # Direct call to avoid HTTP overhead
        impacts = await _run_impact_simulation(driver, impact_req)
        stage4["result"] = impacts
    except Exception as e:
        stage4["error"] = str(e)
        stage4["result"] = {"total_impacts": 0, "impacts": []}
    stage4["status"] = "complete"
    results["stages"].append(stage4)

    # Stage 5: Clause-level diff
    stage5 = {"name": "Clause-Level Diff Analysis", "status": "running"}
    try:
        from diff_engine import compute_diff
        v1_path = os.path.join(DOCS_DIR, "01_info_security_policy_v1.md")
        v2_path = os.path.join(DOCS_DIR, "01_info_security_policy_v2.md")
        old_text = Path(v1_path).read_text(encoding="utf-8") if os.path.exists(v1_path) else ""
        new_text = Path(v2_path).read_text(encoding="utf-8") if os.path.exists(v2_path) else ""
        diff_result = await compute_diff({"old_text": old_text, "new_text": new_text, "document_name": "Information Security Policy"})
        stage5["result"] = diff_result
    except Exception as e:
        stage5["error"] = str(e)
    stage5["status"] = "complete"
    results["stages"].append(stage5)

    # Stage 6: Contradiction detection
    stage6 = {"name": "Contradiction & Drift Detection", "status": "running"}
    try:
        documents_for_contradiction = []
        async with pool.acquire() as conn:
            all_docs = await conn.fetch("SELECT id, filename FROM documents ORDER BY id")
        for d in all_docs:
            async with pool.acquire() as conn:
                content_rows = await conn.fetch("SELECT content FROM chunks WHERE document_id = $1", d["id"])
            content = " ".join(r["content"] for r in content_rows)
            clauses = _parse_clauses(content)
            documents_for_contradiction.append({
                "filename": d["filename"],
                "content": content,
                "clauses": [{"id": c["id"], "heading": c["heading"], "content": c["content"]} for c in clauses],
            })
        from contradiction import detect_contradictions
        contr_result = await detect_contradictions(ContradictionRequest(documents=documents_for_contradiction))
        stage6["result"] = contr_result
    except Exception as e:
        stage6["error"] = str(e)
    stage6["status"] = "complete"
    results["stages"].append(stage6)

    # Compute summary
    impact_data = stage4.get("result", {})
    diff_data = stage5.get("result", {})
    contr_data = stage6.get("result", {})

    results["summary"] = {
        "documents_analyzed": len(docs),
        "total_policy_elements": sum(e.get("extracted", 0) for e in stage2["extractions"]),
        "total_graph_nodes": sum(g.get("nodes", 0) for g in stage3["graphs"]),
        "total_graph_edges": sum(g.get("edges", 0) for g in stage3["graphs"]),
        "changed_clauses": diff_data.get("total_changes", 0),
        "affected_artifacts": impact_data.get("total_impacts", 0),
        "contradictions_detected": contr_data.get("total_contradictions", 0),
        "drift_items": contr_data.get("total_drifts", 0),
        "impact_score": _compute_impact_score(impact_data, diff_data, contr_data),
        "blast_radius": _compute_blast_radius(impact_data),
        "severity_breakdown": {
            "high": impact_data.get("high_severity", 0) + contr_data.get("high_severity", 0),
            "medium": impact_data.get("medium_severity", 0) + contr_data.get("medium_severity", 0),
            "low": impact_data.get("low_severity", 0),
        },
    }

    return results


def _compute_impact_score(impact_data: dict, diff_data: dict, contr_data: dict) -> int:
    """Compute an overall impact score 0-100."""
    score = 0
    score += min(impact_data.get("total_impacts", 0) * 5, 30)
    score += min(impact_data.get("high_severity", 0) * 10, 20)
    score += min(diff_data.get("high_impact", 0) * 8, 25)
    score += min(contr_data.get("total_contradictions", 0) * 10, 15)
    score += min(contr_data.get("total_drifts", 0) * 3, 10)
    return min(score, 100)


def _compute_blast_radius(impact_data: dict) -> dict:
    """Compute blast radius metrics."""
    impacts = impact_data.get("impacts", [])
    docs = set(i.get("affected_doc_filename", "") for i in impacts)
    types = {}
    for i in impacts:
        t = i.get("affected_type", "unknown")
        types[t] = types.get(t, 0) + 1
    return {
        "documents_affected": len(docs),
        "document_list": list(docs),
        "elements_by_type": types,
        "max_propagation_distance": max((i.get("distance", 0) for i in impacts), default=0),
    }


async def _run_impact_simulation(driver, req):
    """Direct impact simulation without HTTP."""
    from propagation import _check_violation, _severity, DECAY_RATE, CONFIDENCE_THRESHOLD

    impacts = []
    async with driver.session() as session:
        result = await session.run(
            """MATCH (p:PolicyElement)
               WHERE toLower(p.name) CONTAINS toLower($name_fragment)
               MATCH (p)<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
               RETURN p.id AS id, p.source_text AS source, p.element_type AS type,
                      d.filename AS doc_filename, d.id AS doc_id""",
            name_fragment=req.element_name.replace("_", " "),
        )
        source_nodes = [dict(r) async for r in result]

        if not source_nodes:
            # Fallback: try matching any element
            result = await session.run(
                """MATCH (p:PolicyElement)
                   MATCH (p)<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
                   RETURN p.id AS id, p.name AS name, p.source_text AS source,
                          p.element_type AS type, d.filename AS doc_filename, d.id AS doc_id
                   LIMIT 5"""
            )
            source_nodes = [dict(r) async for r in result]

        for node in source_nodes:
            bfs_result = await session.run(
                """MATCH path = (start:PolicyElement {id: $start_id})-[:DEPENDS_ON|REFERENCES*1..4]->(target:PolicyElement)
                   WITH target, length(path) AS dist,
                        [n IN nodes(path) | n.source_text] AS evidence_texts,
                        [n IN nodes(path) | n.name] AS evidence_names
                   RETURN target.id AS target_id, target.name AS target_name,
                          target.element_type AS target_type, target.source_text AS target_source,
                          dist, evidence_texts, evidence_names""",
                start_id=node["id"],
            )
            async for record in bfs_result:
                distance = record["dist"]
                confidence = DECAY_RATE ** distance
                if confidence < CONFIDENCE_THRESHOLD:
                    continue

                target_doc = await session.run(
                    """MATCH (p:PolicyElement {id: $target_id})<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
                       RETURN d.filename AS filename, d.id AS doc_id""",
                    target_id=record["target_id"],
                )
                target_doc_record = await target_doc.single()
                target_doc_dict = dict(target_doc_record) if target_doc_record else {}

                violation = _check_violation(req.old_value, req.new_value, record["target_type"], record["target_source"])

                evidence_path = []
                for i, name in enumerate(record["evidence_names"]):
                    step = {"name": name}
                    if i < len(record["evidence_texts"]):
                        step["text"] = record["evidence_texts"][i]
                    evidence_path.append(step)

                impacts.append({
                    "affected_element": record["target_name"],
                    "affected_type": record["target_type"],
                    "affected_source": record["target_source"],
                    "affected_doc_id": target_doc_dict.get("doc_id"),
                    "affected_doc_filename": target_doc_dict.get("filename", "unknown"),
                    "distance": distance,
                    "confidence": round(confidence, 3),
                    "violation": violation,
                    "evidence_path": evidence_path,
                    "severity": _severity(confidence, violation),
                })

    impacts.sort(key=lambda x: (-x["confidence"], x["distance"]))
    seen = set()
    unique = []
    for impact in impacts:
        if impact["affected_element"] not in seen:
            seen.add(impact["affected_element"])
            unique.append(impact)

    docs_affected = set(i["affected_doc_id"] for i in unique if i.get("affected_doc_id"))

    return {
        "changed_element": req.element_name,
        "old_value": req.old_value,
        "new_value": req.new_value,
        "impacts": unique,
        "total_impacts": len(unique),
        "documents_affected": len(docs_affected),
        "high_severity": sum(1 for i in unique if i["severity"] == "high"),
        "medium_severity": sum(1 for i in unique if i["severity"] == "medium"),
        "low_severity": sum(1 for i in unique if i["severity"] == "low"),
    }
