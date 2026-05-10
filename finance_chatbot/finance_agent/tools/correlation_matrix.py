"""
Tool: get_correlation_matrix
Mô tả: Tính ma trận tương quan giữa các cổ phiếu
Data source: yfinance historical data

Correlation types supported:
- Pearson (default)
- Spearman
- Kendall
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
import numpy as np


def get_correlation_matrix(
    symbols: List[str],
    period: str = "1y",
    method: str = "pearson",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Tính ma trận tương quan giữa các cổ phiếu.
    
    Args:
        symbols: List mã cổ phiếu
        period: Khoảng thời gian ("1mo", "3mo", "6mo", "1y", "2y", "5y")
        method: Phương pháp tính ("pearson", "spearman", "kendall")
        start_date: Ngày bắt đầu (YYYY-MM-DD), override period
        end_date: Ngày kết thúc (YYYY-MM-DD)
    
    Returns:
        Dict chứa correlation matrix và thống kê
    
    Examples:
        >>> get_correlation_matrix(["FPT.VN", "VCB.VN", "MWG.VN"], period="1y")
        >>> get_correlation_matrix(["AAPL", "MSFT", "GOOGL"], period="6mo", method="spearman")
    """
    try:
        # Validate inputs
        if not symbols or len(symbols) < 2:
            return {
                "status": "error",
                "error": "At least 2 symbols required",
                "timestamp": datetime.now().isoformat()
            }
        
        if method not in ["pearson", "spearman", "kendall"]:
            return {
                "status": "error",
                "error": f"Invalid method: {method}",
                "available_methods": ["pearson", "spearman", "kendall"],
                "timestamp": datetime.now().isoformat()
            }
        
        # Set date range
        if end_date is None:
            end_date = datetime.now().strftime("%Y-%m-%d")
        
        if start_date is None:
            # Map period to days
            period_map = {
                "1mo": 30,
                "3mo": 90,
                "6mo": 180,
                "1y": 365,
                "2y": 730,
                "5y": 1825
            }
            days = period_map.get(period, 365)
            start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        
        # Download data
        data = {}
        failed_symbols = []
        
        for symbol in symbols:
            try:
                ticker = yf.Ticker(symbol)
                hist = ticker.history(start=start_date, end=end_date)
                
                if hist.empty:
                    failed_symbols.append(symbol)
                else:
                    data[symbol] = hist['Close']
            except Exception as e:
                failed_symbols.append(symbol)
        
        if len(data) < 2:
            return {
                "status": "error",
                "error": "Insufficient valid data",
                "failed_symbols": failed_symbols,
                "timestamp": datetime.now().isoformat()
            }
        
        # Create DataFrame
        df = pd.DataFrame(data)
        df = df.dropna()
        
        if len(df) < 10:
            return {
                "status": "error",
                "error": "Insufficient data points (minimum 10 required)",
                "data_points": len(df),
                "timestamp": datetime.now().isoformat()
            }
        
        # Calculate returns
        returns = df.pct_change().dropna()
        
        # Calculate correlation matrix
        corr_matrix = returns.corr(method=method)
        
        # Convert to dict format
        correlation_data = {}
        for symbol1 in corr_matrix.index:
            correlation_data[symbol1] = {}
            for symbol2 in corr_matrix.columns:
                correlation_data[symbol1][symbol2] = round(corr_matrix.loc[symbol1, symbol2], 4)
        
        # Find highest and lowest correlations (excluding self-correlation)
        pairs = []
        for i, symbol1 in enumerate(symbols):
            for symbol2 in symbols[i+1:]:
                if symbol1 in corr_matrix.index and symbol2 in corr_matrix.columns:
                    corr_value = corr_matrix.loc[symbol1, symbol2]
                    pairs.append({
                        "pair": f"{symbol1} - {symbol2}",
                        "correlation": round(corr_value, 4)
                    })
        
        # Sort pairs
        pairs_sorted = sorted(pairs, key=lambda x: abs(x['correlation']), reverse=True)
        
        # Statistics
        corr_values = [p['correlation'] for p in pairs]
        stats = {
            "mean": round(np.mean(corr_values), 4) if corr_values else 0,
            "median": round(np.median(corr_values), 4) if corr_values else 0,
            "std": round(np.std(corr_values), 4) if corr_values else 0,
            "min": round(min(corr_values), 4) if corr_values else 0,
            "max": round(max(corr_values), 4) if corr_values else 0
        }
        
        return {
            "status": "success",
            "symbols": list(data.keys()),
            "method": method,
            "period": {
                "start": start_date,
                "end": end_date,
                "data_points": len(df)
            },
            "correlation_matrix": correlation_data,
            "top_correlations": pairs_sorted[:5],
            "lowest_correlations": sorted(pairs, key=lambda x: x['correlation'])[:5],
            "statistics": stats,
            "failed_symbols": failed_symbols if failed_symbols else None,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def get_rolling_correlation(
    symbol1: str,
    symbol2: str,
    window: int = 30,
    period: str = "1y"
) -> Dict[str, Any]:
    """
    Tính correlation động theo thời gian (rolling correlation).
    
    Args:
        symbol1: Mã cổ phiếu 1
        symbol2: Mã cổ phiếu 2
        window: Số ngày cho rolling window
        period: Khoảng thời gian
    
    Returns:
        Dict chứa rolling correlation data
    """
    try:
        # Map period to days
        period_map = {
            "1mo": 30, "3mo": 90, "6mo": 180,
            "1y": 365, "2y": 730, "5y": 1825
        }
        days = period_map.get(period, 365)
        
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        end_date = datetime.now().strftime("%Y-%m-%d")
        
        # Download data
        ticker1 = yf.Ticker(symbol1)
        ticker2 = yf.Ticker(symbol2)
        
        hist1 = ticker1.history(start=start_date, end=end_date)
        hist2 = ticker2.history(start=start_date, end=end_date)
        
        if hist1.empty or hist2.empty:
            return {
                "status": "error",
                "error": f"No data for {symbol1} or {symbol2}",
                "timestamp": datetime.now().isoformat()
            }
        
        # Combine data
        df = pd.DataFrame({
            symbol1: hist1['Close'],
            symbol2: hist2['Close']
        }).dropna()
        
        # Calculate returns
        returns = df.pct_change().dropna()
        
        # Calculate rolling correlation
        rolling_corr = returns[symbol1].rolling(window=window).corr(returns[symbol2])
        rolling_corr = rolling_corr.dropna()
        
        # Convert to list format
        corr_data = []
        for date, corr in rolling_corr.items():
            corr_data.append({
                "date": date.strftime("%Y-%m-%d"),
                "correlation": round(corr, 4)
            })
        
        # Statistics
        current_corr = rolling_corr.iloc[-1] if len(rolling_corr) > 0 else 0
        avg_corr = rolling_corr.mean()
        
        return {
            "status": "success",
            "symbol1": symbol1,
            "symbol2": symbol2,
            "window": window,
            "period": period,
            "current_correlation": round(current_corr, 4),
            "average_correlation": round(avg_corr, 4),
            "data_points": len(corr_data),
            "rolling_data": corr_data[-90:],  # Last 90 points
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
