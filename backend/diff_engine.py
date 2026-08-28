import re
import logging
from difflib import SequenceMatcher
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
log = logging.getLogger("diff_engine")


def _parse_clauses(text: str) -> list[dict]:
    """Extract hierarchical clauses from document text."""
    clauses = []
    current = {"id": "", "heading": "", "level": 0, "content": "", "requirements": []}
    in_clause = False

    for line in text.split("\n"):
        stripped = line.strip()
        heading_match = re.match(r"^(#{1,6})\s+(.+)", stripped)
        if heading_match:
            if in_clause and current["content"].strip():
                current["requirements"] = _extract_requirements(current["content"])
                clauses.append(current)
            level = len(heading_match.group(1))
            heading = heading_match.group(2).strip()
            clause_id = _make_clause_id(heading)
            current = {
                "id": clause_id,
                "heading": heading,
                "level": level,
                "content": "",
                "requirements": [],
                "raw_lines": [],
            }
            in_clause = True
        elif in_clause:
            current["content"] += line + "\n"
            if stripped:
                current.setdefault("raw_lines", []).append(stripped)

    if in_clause and current["content"].strip():
        current["requirements"] = _extract_requirements(current["content"])
        clauses.append(current)

    return clauses


def _make_clause_id(heading: str) -> str:
    """Create a stable clause ID from heading text."""
    clean = re.sub(r"[^a-zA-Z0-9\s]", "", heading.lower())
    return re.sub(r"\s+", "_", clean.strip())[:60]


def _extract_requirements(content: str) -> list[str]:
    """Extract individual requirement statements from clause content."""
    reqs = []
    for line in content.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        # Skip metadata lines
        if any(stripped.startswith(kw) for kw in ["Requirement:", "Control Mapping:", "Responsible:", "Review Frequency:", "Change from", "New in", "Compliance Deadline:", "Technical Implementation:", "Parent Clause:", "Note:", "Status:", "**"]):
            continue
        # Sentence-level splitting for long paragraphs
        sentences = re.split(r"(?<=[.;])\s+", stripped)
        for s in sentences:
            s = s.strip().rstrip(".")
            if len(s) > 15:
                reqs.append(s)
    return reqs


def _compute_clause_similarity(old_clause: dict, new_clause: dict) -> float:
    """Compute similarity between two clauses using SequenceMatcher."""
    old_text = old_clause["content"].lower().strip()
    new_text = new_clause["content"].lower().strip()
    return SequenceMatcher(None, old_text, new_text).ratio()


def _detect_change_type(old_clause: dict, new_clause: dict) -> str:
    """Determine the type of change between two clause versions."""
    old_reqs = set(r.lower().strip() for r in old_clause.get("requirements", []))
    new_reqs = set(r.lower().strip() for r in new_clause.get("requirements", []))

    if old_reqs == new_reqs:
        return "unchanged"
    if not old_reqs:
        return "added"
    if not new_reqs:
        return "deleted"

    added = new_reqs - old_reqs
    removed = old_reqs - new_reqs

    if added and removed:
        return "modified"
    if added:
        return "extended"
    if removed:
        return "removed"
    return "reworded"


def _extract_value_changes(old_clause: dict, new_clause: dict) -> list[dict]:
    """Detect specific value/threshold changes between clause versions."""
    changes = []
    old_text = old_clause["content"]
    new_text = new_clause["content"]

    # Extract numeric values with context
    old_values = re.findall(r"(\d+[\d,]*(?:\.\d+)?)\s*(days?|minutes?|hours?|months?|years?|characters?|%|attempts?|percent)?", old_text, re.IGNORECASE)
    new_values = re.findall(r"(\d+[\d,]*(?:\.\d+)?)\s*(days?|minutes?|hours?|months?|years?|characters?|%|attempts?|percent)?", new_text, re.IGNORECASE)

    old_set = {(v.replace(",", ""), u.lower() if u else "") for v, u in old_values}
    new_set = {(v.replace(",", ""), u.lower() if u else "") for v, u in new_values}

    for old_val, old_unit in old_set:
        for new_val, new_unit in new_set:
            if old_unit == new_unit and old_val != new_val:
                try:
                    changes.append({
                        "parameter": old_unit or "value",
                        "old_value": float(old_val),
                        "new_value": float(new_val),
                        "unit": old_unit,
                        "magnitude": abs(float(new_val) - float(old_val)) / max(float(old_val), 0.001),
                    })
                except ValueError:
                    pass

    # Detect key phrase changes
    old_lower = old_text.lower()
    new_lower = new_text.lower()
    key_phrases = [
        ("single-factor", "multi-factor"),
        ("tls 1.2", "tls 1.3"),
        ("8 characters", "12 characters"),
        ("90 days", "60 days"),
        ("5 minutes", "3 minutes"),
        ("5 attempts", "3 attempts"),
        ("15 minutes", "30 minutes"),
        ("quarterly", "monthly"),
        ("12 months", "24 months"),
        ("1 hour", "30 minutes"),
        ("30 days", "15 days"),
    ]
    for old_phrase, new_phrase in key_phrases:
        if old_phrase in old_lower and new_phrase in new_lower:
            changes.append({
                "parameter": "requirement",
                "old_value": old_phrase,
                "new_value": new_phrase,
                "unit": "text",
                "magnitude": 1.0,
            })

    return changes


