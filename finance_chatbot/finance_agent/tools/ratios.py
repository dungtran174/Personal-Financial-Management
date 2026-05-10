import logging
from typing import Dict, Any
from .fundamentals import get_fundamentals
from .stock_price import get_stock_price

logger = logging.getLogger(__name__)


def calculate_ratios(ticker: str, assume_pb: float = 4.0) -> Dict[str, Any]:
    """
    Tính toán các chỉ số tài chính cơ bản:
      - EPS
      - P/E
      - ROE (ưu tiên dùng Total Equity, fallback sang giả định P/B nếu thiếu)
    """
    fund = get_fundamentals(ticker)
    snap = fund.get("snapshot", {})
    price_info = get_stock_price(ticker)

    result = {"ticker": ticker, "ratios": {}}

    price = price_info.get("price")
    net_income = snap.get("netIncome")
    shares = snap.get("sharesOutstanding")
    equity = snap.get("totalEquity")
    market_cap = snap.get("marketCap")

    # --- EPS ---
    eps = snap.get("eps")
    if not eps and net_income and shares and shares > 0:
        eps = net_income / shares
        result["ratios"]["eps"] = round(eps, 2)
    elif eps:
        result["ratios"]["eps"] = round(eps, 2)
    else:
        result["ratios"]["eps_note"] = "Missing net income or shares outstanding"

    # --- P/E ---
    if price and eps and eps > 0:
        result["ratios"]["pe"] = round(price / eps, 2)
    else:
        result["ratios"]["pe_note"] = "Cannot compute P/E (missing EPS or price)"

    # --- ROE ---
    roe = None
    if net_income and equity and equity > 0:
        roe = net_income / equity
        result["ratios"]["roe"] = round(roe * 100, 2)  # %
    elif net_income and market_cap:
        equity_est = market_cap / assume_pb
        roe = net_income / equity_est
        result["ratios"]["roe"] = round(roe * 100, 2)
        result["ratios"]["roe_note"] = f"Estimated with P/B={assume_pb}"
    else:
        result["ratios"]["roe_note"] = "Missing equity and market cap"

    return result
