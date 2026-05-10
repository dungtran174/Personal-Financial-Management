# finance_agent/tools/advanced_ratios.py
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
    logger.warning("yfinance not available; advanced_ratios will return mock data.")


def safe_divide(numerator: float, denominator: float, default=None) -> Optional[float]:
    """Safely divide two numbers, return default if denominator is 0 or None."""
    try:
        if denominator is None or denominator == 0:
            return default
        return numerator / denominator
    except:
        return default


def get_advanced_ratios(ticker: str) -> Dict[str, Any]:
    """
    Calculate advanced financial ratios and metrics.
    
    Args:
        ticker: Stock ticker symbol
    
    Returns:
        Dictionary with valuation, leverage, liquidity, profitability, and efficiency ratios
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
            balance_sheet = stock.balance_sheet
            income_stmt = stock.financials
            cashflow_stmt = stock.cashflow
        except Exception as e:
            logger.warning("Could not fetch financial statements for %s: %s", ticker, e)
            balance_sheet = pd.DataFrame()
            income_stmt = pd.DataFrame()
            cashflow_stmt = pd.DataFrame()
        
        result = {
            "ticker": ticker,
            "company_name": info.get("longName", ticker),
            "valuation": {},
            "leverage": {},
            "liquidity": {},
            "profitability": {},
            "efficiency": {},
            "interpretation": {},
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # ========== VALUATION RATIOS ==========
        
        # P/E Ratio
        pe_ratio = info.get("trailingPE") or info.get("forwardPE")
        result["valuation"]["price_to_earnings"] = pe_ratio
        
        # P/B Ratio (Price to Book)
        pb_ratio = info.get("priceToBook")
        result["valuation"]["price_to_book"] = pb_ratio
        
        # P/S Ratio (Price to Sales)
        ps_ratio = info.get("priceToSalesTrailing12Months")
        result["valuation"]["price_to_sales"] = ps_ratio
        
        # PEG Ratio
        peg_ratio = info.get("pegRatio")
        result["valuation"]["peg_ratio"] = peg_ratio
        
        # EV/EBITDA
        ev_ebitda = info.get("enterpriseToEbitda")
        result["valuation"]["ev_to_ebitda"] = ev_ebitda
        
        # Enterprise Value
        result["valuation"]["enterprise_value"] = info.get("enterpriseValue")
        
        # Market Cap
        result["valuation"]["market_cap"] = info.get("marketCap")
        
        # ========== LEVERAGE RATIOS ==========
        
        # Debt to Equity
        debt_to_equity = info.get("debtToEquity")
        if debt_to_equity:
            result["leverage"]["debt_to_equity"] = debt_to_equity / 100  # yfinance returns as percentage
        else:
            # Calculate from balance sheet
            if not balance_sheet.empty:
                try:
                    total_debt = balance_sheet.loc["Total Debt"].iloc[0] if "Total Debt" in balance_sheet.index else None
                    if total_debt is None:
                        long_term_debt = balance_sheet.loc["Long Term Debt"].iloc[0] if "Long Term Debt" in balance_sheet.index else 0
                        short_term_debt = balance_sheet.loc["Current Debt"].iloc[0] if "Current Debt" in balance_sheet.index else 0
                        total_debt = long_term_debt + short_term_debt
                    
                    total_equity = balance_sheet.loc["Stockholders Equity"].iloc[0] if "Stockholders Equity" in balance_sheet.index else None
                    if total_equity is None:
                        total_equity = balance_sheet.loc["Total Stockholder Equity"].iloc[0] if "Total Stockholder Equity" in balance_sheet.index else None
                    
                    result["leverage"]["debt_to_equity"] = safe_divide(total_debt, total_equity)
                except Exception as e:
                    logger.debug("Could not calculate debt to equity: %s", e)
        
        # Debt Ratio (Total Debt / Total Assets)
        if not balance_sheet.empty:
            try:
                total_debt = balance_sheet.loc["Total Debt"].iloc[0] if "Total Debt" in balance_sheet.index else None
                total_assets = balance_sheet.loc["Total Assets"].iloc[0] if "Total Assets" in balance_sheet.index else None
                result["leverage"]["debt_ratio"] = safe_divide(total_debt, total_assets)
            except Exception as e:
                logger.debug("Could not calculate debt ratio: %s", e)
        
        # Interest Coverage (EBIT / Interest Expense)
        if not income_stmt.empty:
            try:
                ebit = income_stmt.loc["EBIT"].iloc[0] if "EBIT" in income_stmt.index else None
                interest_expense = income_stmt.loc["Interest Expense"].iloc[0] if "Interest Expense" in income_stmt.index else None
                
                if interest_expense and interest_expense < 0:
                    interest_expense = abs(interest_expense)
                
                result["leverage"]["interest_coverage"] = safe_divide(ebit, interest_expense)
            except Exception as e:
                logger.debug("Could not calculate interest coverage: %s", e)
        
        # ========== LIQUIDITY RATIOS ==========
        
        # Current Ratio
        current_ratio = info.get("currentRatio")
        result["liquidity"]["current_ratio"] = current_ratio
        
        # Quick Ratio
        quick_ratio = info.get("quickRatio")
        result["liquidity"]["quick_ratio"] = quick_ratio
        
        # Cash Ratio
        if not balance_sheet.empty:
            try:
                cash = balance_sheet.loc["Cash"].iloc[0] if "Cash" in balance_sheet.index else None
                if cash is None:
                    cash = balance_sheet.loc["Cash And Cash Equivalents"].iloc[0] if "Cash And Cash Equivalents" in balance_sheet.index else None
                
                current_liabilities = balance_sheet.loc["Current Liabilities"].iloc[0] if "Current Liabilities" in balance_sheet.index else None
                result["liquidity"]["cash_ratio"] = safe_divide(cash, current_liabilities)
            except Exception as e:
                logger.debug("Could not calculate cash ratio: %s", e)
        
        # ========== PROFITABILITY RATIOS ==========
        
        # Profit Margins
        result["profitability"]["gross_margin"] = info.get("grossMargins")
        result["profitability"]["operating_margin"] = info.get("operatingMargins")
        result["profitability"]["net_margin"] = info.get("profitMargins")
        
        # Return on Assets (ROA)
        result["profitability"]["return_on_assets"] = info.get("returnOnAssets")
        
        # Return on Equity (ROE)
        result["profitability"]["return_on_equity"] = info.get("returnOnEquity")
        
        # ROCE (Return on Capital Employed)
        if not income_stmt.empty and not balance_sheet.empty:
            try:
                ebit = income_stmt.loc["EBIT"].iloc[0] if "EBIT" in income_stmt.index else None
                total_assets = balance_sheet.loc["Total Assets"].iloc[0] if "Total Assets" in balance_sheet.index else None
                current_liabilities = balance_sheet.loc["Current Liabilities"].iloc[0] if "Current Liabilities" in balance_sheet.index else None
                
                if ebit and total_assets and current_liabilities:
                    capital_employed = total_assets - current_liabilities
                    roce = safe_divide(ebit, capital_employed)
                    result["profitability"]["return_on_capital_employed"] = roce
            except Exception as e:
                logger.debug("Could not calculate ROCE: %s", e)
        
        # ========== EFFICIENCY RATIOS ==========
        
        # Asset Turnover
        if not income_stmt.empty and not balance_sheet.empty:
            try:
                revenue = income_stmt.loc["Total Revenue"].iloc[0] if "Total Revenue" in income_stmt.index else None
                total_assets = balance_sheet.loc["Total Assets"].iloc[0] if "Total Assets" in balance_sheet.index else None
                result["efficiency"]["asset_turnover"] = safe_divide(revenue, total_assets)
            except Exception as e:
                logger.debug("Could not calculate asset turnover: %s", e)
        
        # Inventory Turnover
        if not income_stmt.empty and not balance_sheet.empty:
            try:
                cogs = income_stmt.loc["Cost Of Revenue"].iloc[0] if "Cost Of Revenue" in income_stmt.index else None
                inventory = balance_sheet.loc["Inventory"].iloc[0] if "Inventory" in balance_sheet.index else None
                result["efficiency"]["inventory_turnover"] = safe_divide(cogs, inventory)
            except Exception as e:
                logger.debug("Could not calculate inventory turnover: %s", e)
        
        # Receivables Turnover
        if not income_stmt.empty and not balance_sheet.empty:
            try:
                revenue = income_stmt.loc["Total Revenue"].iloc[0] if "Total Revenue" in income_stmt.index else None
                receivables = balance_sheet.loc["Accounts Receivable"].iloc[0] if "Accounts Receivable" in balance_sheet.index else None
                result["efficiency"]["receivables_turnover"] = safe_divide(revenue, receivables)
            except Exception as e:
                logger.debug("Could not calculate receivables turnover: %s", e)
        
        # ========== INTERPRETATIONS ==========
        
        # Valuation Status
        if pe_ratio:
            if pe_ratio < 15:
                result["interpretation"]["valuation_status"] = "potentially undervalued"
            elif pe_ratio > 30:
                result["interpretation"]["valuation_status"] = "potentially overvalued"
            else:
                result["interpretation"]["valuation_status"] = "fairly valued"
        
        # Financial Health (based on debt ratios)
        debt_to_eq = result["leverage"].get("debt_to_equity")
        if debt_to_eq is not None:
            if debt_to_eq < 0.5:
                result["interpretation"]["leverage_status"] = "low leverage - conservative"
            elif debt_to_eq < 1.5:
                result["interpretation"]["leverage_status"] = "moderate leverage"
            else:
                result["interpretation"]["leverage_status"] = "high leverage - risky"
        
        # Liquidity Status
        curr_ratio = result["liquidity"].get("current_ratio")
        if curr_ratio is not None:
            if curr_ratio < 1.0:
                result["interpretation"]["liquidity_status"] = "poor - may struggle to pay short-term obligations"
            elif curr_ratio < 1.5:
                result["interpretation"]["liquidity_status"] = "adequate"
            else:
                result["interpretation"]["liquidity_status"] = "strong - good short-term financial health"
        
        # Profitability Status
        roe = result["profitability"].get("return_on_equity")
        if roe is not None:
            if roe < 0.10:
                result["interpretation"]["profitability_status"] = "low profitability"
            elif roe < 0.15:
                result["interpretation"]["profitability_status"] = "moderate profitability"
            else:
                result["interpretation"]["profitability_status"] = "high profitability"
        
        return result
        
    except Exception as e:
        logger.exception("Error calculating advanced ratios for %s: %s", ticker, e)
        return {
            "ticker": ticker,
            "error": str(e),
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
