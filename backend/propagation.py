import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import get_neo4j

router = APIRouter()
log = logging.getLogger("propagation")

DECAY_RATE = 0.8
CONFIDENCE_THRESHOLD = 0.3


class SimulateRequest(BaseModel):
    element_name: str
    old_value: float
    new_value: float


@router.post("/impact")
async def simulate_impact(req: SimulateRequest):
    driver = await get_neo4j()
    impacts = []

    async with driver.session() as session:
        result = await session.run(
            """MATCH (p:PolicyElement {name: $name})
               MATCH (p)<-[:HAS_POLICY]-(c:Chunk)<-[:HAS_SECTION]-(d:Document)
               RETURN p.id AS id, p.source_text AS source, p.element_type AS type,
                      d.filename AS doc_filename, d.id AS doc_id""",
            name=req.element_name,
        )
        source_nodes = [dict(r) async for r in result]

        if not source_nodes:
            raise HTTPException(
                status_code=404,
                detail=f"No policy element found with name '{req.element_name}'",
            )

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

                violation = _check_violation(
                    req.old_value,
                    req.new_value,
                    record["target_type"],
                    record["target_source"],
                )

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
    unique_impacts = []
    for impact in impacts:
        key = impact["affected_element"]
        if key not in seen:
            seen.add(key)
            unique_impacts.append(impact)

    docs_affected = set(i["affected_doc_id"] for i in unique_impacts if i.get("affected_doc_id"))

    return {
        "changed_element": req.element_name,
        "old_value": req.old_value,
        "new_value": req.new_value,
        "source_documents": [
            {"id": n["doc_id"], "filename": n["doc_filename"]} for n in source_nodes
        ],
        "impacts": unique_impacts,
        "total_impacts": len(unique_impacts),
        "documents_affected": len(docs_affected),
        "high_severity": sum(1 for i in unique_impacts if i["severity"] == "high"),
        "medium_severity": sum(1 for i in unique_impacts if i["severity"] == "medium"),
        "low_severity": sum(1 for i in unique_impacts if i["severity"] == "low"),
    }


def _check_violation(old_val: float, new_val: float, target_type: str, source_text: str) -> bool:
    text_lower = source_text.lower()

    if target_type == "constraint":
        constraint_keywords = ["must", "shall", "required", "mandatory"]
        limit_keywords = ["maximum", "limit", "ceiling", "exceed", "not exceed", "shall not"]
        if any(kw in text_lower for kw in constraint_keywords) and any(kw in text_lower for kw in limit_keywords):
            return True
        if "minimum" in text_lower or "floor" in text_lower:
            if new_val < old_val:
                return True
        if "retain" in text_lower or "retention" in text_lower:
            return False

    if target_type == "threshold":
        if new_val > old_val * 1.5:
            return True
        if new_val <= old_val * 0.5:
            return True

    return False


def _severity(confidence: float, violation: bool) -> str:
    if violation and confidence > 0.6:
        return "high"
    if confidence > 0.4 or (violation and confidence > 0.3):
        return "medium"
    return "low"
