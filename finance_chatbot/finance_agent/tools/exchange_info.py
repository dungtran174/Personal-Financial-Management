# finance_agent/tools/exchange_info.py
"""
Tool: get_exchange_info
Mô tả: Lấy thông tin sàn giao dịch, quốc gia, múi giờ
Data source: Static data mapping
"""

from typing import Dict, Any, Optional
from datetime import datetime

# Static data mapping for major exchanges
EXCHANGE_DATA = {
    # Vietnam
    "HOSE": {
        "full_name": "Ho Chi Minh Stock Exchange",
        "country": "Vietnam",
        "country_code": "VN",
        "timezone": "Asia/Ho_Chi_Minh",
        "utc_offset": "+07:00",
        "currency": "VND",
        "trading_hours": "09:00-15:00",
        "website": "https://www.hsx.vn",
        "established": 2000
    },
    "HNX": {
        "full_name": "Hanoi Stock Exchange",
        "country": "Vietnam",
        "country_code": "VN",
        "timezone": "Asia/Ho_Chi_Minh",
        "utc_offset": "+07:00",
        "currency": "VND",
        "trading_hours": "09:00-15:00",
        "website": "https://www.hnx.vn",
        "established": 2005
    },
    "UPCOM": {
        "full_name": "Unlisted Public Company Market",
        "country": "Vietnam",
        "country_code": "VN",
        "timezone": "Asia/Ho_Chi_Minh",
        "utc_offset": "+07:00",
        "currency": "VND",
        "trading_hours": "09:00-15:00",
        "website": "https://www.hnx.vn",
        "established": 2009
    },
    
    # United States
    "NYSE": {
        "full_name": "New York Stock Exchange",
        "country": "United States",
        "country_code": "US",
        "timezone": "America/New_York",
        "utc_offset": "-05:00",
        "currency": "USD",
        "trading_hours": "09:30-16:00 EST",
        "website": "https://www.nyse.com",
        "established": 1792
    },
    "NASDAQ": {
        "full_name": "NASDAQ Stock Market",
        "country": "United States",
        "country_code": "US",
        "timezone": "America/New_York",
        "utc_offset": "-05:00",
        "currency": "USD",
        "trading_hours": "09:30-16:00 EST",
        "website": "https://www.nasdaq.com",
        "established": 1971
    },
    
    # Other major exchanges
    "LSE": {
        "full_name": "London Stock Exchange",
        "country": "United Kingdom",
        "country_code": "GB",
        "timezone": "Europe/London",
        "utc_offset": "+00:00",
        "currency": "GBP",
        "trading_hours": "08:00-16:30 GMT",
        "website": "https://www.londonstockexchange.com",
        "established": 1801
    },
    "JPX": {
        "full_name": "Japan Exchange Group (Tokyo Stock Exchange)",
        "country": "Japan",
        "country_code": "JP",
        "timezone": "Asia/Tokyo",
        "utc_offset": "+09:00",
        "currency": "JPY",
        "trading_hours": "09:00-15:00 JST",
        "website": "https://www.jpx.co.jp",
        "established": 1878
    },
    "SSE": {
        "full_name": "Shanghai Stock Exchange",
        "country": "China",
        "country_code": "CN",
        "timezone": "Asia/Shanghai",
        "utc_offset": "+08:00",
        "currency": "CNY",
        "trading_hours": "09:30-15:00 CST",
        "website": "http://www.sse.com.cn",
        "established": 1990
    },
    "HKEX": {
        "full_name": "Hong Kong Stock Exchange",
        "country": "Hong Kong",
        "country_code": "HK",
        "timezone": "Asia/Hong_Kong",
        "utc_offset": "+08:00",
        "currency": "HKD",
        "trading_hours": "09:30-16:00 HKT",
        "website": "https://www.hkex.com.hk",
        "established": 1891
    }
}

# Mapping ticker suffix to exchange
TICKER_SUFFIX_MAP = {
    ".VN": "HOSE",  # Vietnam stocks typically use .VN
    ".HNX": "HNX",
    ".OTC": "UPCOM",
    ".L": "LSE",
    ".T": "JPX",
    ".SS": "SSE",
    ".HK": "HKEX"
}


def get_exchange_info(exchange_code: Optional[str] = None, ticker: Optional[str] = None) -> Dict[str, Any]:
    """
    Lấy thông tin chi tiết về sàn giao dịch.
    
    Args:
        exchange_code: Mã sàn (HOSE, NYSE, NASDAQ, ...). Optional.
        ticker: Mã cổ phiếu để tự động detect exchange. Optional.
    
    Returns:
        Dict chứa thông tin sàn giao dịch hoặc danh sách tất cả sàn
    
    Examples:
        >>> get_exchange_info("HOSE")
        >>> get_exchange_info(ticker="AAPL")  # Detect NYSE/NASDAQ
        >>> get_exchange_info()  # List all exchanges
    """
    try:
        # If neither provided, return all exchanges
        if not exchange_code and not ticker:
            return {
                "status": "success",
                "exchanges": list(EXCHANGE_DATA.keys()),
                "total": len(EXCHANGE_DATA),
                "timestamp": datetime.now().isoformat()
            }
        
        # Auto-detect exchange from ticker
        if ticker and not exchange_code:
            # Check for ticker suffix
            for suffix, exchange in TICKER_SUFFIX_MAP.items():
                if ticker.upper().endswith(suffix):
                    exchange_code = exchange
                    break
            
            # Default to NYSE/NASDAQ for US tickers without suffix
            if not exchange_code:
                exchange_code = "NASDAQ"  # Default assumption
        
        # Normalize exchange code
        exchange_code = exchange_code.upper()
        
        # Get exchange data
        if exchange_code in EXCHANGE_DATA:
            return {
                "status": "success",
                "exchange_code": exchange_code,
                "info": EXCHANGE_DATA[exchange_code],
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "status": "error",
                "error": f"Exchange '{exchange_code}' not found",
                "available_exchanges": list(EXCHANGE_DATA.keys()),
                "timestamp": datetime.now().isoformat()
            }
            
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def get_all_exchanges() -> Dict[str, Any]:
    """
    Lấy danh sách tất cả các sàn giao dịch được hỗ trợ.
    
    Returns:
        Dict chứa thông tin tất cả các sàn
    """
    return {
        "status": "success",
        "exchanges": EXCHANGE_DATA,
        "total": len(EXCHANGE_DATA),
        "timestamp": datetime.now().isoformat()
    }