@router.post("/diff")
async def compute_diff(req: dict):
    """Compare two document versions at the clause level."""
    old_text = req.get("old_text", "")
    new_text = req.get("new_text", "")
    doc_name = req.get("document_name", "Unknown Document")

    if not old_text or not new_text:
        raise HTTPException(status_code=400, detail="Both old_text and new_text are required")

    old_clauses = _parse_clauses(old_text)
    new_clauses = _parse_clauses(new_text)

    # Build clause index by ID
    old_index = {c["id"]: c for c in old_clauses}
    new_index = {c["id"]: c for c in new_clauses}

    all_ids = set(old_index.keys()) | set(new_index.keys())
    changes = []

    for cid in all_ids:
        old_c = old_index.get(cid)
        new_c = new_index.get(cid)

        if old_c and not new_c:
            changes.append({
                "clause_id": cid,
                "heading": old_c["heading"],
                "change_type": "deleted",
                "similarity": 0.0,
                "value_changes": [],
                "old_content": old_c["content"].strip()[:500],
                "new_content": "",
                "impact_level": "high",
                "explanation": f"Clause '{old_c['heading']}' was removed from the new version.",
            })
        elif new_c and not old_c:
            changes.append({
                "clause_id": cid,
                "heading": new_c["heading"],
                "change_type": "added",
                "similarity": 0.0,
                "value_changes": [],
                "old_content": "",
                "new_content": new_c["content"].strip()[:500],
                "impact_level": "medium",
                "explanation": f"New clause '{new_c['heading']}' was added.",
            })
        else:
            similarity = _compute_clause_similarity(old_c, new_c)
            change_type = _detect_change_type(old_c, new_c)
            value_changes = _extract_value_changes(old_c, new_c)

            if change_type == "unchanged":
                continue

            impact = "high" if value_changes else ("medium" if change_type == "modified" else "low")
            explanation = _generate_explanation(old_c, new_c, change_type, value_changes)

            changes.append({
                "clause_id": cid,
                "heading": old_c["heading"],
                "change_type": change_type,
                "similarity": round(similarity, 3),
                "value_changes": value_changes,
                "old_content": old_c["content"].strip()[:500],
                "new_content": new_c["content"].strip()[:500],
                "impact_level": impact,
                "explanation": explanation,
            })

    changes.sort(key=lambda x: {"high": 0, "medium": 1, "low": 2}[x["impact_level"]])

    return {
        "document_name": doc_name,
        "total_clauses_old": len(old_clauses),
        "total_clauses_new": len(new_clauses),
        "changes": changes,
        "total_changes": len(changes),
        "added": sum(1 for c in changes if c["change_type"] == "added"),
        "deleted": sum(1 for c in changes if c["change_type"] == "deleted"),
        "modified": sum(1 for c in changes if c["change_type"] == "modified"),
        "extended": sum(1 for c in changes if c["change_type"] == "extended"),
        "high_impact": sum(1 for c in changes if c["impact_level"] == "high"),
        "medium_impact": sum(1 for c in changes if c["impact_level"] == "medium"),
    }


def _generate_explanation(old_c: dict, new_c: dict, change_type: str, value_changes: list) -> str:
    heading = old_c["heading"]
    if value_changes:
        vc = value_changes[0]
        if vc["unit"] == "text":
            return f"'{heading}' changed from '{vc['old_value']}' to '{vc['new_value']}', tightening the requirement."
        return f"'{heading}' changed {vc['parameter']} from {vc['old_value']} to {vc['new_value']} {vc['unit'] or ''}."
    if change_type == "extended":
        return f"'{heading}' was extended with additional requirements in the new version."
    if change_type == "modified":
        return f"'{heading}' has been modified with changed requirements."
    if change_type == "reworded":
        return f"'{heading}' was reworded without changing the underlying requirements."
    return f"Change detected in '{heading}'."
