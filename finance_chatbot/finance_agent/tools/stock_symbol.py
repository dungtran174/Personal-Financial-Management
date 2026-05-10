# finance_agent/tools/stock_symbol.py
from __future__ import annotations
import logging
import os
import re
import json
import datetime
import certifi
import ssl
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Ensure certifi used by requests/urllib3
os.environ.setdefault("SSL_CERT_FILE", certifi.where())

# --- Optional deps ---
USE_YFINANCE = False
try:
    import yfinance as yf  # type: ignore
    USE_YFINANCE = True
except Exception:
    logger.info("yfinance not available; stock_symbol tool will skip validation.")

try:
    from .google_search import google_search  # type: ignore
    HAS_GOOGLE_SEARCH = True
except Exception:
    HAS_GOOGLE_SEARCH = False
    logger.debug("google_search tool not available.")

try:
    from ..gemini_wrapper import GeminiWrapper  # type: ignore
    HAS_GEMINI = True
except Exception:
    try:
        from finance_agent.gemini_wrapper import GeminiWrapper
        HAS_GEMINI = True
    except Exception:
        HAS_GEMINI = False


def _build_result(
    company_name: str,
    ticker: Optional[str],
    source: str,
    raw: Optional[str] = None,
    confidence: float = 0.0,
    error: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "company_name": company_name,
        "ticker": ticker,
        "source": source,
        "raw": raw,
        "confidence": confidence,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "error": error,
    }


# --- Regex heuristics ---
_UPPER_TOKEN_RE = re.compile(r"\b([A-Z]{1,5})\b")
_VN_TOKEN_RE = re.compile(r"\b([A-Z0-9]{1,6}\.VN)\b", re.IGNORECASE)
_TICKER_LABEL_RE = re.compile(r"(?:ticker|symbol)[:\s]*([A-Z0-9\.\-]{1,8})", re.IGNORECASE)


def _candidates_from_text(text: str) -> List[str]:
    """Extract plausible ticker symbols from text."""
    if not text:
        return []
    candidates = []
    for m in _TICKER_LABEL_RE.finditer(text):
        candidates.append(m.group(1).upper())
    for m in _VN_TOKEN_RE.finditer(text):
        candidates.append(m.group(1).upper())
    for m in _UPPER_TOKEN_RE.finditer(text):
        tok = m.group(1).upper()
        if len(tok) > 1:  # skip one-letter noise
            candidates.append(tok)
    # dedupe while preserving order
    seen, out = set(), []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


def _validate_with_yfinance(symbol: str) -> Dict[str, Any]:
    """Check if ticker has market data in yfinance."""
    if not USE_YFINANCE:
        return {"ok": False, "symbol_used": symbol, "price": None, "error": "yfinance unavailable"}
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period="1d")
        if hist is not None and not hist.empty:
            return {"ok": True, "symbol_used": symbol, "price": float(hist["Close"].iloc[-1])}
        # try .VN fallback for Vietnam
        if not symbol.upper().endswith(".VN"):
            sym2 = f"{symbol}.VN"
            t2 = yf.Ticker(sym2)
            hist2 = t2.history(period="1d")
            if hist2 is not None and not hist2.empty:
                return {"ok": True, "symbol_used": sym2, "price": float(hist2["Close"].iloc[-1])}
        return {"ok": False, "symbol_used": symbol, "price": None, "error": "no data"}
    except Exception as e:
        return {"ok": False, "symbol_used": symbol, "price": None, "error": str(e)}


def get_stock_symbol(company_name: str, country: Optional[str] = None) -> Dict[str, Any]:
    """
    Resolve a company name to a stock ticker symbol.

    Strategy:
      1) Try google_search("company_name stock ticker"), extract candidates.
      2) Validate candidates with yfinance.
      3) If nothing, ask GeminiWrapper for a ticker guess.
      4) Return structured dict.
    """
    company = (company_name or "").strip()
    if not company:
        return _build_result(company, None, "invalid", confidence=0.0, error="company_name required")

    raw_text, candidates = None, []

    # --- Step 1: Web search ---
    if HAS_GOOGLE_SEARCH:
        try:
            q = f"{company} stock ticker"
            if country and country.lower() in ("vn", "vietnam", "việt nam", "viet nam"):
                q = f"mã cổ phiếu {company}"
            raw_text = google_search(q)
            if isinstance(raw_text, dict):
                raw_text = " ".join(raw_text.values())
            candidates = _candidates_from_text(str(raw_text))
        except Exception as e:
            logger.debug("google_search failed: %s", e)

    # --- Step 2: Validate candidates ---
    for cand in candidates:
        v = _validate_with_yfinance(cand)
        if v.get("ok"):
            return _build_result(company, v["symbol_used"], "google_search+yfinance", raw=raw_text, confidence=0.95)

    if candidates:
        return _build_result(company, candidates[0], "google_search", raw=raw_text, confidence=0.4, error="not validated")

    # --- Step 3: LLM fallback ---
    if HAS_GEMINI:
        try:
            gw = GeminiWrapper(model="google/gemini-2.5-flash")
            prompt = (
                f"What is the stock ticker symbol for '{company}'"
                + (f" ({country})" if country else "")
                + "? Reply with only the ticker symbol."
            )
            msgs = [{"role": "user", "content": prompt}]
            out = gw.generate(msgs, tools=None)
            text = (out.get("text") or "").strip().upper()
            cands = _candidates_from_text(text) or ([text] if text else [])
            if cands:
                v = _validate_with_yfinance(cands[0])
                if v.get("ok"):
                    return _build_result(company, v["symbol_used"], "llm+yfinance", raw=text, confidence=0.9)
                return _build_result(company, cands[0], "llm", raw=text, confidence=0.3, error="not validated")
        except Exception as e:
            logger.debug("LLM fallback failed: %s", e)

    # --- Step 4: Fail ---
    return _build_result(company, None, "none", confidence=0.0, error="ticker not found")
