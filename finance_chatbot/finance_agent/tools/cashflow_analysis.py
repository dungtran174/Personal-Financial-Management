# finance_agent/tools/cashflow_analysis.py
import logging
import datetime
from typing import Dict, Any, Optional
import pandas as pd

logger = logging.getLogger(__name__)

USE_YFINANCE = False
try:
    import yfinance as yf
    USE_YFINANCE = True
except Exception:
    logger.warning("yfinance not available; cashflow_analysis will return limited data.")


def safe_get_value(df: pd.DataFrame, key: str, col_idx: int = 0) -> Optional[float]:
    """Safely get a value from DataFrame."""
    try:
        if key in df.index:
            value = df.loc[key].iloc[col_idx]
            return float(value) if value is not None else None
        return None
    except Exception:
        return None


def calculate_cash_conversion_cycle(
    days_inventory_outstanding: Optional[float],
    days_sales_outstanding: Optional[float],
    days_payables_outstanding: Optional[float]
) -> Optional[float]:
    """
    Calculate Cash Conversion Cycle (CCC).
    
    CCC = DIO + DSO - DPO
    
    Args:
        days_inventory_outstanding: Days inventory sits before sale
        days_sales_outstanding: Days to collect receivables
        days_payables_outstanding: Days to pay suppliers
    
    Returns:
        Cash conversion cycle in days (lower is better)
    """
    if None in [days_inventory_outstanding, days_sales_outstanding, days_payables_outstanding]:
        return None
    
    ccc = days_inventory_outstanding + days_sales_outstanding - days_payables_outstanding
    return float(ccc)


def calculate_dio(inventory: float, cogs: float) -> Optional[float]:
    """
    Calculate Days Inventory Outstanding.
    
    DIO = (Inventory / COGS) * 365
    """
    if cogs <= 0:
        return None
    return (inventory / cogs) * 365


def calculate_dso(receivables: float, revenue: float) -> Optional[float]:
    """
    Calculate Days Sales Outstanding.
    
    DSO = (Accounts Receivable / Revenue) * 365
    """
    if revenue <= 0:
        return None
    return (receivables / revenue) * 365


def calculate_dpo(payables: float, cogs: float) -> Optional[float]:
    """
    Calculate Days Payables Outstanding.
    
    DPO = (Accounts Payable / COGS) * 365
    """
    if cogs <= 0:
        return None
    return (payables / cogs) * 365


def assess_cashflow_quality(
    ocf: float,
    net_income: float,
    capex: float
) -> Dict[str, Any]:
    """
    Assess quality of cash flows.
    
    Returns:
        Dictionary with quality score and interpretation
    """
    quality_score = 0
    comments = []
    
    # 1. OCF to Net Income ratio (should be > 1.0 for quality earnings)
    if net_income > 0:
        ocf_to_ni_ratio = ocf / net_income
        if ocf_to_ni_ratio > 1.2:
            quality_score += 3
            comments.append("Strong cash generation relative to earnings.")
        elif ocf_to_ni_ratio > 0.8:
            quality_score += 2
            comments.append("Adequate cash generation from operations.")
        else:
            quality_score += 0
            comments.append("Warning: Low cash generation relative to earnings.")
    
    # 2. Free Cash Flow (should be positive)
    fcf = ocf + capex  # capex is typically negative
    if fcf > 0:
        quality_score += 2
        comments.append("Positive free cash flow.")
    else:
        comments.append("Negative free cash flow - company consuming cash.")
    
    # 3. FCF to OCF ratio (higher is better, means less capex burden)
    if ocf > 0:
        fcf_to_ocf = fcf / ocf
        if fcf_to_ocf > 0.5:
            quality_score += 2
            comments.append("Healthy FCF margin after capex.")
        elif fcf_to_ocf > 0.2:
            quality_score += 1
            comments.append("Moderate FCF margin.")
        else:
            comments.append("High capital intensity - low FCF margin.")
    
    # Overall quality assessment
    if quality_score >= 6:
        quality = "high"
    elif quality_score >= 4:
        quality = "moderate"
    else:
        quality = "low"
    
    return {
        "quality": quality,
        "score": quality_score,
        "max_score": 7,
        "comments": comments
    }


