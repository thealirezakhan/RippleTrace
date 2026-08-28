"""Tests for RippleTrace backend core logic."""
import json
import re
import pytest


def test_regex_extract_thresholds():
    from extraction import _regex_extract

    text = "The maximum transaction limit shall not exceed $10,000. Wire transfers max $50,000."
    elements = _regex_extract(text)

    names = [e["name"] for e in elements]
    assert "limit_10000_usd" in names
    assert "limit_50000_usd" in names

    for el in elements:
        assert el["element_type"] in ("threshold", "constraint", "variable", "condition")
        assert "value" in el
        assert "source_text" in el
        assert isinstance(el["value"], (int, float))


def test_regex_extract_percentage():
    from extraction import _regex_extract

    text = "The interest rate is 5.5% per annum."
    elements = _regex_extract(text)

    pct_elements = [e for e in elements if e["unit"] == "percentage"]
    assert len(pct_elements) >= 1
    assert pct_elements[0]["value"] == 5.5


def test_regex_extract_empty():
    from extraction import _regex_extract

    elements = _regex_extract("No numbers or thresholds here.")
    assert elements == []


def test_chunk_text_basic():
    from ingestion import _chunk_text

    text = """# Title

Some preamble text.

## Section 1

Content of section 1.

## Section 2

Content of section 2.

### Subsection 2.1

Sub-content."""

    chunks = _chunk_text(text)
    assert len(chunks) >= 2
    sections = [c["section"] for c in chunks]
    assert "Title" in sections[0] or "preamble" in sections[0]


def test_chunk_text_empty():
    from ingestion import _chunk_text

    chunks = _chunk_text("")
    assert chunks == []


def test_chunk_text_no_headers():
    from ingestion import _chunk_text

    text = "Just plain text with no headers at all."
    chunks = _chunk_text(text)
    assert len(chunks) == 1
    assert chunks[0]["section"] == " preamble"


def test_types_related():
    from graph import _types_related

    assert _types_related("threshold", "constraint") is True
    assert _types_related("constraint", "threshold") is True
    assert _types_related("variable", "threshold") is True
    assert _types_related("condition", "constraint") is True
    assert _types_related("document", "chunk") is False
    assert _types_related("threshold", "threshold") is False


def test_severity_levels():
    from propagation import _severity

    assert _severity(0.9, True) == "high"
    assert _severity(0.9, False) == "medium"
    assert _severity(0.5, True) == "medium"
    assert _severity(0.3, False) == "low"
    assert _severity(0.2, True) == "low"


def test_check_violation_constraint():
    from propagation import _check_violation

    assert _check_violation(10000, 15000, "constraint", "must not exceed $10,000") is True
    assert _check_violation(10000, 8000, "constraint", "must retain records for 7 years") is False
    assert _check_violation(10000, 5000, "constraint", "minimum balance of $10,000") is True


def test_check_violation_threshold():
    from propagation import _check_violation

    assert _check_violation(10000, 20000, "threshold", "limit is $10,000") is True
    assert _check_violation(10000, 4999, "threshold", "limit is $10,000") is True
    assert _check_violation(10000, 12000, "threshold", "limit is $10,000") is False


def test_parse_json_valid():
    from extraction import _parse_json

    result = _parse_json('[{"name": "test", "value": 100}]')
    assert len(result) == 1
    assert result[0]["name"] == "test"


def test_parse_json_with_markdown_fences():
    from extraction import _parse_json

    raw = '```json\n[{"name": "test"}]\n```'
    result = _parse_json(raw)
    assert len(result) == 1


def test_parse_json_invalid():
    from extraction import _parse_json

    assert _parse_json("not json") == []
    assert _parse_json("") == []


def test_parse_json_dict_wrapper():
    from extraction import _parse_json

    result = _parse_json('{"elements": [{"name": "a"}]}')
    assert len(result) == 1


def test_document_metadata_extraction():
    from ingestion import _extract_metadata

    text = "# My Policy Document\n\nSome content."
    meta = _extract_metadata(text, "test.md")
    assert meta["filename"] == "test.md"
    assert meta["title"] == "My Policy Document"


def test_document_metadata_no_title():
    from ingestion import _extract_metadata

    text = "Just some text with no title."
    meta = _extract_metadata(text, "test.md")
    assert meta["filename"] == "test.md"
    assert "title" not in meta


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
