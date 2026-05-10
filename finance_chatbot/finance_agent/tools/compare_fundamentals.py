# finance_agent/tools/compare_fundamentals.py
"""
Tool: compare_fundamentals
Mô tả: So sánh chỉ số tài chính cơ bản giữa các công ty
Data source: yfinance + fundamentals.py
"""

from typing import Dict, Any, List
from datetime import datetime
import yfinance as yf
from .fundamentals import get_fundamentals
from .ratios import calculate_ratios
from .advanced_ratios import get_advanced_ratios


def compare_fundamentals(tickers: List[str], metrics: List[str] = None) -> Dict[str, Any]:
    """
    So sánh chỉ số tài chính giữa nhiều công ty.
    
    Args:
        tickers: List các mã cổ phiếu cần so sánh
        metrics: List các chỉ số cần so sánh (optional). 
                 Nếu None, sẽ so sánh các chỉ số cơ bản.
    
    Returns:
        Dict chứa kết quả so sánh
    
    Examples:
        >>> compare_fundamentals(["AAPL", "MSFT", "GOOGL"])
        >>> compare_fundamentals(["FPT", "CMG"], ["ROE", "ROA", "P/E"])
    """
    try:
        if not tickers or len(tickers) < 2:
            return {
                "status": "error",
                "error": "Need at least 2 tickers to compare",
                "timestamp": datetime.now().isoformat()
            }
        
        # Default metrics to compare
        if metrics is None:
            metrics = [
                "Market Cap",
                "P/E Ratio",
                "P/B Ratio",
                "ROE",
                "ROA",
                "Debt to Equity",
                "Current Ratio",
                "Net Margin",
                "Revenue Growth"
            ]
        
        comparison_data = {}
        
        for ticker in tickers:
            try:
                stock = yf.Ticker(ticker)
                info = stock.info
                
                # Get fundamental data
                fundamentals = get_fundamentals(ticker)
                ratios = calculate_ratios(ticker)
                advanced = get_advanced_ratios(ticker)
                
                company_metrics = {
                    "company_name": info.get("longName", ticker),
                    "sector": info.get("sector", "Unknown"),
                    "country": info.get("country", "Unknown")
                }
                
                # Extract metrics from different sources
                # Market Cap
                if fundamentals.get("status") == "success":
                    snapshot = fundamentals.get("snapshot", {})
                    company_metrics["Market Cap"] = snapshot.get("marketCap", None)
                    company_metrics["EPS"] = snapshot.get("eps", None)
                
                # Ratios
                if ratios.get("status") == "success":
                    ratio_data = ratios.get("ratios", {})
                    company_metrics["P/E Ratio"] = ratio_data.get("pe", None)
                    company_metrics["ROE"] = ratio_data.get("roe", None)
                
                # Advanced ratios
                if advanced.get("status") == "success":
                    valuation = advanced.get("valuation", {})
                    leverage = advanced.get("leverage", {})
                    liquidity = advanced.get("liquidity", {})
                    profitability = advanced.get("profitability", {})
                    
                    company_metrics["P/B Ratio"] = valuation.get("price_to_book", None)
                    company_metrics["P/S Ratio"] = valuation.get("price_to_sales", None)
                    company_metrics["Debt to Equity"] = leverage.get("debt_to_equity", None)
                    company_metrics["Current Ratio"] = liquidity.get("current_ratio", None)
                    company_metrics["ROA"] = profitability.get("return_on_assets", None)
                    company_metrics["Net Margin"] = profitability.get("net_margin", None)
                    company_metrics["Gross Margin"] = profitability.get("gross_margin", None)
                
                # Additional info from yfinance
                company_metrics["Beta"] = info.get("beta", None)
                company_metrics["Dividend Yield"] = info.get("dividendYield", None)
                
                # Revenue growth (if available)
                try:
                    financials = stock.financials
                    if financials is not None and not financials.empty:
                        if "Total Revenue" in financials.index and len(financials.columns) >= 2:
                            current_rev = financials.loc["Total Revenue", financials.columns[0]]
                            prev_rev = financials.loc["Total Revenue", financials.columns[1]]
                            if prev_rev != 0:
                                growth = ((current_rev - prev_rev) / abs(prev_rev)) * 100
                                company_metrics["Revenue Growth"] = round(growth, 2)
                except:
                    pass
                
                comparison_data[ticker] = company_metrics
                
            except Exception as e:
                comparison_data[ticker] = {
                    "error": str(e),
                    "company_name": ticker
                }
        
        # Analyze comparison - find best/worst for each metric
        analysis = {}
        
        for metric in metrics:
            values = {}
            for ticker, data in comparison_data.items():
                if metric in data and data[metric] is not None:
                    try:
                        values[ticker] = float(data[metric])
                    except (ValueError, TypeError):
                        pass
            
            if values:
                # Determine if higher is better or lower is better
                higher_is_better = metric in [
                    "Market Cap", "ROE", "ROA", "Current Ratio", 
                    "Net Margin", "Gross Margin", "Revenue Growth", "EPS"
                ]
                
                if higher_is_better:
                    best_ticker = max(values, key=values.get)
                    worst_ticker = min(values, key=values.get)
                else:
                    best_ticker = min(values, key=values.get)
                    worst_ticker = max(values, key=values.get)
                
                analysis[metric] = {
                    "best": {
                        "ticker": best_ticker,
                        "value": values[best_ticker],
                        "company": comparison_data[best_ticker]["company_name"]
                    },
                    "worst": {
                        "ticker": worst_ticker,
                        "value": values[worst_ticker],
                        "company": comparison_data[worst_ticker]["company_name"]
                    },
                    "average": round(sum(values.values()) / len(values), 2)
                }
        
        # Generate summary
        summary = []
        for metric, data in analysis.items():
            summary.append(
                f"{data['best']['company']} leads in {metric} with {data['best']['value']}"
            )
        
        return {
            "status": "success",
            "tickers": tickers,
            "comparison": comparison_data,
            "analysis": analysis,
            "summary": summary[:5],  # Top 5 insights
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def compare_two_stocks(ticker1: str, ticker2: str) -> Dict[str, Any]:
    """
    So sánh chi tiết giữa 2 cổ phiếu.
    
    Args:
        ticker1: Mã cổ phiếu thứ nhất
        ticker2: Mã cổ phiếu thứ hai
    
    Returns:
        Dict chứa so sánh chi tiết
    """
    result = compare_fundamentals([ticker1, ticker2])
    
    if result["status"] != "success":
        return result
    
    # Add head-to-head comparison
    comparison = result["comparison"]
    
    wins = {ticker1: 0, ticker2: 0}
    
    for metric, data in result["analysis"].items():
        best = data["best"]["ticker"]
        if best in wins:
            wins[best] += 1
    
    winner = ticker1 if wins[ticker1] > wins[ticker2] else ticker2
    
    result["head_to_head"] = {
        "winner": winner,
        "scores": wins,
        "interpretation": f"{winner} wins in {wins[winner]} out of {len(result['analysis'])} metrics"
    }
    
    return result
