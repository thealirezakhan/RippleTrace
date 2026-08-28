import os
import json
import re
import logging
from fastapi import APIRouter, Query, HTTPException
from openai import AsyncOpenAI

router = APIRouter()
log = logging.getLogger("extraction")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434/v1")
MODEL = os.getenv("LLM_MODEL", "qwen2.5-coder:7b")

client = AsyncOpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama", timeout=30.0)

EXTRACTION_PROMPT = """Extract all policy state elements from this document chunk.
Return a JSON array of objects, each with:
- element_type: "variable" | "threshold" | "condition" | "constraint"
- name: snake_case identifier
- value: the numeric/string value (numbers as numbers, strings as strings)
- unit: currency/percentage/count if applicable, else null
- source_text: the exact sentence from the document

Only extract explicit values, thresholds, conditions, or constraints.
Return empty array if nothing extractable. Return ONLY the JSON array, no markdown fences."""


_PATTERNS = [
    (r"(?:maximum|max|limit|threshold|ceiling)\s+(?:of\s+|is\s+|shall not exceed\s+)?\$?([\d,]+(?:\.\d+)?)", "threshold", "USD", "limit"),
    (r"(?:minimum|min|floor)\s+(?:of\s+|is\s+)?\$?([\d,]+(?:\.\d+)?)", "threshold", "USD", "minimum"),
    (r"\$([\d,]+(?:\.\d+)?)\s+(?:per|each|every)", "threshold", "USD", "per_unit"),
    (r"([\d,]+(?:\.\d+)?)\s*%", "threshold", "percentage", "percentage"),
    (r"(?:exceed|over|above|greater than)\s+\$?([\d,]+(?:\.\d+)?)", "constraint", "USD", "exceeds"),
    (r"(?:must|shall|required)\s+.{0,60}?\$?([\d,]+(?:\.\d+)?)", "constraint", "USD", "requires"),
    (r"(?:retain|retention|store|keep)\s+.{0,40}?\s+(\d+)\s+(?:years?|months?|days?)", "constraint", "duration", "retention"),
    (r"(?:report|notify|submit|file)\s+.{0,40}?\s+(?:within\s+)?(\d+)\s+(?:days?|hours?|months?)", "constraint", "duration", "reporting"),
    (r"(?:penalty|fine|charge|fee)\s+(?:of\s+|up to\s+)?\$?([\d,]+(?:\.\d+)?)", "threshold", "USD", "penalty"),
    (r"(?:interest rate|rate)\s+(?:of\s+|at\s+)?([\d.]+)\s*%", "threshold", "percentage", "rate"),
    # Security/compliance patterns
    (r"(?:minimum\s+(?:password\s+)?length\s+(?:is\s+)?(?:increased\s+to\s+)?)(\d+)\s*(?:characters?)", "threshold", "count", "password_length"),
    (r"(?:lock(?:ed|out)?|timeout|lockout)\s+(?:after\s+)?(\d+)\s+(?:minutes?|hours?|seconds?|attempts?|days?)", "constraint", "duration", "lockout"),
    (r"(?:changed|every|each|within)\s+(?:every\s+)?(\d+)\s+(?:days?|months?|hours?)", "constraint", "duration", "rotation"),
    (r"(?:retain(?:ed)?|retention)\s+(?:for\s+)?(\d+)\s+(?:months?|years?|days?)", "constraint", "duration", "retention_period"),
    (r"(?:alerts?\s+(?:are\s+)?generated\s+(?:within\s+)?)(\d+)\s+(?:minutes?|hours?|days?)", "constraint", "duration", "alert_sla"),
    (r"(?:limit(?:ed)?\s+to\s+)(\d+)\s+(?:concurrent|simultaneous)", "constraint", "count", "session_limit"),
    (r"(?:minimum\s+(?:of\s+)?)(\d+)\s+(?:characters?|letters?|digits?)", "threshold", "count", "min_chars"),
    (r"(?:frequency|review)\s+(?:is\s+)?(?:conducted\s+)?(?:every\s+)?(quarterly|monthly|annually|daily|weekly)", "constraint", "frequency", "review_freq"),
    (r"(?:threshold:\s*)(\d+)\s+(?:attempts?|consecutive)", "constraint", "count", "lockout_threshold"),
    (r"(?:duration:\s*)(\d+)\s+(?:minutes?|hours?)", "constraint", "duration", "lockout_duration"),
    (r"(?:timeout:\s*)(\d+)\s+(?:seconds?|minutes?)", "constraint", "duration", "timeout"),
]


