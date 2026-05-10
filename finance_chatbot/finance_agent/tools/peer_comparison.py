# finance_agent/tools/peer_comparison.py
import logging
import datetime
from typing import Dict, Any, List, Optional
import numpy as np

logger = logging.getLogger(__name__)

USE_YFINANCE = False
try:
    import yfinance as yf
    USE_YFINANCE = True
except Exception:
    logger.warning("yfinance not available; peer_comparison will return limited data.")


# Predefined peer groups for common stocks
PEER_GROUPS = {
    # US Tech
    "AAPL": ["MSFT", "GOOGL", "META", "AMZN"],
    "MSFT": ["AAPL", "GOOGL", "META", "AMZN"],
    "GOOGL": ["AAPL", "MSFT", "META", "AMZN"],
    "META": ["AAPL", "MSFT", "GOOGL", "AMZN"],
    "AMZN": ["AAPL", "MSFT", "GOOGL", "META"],
    
    # Vietnam Banks
    "VCB.VN": ["BID.VN", "CTG.VN", "TCB.VN", "MBB.VN"],
    "BID.VN": ["VCB.VN", "CTG.VN", "TCB.VN", "MBB.VN"],
    "CTG.VN": ["VCB.VN", "BID.VN", "TCB.VN", "MBB.VN"],
    
    # Vietnam Consumer
    "VNM.VN": ["MSN.VN", "SAB.VN", "VHC.VN"],
    "MSN.VN": ["VNM.VN", "SAB.VN", "VHC.VN"],
    
    # Vietnam Real Estate
    "VHM.VN": ["VIC.VN", "NVL.VN", "DXG.VN"],
    "VIC.VN": ["VHM.VN", "NVL.VN", "DXG.VN"],
    
    # Vietnam Technology
    "FPT.VN": ["CMG.VN", "SAM.VN"],
}


def get_peers_for_ticker(ticker: str, sector: Optional[str] = None) -> List[str]:
    """Get list of peer tickers."""
    # Check predefined peer groups first
    ticker_upper = ticker.upper()
    if ticker_upper in PEER_GROUPS:
        return PEER_GROUPS[ticker_upper]
    
    # If sector is provided, try to find peers in same sector
    # This is a simplified approach - in production, use a proper stock screener API
    
    return []


def fetch_peer_metrics(ticker: str) -> Optional[Dict[str, Any]]:
    """Fetch key metrics for a single ticker."""
    if not USE_YFINANCE:
        return None
    
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        return {
            "ticker": ticker,
            "company_name": info.get("longName", ticker),
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE") or info.get("forwardPE"),
            "pb_ratio": info.get("priceToBook"),
            "ps_ratio": info.get("priceToSalesTrailing12Months"),
            "peg_ratio": info.get("pegRatio"),
            "roe": info.get("returnOnEquity"),
            "roa": info.get("returnOnAssets"),
            "net_margin": info.get("profitMargins"),
            "debt_to_equity": info.get("debtToEquity"),
            "current_ratio": info.get("currentRatio"),
            "revenue_growth": info.get("revenueGrowth"),
            "earnings_growth": info.get("earningsGrowth"),
            "beta": info.get("beta"),
            "dividend_yield": info.get("dividendYield"),
        }
    except Exception as e:
        logger.debug("Could not fetch metrics for %s: %s", ticker, e)
        return None


def calculate_rank(value: float, peer_values: List[float], higher_is_better: bool = True) -> Dict[str, Any]:
    """
    Calculate rank and percentile for a value among peers.
    
    Args:
        value: The value to rank
        peer_values: List of peer values (excluding the target value)
        higher_is_better: If True, higher values rank better
    
    Returns:
        Dictionary with rank, percentile, and comparison to peer average/median
    """
    if value is None:
        return {"rank": None, "percentile": None}
    
    # Filter out None values
    valid_peers = [v for v in peer_values if v is not None]
    if not valid_peers:
        return {"rank": None, "percentile": None}
    
    all_values = valid_peers + [value]
    
    if higher_is_better:
        sorted_values = sorted(all_values, reverse=True)
    else:
        sorted_values = sorted(all_values)
    
    rank = sorted_values.index(value) + 1
    percentile = (len(all_values) - rank) / len(all_values) * 100
    
    peer_avg = np.mean(valid_peers)
    peer_median = np.median(valid_peers)
    
    return {
        "rank": rank,
        "total": len(all_values),
        "percentile": round(percentile, 1),
        "peer_average": round(peer_avg, 4) if peer_avg else None,
        "peer_median": round(peer_median, 4) if peer_median else None,
        "vs_average": round((value - peer_avg) / peer_avg * 100, 2) if peer_avg else None,
    }


