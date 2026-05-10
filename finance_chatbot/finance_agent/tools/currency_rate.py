# finance_agent/tools/currency_rate.py
"""
Tool: get_currency_rate
Mô tả: Lấy tỷ giá giữa các đồng tiền
Data source: exchangerate-api.com (free tier) hoặc yfinance forex pairs
"""

from typing import Dict, Any, Optional
from datetime import datetime
import yfinance as yf

# Common currency pairs
MAJOR_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CNY", "VND", "SGD", "THB", "KRW"]


def get_currency_rate(
    from_currency: str = "USD",
    to_currency: str = "VND",
    amount: float = 1.0
) -> Dict[str, Any]:
    """
    Lấy tỷ giá giữa hai đồng tiền.
    
    Args:
        from_currency: Đồng tiền nguồn (e.g., "USD")
        to_currency: Đồng tiền đích (e.g., "VND")
        amount: Số tiền cần quy đổi (default: 1.0)
    
    Returns:
        Dict chứa tỷ giá và giá trị quy đổi
    
    Examples:
        >>> get_currency_rate("USD", "VND", 100)
        >>> get_currency_rate("EUR", "USD")
    """
    try:
        from_currency = from_currency.upper()
        to_currency = to_currency.upper()
        
        # If same currency
        if from_currency == to_currency:
            return {
                "status": "success",
                "from_currency": from_currency,
                "to_currency": to_currency,
                "rate": 1.0,
                "amount": amount,
                "converted_amount": amount,
                "timestamp": datetime.now().isoformat(),
                "source": "same_currency"
            }
        
        # Try using yfinance forex pairs
        # Format: USDVND=X for USD to VND
        forex_pair = f"{from_currency}{to_currency}=X"
        
        try:
            ticker = yf.Ticker(forex_pair)
            hist = ticker.history(period="1d")
            
            if not hist.empty:
                rate = hist['Close'].iloc[-1]
                converted = amount * rate
                
                return {
                    "status": "success",
                    "from_currency": from_currency,
                    "to_currency": to_currency,
                    "rate": round(rate, 4),
                    "amount": amount,
                    "converted_amount": round(converted, 2),
                    "timestamp": datetime.now().isoformat(),
                    "source": "yfinance",
                    "last_updated": hist.index[-1].isoformat()
                }
        except Exception as yf_error:
            # Try reverse pair
            reverse_pair = f"{to_currency}{from_currency}=X"
            try:
                ticker = yf.Ticker(reverse_pair)
                hist = ticker.history(period="1d")
                
                if not hist.empty:
                    reverse_rate = hist['Close'].iloc[-1]
                    rate = 1 / reverse_rate
                    converted = amount * rate
                    
                    return {
                        "status": "success",
                        "from_currency": from_currency,
                        "to_currency": to_currency,
                        "rate": round(rate, 4),
                        "amount": amount,
                        "converted_amount": round(converted, 2),
                        "timestamp": datetime.now().isoformat(),
                        "source": "yfinance_reverse",
                        "last_updated": hist.index[-1].isoformat()
                    }
            except:
                pass
        
        # If yfinance fails, use approximate static rates (fallback)
        # Note: These are approximate and should be updated regularly
        STATIC_RATES = {
            ("USD", "VND"): 24500,
            ("EUR", "USD"): 1.08,
            ("GBP", "USD"): 1.27,
            ("JPY", "USD"): 0.0067,
            ("USD", "CNY"): 7.24,
            ("USD", "SGD"): 1.34,
            ("USD", "THB"): 35.5,
            ("USD", "KRW"): 1340
        }
        
        rate = None
        
        # Check static rates
        if (from_currency, to_currency) in STATIC_RATES:
            rate = STATIC_RATES[(from_currency, to_currency)]
        elif (to_currency, from_currency) in STATIC_RATES:
            rate = 1 / STATIC_RATES[(to_currency, from_currency)]
        
        if rate:
            converted = amount * rate
            return {
                "status": "success",
                "from_currency": from_currency,
                "to_currency": to_currency,
                "rate": round(rate, 4),
                "amount": amount,
                "converted_amount": round(converted, 2),
                "timestamp": datetime.now().isoformat(),
                "source": "static_fallback",
                "warning": "Using approximate static rates. May not be up-to-date."
            }
        
        # If all fails
        return {
            "status": "error",
            "error": f"Could not find exchange rate for {from_currency} to {to_currency}",
            "from_currency": from_currency,
            "to_currency": to_currency,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "from_currency": from_currency if 'from_currency' in locals() else None,
            "to_currency": to_currency if 'to_currency' in locals() else None,
            "timestamp": datetime.now().isoformat()
        }


def get_multiple_rates(base_currency: str = "USD", target_currencies: list = None) -> Dict[str, Any]:
    """
    Lấy tỷ giá từ một đồng tiền cơ sở sang nhiều đồng tiền khác.
    
    Args:
        base_currency: Đồng tiền cơ sở
        target_currencies: List các đồng tiền đích
    
    Returns:
        Dict chứa tỷ giá của tất cả các cặp tiền tệ
    """
    if target_currencies is None:
        target_currencies = ["VND", "EUR", "GBP", "JPY", "CNY"]
    
    results = {}
    for target in target_currencies:
        rate_info = get_currency_rate(base_currency, target, 1.0)
        if rate_info["status"] == "success":
            results[target] = rate_info["rate"]
    
    return {
        "status": "success",
        "base_currency": base_currency,
        "rates": results,
        "timestamp": datetime.now().isoformat()
    }
