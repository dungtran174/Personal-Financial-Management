"""
Tool: get_candlestick_analysis
Mô tả: Phân tích mẫu nến Nhật (candlestick patterns)
Data source: yfinance historical data

Patterns supported:
- Doji
- Hammer / Hanging Man
- Shooting Star / Inverted Hammer
- Engulfing (Bullish/Bearish)
- Morning Star / Evening Star
- Three White Soldiers / Three Black Crows
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
import yfinance as yf
import pandas as pd
import numpy as np


def get_candlestick_analysis(
    symbol: str,
    period: str = "1mo",
    lookback_days: int = 5
) -> Dict[str, Any]:
    """
    Phân tích các mẫu nến đảo chiều.
    
    Args:
        symbol: Mã cổ phiếu
        period: Khoảng thời gian ("5d", "1mo", "3mo")
        lookback_days: Số ngày để phân tích patterns
    
    Returns:
        Dict chứa candlestick patterns detected
    
    Examples:
        >>> get_candlestick_analysis("FPT.VN", period="1mo")
        >>> get_candlestick_analysis("AAPL", period="3mo", lookback_days=10)
    """
    try:
        # Download data
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period)
        
        if hist.empty or len(hist) < 3:
            return {
                "status": "error",
                "error": f"Insufficient data for {symbol}",
                "timestamp": datetime.now().isoformat()
            }
        
        # Get recent candles
        recent = hist.tail(lookback_days)
        
        # Detect patterns
        patterns = []
        
        # Check each candle
        for i in range(len(recent)):
            candle_date = recent.index[i].strftime("%Y-%m-%d")
            candle_data = recent.iloc[i]
            
            # Single candle patterns
            pattern = _detect_single_candle_pattern(candle_data)
            if pattern:
                patterns.append({
                    "date": candle_date,
                    **pattern
                })
            
            # Multi-candle patterns (need at least 2 candles)
            if i >= 1:
                prev_candle = recent.iloc[i-1]
                pattern = _detect_two_candle_pattern(prev_candle, candle_data)
                if pattern:
                    patterns.append({
                        "date": candle_date,
                        **pattern
                    })
            
            # Three-candle patterns
            if i >= 2:
                candle1 = recent.iloc[i-2]
                candle2 = recent.iloc[i-1]
                candle3 = candle_data
                pattern = _detect_three_candle_pattern(candle1, candle2, candle3)
                if pattern:
                    patterns.append({
                        "date": candle_date,
                        **pattern
                    })
        
        # Get current candle info
        latest = recent.iloc[-1]
        current_pattern = _detect_single_candle_pattern(latest)
        
        return {
            "status": "success",
            "symbol": symbol,
            "period": period,
            "current_price": round(latest['Close'], 2),
            "current_candle": {
                "open": round(latest['Open'], 2),
                "high": round(latest['High'], 2),
                "low": round(latest['Low'], 2),
                "close": round(latest['Close'], 2),
                "pattern": current_pattern['pattern'] if current_pattern else "No specific pattern"
            },
            "patterns_detected": patterns,
            "total_patterns": len(patterns),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def _detect_single_candle_pattern(candle: pd.Series) -> Optional[Dict[str, Any]]:
    """Detect single candlestick patterns."""
    try:
        open_p = candle['Open']
        high = candle['High']
        low = candle['Low']
        close = candle['Close']
        
        # Calculate body and shadows
        body = abs(close - open_p)
        upper_shadow = high - max(close, open_p)
        lower_shadow = min(close, open_p) - low
        total_range = high - low
        
        if total_range == 0:
            return None
        
        body_pct = body / total_range
        upper_shadow_pct = upper_shadow / total_range
        lower_shadow_pct = lower_shadow / total_range
        
        # Doji: Very small body
        if body_pct < 0.1:
            return {
                "pattern": "Doji",
                "type": "Neutral/Reversal",
                "signal": "Indecision - potential reversal",
                "reliability": "Medium"
            }
        
        # Hammer: Small body at top, long lower shadow
        if lower_shadow_pct > 0.6 and body_pct < 0.3 and upper_shadow_pct < 0.1:
            if close > open_p:
                return {
                    "pattern": "Hammer",
                    "type": "Bullish Reversal",
                    "signal": "Strong buy signal after downtrend",
                    "reliability": "High"
                }
            else:
                return {
                    "pattern": "Hanging Man",
                    "type": "Bearish Reversal",
                    "signal": "Potential sell signal after uptrend",
                    "reliability": "Medium"
                }
        
        # Inverted Hammer / Shooting Star: Small body at bottom, long upper shadow
        if upper_shadow_pct > 0.6 and body_pct < 0.3 and lower_shadow_pct < 0.1:
            if close > open_p:
                return {
                    "pattern": "Inverted Hammer",
                    "type": "Bullish Reversal",
                    "signal": "Potential buy signal (needs confirmation)",
                    "reliability": "Medium"
                }
            else:
                return {
                    "pattern": "Shooting Star",
                    "type": "Bearish Reversal",
                    "signal": "Strong sell signal after uptrend",
                    "reliability": "High"
                }
        
        # Marubozu: Very long body, almost no shadows
        if body_pct > 0.9:
            if close > open_p:
                return {
                    "pattern": "Bullish Marubozu",
                    "type": "Bullish Continuation",
                    "signal": "Strong buying pressure",
                    "reliability": "High"
                }
            else:
                return {
                    "pattern": "Bearish Marubozu",
                    "type": "Bearish Continuation",
                    "signal": "Strong selling pressure",
                    "reliability": "High"
                }
        
        return None
        
    except Exception:
        return None


def _detect_two_candle_pattern(candle1: pd.Series, candle2: pd.Series) -> Optional[Dict[str, Any]]:
    """Detect two-candlestick patterns."""
    try:
        # Candle 1
        open1 = candle1['Open']
        close1 = candle1['Close']
        body1 = abs(close1 - open1)
        
        # Candle 2
        open2 = candle2['Open']
        close2 = candle2['Close']
        body2 = abs(close2 - open2)
        
        # Bullish Engulfing
        if (close1 < open1 and  # First candle bearish
            close2 > open2 and  # Second candle bullish
            open2 < close1 and  # Opens below previous close
            close2 > open1 and  # Closes above previous open
            body2 > body1 * 1.1):  # Second body larger
            return {
                "pattern": "Bullish Engulfing",
                "type": "Bullish Reversal",
                "signal": "Strong buy signal",
                "reliability": "High"
            }
        
        # Bearish Engulfing
        if (close1 > open1 and  # First candle bullish
            close2 < open2 and  # Second candle bearish
            open2 > close1 and  # Opens above previous close
            close2 < open1 and  # Closes below previous open
            body2 > body1 * 1.1):  # Second body larger
            return {
                "pattern": "Bearish Engulfing",
                "type": "Bearish Reversal",
                "signal": "Strong sell signal",
                "reliability": "High"
            }
        
        # Piercing Pattern (Bullish)
        if (close1 < open1 and  # First bearish
            close2 > open2 and  # Second bullish
            open2 < close1 and  # Opens below previous close
            close2 > (open1 + close1) / 2 and  # Closes above midpoint
            close2 < open1):  # But below previous open
            return {
                "pattern": "Piercing Pattern",
                "type": "Bullish Reversal",
                "signal": "Buy signal",
                "reliability": "Medium"
            }
        
        # Dark Cloud Cover (Bearish)
        if (close1 > open1 and  # First bullish
            close2 < open2 and  # Second bearish
            open2 > close1 and  # Opens above previous close
            close2 < (open1 + close1) / 2 and  # Closes below midpoint
            close2 > open1):  # But above previous open
            return {
                "pattern": "Dark Cloud Cover",
                "type": "Bearish Reversal",
                "signal": "Sell signal",
                "reliability": "Medium"
            }
        
        return None
        
    except Exception:
        return None


def _detect_three_candle_pattern(candle1: pd.Series, candle2: pd.Series, 
                                 candle3: pd.Series) -> Optional[Dict[str, Any]]:
    """Detect three-candlestick patterns."""
    try:
        # Candle data
        close1 = candle1['Close']
        open1 = candle1['Open']
        
        close2 = candle2['Close']
        open2 = candle2['Open']
        
        close3 = candle3['Close']
        open3 = candle3['Open']
        
        # Morning Star (Bullish)
        if (close1 < open1 and  # First bearish
            abs(close2 - open2) < abs(close1 - open1) * 0.3 and  # Second small body
            close3 > open3 and  # Third bullish
            close3 > (open1 + close1) / 2):  # Third closes above first midpoint
            return {
                "pattern": "Morning Star",
                "type": "Bullish Reversal",
                "signal": "Strong buy signal",
                "reliability": "High"
            }
        
        # Evening Star (Bearish)
        if (close1 > open1 and  # First bullish
            abs(close2 - open2) < abs(close1 - open1) * 0.3 and  # Second small body
            close3 < open3 and  # Third bearish
            close3 < (open1 + close1) / 2):  # Third closes below first midpoint
            return {
                "pattern": "Evening Star",
                "type": "Bearish Reversal",
                "signal": "Strong sell signal",
                "reliability": "High"
            }
        
        # Three White Soldiers (Bullish)
        if (close1 > open1 and close2 > open2 and close3 > open3 and  # All bullish
            close2 > close1 and close3 > close2 and  # Progressive highs
            open2 > open1 and open2 < close1 and  # Second opens within first
            open3 > open2 and open3 < close2):  # Third opens within second
            return {
                "pattern": "Three White Soldiers",
                "type": "Bullish Continuation",
                "signal": "Strong uptrend continuation",
                "reliability": "High"
            }
        
        # Three Black Crows (Bearish)
        if (close1 < open1 and close2 < open2 and close3 < open3 and  # All bearish
            close2 < close1 and close3 < close2 and  # Progressive lows
            open2 < open1 and open2 > close1 and  # Second opens within first
            open3 < open2 and open3 > close2):  # Third opens within second
            return {
                "pattern": "Three Black Crows",
                "type": "Bearish Continuation",
                "signal": "Strong downtrend continuation",
                "reliability": "High"
            }
        
        return None
        
    except Exception:
        return None


def get_candle_info(symbol: str, date: Optional[str] = None) -> Dict[str, Any]:
    """
    Lấy thông tin chi tiết về 1 cây nến cụ thể.
    
    Args:
        symbol: Mã cổ phiếu
        date: Ngày cụ thể (YYYY-MM-DD), None = latest
    
    Returns:
        Dict chứa candle details
    """
    try:
        ticker = yf.Ticker(symbol)
        
        if date:
            hist = ticker.history(start=date, period="5d")
        else:
            hist = ticker.history(period="5d")
        
        if hist.empty:
            return {
                "status": "error",
                "error": "No data available",
                "timestamp": datetime.now().isoformat()
            }
        
        candle = hist.iloc[-1]
        
        open_p = candle['Open']
        high = candle['High']
        low = candle['Low']
        close = candle['Close']
        volume = candle['Volume']
        
        # Calculate metrics
        body = abs(close - open_p)
        upper_shadow = high - max(close, open_p)
        lower_shadow = min(close, open_p) - low
        total_range = high - low
        
        change = close - open_p
        change_pct = (change / open_p * 100) if open_p != 0 else 0
        
        candle_type = "Bullish" if close > open_p else "Bearish" if close < open_p else "Neutral"
        
        pattern = _detect_single_candle_pattern(candle)
        
        return {
            "status": "success",
            "symbol": symbol,
            "date": hist.index[-1].strftime("%Y-%m-%d"),
            "ohlc": {
                "open": round(open_p, 2),
                "high": round(high, 2),
                "low": round(low, 2),
                "close": round(close, 2)
            },
            "volume": int(volume),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "type": candle_type,
            "body_size": round(body, 2),
            "upper_shadow": round(upper_shadow, 2),
            "lower_shadow": round(lower_shadow, 2),
            "total_range": round(total_range, 2),
            "pattern": pattern if pattern else {"pattern": "No specific pattern"},
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
