"""
Tool: get_pattern_recognition
Mô tả: Nhận diện các mô hình giá cổ phiếu (chart patterns)
Data source: yfinance historical data + pattern detection algorithms

Patterns supported:
- Head and Shoulders (Đầu vai)
- Double Top/Bottom (Đỉnh đôi/Đáy đôi)
- Triangle (Tam giác)
- Flag and Pennant
- Support and Resistance levels
"""

from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
import numpy as np
from scipy.signal import argrelextrema


def get_pattern_recognition(
    symbol: str,
    period: str = "6mo",
    patterns: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Nhận diện các mô hình giá cổ phiếu.
    
    Args:
        symbol: Mã cổ phiếu
        period: Khoảng thời gian ("1mo", "3mo", "6mo", "1y")
        patterns: List patterns cần tìm (None = all patterns)
    
    Returns:
        Dict chứa patterns detected
    
    Examples:
        >>> get_pattern_recognition("FPT.VN", period="6mo")
        >>> get_pattern_recognition("AAPL", period="1y", patterns=["double_top", "support_resistance"])
    """
    try:
        # Download data
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period)
        
        if hist.empty or len(hist) < 30:
            return {
                "status": "error",
                "error": f"Insufficient data for {symbol}",
                "timestamp": datetime.now().isoformat()
            }
        
        # Available patterns
        all_patterns = ["head_shoulders", "double_top", "double_bottom", 
                       "triangle", "support_resistance"]
        
        if patterns is None:
            patterns = all_patterns
        
        # Detect patterns
        results = {}
        
        if "head_shoulders" in patterns:
            results["head_shoulders"] = _detect_head_shoulders(hist)
        
        if "double_top" in patterns:
            results["double_top"] = _detect_double_top(hist)
        
        if "double_bottom" in patterns:
            results["double_bottom"] = _detect_double_bottom(hist)
        
        if "triangle" in patterns:
            results["triangle"] = _detect_triangle(hist)
        
        if "support_resistance" in patterns:
            results["support_resistance"] = _find_support_resistance(hist)
        
        # Current price
        current_price = hist['Close'].iloc[-1]
        
        return {
            "status": "success",
            "symbol": symbol,
            "period": period,
            "current_price": round(current_price, 2),
            "patterns_detected": results,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def _detect_head_shoulders(hist: pd.DataFrame) -> Dict[str, Any]:
    """Detect Head and Shoulders pattern."""
    try:
        prices = hist['Close'].values
        
        # Find local maxima
        order = min(10, len(prices) // 10)
        if order < 1:
            order = 1
            
        maxima_idx = argrelextrema(prices, np.greater, order=order)[0]
        
        if len(maxima_idx) < 3:
            return {
                "detected": False,
                "reason": "Insufficient peaks"
            }
        
        # Look for pattern: left shoulder < head > right shoulder
        for i in range(len(maxima_idx) - 2):
            left = maxima_idx[i]
            head = maxima_idx[i + 1]
            right = maxima_idx[i + 2]
            
            left_price = prices[left]
            head_price = prices[head]
            right_price = prices[right]
            
            # Check if it's a head and shoulders
            if (left_price < head_price and 
                right_price < head_price and
                abs(left_price - right_price) / left_price < 0.05):  # Shoulders similar height
                
                # Calculate neckline
                left_valley = prices[left:head].min()
                right_valley = prices[head:right].min()
                neckline = (left_valley + right_valley) / 2
                
                current_price = prices[-1]
                
                return {
                    "detected": True,
                    "type": "Head and Shoulders",
                    "signal": "Bearish reversal pattern",
                    "left_shoulder": round(left_price, 2),
                    "head": round(head_price, 2),
                    "right_shoulder": round(right_price, 2),
                    "neckline": round(neckline, 2),
                    "current_price": round(current_price, 2),
                    "price_target": round(neckline - (head_price - neckline), 2),
                    "confirmation": "Confirmed if price breaks below neckline" if current_price > neckline else "Pattern confirmed"
                }
        
        return {
            "detected": False,
            "reason": "No valid pattern found"
        }
        
    except Exception as e:
        return {
            "detected": False,
            "error": str(e)
        }


def _detect_double_top(hist: pd.DataFrame) -> Dict[str, Any]:
    """Detect Double Top pattern."""
    try:
        prices = hist['Close'].values
        
        # Find local maxima
        order = min(10, len(prices) // 10)
        if order < 1:
            order = 1
            
        maxima_idx = argrelextrema(prices, np.greater, order=order)[0]
        
        if len(maxima_idx) < 2:
            return {
                "detected": False,
                "reason": "Insufficient peaks"
            }
        
        # Look for two similar peaks
        for i in range(len(maxima_idx) - 1):
            peak1_idx = maxima_idx[i]
            peak2_idx = maxima_idx[i + 1]
            
            peak1 = prices[peak1_idx]
            peak2 = prices[peak2_idx]
            
            # Check if peaks are similar (within 3%)
            if abs(peak1 - peak2) / peak1 < 0.03:
                # Find valley between peaks
                valley = prices[peak1_idx:peak2_idx].min()
                
                current_price = prices[-1]
                
                return {
                    "detected": True,
                    "type": "Double Top",
                    "signal": "Bearish reversal pattern",
                    "peak1": round(peak1, 2),
                    "peak2": round(peak2, 2),
                    "valley": round(valley, 2),
                    "current_price": round(current_price, 2),
                    "price_target": round(valley - (peak1 - valley), 2),
                    "confirmation": "Confirmed if price breaks below valley" if current_price > valley else "Pattern confirmed"
                }
        
        return {
            "detected": False,
            "reason": "No valid double top found"
        }
        
    except Exception as e:
        return {
            "detected": False,
            "error": str(e)
        }


def _detect_double_bottom(hist: pd.DataFrame) -> Dict[str, Any]:
    """Detect Double Bottom pattern."""
    try:
        prices = hist['Close'].values
        
        # Find local minima
        order = min(10, len(prices) // 10)
        if order < 1:
            order = 1
            
        minima_idx = argrelextrema(prices, np.less, order=order)[0]
        
        if len(minima_idx) < 2:
            return {
                "detected": False,
                "reason": "Insufficient valleys"
            }
        
        # Look for two similar bottoms
        for i in range(len(minima_idx) - 1):
            bottom1_idx = minima_idx[i]
            bottom2_idx = minima_idx[i + 1]
            
            bottom1 = prices[bottom1_idx]
            bottom2 = prices[bottom2_idx]
            
            # Check if bottoms are similar (within 3%)
            if abs(bottom1 - bottom2) / bottom1 < 0.03:
                # Find peak between bottoms
                peak = prices[bottom1_idx:bottom2_idx].max()
                
                current_price = prices[-1]
                
                return {
                    "detected": True,
                    "type": "Double Bottom",
                    "signal": "Bullish reversal pattern",
                    "bottom1": round(bottom1, 2),
                    "bottom2": round(bottom2, 2),
                    "peak": round(peak, 2),
                    "current_price": round(current_price, 2),
                    "price_target": round(peak + (peak - bottom1), 2),
                    "confirmation": "Confirmed if price breaks above peak" if current_price < peak else "Pattern confirmed"
                }
        
        return {
            "detected": False,
            "reason": "No valid double bottom found"
        }
        
    except Exception as e:
        return {
            "detected": False,
            "error": str(e)
        }


def _detect_triangle(hist: pd.DataFrame) -> Dict[str, Any]:
    """Detect Triangle patterns (Ascending, Descending, Symmetrical)."""
    try:
        prices = hist['Close'].values
        
        if len(prices) < 30:
            return {
                "detected": False,
                "reason": "Insufficient data"
            }
        
        # Get recent data (last 60 days or available)
        recent_prices = prices[-min(60, len(prices)):]
        
        # Find highs and lows
        order = 5
        highs_idx = argrelextrema(recent_prices, np.greater, order=order)[0]
        lows_idx = argrelextrema(recent_prices, np.less, order=order)[0]
        
        if len(highs_idx) < 2 or len(lows_idx) < 2:
            return {
                "detected": False,
                "reason": "Insufficient swing points"
            }
        
        # Calculate trend lines
        highs = recent_prices[highs_idx]
        lows = recent_prices[lows_idx]
        
        # High trend (resistance)
        high_slope = (highs[-1] - highs[0]) / len(highs) if len(highs) > 1 else 0
        
        # Low trend (support)
        low_slope = (lows[-1] - lows[0]) / len(lows) if len(lows) > 1 else 0
        
        # Determine triangle type
        if abs(high_slope) < 0.5 and low_slope > 0.5:
            triangle_type = "Ascending Triangle"
            signal = "Bullish continuation pattern"
        elif high_slope < -0.5 and abs(low_slope) < 0.5:
            triangle_type = "Descending Triangle"
            signal = "Bearish continuation pattern"
        elif abs(high_slope - low_slope) < 1.0:
            triangle_type = "Symmetrical Triangle"
            signal = "Continuation pattern (direction depends on breakout)"
        else:
            return {
                "detected": False,
                "reason": "No clear triangle pattern"
            }
        
        current_price = prices[-1]
        resistance = highs[-1]
        support = lows[-1]
        
        return {
            "detected": True,
            "type": triangle_type,
            "signal": signal,
            "resistance": round(resistance, 2),
            "support": round(support, 2),
            "current_price": round(current_price, 2),
            "breakout_watch": "Monitor for breakout above resistance or below support"
        }
        
    except Exception as e:
        return {
            "detected": False,
            "error": str(e)
        }


def _find_support_resistance(hist: pd.DataFrame, num_levels: int = 3) -> Dict[str, Any]:
    """Find support and resistance levels."""
    try:
        prices = hist['Close'].values
        
        # Find local maxima and minima
        order = min(10, len(prices) // 10)
        if order < 1:
            order = 1
            
        maxima_idx = argrelextrema(prices, np.greater, order=order)[0]
        minima_idx = argrelextrema(prices, np.less, order=order)[0]
        
        # Get price levels
        resistance_levels = prices[maxima_idx] if len(maxima_idx) > 0 else []
        support_levels = prices[minima_idx] if len(minima_idx) > 0 else []
        
        # Cluster similar levels
        def cluster_levels(levels, tolerance=0.02):
            if len(levels) == 0:
                return []
            
            levels_sorted = sorted(levels, reverse=True)
            clustered = []
            current_cluster = [levels_sorted[0]]
            
            for level in levels_sorted[1:]:
                if abs(level - current_cluster[0]) / current_cluster[0] < tolerance:
                    current_cluster.append(level)
                else:
                    clustered.append(np.mean(current_cluster))
                    current_cluster = [level]
            
            clustered.append(np.mean(current_cluster))
            return clustered
        
        resistance_clustered = cluster_levels(resistance_levels)[:num_levels]
        support_clustered = cluster_levels(support_levels)[:num_levels]
        
        current_price = prices[-1]
        
        # Find nearest levels
        nearest_resistance = min([r for r in resistance_clustered if r > current_price], 
                                default=None)
        nearest_support = max([s for s in support_clustered if s < current_price], 
                             default=None)
        
        return {
            "detected": True,
            "current_price": round(current_price, 2),
            "resistance_levels": [round(r, 2) for r in resistance_clustered],
            "support_levels": [round(s, 2) for s in support_clustered],
            "nearest_resistance": round(nearest_resistance, 2) if nearest_resistance else None,
            "nearest_support": round(nearest_support, 2) if nearest_support else None,
            "price_position": "Between support and resistance"
        }
        
    except Exception as e:
        return {
            "detected": False,
            "error": str(e)
        }
