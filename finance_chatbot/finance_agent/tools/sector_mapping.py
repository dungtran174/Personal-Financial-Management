# finance_agent/tools/sector_mapping.py
"""
Tool: get_sector_mapping
Mô tả: Lấy thông tin ngành nghề của công ty
Data source: yfinance
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
import yfinance as yf


def get_sector_mapping(ticker: str) -> Dict[str, Any]:
    """
    Lấy thông tin ngành nghề (sector, industry) của công ty.
    
    Args:
        ticker: Mã cổ phiếu (e.g., "AAPL", "FPT.VN")
    
    Returns:
        Dict chứa sector và industry information
    
    Examples:
        >>> get_sector_mapping("AAPL")
        >>> get_sector_mapping("MSFT")
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        if not info:
            return {
                "status": "error",
                "ticker": ticker,
                "error": "Could not retrieve company information",
                "timestamp": datetime.now().isoformat()
            }
        
        sector = info.get("sector", "Unknown")
        industry = info.get("industry", "Unknown")
        industry_key = info.get("industryKey", None)
        sector_key = info.get("sectorKey", None)
        
        # Get additional classification info
        company_info = {
            "company_name": info.get("longName", info.get("shortName", ticker)),
            "sector": sector,
            "industry": industry,
            "industry_key": industry_key,
            "sector_key": sector_key,
            "country": info.get("country", "Unknown"),
            "business_summary": info.get("longBusinessSummary", "")[:200] + "..." if info.get("longBusinessSummary") else None
        }
        
        # Try to get sub-industry or more specific classification
        if "industryDisp" in info:
            company_info["industry_display"] = info["industryDisp"]
        
        if "sectorDisp" in info:
            company_info["sector_display"] = info["sectorDisp"]
        
        return {
            "status": "success",
            "ticker": ticker,
            "classification": company_info,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "ticker": ticker,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def get_sector_peers(ticker: str, max_peers: int = 5) -> Dict[str, Any]:
    """
    Lấy danh sách công ty cùng ngành.
    
    Note: This is a simplified version. For production, should use a proper
    company database or API that provides industry peers.
    
    Args:
        ticker: Mã cổ phiếu
        max_peers: Số lượng peers tối đa
    
    Returns:
        Dict chứa thông tin peers
    """
    try:
        # Get sector info for the ticker
        sector_info = get_sector_mapping(ticker)
        
        if sector_info["status"] != "success":
            return sector_info
        
        sector = sector_info["classification"]["sector"]
        industry = sector_info["classification"]["industry"]
        
        # Predefined peer groups for common companies
        # In production, this should come from a database
        PEER_GROUPS = {
            # Tech companies
            "AAPL": ["MSFT", "GOOGL", "META", "NVDA"],
            "MSFT": ["AAPL", "GOOGL", "AMZN", "META"],
            "GOOGL": ["AAPL", "MSFT", "META", "AMZN"],
            "META": ["GOOGL", "SNAP", "PINS", "TWTR"],
            "NVDA": ["AMD", "INTC", "QCOM", "TSM"],
            
            # Vietnamese stocks
            "FPT": ["CMG", "SAM", "VGI"],
            "VCB": ["TCB", "BID", "CTG", "VPB"],
            "VNM": ["MSN", "VHC", "SAB"],
            "HPG": ["HSG", "NKG", "TLH"],
        }
        
        ticker_base = ticker.replace(".VN", "").replace(".HNX", "")
        peers = PEER_GROUPS.get(ticker_base, [])
        
        return {
            "status": "success",
            "ticker": ticker,
            "sector": sector,
            "industry": industry,
            "peers": peers[:max_peers],
            "note": "Peer list based on predefined mapping. For comprehensive peer analysis, use dedicated peer discovery service.",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "ticker": ticker,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def get_all_sectors() -> Dict[str, Any]:
    """
    Lấy danh sách tất cả các sectors phổ biến.
    
    Returns:
        Dict chứa danh sách sectors
    """
    # GICS sectors (Global Industry Classification Standard)
    sectors = [
        "Technology",
        "Healthcare",
        "Financial Services",
        "Consumer Cyclical",
        "Consumer Defensive",
        "Industrials",
        "Energy",
        "Basic Materials",
        "Real Estate",
        "Utilities",
        "Communication Services"
    ]
    
    return {
        "status": "success",
        "sectors": sectors,
        "standard": "GICS (Global Industry Classification Standard)",
        "timestamp": datetime.now().isoformat()
    }