def analyze_cashflow(ticker: str) -> Dict[str, Any]:
    """
    Comprehensive cash flow analysis.
    
    Includes:
    - Operating Cash Flow (OCF)
    - Free Cash Flow (FCF)
    - Cash Conversion Cycle
    - Cash Flow Quality Assessment
    
    Args:
        ticker: Stock ticker symbol
    
    Returns:
        Complete cash flow analysis
    """
    if not USE_YFINANCE:
        return {
            "ticker": ticker,
            "error": "yfinance not available",
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
    
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # Fetch financial statements
        try:
            cashflow_stmt = stock.cashflow
            income_stmt = stock.financials
            balance_sheet = stock.balance_sheet
        except Exception as e:
            logger.warning("Could not fetch financial statements: %s", e)
            return {
                "ticker": ticker,
                "error": f"Could not fetch financial statements: {e}",
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        result = {
            "ticker": ticker,
            "company_name": info.get("longName", ticker),
            "cashflow_metrics": {},
            "cash_conversion_cycle": {},
            "quality_assessment": {},
            "trends": {},
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # ========== Operating Cash Flow ==========
        ocf = safe_get_value(cashflow_stmt, "Operating Cash Flow")
        if ocf:
            result["cashflow_metrics"]["operating_cash_flow"] = round(ocf, 2)
        
        # ========== Free Cash Flow ==========
        fcf = safe_get_value(cashflow_stmt, "Free Cash Flow")
        if fcf:
            result["cashflow_metrics"]["free_cash_flow"] = round(fcf, 2)
        
        # If FCF not available, calculate it
        if fcf is None and ocf:
            capex = safe_get_value(cashflow_stmt, "Capital Expenditure")
            if capex:
                fcf = ocf + capex  # capex is negative
                result["cashflow_metrics"]["free_cash_flow"] = round(fcf, 2)
                result["cashflow_metrics"]["free_cash_flow_calculated"] = True
        
        # ========== Capital Expenditure ==========
        capex = safe_get_value(cashflow_stmt, "Capital Expenditure")
        if capex:
            result["cashflow_metrics"]["capital_expenditure"] = round(capex, 2)
        
        # ========== Cash and Cash Equivalents ==========
        if not balance_sheet.empty:
            cash = safe_get_value(balance_sheet, "Cash")
            if cash is None:
                cash = safe_get_value(balance_sheet, "Cash And Cash Equivalents")
            if cash:
                result["cashflow_metrics"]["cash_and_equivalents"] = round(cash, 2)
        
        # ========== Cash Conversion Cycle ==========
        if not balance_sheet.empty and not income_stmt.empty:
            inventory = safe_get_value(balance_sheet, "Inventory")
            receivables = safe_get_value(balance_sheet, "Accounts Receivable")
            payables = safe_get_value(balance_sheet, "Accounts Payable")
            
            cogs = safe_get_value(income_stmt, "Cost Of Revenue")
            revenue = safe_get_value(income_stmt, "Total Revenue")
            
            if inventory and cogs:
                dio = calculate_dio(inventory, cogs)
                result["cash_conversion_cycle"]["days_inventory_outstanding"] = round(dio, 1)
            
            if receivables and revenue:
                dso = calculate_dso(receivables, revenue)
                result["cash_conversion_cycle"]["days_sales_outstanding"] = round(dso, 1)
            
            if payables and cogs:
                dpo = calculate_dpo(payables, cogs)
                result["cash_conversion_cycle"]["days_payables_outstanding"] = round(dpo, 1)
            
            # Calculate CCC
            if all([dio, dso, dpo]):
                ccc = calculate_cash_conversion_cycle(dio, dso, dpo)
                result["cash_conversion_cycle"]["cash_conversion_cycle"] = round(ccc, 1)
                
                # Interpretation
                if ccc < 30:
                    result["cash_conversion_cycle"]["interpretation"] = "Excellent - very efficient cash cycle"
                elif ccc < 60:
                    result["cash_conversion_cycle"]["interpretation"] = "Good cash cycle efficiency"
                elif ccc < 90:
                    result["cash_conversion_cycle"]["interpretation"] = "Moderate cash cycle efficiency"
                else:
                    result["cash_conversion_cycle"]["interpretation"] = "Poor - cash tied up for extended period"
        
        # ========== Quality Assessment ==========
        if ocf and fcf:
            net_income = safe_get_value(income_stmt, "Net Income")
            capex = capex or 0
            
            if net_income:
                quality = assess_cashflow_quality(ocf, net_income, capex)
                result["quality_assessment"] = quality
        
        # ========== Trends (compare latest to previous period) ==========
        if not cashflow_stmt.empty and len(cashflow_stmt.columns) > 1:
            ocf_current = safe_get_value(cashflow_stmt, "Operating Cash Flow", 0)
            ocf_previous = safe_get_value(cashflow_stmt, "Operating Cash Flow", 1)
            
            if ocf_current and ocf_previous:
                ocf_growth = ((ocf_current - ocf_previous) / abs(ocf_previous)) * 100
                result["trends"]["ocf_growth_pct"] = round(ocf_growth, 2)
                
                if ocf_growth > 10:
                    result["trends"]["ocf_trend"] = "strong growth"
                elif ocf_growth > 0:
                    result["trends"]["ocf_trend"] = "growing"
                elif ocf_growth > -10:
                    result["trends"]["ocf_trend"] = "declining"
                else:
                    result["trends"]["ocf_trend"] = "significant decline"
            
            fcf_current = safe_get_value(cashflow_stmt, "Free Cash Flow", 0)
            fcf_previous = safe_get_value(cashflow_stmt, "Free Cash Flow", 1)
            
            if fcf_current and fcf_previous:
                fcf_growth = ((fcf_current - fcf_previous) / abs(fcf_previous)) * 100
                result["trends"]["fcf_growth_pct"] = round(fcf_growth, 2)
        
        # ========== Overall Interpretation ==========
        interpretations = []
        
        if ocf and ocf > 0:
            interpretations.append("Positive operating cash flow indicates healthy core operations.")
        elif ocf and ocf < 0:
            interpretations.append("Warning: Negative operating cash flow.")
        
        if fcf and fcf > 0:
            interpretations.append("Positive free cash flow available for dividends, buybacks, or growth.")
        elif fcf and fcf < 0:
            interpretations.append("Negative free cash flow - company is investing heavily or facing challenges.")
        
        quality = result.get("quality_assessment", {}).get("quality")
        if quality == "high":
            interpretations.append("High quality cash flows - earnings backed by cash.")
        elif quality == "low":
            interpretations.append("Low quality cash flows - investigate earnings quality.")
        
        result["interpretation"] = " ".join(interpretations)
        
        return result
        
    except Exception as e:
        logger.exception("Error analyzing cash flow for %s: %s", ticker, e)
        return {
            "ticker": ticker,
            "error": str(e),
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