def _regex_extract(text: str) -> list[dict]:
    elements = []
    seen = set()
    for pattern, etype, unit, prefix in _PATTERNS:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            val_str = match.group(1).replace(",", "")
            try:
                val = float(val_str)
            except ValueError:
                continue
            val_int = int(val) if val == int(val) else val
            name = f"{prefix}_{val_int}_{unit.lower()}" if unit != "percentage" else f"{prefix}_{val_int}pct"
            if unit == "duration":
                name = f"{prefix}_{val_int}_{match.group(0).split()[-1]}"
            if name not in seen:
                seen.add(name)
                elements.append({
                    "element_type": etype,
                    "name": name,
                    "value": val,
                    "unit": unit,
                    "source_text": match.group(0).strip(),
                })
    return elements


def _parse_json(raw: str) -> list:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        elements = json.loads(raw)
        if isinstance(elements, dict):
            elements = elements.get("elements", elements.get("policy_states", []))
        return elements if isinstance(elements, list) else []
    except json.JSONDecodeError:
        return []


async def _ollama_extract(chunk_text: str) -> list[dict]:
    try:
        response = await client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You are a policy document analyst. Extract structured state. Return only valid JSON."},
                {"role": "user", "content": f"{EXTRACTION_PROMPT}\n\n{chunk_text}"},
            ],
            temperature=0,
        )
        raw = response.choices[0].message.content
        return _parse_json(raw)
    except Exception as e:
        log.warning("Ollama extraction failed: %s", e)
        return []


@router.post("/extract/{document_id}")
async def extract_policy_states(document_id: int, use_llm: bool = Query(False), force: bool = Query(False)):
    from db import get_pool

    pool = await get_pool()

    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            "SELECT id, filename FROM documents WHERE id = $1", document_id
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        if not force:
            existing = await conn.fetchval(
                "SELECT COUNT(*) FROM policy_states ps JOIN chunks c ON ps.chunk_id = c.id WHERE c.document_id = $1",
                document_id,
            )
            if existing > 0:
                return {
                    "document_id": document_id,
                    "extracted": existing,
                    "elements": [],
                    "cached": True,
                }

        if force:
            await conn.execute(
                """DELETE FROM policy_states
                   WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = $1)""",
                document_id,
            )

    async with pool.acquire() as conn:
        chunks = await conn.fetch(
            "SELECT id, content, section FROM chunks WHERE document_id = $1 ORDER BY chunk_index",
            document_id,
        )

    if not chunks:
        return {
            "document_id": document_id,
            "extracted": 0,
            "elements": [],
            "error": "no_chunks",
        }

    log.info("Extracting from %d chunks for doc %d (use_llm=%s)", len(chunks), document_id, use_llm)

    results = []
    for chunk in chunks:
        if use_llm:
            elements = await _ollama_extract(chunk["content"])
            if not elements:
                elements = _regex_extract(chunk["content"])
        else:
            elements = _regex_extract(chunk["content"])

        log.info("Chunk %d (%s): %d elements", chunk["id"], chunk["section"], len(elements))

        async with pool.acquire() as conn:
            for el in elements:
                value = el.get("value")
                if isinstance(value, (int, float)):
                    value_json = json.dumps(value)
                else:
                    value_json = json.dumps(str(value)) if value is not None else "null"

                await conn.execute(
                    """INSERT INTO policy_states (chunk_id, element_type, name, value, unit, source_text, confidence)
                       VALUES ($1, $2, $3, $4, $5, $6, $7)""",
                    chunk["id"],
                    el.get("element_type", "variable"),
                    el.get("name", "unknown"),
                    value_json,
                    el.get("unit"),
                    el.get("source_text", ""),
                    0.9,
                )
                results.append({"chunk_id": chunk["id"], **el})

    log.info("Extracted %d elements total for doc %d", len(results), document_id)
    return {"document_id": document_id, "extracted": len(results), "elements": results}


@router.get("/states/{document_id}")
async def get_policy_states(document_id: int):
    from db import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT ps.id, ps.element_type, ps.name, ps.value, ps.unit, ps.source_text, ps.confidence,
                      c.section, c.document_id
               FROM policy_states ps
               JOIN chunks c ON ps.chunk_id = c.id
               WHERE c.document_id = $1""",
            document_id,
        )
    return [dict(r) for r in rows]
