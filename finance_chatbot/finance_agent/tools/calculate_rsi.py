"""
Calculate RSI (Relative Strength Index) using backend OHLCV data.
Primary source: Backend /api/v1/price/candles
Fallback: yfinance
"""

import logging
from typing import Dict, Any
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


def _calculate_rsi_from_prices(prices: pd.Series, period: int = 14) -> float:
    """
    Calculate RSI from price series.
    
    Args:
        prices: Pandas Series of close prices
        period: RSI period (default: 14)
    
    Returns:
        RSI value (0-100)
    """
    delta = prices.diff()
    
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    
    # Avoid division by zero
    rs = gain / loss.replace(0, 1e-10)
    rsi = 100 - (100 / (1 + rs))
    
    return float(rsi.iloc[-1]) if not rsi.empty else None


def _yfinance_fallback(ticker: str, period: int, interval: str) -> Dict[str, Any]:
    """
    Fallback to yfinance for RSI calculation.
    """
    if not USE_YFINANCE:
        return {
            "ticker": ticker,
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
                "period": period,
                "error": f"No data from yfinance for {ticker}"
            }
        
        close_prices = data['Close']
        rsi_value = _calculate_rsi_from_prices(close_prices, period)
        current_price = float(close_prices.iloc[-1])
        
        # Determine signal
        if rsi_value > 70:
            signal = "OVERBOUGHT"
            interpretation = "Strong sell signal - asset may be overvalued"
        elif rsi_value < 30:
            signal = "OVERSOLD"
            interpretation = "Strong buy signal - asset may be undervalued"
        elif rsi_value > 60:
            signal = "BULLISH"
            interpretation = "Moderately bullish - upward momentum"
        elif rsi_value < 40:
            signal = "BEARISH"
            interpretation = "Moderately bearish - downward momentum"
        else:
            signal = "NEUTRAL"
            interpretation = "No strong signal - wait for confirmation"
        
        return {
            "ticker": ticker,
            "rsi": round(rsi_value, 2),
            "period": period,
            "interval": interval,
            "current_price": current_price,
            "signal": signal,
            "interpretation": interpretation,
            "source": "yfinance-fallback"
        }
        
    except Exception as e:
        logger.error(f"yfinance fallback failed: {e}")
        return {
            "ticker": ticker,
            "period": period,
            "error": f"yfinance fallback error: {str(e)}"
        }


def calculate_rsi(
    ticker: str,
    period: int = 14,
    interval: str = "1d"
) -> Dict[str, Any]:
    """
    Calculate RSI (Relative Strength Index) for a stock/crypto.
    
    RSI is a momentum oscillator that measures speed and magnitude of price changes.
    - RSI > 70: Overbought (potential sell signal)
    - RSI < 30: Oversold (potential buy signal)
    - RSI 30-70: Neutral zone
    
    Primary source: Backend API OHLCV data
    Fallback: yfinance
    
    Args:
        ticker: Stock/crypto ticker symbol (e.g., 'VCB.VN', 'BTCUSDT', 'AAPL')
        period: RSI period (default: 14)
        interval: Timeframe - "1m", "5m", "15m", "1h", "4h", "1d", "1w" (default: "1d")
    
    Returns:
        Dict with RSI value, signal, and interpretation
    """
    # Validate inputs
    if not ticker:
        return {"error": "ticker parameter required"}
    
    if period < 2:
        return {"error": "period must be at least 2"}
    
    # ============================================================
    # PRIMARY: Try backend API first
    # ============================================================
    try:
        logger.info(f"Fetching OHLCV data from backend for {ticker} to calculate RSI{period}")
        
        # Fetch enough candles for RSI calculation (period * 2 + 20 for warmup)
        limit = max(period * 3 + 20, 100)
        candles = get_price_candles(
            symbol=ticker,
            timeframe=interval,
            limit=limit
        )
        
        if not candles or len(candles) < period + 1:
            logger.warning(f"Insufficient data from backend: got {len(candles) if candles else 0}, need {period + 1}")
            raise BackendAPIError("Insufficient candle data for RSI calculation")
        
        # Convert to DataFrame
        df = pd.DataFrame(candles)
        
        # Ensure we have close prices
        if 'close' not in df.columns:
            raise BackendAPIError("Missing 'close' column in candle data")
        
        close_prices = pd.Series(df['close'].values)
        
        # Calculate RSI
        rsi_value = _calculate_rsi_from_prices(close_prices, period)
        current_price = float(close_prices.iloc[-1])
        
        if rsi_value is None:
            raise BackendAPIError("RSI calculation returned None")
        
        # Determine signal and interpretation
        if rsi_value > 70:
            signal = "OVERBOUGHT"
            interpretation = "Strong sell signal - asset may be overvalued"
        elif rsi_value < 30:
            signal = "OVERSOLD"
            interpretation = "Strong buy signal - asset may be undervalued"
        elif rsi_value > 60:
            signal = "BULLISH"
            interpretation = "Moderately bullish - upward momentum"
        elif rsi_value < 40:
            signal = "BEARISH"
            interpretation = "Moderately bearish - downward momentum"
        else:
            signal = "NEUTRAL"
            interpretation = "No strong signal - wait for confirmation"
        
        logger.info(f"✅ Successfully calculated RSI{period} for {ticker}: {rsi_value:.2f} ({signal})")
        
        return {
            "ticker": ticker,
            "rsi": round(rsi_value, 2),
            "period": period,
            "interval": interval,
            "current_price": round(current_price, 4),
            "signal": signal,
            "interpretation": interpretation,
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
