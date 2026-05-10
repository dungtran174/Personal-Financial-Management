# finance_agent/tools/valuation.py
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
    logger.warning("yfinance not available; valuation tool will return limited data.")


def calculate_dcf_value(
    free_cash_flow: float,
    growth_rate: float,
    discount_rate: float,
    terminal_growth_rate: float = 0.025,
    projection_years: int = 5
) -> float:
    """
    Calculate intrinsic value using Discounted Cash Flow (DCF) model.
    
    Args:
        free_cash_flow: Most recent free cash flow
        growth_rate: Expected growth rate for projection period
        discount_rate: Discount rate (WACC or required return)
        terminal_growth_rate: Long-term growth rate after projection period
        projection_years: Number of years to project
    
    Returns:
        Present value of future cash flows
    """
    if free_cash_flow <= 0:
        return None
    
    # Project future cash flows
    present_value = 0.0
    fcf = free_cash_flow
    
    for year in range(1, projection_years + 1):
        fcf *= (1 + growth_rate)
        pv = fcf / ((1 + discount_rate) ** year)
        present_value += pv
    
    # Terminal value
    terminal_fcf = fcf * (1 + terminal_growth_rate)
    terminal_value = terminal_fcf / (discount_rate - terminal_growth_rate)
    terminal_pv = terminal_value / ((1 + discount_rate) ** projection_years)
    
    total_value = present_value + terminal_pv
    
    return float(total_value)


def calculate_ddm_value(
    dividend_per_share: float,
    growth_rate: float,
    required_return: float
) -> float:
    """
    Calculate intrinsic value using Dividend Discount Model (Gordon Growth Model).
    
    DDM Value = D1 / (r - g)
    where D1 = next year's dividend, r = required return, g = growth rate
    
    Args:
        dividend_per_share: Most recent annual dividend per share
        growth_rate: Expected dividend growth rate
        required_return: Required rate of return
    
    Returns:
        Intrinsic value per share
    """
    if dividend_per_share <= 0:
        return None
    
    if required_return <= growth_rate:
        return None  # Model breaks down when r <= g
    
    next_dividend = dividend_per_share * (1 + growth_rate)
    value = next_dividend / (required_return - growth_rate)
    
    return float(value)


def estimate_growth_rate(financials: pd.DataFrame, metric: str = "Total Revenue") -> Optional[float]:
    """
    Estimate historical growth rate from financial statements.
    
    Args:
        financials: DataFrame from yfinance with financial data
        metric: The metric to calculate growth for (e.g., "Total Revenue", "Net Income")
    
    Returns:
        Average annual growth rate as decimal (e.g., 0.10 = 10%)
    """
    try:
        if metric not in financials.index:
            return None
        
        values = financials.loc[metric].dropna()
        if len(values) < 2:
            return None
        
        # Calculate year-over-year growth rates
        growth_rates = []
        for i in range(len(values) - 1):
            older_value = values.iloc[i + 1]
            newer_value = values.iloc[i]
            if older_value > 0:
                growth = (newer_value - older_value) / older_value
                growth_rates.append(growth)
        
        if not growth_rates:
            return None
        
        # Return average growth rate
        avg_growth = sum(growth_rates) / len(growth_rates)
        return float(avg_growth)
        
    except Exception as e:
        logger.debug("Could not estimate growth rate: %s", e)
        return None


def calculate_peg_valuation(pe_ratio: float, earnings_growth_rate: float) -> Dict[str, Any]:
    """
    Calculate PEG ratio and assess valuation.
    
    PEG = P/E Ratio / Earnings Growth Rate (in %)
    
    Args:
        pe_ratio: Price to Earnings ratio
        earnings_growth_rate: Annual earnings growth rate as decimal
    
    Returns:
        Dictionary with PEG ratio and interpretation
    """
    if pe_ratio is None or pe_ratio <= 0:
        return {"peg_ratio": None, "assessment": "Cannot calculate - invalid P/E"}
    
    if earnings_growth_rate is None or earnings_growth_rate <= 0:
        return {"peg_ratio": None, "assessment": "Cannot calculate - invalid growth rate"}
    
    # Convert growth rate to percentage
    growth_pct = earnings_growth_rate * 100
    peg = pe_ratio / growth_pct
    
    # Interpretation
    if peg < 1.0:
        assessment = "undervalued"
        explanation = f"PEG < 1.0 suggests the stock may be undervalued relative to its growth."
    elif peg < 2.0:
        assessment = "fairly valued"
        explanation = f"PEG between 1-2 suggests fair valuation."
    else:
        assessment = "overvalued"
        explanation = f"PEG > 2.0 suggests the stock may be overvalued relative to its growth."
    
    return {
        "peg_ratio": round(peg, 2),
        "assessment": assessment,
        "explanation": explanation
    }


