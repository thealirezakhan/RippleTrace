import re
import logging
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
log = logging.getLogger("contradiction")


class ContradictionRequest(BaseModel):
    documents: list[dict]  # [{filename, content, clauses: [{id, heading, content}]}]


def _extract_numeric_constraints(text: str) -> list[dict]:
    """Extract numeric constraints from text."""
    constraints = []
    patterns = [
        (r"(?:minimum|min)\s+(?:of\s+|is\s+)?(\d+)\s*(days?|minutes?|hours?|characters?|attempts?|percent|%)", "minimum"),
        (r"(?:maximum|max|limit|ceiling)\s+(?:of\s+|is\s+|shall not exceed\s+)?(\d+)\s*(days?|minutes?|hours?|characters?|attempts?|percent|%)", "maximum"),
        (r"(?:must|shall|required)\s+.{0,40}?(\d+)\s*(days?|minutes?|hours?|characters?|attempts?)", "requirement"),
        (r"(?:after|within)\s+(\d+)\s*(days?|minutes?|hours?)", "threshold"),
        (r"(?:every|each)\s+(\d+)\s*(days?|minutes?|hours?|months?)", "frequency"),
    ]
    for pattern, ctype in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            val_str = match.group(1)
            unit = match.group(2)
            try:
                constraints.append({
                    "type": ctype,
                    "value": int(val_str),
                    "unit": unit.rstrip("s"),
                    "raw": match.group(0).strip(),
                    "context": text[max(0, match.start()-50):match.end()+50].strip(),
                })
            except ValueError:
                pass
    return constraints


def _check_value_conflicts(constraints_a: list[dict], constraints_b: list[dict], unit_filter: str) -> list[dict]:
    """Check if two sets of constraints conflict on the same unit."""
    conflicts = []
    a_filtered = [c for c in constraints_a if c["unit"] == unit_filter]
    b_filtered = [c for c in constraints_b if c["unit"] == unit_filter]

    for a in a_filtered:
        for b in b_filtered:
            if a["type"] == "maximum" and b["type"] == "minimum":
                if a["value"] < b["value"]:
                    conflicts.append({
                        "constraint_a": a,
                        "constraint_b": b,
                        "conflict_type": "value_mismatch",
                        "severity": "high",
                        "explanation": f"Document A sets maximum {a['value']} {a['unit']} but Document B requires minimum {b['value']} {b['unit']}. Maximum is lower than minimum — incompatible.",
                    })
            elif a["type"] == "minimum" and b["type"] == "maximum":
                if a["value"] > b["value"]:
                    conflicts.append({
                        "constraint_a": a,
                        "constraint_b": b,
                        "conflict_type": "value_mismatch",
                        "severity": "high",
                        "explanation": f"Document A requires minimum {a['value']} {a['unit']} but Document B sets maximum {b['value']} {b['unit']}. Minimum exceeds maximum — incompatible.",
                    })
            elif a["type"] == b["type"] and a["value"] != b["value"]:
                conflicts.append({
                    "constraint_a": a,
                    "constraint_b": b,
                    "conflict_type": "divergent_values",
                    "severity": "medium",
                    "explanation": f"Both documents define {a['type']} {unit_filter} but with different values: {a['value']} vs {b['value']}.",
                })
    return conflicts


def _check_requirement_drift(doc_clauses: list[dict], requirement_keywords: list[str]) -> list[dict]:
    """Detect when documents drift from a requirement (old value still present)."""
    drifts = []
    for clause in doc_clauses:
        content = clause.get("content", "")
        for keyword in requirement_keywords:
            if keyword.lower() in content.lower():
                drifts.append({
                    "clause_id": clause.get("id", "unknown"),
                    "heading": clause.get("heading", "Unknown"),
                    "drifted_requirement": keyword,
                    "content_snippet": content[:200],
                    "severity": "medium",
                    "explanation": f"Document still references '{keyword}' which may be outdated per the new policy version.",
                })
    return drifts


@router.post("/detect")
async def detect_contradictions(req: ContradictionRequest):
    """Detect contradictions and drift across documents."""
    all_conflicts = []
    all_drifts = []

    # Cross-document contradiction detection
    docs = req.documents
    for i in range(len(docs)):
        for j in range(i + 1, len(docs)):
            doc_a = docs[i]
            doc_b = docs[j]

            clauses_a = doc_a.get("clauses", [])
            clauses_b = doc_b.get("clauses", [])

            # Aggregate constraints from all clauses
            text_a = " ".join(c.get("content", "") for c in clauses_a)
            text_b = " ".join(c.get("content", "") for c in clauses_b)

            constraints_a = _extract_numeric_constraints(text_a)
            constraints_b = _extract_numeric_constraints(text_b)

            # Check for conflicts on each unit type
            units = set(c["unit"] for c in constraints_a) | set(c["unit"] for c in constraints_b)
            for unit in units:
                conflicts = _check_value_conflicts(constraints_a, constraints_b, unit)
                for conflict in conflicts:
                    all_conflicts.append({
                        "document_a": doc_a.get("filename", "Unknown"),
                        "document_b": doc_b.get("filename", "Unknown"),
                        **conflict,
                    })

    # Drift detection — check if downstream docs still reference old values
    outdated_keywords = [
        "single-factor", "tls 1.2", "8 characters", "90 days",
        "5 minutes", "5 attempts", "15 minutes", "quarterly",
        "12 months", "1 hour", "30 days",
    ]
    for doc in docs:
        clauses = doc.get("clauses", [])
        drifts = _check_requirement_drift(clauses, outdated_keywords)
        for drift in drifts:
            drift["document"] = doc.get("filename", "Unknown")
            all_drifts.append(drift)

    # Deduplicate
    seen_conflicts = set()
    unique_conflicts = []
    for c in all_conflicts:
        key = (c["document_a"], c["document_b"], c.get("constraint_a", {}).get("raw", ""), c.get("constraint_b", {}).get("raw", ""))
        if key not in seen_conflicts:
            seen_conflicts.add(key)
            unique_conflicts.append(c)

    seen_drifts = set()
    unique_drifts = []
    for d in all_drifts:
        key = (d["document"], d["clause_id"], d["drifted_requirement"])
        if key not in seen_drifts:
            seen_drifts.add(key)
            unique_drifts.append(d)

    return {
        "contradictions": unique_conflicts,
        "drifts": unique_drifts,
        "total_contradictions": len(unique_conflicts),
        "total_drifts": len(unique_drifts),
        "high_severity": sum(1 for c in unique_conflicts if c["severity"] == "high") + sum(1 for d in unique_drifts if d["severity"] == "high"),
        "medium_severity": sum(1 for c in unique_conflicts if c["severity"] == "medium") + sum(1 for d in unique_drifts if d["severity"] == "medium"),
        "documents_analyzed": len(docs),
    }
