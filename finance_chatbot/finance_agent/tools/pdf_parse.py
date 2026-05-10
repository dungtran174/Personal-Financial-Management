# finance_agent/tools/pdf_parse.py
from typing import Dict, Any

def parse_financial_report(pdf_path: str, sections: list | None = None) -> Dict[str, Any]:
    """
    Placeholder parser. Returns summary-like structure. In production, integrate PDF parsers.
    """
    if not pdf_path:
        return {"error": "pdf_path required"}
    return {"pdf_path": pdf_path, "sections_requested": sections or [], "content_summary": "parsed_content_placeholder"}
