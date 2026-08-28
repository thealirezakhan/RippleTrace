import os
import re
import glob
import json
import logging
import tempfile
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter()
log = logging.getLogger("ingestion")

DOCS_DIR = os.getenv("DOCS_DIR", "/app/sample_docs")

PARSABLE_EXTS = {".md", ".txt", ".pdf", ".docx"}


def _parse_document(path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext == ".pdf":
        try:
            from docling.document_converter import DocumentConverter
            return DocumentConverter().convert(path).document.export_to_markdown()
        except Exception as e:
            log.warning("Docling PDF parse failed for %s: %s", path, e)
    if ext == ".docx":
        try:
            from docling.document_converter import DocumentConverter
            return DocumentConverter().convert(path).document.export_to_markdown()
        except Exception as e:
            log.warning("Docling DOCX parse failed for %s: %s", path, e)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        log.error("Failed to read %s: %s", path, e)
        return ""


def _chunk_text(text: str) -> list[dict]:
    if not text or not text.strip():
        return []

    sections = []
    current_section = " preamble"
    current_lines = []
    index = 0

    for line in text.split("\n"):
        stripped = line.strip()
        if re.match(r"^#{1,6}\s+", stripped):
            if current_lines:
                content = "\n".join(current_lines).strip()
                if content:
                    sections.append({
                        "content": content,
                        "section": current_section,
                        "index": index,
                    })
                    index += 1
            current_section = re.sub(r"^#{1,6}\s+", "", stripped).strip()
            current_lines = [line]
        else:
            current_lines.append(line)

    if current_lines:
        content = "\n".join(current_lines).strip()
        if content:
            sections.append({
                "content": content,
                "section": current_section,
                "index": index,
            })

    return sections


def _extract_metadata(text: str, filename: str) -> dict:
    meta = {"filename": filename}
    first_lines = text[:500]
    title_match = re.search(r"^#\s+(.+)", first_lines, re.MULTILINE)
    if title_match:
        meta["title"] = title_match.group(1).strip()
    return meta


async def _ingest_file(pool, filepath: str) -> dict:
    filename = Path(filepath).name
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM documents WHERE filename = $1", filename
        )
        if existing:
            return {
                "filename": filename,
                "document_id": existing,
                "chunks": 0,
                "cached": True,
            }

    text = _parse_document(filepath)
    if not text or not text.strip():
        log.warning("Empty document: %s", filename)
        return {
            "filename": filename,
            "document_id": None,
            "chunks": 0,
            "error": "empty_document",
        }

    chunks = _chunk_text(text)
    metadata = _extract_metadata(text, filename)

    async with pool.acquire() as conn:
        doc_id = await conn.fetchval(
            "INSERT INTO documents (filename, content, metadata) VALUES ($1, $2, $3) RETURNING id",
            filename,
            text,
            json.dumps(metadata),
        )
        for chunk in chunks:
            chunk_meta = json.dumps({
                "section": chunk["section"],
                "chunk_index": chunk["index"],
                "source_file": filename,
            })
            await conn.execute(
                "INSERT INTO chunks (document_id, content, section, chunk_index, metadata) VALUES ($1, $2, $3, $4, $5)",
                doc_id,
                chunk["content"],
                chunk["section"],
                chunk["index"],
                chunk_meta,
            )

    log.info("Ingested %s: %d chunks, doc_id=%d", filename, len(chunks), doc_id)
    return {"filename": filename, "document_id": doc_id, "chunks": len(chunks)}


@router.post("/scan")
async def scan_directory():
    from db import get_pool

    pool = await get_pool()

    files = [
        p
        for p in glob.glob(os.path.join(DOCS_DIR, "**", "*"), recursive=True)
        if Path(p).suffix.lower() in PARSABLE_EXTS and os.path.isfile(p)
    ]
    log.info("Found %d documents in %s", len(files), DOCS_DIR)

    results = []
    errors = []
    for filepath in sorted(files):
        try:
            result = await _ingest_file(pool, filepath)
            results.append(result)
            if result.get("error"):
                errors.append({"filename": result["filename"], "error": result["error"]})
        except Exception as e:
            log.error("Failed to ingest %s: %s", filepath, e)
            errors.append({"filename": Path(filepath).name, "error": str(e)})

    total_chunks = sum(r.get("chunks", 0) for r in results)
    return {
        "scanned": len(results),
        "total_chunks": total_chunks,
        "documents": results,
        "errors": errors,
    }


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in PARSABLE_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Supported: {', '.join(sorted(PARSABLE_EXTS))}",
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    safe_name = re.sub(r"[^\w\-.]", "_", file.filename)
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        from db import get_pool

        pool = await get_pool()
        result = await _ingest_file(pool, tmp_path)
        return result
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@router.get("/")
async def list_documents():
    from db import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT d.id, d.filename, d.created_at, d.metadata,
                   COUNT(DISTINCT c.id) AS chunk_count,
                   COUNT(DISTINCT ps.id) AS policy_count
            FROM documents d
            LEFT JOIN chunks c ON c.document_id = d.id
            LEFT JOIN policy_states ps ON ps.chunk_id = c.id
            GROUP BY d.id ORDER BY d.created_at DESC
        """
        )
    return [dict(r) for r in rows]


@router.get("/{document_id}")
async def get_document(document_id: int):
    from db import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            "SELECT id, filename, content, metadata, created_at FROM documents WHERE id = $1",
            document_id,
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        chunks = await conn.fetch(
            """SELECT c.id, c.content, c.section, c.chunk_index, c.metadata,
                      COUNT(ps.id) AS policy_count
               FROM chunks c
               LEFT JOIN policy_states ps ON ps.chunk_id = c.id
               WHERE c.document_id = $1
               GROUP BY c.id
               ORDER BY c.chunk_index""",
            document_id,
        )

        policies = await conn.fetch(
            """SELECT ps.id, ps.element_type, ps.name, ps.value, ps.unit,
                      ps.source_text, ps.confidence, ps.metadata,
                      c.id AS chunk_id, c.section
               FROM policy_states ps
               JOIN chunks c ON ps.chunk_id = c.id
               WHERE c.document_id = $1""",
            document_id,
        )

    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "metadata": doc["metadata"],
        "created_at": str(doc["created_at"]),
        "chunks": [dict(c) for c in chunks],
        "policies": [dict(p) for p in policies],
        "chunk_count": len(chunks),
        "policy_count": len(policies),
    }


@router.delete("/{document_id}")
async def delete_document(document_id: int):
    from db import get_pool
    from db import get_neo4j

    pool = await get_pool()
    async with pool.acquire() as conn:
        doc = await conn.fetchrow(
            "SELECT id, filename FROM documents WHERE id = $1", document_id
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        await conn.execute("DELETE FROM documents WHERE id = $1", document_id)

    try:
        driver = await get_neo4j()
        async with driver.session() as session:
            await session.run(
                "MATCH (d:Document {id: $doc_id}) DETACH DELETE d",
                doc_id=document_id,
            )
    except Exception as e:
        log.warning("Failed to clean up Neo4j for doc %d: %s", document_id, e)

    return {"deleted": document_id, "filename": doc["filename"]}