def estimate_fair_value(
    ticker: str,
    method: str = "all",
    growth_rate: Optional[float] = None,
    discount_rate: Optional[float] = None,
    required_return: Optional[float] = None
) -> Dict[str, Any]:
    """
    Estimate fair value of a stock using various valuation methods.
    
    Args:
        ticker: Stock ticker symbol
        method: Valuation method ("dcf", "ddm", "peg", "all")
        growth_rate: Custom growth rate (if None, estimate from historical data)
        discount_rate: Discount rate for DCF (if None, use 10%)
        required_return: Required return for DDM (if None, use 12%)
    
    Returns:
        Dictionary with fair value estimates and recommendations
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
        
        # Get current price
        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        
        result = {
            "ticker": ticker,
            "company_name": info.get("longName", ticker),
            "current_price": current_price,
            "valuation": {},
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # Fetch financial statements
        try:
            financials = stock.financials
            cashflow = stock.cashflow
            balance_sheet = stock.balance_sheet
        except Exception as e:
            logger.warning("Could not fetch financial statements: %s", e)
            financials = pd.DataFrame()
            cashflow = pd.DataFrame()
            balance_sheet = pd.DataFrame()
        
        # Estimate growth rate if not provided
        if growth_rate is None:
            estimated_growth = estimate_growth_rate(financials, "Total Revenue")
            if estimated_growth is None:
                estimated_growth = 0.10  # Default 10%
            growth_rate = estimated_growth
        
        result["assumptions"] = {
            "growth_rate": round(growth_rate, 4),
            "growth_rate_pct": round(growth_rate * 100, 2)
        }
        
        # ========== DCF Valuation ==========
        if method in ["dcf", "all"]:
            try:
                # Get Free Cash Flow
                if not cashflow.empty and "Free Cash Flow" in cashflow.index:
                    fcf = cashflow.loc["Free Cash Flow"].iloc[0]
                    
                    # Get shares outstanding
                    shares_outstanding = info.get("sharesOutstanding")
                    
                    if fcf and shares_outstanding:
                        fcf_per_share = fcf / shares_outstanding
                        
                        # Use default discount rate if not provided
                        if discount_rate is None:
                            discount_rate = 0.10  # 10% WACC
                        
                        result["assumptions"]["discount_rate"] = round(discount_rate, 4)
                        
                        # Calculate DCF value
                        dcf_total_value = calculate_dcf_value(
                            free_cash_flow=fcf,
                            growth_rate=growth_rate,
                            discount_rate=discount_rate
                        )
                        
                        if dcf_total_value:
                            dcf_value_per_share = dcf_total_value / shares_outstanding
                            result["valuation"]["dcf_value"] = round(dcf_value_per_share, 2)
                else:
                    result["valuation"]["dcf_value"] = None
                    result["valuation"]["dcf_note"] = "Free Cash Flow data not available"
            except Exception as e:
                logger.debug("DCF calculation failed: %s", e)
                result["valuation"]["dcf_value"] = None
                result["valuation"]["dcf_error"] = str(e)
        
        # ========== DDM Valuation ==========
        if method in ["ddm", "all"]:
            try:
                dividend_rate = info.get("dividendRate")
                
                if dividend_rate and dividend_rate > 0:
                    if required_return is None:
                        required_return = 0.12  # 12% default
                    
                    result["assumptions"]["required_return"] = round(required_return, 4)
                    
                    ddm_value = calculate_ddm_value(
                        dividend_per_share=dividend_rate,
                        growth_rate=growth_rate,
                        required_return=required_return
                    )
                    
                    result["valuation"]["ddm_value"] = round(ddm_value, 2) if ddm_value else None
                else:
                    result["valuation"]["ddm_value"] = None
                    result["valuation"]["ddm_note"] = "Company does not pay dividends"
            except Exception as e:
                logger.debug("DDM calculation failed: %s", e)
                result["valuation"]["ddm_value"] = None
                result["valuation"]["ddm_error"] = str(e)
        
        # ========== PEG Valuation ==========
        if method in ["peg", "all"]:
            pe_ratio = info.get("trailingPE") or info.get("forwardPE")
            earnings_growth = info.get("earningsGrowth")
            
            if earnings_growth is None:
                earnings_growth = estimate_growth_rate(financials, "Net Income")
            
            peg_result = calculate_peg_valuation(pe_ratio, earnings_growth)
            result["valuation"]["peg_analysis"] = peg_result
        
        # ========== Fair Value Assessment ==========
        valuations = []
        if result["valuation"].get("dcf_value"):
            valuations.append(result["valuation"]["dcf_value"])
        if result["valuation"].get("ddm_value"):
            valuations.append(result["valuation"]["ddm_value"])
        
        if valuations:
            avg_fair_value = sum(valuations) / len(valuations)
            result["valuation"]["average_fair_value"] = round(avg_fair_value, 2)
            
            if current_price:
                upside = (avg_fair_value - current_price) / current_price * 100
                
                result["assessment"] = {
                    "upside_potential_pct": round(upside, 2),
                    "upside_potential": round(avg_fair_value - current_price, 2)
                }
                
                # Recommendation
                if upside > 20:
                    status = "undervalued"
                    recommendation = "Buy - significant upside potential"
                elif upside > 10:
                    status = "slightly undervalued"
                    recommendation = "Consider buying"
                elif upside > -10:
                    status = "fairly valued"
                    recommendation = "Hold"
                elif upside > -20:
                    status = "slightly overvalued"
                    recommendation = "Consider selling"
                else:
                    status = "overvalued"
                    recommendation = "Sell - significant downside risk"
                
                result["assessment"]["valuation_status"] = status
                result["assessment"]["recommendation"] = recommendation
        else:
            result["assessment"] = {
                "valuation_status": "unknown",
                "recommendation": "Insufficient data for valuation"
            }
        
        # Add PEG assessment to overall assessment if available
        peg_analysis = result["valuation"].get("peg_analysis", {})
        if peg_analysis.get("assessment"):
            result["assessment"]["peg_assessment"] = peg_analysis["assessment"]
        
        return result
        
    except Exception as e:
        logger.exception("Error in valuation for %s: %s", ticker, e)
        return {
            "ticker": ticker,
            "error": str(e),
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
