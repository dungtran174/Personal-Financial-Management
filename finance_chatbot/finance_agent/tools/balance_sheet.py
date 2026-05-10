# finance_agent/tools/balance_sheet.py
"""
Tool: get_balance_sheet
Mô tả: Lấy bảng cân đối kế toán (Balance Sheet)
Data source: yfinance
"""

from typing import Dict, Any, Optional
from datetime import datetime
import yfinance as yf
import pandas as pd


def get_balance_sheet(ticker: str, period: str = "annual") -> Dict[str, Any]:
    """
    Lấy bảng cân đối kế toán của công ty.
    
    Args:
        ticker: Mã cổ phiếu (e.g., "AAPL", "FPT.VN")
        period: "annual" hoặc "quarterly"
    
    Returns:
        Dict chứa balance sheet data
    
    Examples:
        >>> get_balance_sheet("AAPL", "annual")
        >>> get_balance_sheet("MSFT", "quarterly")
    """
    try:
        stock = yf.Ticker(ticker)
        
        # Get balance sheet
        if period.lower() == "quarterly":
            balance_sheet = stock.quarterly_balance_sheet
        else:
            balance_sheet = stock.balance_sheet
        
        if balance_sheet is None or balance_sheet.empty:
            return {
                "status": "error",
                "ticker": ticker,
                "error": "No balance sheet data available",
                "timestamp": datetime.now().isoformat()
            }
        
        # Get latest period data
        latest_date = balance_sheet.columns[0]
        latest_data = {}
        
        # Key metrics to extract - ASSETS
        asset_metrics = [
            "Cash And Cash Equivalents",
            "Short Term Investments",
            "Accounts Receivable",
            "Inventory",
            "Current Assets",
            "Net PPE",
            "Goodwill",
            "Intangible Assets",
            "Total Assets"
        ]
        
        # Key metrics - LIABILITIES
        liability_metrics = [
            "Accounts Payable",
            "Short Term Debt",
            "Current Liabilities",
            "Long Term Debt",
            "Total Liabilities Net Minority Interest"
        ]
        
        # Key metrics - EQUITY
        equity_metrics = [
            "Common Stock",
            "Retained Earnings",
            "Total Equity Gross Minority Interest",
            "Stockholders Equity"
        ]
        
        assets = {}
        liabilities = {}
        equity = {}
        
        # Extract assets
        for metric in asset_metrics:
            if metric in balance_sheet.index:
                value = balance_sheet.loc[metric, latest_date]
                if pd.notna(value):
                    assets[metric] = float(value)
        
        # Extract liabilities
        for metric in liability_metrics:
            if metric in balance_sheet.index:
                value = balance_sheet.loc[metric, latest_date]
                if pd.notna(value):
                    liabilities[metric] = float(value)
        
        # Extract equity
        for metric in equity_metrics:
            if metric in balance_sheet.index:
                value = balance_sheet.loc[metric, latest_date]
                if pd.notna(value):
                    equity[metric] = float(value)
        
        # Calculate key ratios
        ratios = {}
        
        # Current Ratio
        if "Current Assets" in assets and "Current Liabilities" in liabilities:
            if liabilities["Current Liabilities"] != 0:
                ratios["Current Ratio"] = round(assets["Current Assets"] / liabilities["Current Liabilities"], 2)
        
        # Debt to Equity
        total_debt = liabilities.get("Long Term Debt", 0) + liabilities.get("Short Term Debt", 0)
        total_equity = equity.get("Stockholders Equity", equity.get("Total Equity Gross Minority Interest", 0))
        
        if total_equity != 0 and total_debt > 0:
            ratios["Debt to Equity"] = round(total_debt / total_equity, 2)
        
        # Asset composition %
        if "Total Assets" in assets and assets["Total Assets"] != 0:
            total_assets = assets["Total Assets"]
            composition = {}
            
            if "Current Assets" in assets:
                composition["Current Assets %"] = round((assets["Current Assets"] / total_assets) * 100, 1)
            if "Net PPE" in assets:
                composition["Fixed Assets %"] = round((assets["Net PPE"] / total_assets) * 100, 1)
            
            ratios["Asset Composition"] = composition
        
        # Historical comparison (last 4 periods)
        historical = []
        for col in balance_sheet.columns[:4]:
            period_data = {"date": col.strftime("%Y-%m-%d")}
            
            # Get key metrics
            if "Total Assets" in balance_sheet.index:
                value = balance_sheet.loc["Total Assets", col]
                if pd.notna(value):
                    period_data["Total Assets"] = float(value)
            
            if "Total Liabilities Net Minority Interest" in balance_sheet.index:
                value = balance_sheet.loc["Total Liabilities Net Minority Interest", col]
                if pd.notna(value):
                    period_data["Total Liabilities"] = float(value)
            
            for equity_metric in ["Stockholders Equity", "Total Equity Gross Minority Interest"]:
                if equity_metric in balance_sheet.index:
                    value = balance_sheet.loc[equity_metric, col]
                    if pd.notna(value):
                        period_data["Total Equity"] = float(value)
                        break
            
            historical.append(period_data)
        
        return {
            "status": "success",
            "ticker": ticker,
            "period": period,
            "company_name": stock.info.get("longName", ticker),
            "latest_period": latest_date.strftime("%Y-%m-%d"),
            "assets": assets,
            "liabilities": liabilities,
            "equity": equity,
            "ratios": ratios,
            "historical": historical,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "ticker": ticker,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def get_working_capital(ticker: str) -> Dict[str, Any]:
    """
    Tính vốn lưu động (Working Capital).
    
    Args:
        ticker: Mã cổ phiếu
    
    Returns:
        Dict chứa working capital analysis
    """
    try:
        stock = yf.Ticker(ticker)
        balance_sheet = stock.balance_sheet
        
        if balance_sheet is None or balance_sheet.empty:
            return {
                "status": "error",
                "error": "No data available",
                "timestamp": datetime.now().isoformat()
            }
        
        latest_date = balance_sheet.columns[0]
        
        current_assets = 0
        current_liabilities = 0
        
        if "Current Assets" in balance_sheet.index:
            current_assets = balance_sheet.loc["Current Assets", latest_date]
        
        if "Current Liabilities" in balance_sheet.index:
            current_liabilities = balance_sheet.loc["Current Liabilities", latest_date]
        
        working_capital = current_assets - current_liabilities
        
        return {
            "status": "success",
            "ticker": ticker,
            "period": latest_date.strftime("%Y-%m-%d"),
            "current_assets": float(current_assets) if pd.notna(current_assets) else 0,
            "current_liabilities": float(current_liabilities) if pd.notna(current_liabilities) else 0,
            "working_capital": float(working_capital) if pd.notna(working_capital) else 0,
            "interpretation": "Positive" if working_capital > 0 else "Negative",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
