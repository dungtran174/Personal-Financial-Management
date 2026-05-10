"""
Calculate Moving Averages using backend OHLCV data.
Primary source: Backend /api/v1/price/candles
Fallback: yfinance
"""

import logging
from typing import Dict, Any, Optional
import pandas as pd

from .backend_api import get_price_candles, BackendAPIError

logger = logging.getLogger(__name__)

# Try to import yfinance for fallback
USE_YFINANCE = False
try:
    import yfinance as yf
    USE_YFINANCE = True
except ImportError:
    logger.warning("yfinance not available - fallback disabled")


def _calculate_ma_from_prices(prices: pd.Series, period: int, ma_type: str = "SMA") -> float:
    """
    Calculate moving average from price series.
    
    Args:
        prices: Pandas Series of prices
        period: MA period
        ma_type: "SMA" or "EMA"
    
    Returns:
        Latest MA value
    """
    if ma_type.upper() == "SMA":
        ma = prices.rolling(window=period).mean()
    elif ma_type.upper() == "EMA":
        ma = prices.ewm(span=period, adjust=False).mean()
    else:
        raise ValueError(f"Invalid ma_type: {ma_type}. Use 'SMA' or 'EMA'")
    
    return float(ma.iloc[-1]) if not ma.empty else None


def _yfinance_fallback(ticker: str, period: int, ma_type: str, interval: str) -> Dict[str, Any]:
    """
    Fallback to yfinance for MA calculation.
    """
    if not USE_YFINANCE:
        return {
            "ticker": ticker,
            "ma_type": ma_type,
            "period": period,
            "error": "yfinance not available for fallback"
        }
    
    try:
        logger.info(f"Using yfinance fallback for {ticker}")
        
        # Map interval to yfinance period
        period_map = {
            "1m": "7d", "5m": "1mo", "15m": "1mo", "30m": "1mo",
            "1h": "3mo", "4h": "6mo", "1d": "2y", "1w": "5y"
        }
        
        yf_period = period_map.get(interval, "1y")
        
        data = yf.download(ticker, period=yf_period, interval=interval, progress=False)
        
        if data.empty:
            return {
                "ticker": ticker,
                "ma_type": ma_type,
                "period": period,
                "error": f"No data from yfinance for {ticker}"
            }
        
        close_prices = data['Close']
        ma_value = _calculate_ma_from_prices(close_prices, period, ma_type)
        current_price = float(close_prices.iloc[-1])
        
        return {
            "ticker": ticker,
            "ma_type": ma_type,
            "period": period,
            "interval": interval,
            "current_ma": ma_value,
            "current_price": current_price,
            "signal": "BULLISH" if current_price > ma_value else "BEARISH",
            "source": "yfinance-fallback"
        }
        
    except Exception as e:
        logger.error(f"yfinance fallback failed: {e}")
        return {
            "ticker": ticker,
            "ma_type": ma_type,
            "period": period,
            "error": f"yfinance fallback error: {str(e)}"
        }


def calculate_moving_average(
    ticker: str,
    period: int = 20,
    ma_type: str = "SMA",
    interval: str = "1d"
) -> Dict[str, Any]:
    """
    Calculate Moving Average for a stock/crypto.
    
    Primary source: Backend API OHLCV data
    Fallback: yfinance
    
    Args:
        ticker: Stock/crypto ticker symbol (e.g., 'VCB.VN', 'BTCUSDT', 'AAPL')
        period: MA period (default: 20)
        ma_type: "SMA" (Simple) or "EMA" (Exponential) (default: "SMA")
        interval: Timeframe - "1m", "5m", "15m", "1h", "4h", "1d", "1w" (default: "1d")
    
    Returns:
        Dict with MA value, current price, signal, and metadata
    """
    # Validate inputs
    if not ticker:
        return {"error": "ticker parameter required"}
    
    if period < 2:
        return {"error": "period must be at least 2"}
    
    if ma_type.upper() not in ["SMA", "EMA"]:
        return {"error": "ma_type must be 'SMA' or 'EMA'"}
    
    # ============================================================
    # PRIMARY: Try backend API first
    # ============================================================
    try:
        logger.info(f"Fetching OHLCV data from backend for {ticker} to calculate {ma_type}{period}")
        
        # Fetch enough candles for calculation (period * 2 + 20 for EMA warmup)
        limit = max(period * 2 + 20, 100)
        candles = get_price_candles(
            symbol=ticker,
            timeframe=interval,
            limit=limit
        )
        
        if not candles or len(candles) < period:
            logger.warning(f"Insufficient data from backend: got {len(candles) if candles else 0}, need {period}")
            raise BackendAPIError("Insufficient candle data")
        
        # Convert to DataFrame
        df = pd.DataFrame(candles)
        
        # Ensure we have close prices
        if 'close' not in df.columns:
            raise BackendAPIError("Missing 'close' column in candle data")
        
        close_prices = pd.Series(df['close'].values)
        
        # Calculate MA
        ma_value = _calculate_ma_from_prices(close_prices, period, ma_type)
        current_price = float(close_prices.iloc[-1])
        
        if ma_value is None:
            raise BackendAPIError("MA calculation returned None")
        
        # Determine signal
        signal = "BULLISH" if current_price > ma_value else "BEARISH"
        distance_pct = ((current_price - ma_value) / ma_value) * 100
        
        logger.info(f"✅ Successfully calculated {ma_type}{period} for {ticker}: {ma_value:.2f}")
        
        return {
            "ticker": ticker,
            "ma_type": ma_type.upper(),
            "period": period,
            "interval": interval,
            "current_ma": round(ma_value, 4),
            "current_price": round(current_price, 4),
            "distance_percent": round(distance_pct, 2),
            "signal": signal,
            "data_points": len(candles),
            "source": "backend-api"
        }
        
    except BackendAPIError as e:
        logger.warning(f"Backend API failed for {ticker}: {e}. Falling back to yfinance...")
    except Exception as e:
        logger.error(f"Unexpected error with backend API for {ticker}: {e}")
    
    # ============================================================
    # FALLBACK: Use yfinance
    # ============================================================
    logger.info(f"Using yfinance fallback for {ticker}")
    return _yfinance_fallback(ticker, period, ma_type, interval)
