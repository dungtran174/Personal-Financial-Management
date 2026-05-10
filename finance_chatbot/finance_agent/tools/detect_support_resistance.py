"""
Detect Support and Resistance levels using backend OHLCV data.
Primary source: Backend /api/v1/price/candles
Fallback: yfinance
"""

import logging
from typing import Dict, Any, List
import pandas as pd
import numpy as np

from .backend_api import get_price_candles, BackendAPIError

logger = logging.getLogger(__name__)

# Try to import yfinance for fallback
USE_YFINANCE = False
try:
    import yfinance as yf
    USE_YFINANCE = True
except ImportError:
    logger.warning("yfinance not available - fallback disabled")


def _find_support_resistance(df: pd.DataFrame, window: int = 20) -> Dict[str, List[float]]:
    """
    Detect support and resistance levels using local minima/maxima.
    
    Args:
        df: DataFrame with OHLCV data
        window: Window size for finding local extrema
    
    Returns:
        Dict with support and resistance levels
    """
    # Find local minima (support)
    df['local_min'] = df['low'].rolling(window=window, center=True).min()
    support_levels = df[df['low'] == df['local_min']]['low'].unique()
    
    # Find local maxima (resistance)
    df['local_max'] = df['high'].rolling(window=window, center=True).max()
    resistance_levels = df[df['high'] == df['local_max']]['high'].unique()
    
    # Sort and get top 3-5 most significant levels
    support_levels = sorted(support_levels)[-5:]  # Top 5 support levels
    resistance_levels = sorted(resistance_levels)[:5]  # Top 5 resistance levels
    
    return {
        "support": [float(x) for x in support_levels if not np.isnan(x)],
        "resistance": [float(x) for x in resistance_levels if not np.isnan(x)]
    }


def _yfinance_fallback(ticker: str, period: str, interval: str) -> Dict[str, Any]:
    """
    Fallback to yfinance for support/resistance detection.
    """
    if not USE_YFINANCE:
        return {
            "ticker": ticker,
            "error": "yfinance not available for fallback"
        }
    
    try:
        logger.info(f"Using yfinance fallback for {ticker}")
        
        data = yf.download(ticker, period=period, interval=interval, progress=False)
        
        if data.empty:
            return {
                "ticker": ticker,
                "error": f"No data from yfinance for {ticker}"
            }
        
        levels = _find_support_resistance(data)
        current_price = float(data['Close'].iloc[-1])
        
        # Find nearest support/resistance
        supports = levels['support']
        resistances = levels['resistance']
        
        nearest_support = max([s for s in supports if s < current_price], default=None)
        nearest_resistance = min([r for r in resistances if r > current_price], default=None)
        
        return {
            "ticker": ticker,
            "period": period,
            "interval": interval,
            "current_price": round(current_price, 4),
            "support_levels": [round(x, 4) for x in supports],
            "resistance_levels": [round(x, 4) for x in resistances],
            "nearest_support": round(nearest_support, 4) if nearest_support else None,
            "nearest_resistance": round(nearest_resistance, 4) if nearest_resistance else None,
            "source": "yfinance-fallback"
        }
        
    except Exception as e:
        logger.error(f"yfinance fallback failed: {e}")
        return {
            "ticker": ticker,
            "error": f"yfinance fallback error: {str(e)}"
        }


def detect_support_resistance(
    ticker: str,
    period: str = "3mo",
    interval: str = "1d"
) -> Dict[str, Any]:
    """
    Detect support and resistance price levels for a stock/crypto.
    
    Support: Price levels where downward trend tends to pause (buyers step in)
    Resistance: Price levels where upward trend tends to pause (sellers step in)
    
    Primary source: Backend API OHLCV data
    Fallback: yfinance
    
    Args:
        ticker: Stock/crypto ticker symbol (e.g., 'VCB.VN', 'BTCUSDT', 'AAPL')
        period: Historical period - "1mo", "3mo", "6mo", "1y" (default: "3mo")
        interval: Timeframe - "15m", "1h", "4h", "1d", "1w" (default: "1d")
    
    Returns:
        Dict with support/resistance levels and current position
    """
    # Validate inputs
    if not ticker:
        return {"error": "ticker parameter required"}
    
    # ============================================================
    # PRIMARY: Try backend API first
    # ============================================================
    try:
        logger.info(f"Fetching OHLCV data from backend for {ticker} to detect support/resistance")
        
        # Map period to number of candles
        period_to_limit = {
            "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730
        }
        
        limit = period_to_limit.get(period, 90)
        
        candles = get_price_candles(
            symbol=ticker,
            timeframe=interval,
            limit=limit
        )
        
        if not candles or len(candles) < 20:
            logger.warning(f"Insufficient data from backend: got {len(candles) if candles else 0}, need at least 20")
            raise BackendAPIError("Insufficient candle data")
        
        # Convert to DataFrame
        df = pd.DataFrame(candles)
        
        # Ensure we have required columns
        required_cols = ['open', 'high', 'low', 'close']
        if not all(col in df.columns for col in required_cols):
            raise BackendAPIError(f"Missing required columns in candle data")
        
        # Find support/resistance levels
        levels = _find_support_resistance(df, window=20)
        current_price = float(df['close'].iloc[-1])
        
        # Find nearest support/resistance
        supports = levels['support']
        resistances = levels['resistance']
        
        nearest_support = max([s for s in supports if s < current_price], default=None)
        nearest_resistance = min([r for r in resistances if r > current_price], default=None)
        
        # Calculate distance to nearest levels
        support_distance = None
        resistance_distance = None
        
        if nearest_support:
            support_distance = round(((current_price - nearest_support) / current_price) * 100, 2)
        
        if nearest_resistance:
            resistance_distance = round(((nearest_resistance - current_price) / current_price) * 100, 2)
        
        logger.info(f"✅ Successfully detected support/resistance for {ticker}")
        
        return {
            "ticker": ticker,
            "period": period,
            "interval": interval,
            "current_price": round(current_price, 4),
            "support_levels": [round(x, 4) for x in supports],
            "resistance_levels": [round(x, 4) for x in resistances],
            "nearest_support": round(nearest_support, 4) if nearest_support else None,
            "nearest_resistance": round(nearest_resistance, 4) if nearest_resistance else None,
            "support_distance_percent": support_distance,
            "resistance_distance_percent": resistance_distance,
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
    return _yfinance_fallback(ticker, period, interval)
