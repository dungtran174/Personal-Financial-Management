# finance_agent/tools/income_statement.py
"""
Tool: get_income_statement
Mô tả: Lấy báo cáo kết quả kinh doanh (Income Statement / Profit & Loss)
Data source: yfinance
"""

from typing import Dict, Any, Optional
from datetime import datetime
import yfinance as yf
import pandas as pd


def get_income_statement(ticker: str, period: str = "annual") -> Dict[str, Any]:
    """
    Lấy báo cáo kết quả kinh doanh của công ty.
    
    Args:
        ticker: Mã cổ phiếu (e.g., "AAPL", "FPT.VN")
        period: "annual" hoặc "quarterly"
    
    Returns:
        Dict chứa income statement data
    
    Examples:
        >>> get_income_statement("AAPL", "annual")
        >>> get_income_statement("FPT.VN", "quarterly")
    """
    try:
        stock = yf.Ticker(ticker)
        
        # Get income statement
        if period.lower() == "quarterly":
            income_stmt = stock.quarterly_income_stmt
        else:
            income_stmt = stock.income_stmt
        
        if income_stmt is None or income_stmt.empty:
            return {
                "status": "error",
                "ticker": ticker,
                "error": "No income statement data available",
                "timestamp": datetime.now().isoformat()
            }
        
        # Convert to dict format
        # Transpose so columns are dates and rows are metrics
        income_dict = income_stmt.to_dict()
        
        # Get latest period data
        latest_date = income_stmt.columns[0]
        latest_data = {}
        
        # Key metrics to extract
        key_metrics = [
            "Total Revenue",
            "Cost Of Revenue", 
            "Gross Profit",
            "Operating Expense",
            "Operating Income",
            "EBIT",
            "EBITDA",
            "Interest Expense",
            "Pretax Income",
            "Tax Provision",
            "Net Income",
            "Diluted EPS",
            "Basic EPS"
        ]
        
        for metric in key_metrics:
            if metric in income_stmt.index:
                value = income_stmt.loc[metric, latest_date]
                if pd.notna(value):
                    latest_data[metric] = float(value)
        
        # Calculate margins if we have revenue
        if "Total Revenue" in latest_data and latest_data["Total Revenue"] != 0:
            revenue = latest_data["Total Revenue"]
            
            if "Gross Profit" in latest_data:
                latest_data["Gross Margin %"] = round((latest_data["Gross Profit"] / revenue) * 100, 2)
            
            if "Operating Income" in latest_data:
                latest_data["Operating Margin %"] = round((latest_data["Operating Income"] / revenue) * 100, 2)
            
            if "Net Income" in latest_data:
                latest_data["Net Margin %"] = round((latest_data["Net Income"] / revenue) * 100, 2)
        
        # Historical data (last 4 periods)
        historical = []
        for col in income_stmt.columns[:4]:
            period_data = {"date": col.strftime("%Y-%m-%d")}
            
            # Get key metrics for this period
            for metric in ["Total Revenue", "Gross Profit", "Operating Income", "Net Income"]:
                if metric in income_stmt.index:
                    value = income_stmt.loc[metric, col]
                    if pd.notna(value):
                        period_data[metric] = float(value)
            
            historical.append(period_data)
        
        # Calculate YoY growth if we have at least 2 years
        growth_metrics = {}
        if len(historical) >= 2:
            for metric in ["Total Revenue", "Net Income"]:
                if metric in historical[0] and metric in historical[1]:
                    current = historical[0][metric]
                    previous = historical[1][metric]
                    if previous != 0:
                        growth = ((current - previous) / abs(previous)) * 100
                        growth_metrics[f"{metric} Growth %"] = round(growth, 2)
        
        return {
            "status": "success",
            "ticker": ticker,
            "period": period,
            "company_name": stock.info.get("longName", ticker),
            "latest_period": latest_date.strftime("%Y-%m-%d"),
            "latest_data": latest_data,
            "historical": historical,
            "growth_metrics": growth_metrics,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "ticker": ticker,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def get_revenue_breakdown(ticker: str) -> Dict[str, Any]:
    """
    Lấy chi tiết doanh thu (nếu có).
    
    Args:
        ticker: Mã cổ phiếu
    
    Returns:
        Dict chứa revenue breakdown
    """
    try:
        stock = yf.Ticker(ticker)
        income_stmt = stock.income_stmt
        
        if income_stmt is None or income_stmt.empty:
            return {
                "status": "error",
                "error": "No data available",
                "timestamp": datetime.now().isoformat()
            }
        
        latest_date = income_stmt.columns[0]
        
        # Extract revenue-related metrics
        revenue_items = {}
        for idx in income_stmt.index:
            if "Revenue" in idx or "Sales" in idx:
                value = income_stmt.loc[idx, latest_date]
                if pd.notna(value):
                    revenue_items[idx] = float(value)
        
        return {
            "status": "success",
            "ticker": ticker,
            "latest_period": latest_date.strftime("%Y-%m-%d"),
            "revenue_breakdown": revenue_items,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