def compare_with_peers(
    ticker: str,
    top_n: int = 5,
    metrics: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Compare a stock with its peers.
    
    Args:
        ticker: Stock ticker to analyze
        top_n: Number of peers to include in comparison
        metrics: List of metrics to compare (if None, use all available)
    
    Returns:
        Comprehensive peer comparison analysis
    """
    if not USE_YFINANCE:
        return {
            "ticker": ticker,
            "error": "yfinance not available",
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
    
    try:
        # Fetch target company info
        target_stock = yf.Ticker(ticker)
        target_info = target_stock.info
        sector = target_info.get("sector")
        
        # Get peers
        peers = get_peers_for_ticker(ticker, sector)
        if not peers:
            return {
                "ticker": ticker,
                "error": "No peers found for this ticker",
                "sector": sector,
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        # Limit to top_n peers
        peers = peers[:top_n]
        
        # Fetch metrics for target and peers
        target_metrics = fetch_peer_metrics(ticker)
        if not target_metrics:
            return {
                "ticker": ticker,
                "error": "Could not fetch metrics for target ticker",
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        peer_metrics_list = []
        for peer_ticker in peers:
            peer_data = fetch_peer_metrics(peer_ticker)
            if peer_data:
                peer_metrics_list.append(peer_data)
        
        if not peer_metrics_list:
            return {
                "ticker": ticker,
                "error": "Could not fetch metrics for any peers",
                "peers_attempted": peers,
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        result = {
            "ticker": ticker,
            "company_name": target_metrics["company_name"],
            "sector": sector,
            "peers": [p["ticker"] for p in peer_metrics_list],
            "comparison": {},
            "summary": {},
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # Define metrics to compare and whether higher is better
        metrics_config = {
            "valuation": {
                "pe_ratio": {"higher_is_better": False, "label": "P/E Ratio"},
                "pb_ratio": {"higher_is_better": False, "label": "P/B Ratio"},
                "ps_ratio": {"higher_is_better": False, "label": "P/S Ratio"},
                "peg_ratio": {"higher_is_better": False, "label": "PEG Ratio"},
            },
            "profitability": {
                "roe": {"higher_is_better": True, "label": "ROE"},
                "roa": {"higher_is_better": True, "label": "ROA"},
                "net_margin": {"higher_is_better": True, "label": "Net Margin"},
            },
            "growth": {
                "revenue_growth": {"higher_is_better": True, "label": "Revenue Growth"},
                "earnings_growth": {"higher_is_better": True, "label": "Earnings Growth"},
            },
            "financial_health": {
                "debt_to_equity": {"higher_is_better": False, "label": "Debt to Equity"},
                "current_ratio": {"higher_is_better": True, "label": "Current Ratio"},
            },
            "market": {
                "market_cap": {"higher_is_better": True, "label": "Market Cap"},
                "beta": {"higher_is_better": False, "label": "Beta"},
            }
        }
        
        # Filter metrics if specified
        if metrics:
            filtered_config = {}
            for category, category_metrics in metrics_config.items():
                filtered_metrics = {k: v for k, v in category_metrics.items() if k in metrics}
                if filtered_metrics:
                    filtered_config[category] = filtered_metrics
            metrics_config = filtered_config
        
        # Calculate rankings for each metric
        strengths = []
        weaknesses = []
        total_rank_sum = 0
        total_metrics_count = 0
        
        for category, category_metrics in metrics_config.items():
            result["comparison"][category] = {}
            
            for metric_name, metric_config in category_metrics.items():
                target_value = target_metrics.get(metric_name)
                peer_values = [p.get(metric_name) for p in peer_metrics_list]
                
                ranking = calculate_rank(
                    target_value,
                    peer_values,
                    metric_config["higher_is_better"]
                )
                
                result["comparison"][category][metric_name] = {
                    "value": target_value,
                    "label": metric_config["label"],
                    **ranking
                }
                
                # Track strengths and weaknesses
                if ranking.get("rank"):
                    total_rank_sum += ranking["rank"]
                    total_metrics_count += 1
                    
                    if ranking["rank"] == 1:
                        strengths.append(metric_config["label"])
                    elif ranking["rank"] == ranking.get("total"):
                        weaknesses.append(metric_config["label"])
        
        # Calculate overall rank
        if total_metrics_count > 0:
            avg_rank = total_rank_sum / total_metrics_count
            result["summary"]["average_rank"] = round(avg_rank, 2)
            result["summary"]["total_peers"] = len(peer_metrics_list) + 1
            
            # Determine competitive position
            if avg_rank <= 2:
                position = "leader"
            elif avg_rank <= len(peer_metrics_list) / 2 + 1:
                position = "average"
            else:
                position = "laggard"
            
            result["summary"]["competitive_position"] = position
        
        result["summary"]["strengths"] = strengths
        result["summary"]["weaknesses"] = weaknesses
        
        # Add interpretation
        if strengths and not weaknesses:
            result["summary"]["interpretation"] = f"{ticker} is a strong performer across most metrics compared to peers."
        elif weaknesses and not strengths:
            result["summary"]["interpretation"] = f"{ticker} underperforms peers on most metrics."
        elif strengths and weaknesses:
            result["summary"]["interpretation"] = f"{ticker} shows mixed performance - strong in {', '.join(strengths[:2])} but weak in {', '.join(weaknesses[:2])}."
        else:
            result["summary"]["interpretation"] = f"{ticker} performs comparably to peers across most metrics."
        
        return result
        
    except Exception as e:
        logger.exception("Error in peer comparison for %s: %s", ticker, e)
        return {
            "ticker": ticker,
            "error": str(e),
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
