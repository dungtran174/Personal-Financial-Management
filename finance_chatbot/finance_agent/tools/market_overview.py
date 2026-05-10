# finance_agent/tools/market_overview.py
import logging
import datetime
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

USE_YFINANCE = False
try:
    import yfinance as yf
    USE_YFINANCE = True
except Exception:
    logger.warning("yfinance not available; market_overview will return limited data.")


# Major market indices
MARKET_INDICES = {
    "US": {
        "S&P 500": "^GSPC",
        "Dow Jones": "^DJI",
        "NASDAQ": "^IXIC",
        "Russell 2000": "^RUT"
    },
    "VN": {
        "VN-Index": "^VNI",
        "HNX-Index": "^HNX",
        "UPCOM-Index": "^UPCOM"
    },
    "ASIA": {
        "Nikkei 225": "^N225",
        "Hang Seng": "^HSI",
        "Shanghai": "000001.SS"
    },
    "EUROPE": {
        "FTSE 100": "^FTSE",
        "DAX": "^GDAXI",
        "CAC 40": "^FCHI"
    }
}


# Major sectors ETFs for sector performance
SECTOR_ETFS = {
    "Technology": "XLK",
    "Financials": "XLF",
    "Healthcare": "XLV",
    "Consumer Discretionary": "XLY",
    "Consumer Staples": "XLP",
    "Energy": "XLE",
    "Industrials": "XLI",
    "Materials": "XLB",
    "Real Estate": "XLRE",
    "Utilities": "XLU",
    "Communication Services": "XLC"
}


def fetch_index_data(ticker: str, name: str, period: str = "1d") -> Optional[Dict[str, Any]]:
    """Fetch current data for a market index."""
    if not USE_YFINANCE:
        return None
    
    try:
        index = yf.Ticker(ticker)
        hist = index.history(period=period)
        
        if hist.empty:
            return None
        
        current_price = float(hist["Close"].iloc[-1])
        
        # Calculate daily change
        if len(hist) > 1:
            prev_price = float(hist["Close"].iloc[-2])
            change = current_price - prev_price
            change_pct = (change / prev_price) * 100
        else:
            change = 0
            change_pct = 0
        
        return {
            "name": name,
            "ticker": ticker,
            "current_value": round(current_price, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2)
        }
    except Exception as e:
        logger.debug("Could not fetch data for %s: %s", ticker, e)
        return None


def fetch_sector_performance(period: str = "5d") -> Dict[str, Any]:
    """Fetch sector performance using sector ETFs."""
    if not USE_YFINANCE:
        return {}
    
    sector_data = {}
    
    for sector_name, etf_ticker in SECTOR_ETFS.items():
        try:
            etf = yf.Ticker(etf_ticker)
            hist = etf.history(period=period)
            
            if not hist.empty and len(hist) > 1:
                start_price = float(hist["Close"].iloc[0])
                end_price = float(hist["Close"].iloc[-1])
                
                change_pct = ((end_price - start_price) / start_price) * 100
                
                sector_data[sector_name] = {
                    "etf_ticker": etf_ticker,
                    "change_pct": round(change_pct, 2),
                    "current_price": round(end_price, 2)
                }
        except Exception as e:
            logger.debug("Could not fetch sector data for %s: %s", sector_name, e)
    
    return sector_data


def get_top_movers(market: str = "US", top_n: int = 5) -> Dict[str, List[Dict]]:
    """
    Get top gainers and losers. Note: This is simplified.
    In production, use a proper market screener API.
    """
    # This is a placeholder - yfinance doesn't have a built-in screener
    # You would need to use a different API like finnhub, alpha vantage, etc.
    
    return {
        "note": "Top movers feature requires additional market data API",
        "suggestion": "Consider integrating Finnhub, Alpha Vantage, or IEX Cloud API"
    }


def calculate_market_breadth(indices_data: List[Dict]) -> str:
    """Calculate market breadth based on how many indices are up vs down."""
    if not indices_data:
        return "unknown"
    
    up_count = sum(1 for idx in indices_data if idx.get("change_pct", 0) > 0)
    down_count = len(indices_data) - up_count
    
    if up_count > down_count * 2:
        return "strong positive"
    elif up_count > down_count:
        return "positive"
    elif down_count > up_count:
        return "negative"
    else:
        return "mixed"


def get_market_overview(
    market: str = "US",
    include_sectors: bool = True,
    period: str = "1d"
) -> Dict[str, Any]:
    """
    Get comprehensive market overview including indices and sector performance.
    
    Args:
        market: Market region ("US", "VN", "ASIA", "EUROPE", "ALL")
        include_sectors: Whether to include sector performance
        period: Time period for sector performance ("1d", "5d", "1mo")
    
    Returns:
        Market overview with indices and sector data
    """
    if not USE_YFINANCE:
        return {
            "error": "yfinance not available",
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
    
    try:
        result = {
            "market": market,
            "indices": {},
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # Determine which indices to fetch
        if market.upper() == "ALL":
            indices_to_fetch = {}
            for region, indices in MARKET_INDICES.items():
                indices_to_fetch.update(indices)
        elif market.upper() in MARKET_INDICES:
            indices_to_fetch = MARKET_INDICES[market.upper()]
        else:
            return {
                "error": f"Unknown market '{market}'. Available: US, VN, ASIA, EUROPE, ALL",
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        # Fetch index data
        indices_data = []
        for name, ticker in indices_to_fetch.items():
            index_data = fetch_index_data(ticker, name, period="5d")
            if index_data:
                result["indices"][name] = index_data
                indices_data.append(index_data)
        
        if not indices_data:
            return {
                "error": "Could not fetch any index data",
                "market": market,
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        # Calculate market breadth
        result["market_breadth"] = calculate_market_breadth(indices_data)
        
        # Market summary
        avg_change = sum(idx["change_pct"] for idx in indices_data) / len(indices_data)
        result["summary"] = {
            "average_change_pct": round(avg_change, 2),
            "indices_up": sum(1 for idx in indices_data if idx["change_pct"] > 0),
            "indices_down": sum(1 for idx in indices_data if idx["change_pct"] < 0),
            "total_indices": len(indices_data)
        }
        
        # Fetch sector performance if requested
        if include_sectors and market.upper() in ["US", "ALL"]:
            sector_data = fetch_sector_performance(period)
            if sector_data:
                result["sectors"] = sector_data
                
                # Find best and worst performing sectors
                sorted_sectors = sorted(
                    sector_data.items(),
                    key=lambda x: x[1]["change_pct"],
                    reverse=True
                )
                
                if sorted_sectors:
                    result["top_sectors"] = {
                        "best_performing": sorted_sectors[0][0],
                        "best_performance_pct": sorted_sectors[0][1]["change_pct"],
                        "worst_performing": sorted_sectors[-1][0],
                        "worst_performance_pct": sorted_sectors[-1][1]["change_pct"]
                    }
        
        # Interpretation
        if avg_change > 1.0:
            sentiment = "Strong bullish sentiment across markets."
        elif avg_change > 0.3:
            sentiment = "Positive market sentiment."
        elif avg_change > -0.3:
            sentiment = "Mixed market sentiment - relatively flat."
        elif avg_change > -1.0:
            sentiment = "Negative market sentiment."
        else:
            sentiment = "Strong bearish sentiment across markets."
        
        result["interpretation"] = sentiment
        
        return result
        
    except Exception as e:
        logger.exception("Error fetching market overview: %s", e)
        return {
            "error": str(e),
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
