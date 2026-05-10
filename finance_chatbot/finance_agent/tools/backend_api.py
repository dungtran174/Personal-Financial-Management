"""
Backend API helper module for making requests to the backend server.
Provides centralized error handling and fallback mechanisms.
"""

import requests
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)

# Backend configuration
BACKEND_BASE_URL = "http://localhost:8000"
BACKEND_TIMEOUT = 10  # seconds

class BackendAPIError(Exception):
    """Custom exception for backend API errors"""
    pass


def _make_request(
    endpoint: str,
    method: str = "GET",
    params: Optional[Dict[str, Any]] = None,
    json_data: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = BACKEND_TIMEOUT,
    token: Optional[str] = None
) -> requests.Response:
    """
    Make HTTP request to backend API.
    
    Args:
        endpoint: API endpoint (e.g., '/api/v1/market/ticker-detail')
        method: HTTP method (GET, POST, etc.)
        params: Query parameters
        json_data: JSON body data
        headers: Request headers
        timeout: Request timeout in seconds
        token: JWT token for authentication (optional)
    
    Returns:
        Response object
        
    Raises:
        BackendAPIError: If request fails
    """
    url = f"{BACKEND_BASE_URL}{endpoint}"
    
    # Initialize headers if None
    if headers is None:
        headers = {}
        
    # Add Authorization header if token provided
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        logger.debug(f"Backend API request: {method} {url} params={params}")
        
        response = requests.request(
            method=method,
            url=url,
            params=params,
            json=json_data,
            headers=headers,
            timeout=timeout
        )
        
        response.raise_for_status()
        return response
        
    except requests.exceptions.Timeout:
        logger.error(f"Backend API timeout: {url}")
        raise BackendAPIError(f"Request timeout after {timeout}s")
    except requests.exceptions.ConnectionError:
        logger.error(f"Backend API connection error: {url}")
        raise BackendAPIError("Cannot connect to backend server")
    except requests.exceptions.HTTPError as e:
        logger.error(f"Backend API HTTP error: {e.response.status_code} {url}")
        raise BackendAPIError(f"HTTP {e.response.status_code}: {e.response.text}")
    except Exception as e:
        logger.error(f"Backend API unexpected error: {e}")
        raise BackendAPIError(f"Unexpected error: {str(e)}")


def get_ticker_detail(symbol: str) -> Dict[str, Any]:
    """
    Get detailed ticker information from backend.
    
    Args:
        symbol: Stock/crypto ticker symbol (e.g., 'VCB.VN', 'BTCUSDT')
    
    Returns:
        Dict with ticker details including price, volume, change, etc.
        Normalizes response to include 'price' field (from 'close')
        
    Raises:
        BackendAPIError: If request fails
    """
    response = _make_request(
        endpoint="/api/v1/market/ticker-detail",
        params={"symbol": symbol}
    )
    
    data = response.json()
    
    # Normalize: add 'price' field if not exists (use 'close' as price)
    if 'close' in data and 'price' not in data:
        data['price'] = data['close']
    
    return data


def get_multiple_tickers(symbols: List[str]) -> List[Dict[str, Any]]:
    """
    Get details for multiple tickers at once.
    
    Args:
        symbols: List of ticker symbols
    
    Returns:
        List of ticker detail dictionaries
        
    Raises:
        BackendAPIError: If request fails
    """
    response = _make_request(
        endpoint="/api/v1/market/tickers",
        params={"symbols": ",".join(symbols)}
    )
    return response.json()


def get_price_candles(
    symbol: str,
    timeframe: str = "1d",
    limit: Optional[int] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get OHLCV (candlestick) data from backend.
    
    Args:
        symbol: Stock/crypto ticker symbol
        timeframe: Timeframe (1m, 5m, 15m, 1h, 4h, 1d, 1w)
        limit: Number of candles to return
        start_time: Start timestamp (ISO format)
        end_time: End timestamp (ISO format)
    
    Returns:
        List of OHLCV candles with structure:
        [{
            "timestamp": "2024-01-01T00:00:00Z",
            "open": 100.0,
            "high": 105.0,
            "low": 99.0,
            "close": 103.0,
            "volume": 1000000
        }, ...]
        
    Raises:
        BackendAPIError: If request fails
    """
    params = {
        "symbol": symbol,
        "timeframe": timeframe
    }
    
    if limit:
        params["limit"] = limit
    if start_time:
        params["start_time"] = start_time
    if end_time:
        params["end_time"] = end_time
    
    response = _make_request(
        endpoint="/api/v1/price/candles",
        params=params
    )
    
    data = response.json()
    
    # Backend returns nested structure: {symbol, timeframe, candles: [...]}
    # Extract and normalize the candles array
    if isinstance(data, dict) and 'candles' in data:
        candles = data['candles']
        # Normalize: ensure 'timestamp' field exists (from 'ts')
        for candle in candles:
            if 'ts' in candle and 'timestamp' not in candle:
                candle['timestamp'] = candle['ts']
        return candles
    elif isinstance(data, list):
        # Already a list of candles
        return data
    else:
        raise BackendAPIError(f"Unexpected candle data structure: {type(data)}")


def get_market_news(limit: int = 10) -> List[Dict[str, Any]]:
    """
    Get market news from backend RSS feed.
    
    Args:
        limit: Number of news articles to return
    
    Returns:
        List of news articles with structure:
        [{
            "title": "...",
            "link": "...",
            "published": "...",
            "description": "..."
        }, ...]
        
    Raises:
        BackendAPIError: If request fails
    """
    response = _make_request(
        endpoint="/api/v1/news",
        params={"limit": limit}
    )
    return response.json()


def search_assets(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Search for assets (stocks, crypto) in backend database.
    
    Args:
        query: Search query (symbol or name)
        limit: Maximum results to return
    
    Returns:
        List of matching assets
        
    Raises:
        BackendAPIError: If request fails
    """
    response = _make_request(
        endpoint="/api/v1/assets",
        params={"q": query, "limit": limit}
    )
    return response.json()


def get_vn_gainers(limit: int = 10) -> List[Dict[str, Any]]:
    """Get top VN stock gainers"""
    response = _make_request(
        endpoint="/api/v1/market/vn-gainers",
        params={"limit": limit}
    )
    return response.json()


def get_vn_losers(limit: int = 10) -> List[Dict[str, Any]]:
    """Get top VN stock losers"""
    response = _make_request(
        endpoint="/api/v1/market/vn-losers",
        params={"limit": limit}
    )
    return response.json()


def check_backend_health() -> bool:
    """
    Check if backend server is healthy and responsive.
    
    Returns:
        True if backend is healthy, False otherwise
    """
    try:
        response = _make_request(
            endpoint="/api/v1/health",
            timeout=3
        )
        data = response.json()
        return data.get("status") == "healthy"
    except:
        return False
