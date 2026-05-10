import yfinance as yf
import datetime
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


def get_fundamentals(ticker: str) -> Dict[str, Any]:
    """
    Lấy thông tin cơ bản + số liệu tài chính từ yfinance.
    Trả về:
      - Market Cap
      - Sector
      - Country
      - Shares Outstanding
      - Net Income (TTM)
      - Total Equity (nếu có từ balance sheet)
      - EPS (tính sẵn nếu có dữ liệu)
    """
    try:
        t = yf.Ticker(ticker)
        info = t.info

        # --- Snapshot cơ bản ---
        snapshot = {
            "marketCap": info.get("marketCap"),
            "sector": info.get("sector"),
            "country": info.get("country"),
            "sharesOutstanding": info.get("sharesOutstanding"),
        }

        # --- Income Statement (Net Income TTM) ---
        try:
            fin = t.financials  # Income Statement
            if not fin.empty:
                if "Net Income" in fin.index:
                    net_income = fin.loc["Net Income"].iloc[0]
                    snapshot["netIncome"] = float(net_income)
        except Exception as e:
            logger.debug("Cannot fetch income statement: %s", e)

        # --- Balance Sheet (Total Equity) ---
        try:
            bs = t.balance_sheet
            if not bs.empty:
                if "Total Stockholder Equity" in bs.index:
                    total_equity = bs.loc["Total Stockholder Equity"].iloc[0]
                    snapshot["totalEquity"] = float(total_equity)
                    snapshot["equity_label"] = "Total Stockholder Equity"
                elif "Common Stock Equity" in bs.index:
                    total_equity = bs.loc["Common Stock Equity"].iloc[0]
                    snapshot["totalEquity"] = float(total_equity)
                    snapshot["equity_label"] = "Common Stock Equity"
        except Exception as e:
            logger.debug("Cannot fetch balance sheet: %s", e)

        # --- EPS (nếu đủ dữ liệu) ---
        try:
            if snapshot.get("netIncome") and snapshot.get("sharesOutstanding"):
                shares = snapshot["sharesOutstanding"]
                if shares and shares > 0:
                    eps = snapshot["netIncome"] / shares
                    snapshot["eps"] = round(eps, 2)
        except Exception as e:
            logger.debug("Cannot compute EPS: %s", e)

        return {
            "ticker": ticker,
            "snapshot": snapshot,
            "retrieved": datetime.datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error("get_fundamentals error for %s: %s", ticker, e)
        return {
            "ticker": ticker,
            "snapshot": {},
            "retrieved": datetime.datetime.utcnow().isoformat(),
            "error": str(e),
        }
