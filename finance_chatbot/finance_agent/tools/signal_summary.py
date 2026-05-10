"""
Tool: get_signal_summary
Mô tả: Tổng hợp tín hiệu mua/bán từ nhiều chỉ báo kỹ thuật
Data source: yfinance + technical indicators

Indicators used:
- Moving Averages (MA, EMA)
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands
- Volume
- Stochastic
"""

from typing import Dict, Any, Optional
from datetime import datetime
import yfinance as yf
import pandas as pd
import numpy as np


def get_signal_summary(
    symbol: str,
    period: str = "3mo"
) -> Dict[str, Any]:
    """
    Tổng hợp tín hiệu mua/bán từ các chỉ báo kỹ thuật.
    
    Args:
        symbol: Mã cổ phiếu
        period: Khoảng thời gian để tính toán
    
    Returns:
        Dict chứa tổng hợp tín hiệu và recommendation
    
    Examples:
        >>> get_signal_summary("FPT.VN")
        >>> get_signal_summary("AAPL", period="6mo")
    """
    try:
        # Download data
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period)
        
        if hist.empty or len(hist) < 50:
            return {
                "status": "error",
                "error": f"Insufficient data for {symbol}",
                "timestamp": datetime.now().isoformat()
            }
        
        # Calculate all indicators
        signals = {}
        
        # 1. Moving Averages
        ma_signals = _analyze_moving_averages(hist)
        signals["moving_averages"] = ma_signals
        
        # 2. RSI
        rsi_signal = _analyze_rsi(hist)
        signals["rsi"] = rsi_signal
        
        # 3. MACD
        macd_signal = _analyze_macd(hist)
        signals["macd"] = macd_signal
        
        # 4. Bollinger Bands
        bb_signal = _analyze_bollinger(hist)
        signals["bollinger_bands"] = bb_signal
        
        # 5. Stochastic
        stoch_signal = _analyze_stochastic(hist)
        signals["stochastic"] = stoch_signal
        
        # 6. Volume
        volume_signal = _analyze_volume(hist)
        signals["volume"] = volume_signal
        
        # Calculate overall signal
        overall = _calculate_overall_signal(signals)
        
        current_price = hist['Close'].iloc[-1]
        
        return {
            "status": "success",
            "symbol": symbol,
            "current_price": round(current_price, 2),
            "overall_signal": overall["signal"],
            "overall_score": overall["score"],
            "recommendation": overall["recommendation"],
            "confidence": overall["confidence"],
            "signals": signals,
            "summary": _generate_summary(signals, overall),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def _analyze_moving_averages(hist: pd.DataFrame) -> Dict[str, Any]:
    """Analyze Moving Average signals."""
    try:
        close = hist['Close']
        
        # Calculate MAs
        ma10 = close.rolling(window=10).mean()
        ma20 = close.rolling(window=20).mean()
        ma50 = close.rolling(window=50).mean()
        
        current_price = close.iloc[-1]
        
        signals = []
        buy_count = 0
        sell_count = 0
        
        # Price vs MA10
        if len(ma10) > 0 and not pd.isna(ma10.iloc[-1]):
            if current_price > ma10.iloc[-1]:
                signals.append("Price above MA10 (Bullish)")
                buy_count += 1
            else:
                signals.append("Price below MA10 (Bearish)")
                sell_count += 1
        
        # Price vs MA20
        if len(ma20) > 0 and not pd.isna(ma20.iloc[-1]):
            if current_price > ma20.iloc[-1]:
                signals.append("Price above MA20 (Bullish)")
                buy_count += 1
            else:
                signals.append("Price below MA20 (Bearish)")
                sell_count += 1
        
        # Price vs MA50
        if len(ma50) > 0 and not pd.isna(ma50.iloc[-1]):
            if current_price > ma50.iloc[-1]:
                signals.append("Price above MA50 (Bullish)")
                buy_count += 1
            else:
                signals.append("Price below MA50 (Bearish)")
                sell_count += 1
        
        # MA crossovers
        if len(ma10) > 1 and len(ma20) > 1:
            if ma10.iloc[-1] > ma20.iloc[-1] and ma10.iloc[-2] <= ma20.iloc[-2]:
                signals.append("MA10 crossed above MA20 (Golden Cross - Bullish)")
                buy_count += 2
            elif ma10.iloc[-1] < ma20.iloc[-1] and ma10.iloc[-2] >= ma20.iloc[-2]:
                signals.append("MA10 crossed below MA20 (Death Cross - Bearish)")
                sell_count += 2
        
        # Determine signal
        if buy_count > sell_count:
            signal = "BUY"
        elif sell_count > buy_count:
            signal = "SELL"
        else:
            signal = "NEUTRAL"
        
        return {
            "signal": signal,
            "buy_signals": buy_count,
            "sell_signals": sell_count,
            "details": signals
        }
        
    except Exception as e:
        return {
            "signal": "ERROR",
            "error": str(e)
        }


def _analyze_rsi(hist: pd.DataFrame, period: int = 14) -> Dict[str, Any]:
    """Analyze RSI signals."""
    try:
        close = hist['Close']
        
        # Calculate RSI
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        
        current_rsi = rsi.iloc[-1]
        
        # Determine signal
        if current_rsi < 30:
            signal = "BUY"
            reason = "RSI oversold (< 30)"
        elif current_rsi > 70:
            signal = "SELL"
            reason = "RSI overbought (> 70)"
        elif current_rsi < 40:
            signal = "BUY"
            reason = "RSI near oversold"
        elif current_rsi > 60:
            signal = "SELL"
            reason = "RSI near overbought"
        else:
            signal = "NEUTRAL"
            reason = "RSI in neutral zone"
        
        return {
            "signal": signal,
            "value": round(current_rsi, 2),
            "reason": reason
        }
        
    except Exception as e:
        return {
            "signal": "ERROR",
            "error": str(e)
        }


def _analyze_macd(hist: pd.DataFrame) -> Dict[str, Any]:
    """Analyze MACD signals."""
    try:
        close = hist['Close']
        
        # Calculate MACD
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        macd_line = ema12 - ema26
        signal_line = macd_line.ewm(span=9, adjust=False).mean()
        histogram = macd_line - signal_line
        
        current_macd = macd_line.iloc[-1]
        current_signal = signal_line.iloc[-1]
        current_hist = histogram.iloc[-1]
        
        # Determine signal
        if current_macd > current_signal and histogram.iloc[-2] <= 0:
            signal = "BUY"
            reason = "MACD crossed above signal line (Bullish crossover)"
        elif current_macd < current_signal and histogram.iloc[-2] >= 0:
            signal = "SELL"
            reason = "MACD crossed below signal line (Bearish crossover)"
        elif current_hist > 0:
            signal = "BUY"
            reason = "MACD histogram positive"
        elif current_hist < 0:
            signal = "SELL"
            reason = "MACD histogram negative"
        else:
            signal = "NEUTRAL"
            reason = "MACD neutral"
        
        return {
            "signal": signal,
            "macd": round(current_macd, 2),
            "signal_line": round(current_signal, 2),
            "histogram": round(current_hist, 2),
            "reason": reason
        }
        
    except Exception as e:
        return {
            "signal": "ERROR",
            "error": str(e)
        }


def _analyze_bollinger(hist: pd.DataFrame, period: int = 20) -> Dict[str, Any]:
    """Analyze Bollinger Bands signals."""
    try:
        close = hist['Close']
        
        # Calculate Bollinger Bands
        sma = close.rolling(window=period).mean()
        std = close.rolling(window=period).std()
        upper_band = sma + (std * 2)
        lower_band = sma - (std * 2)
        
        current_price = close.iloc[-1]
        current_upper = upper_band.iloc[-1]
        current_lower = lower_band.iloc[-1]
        current_sma = sma.iloc[-1]
        
        # Calculate position
        bb_width = current_upper - current_lower
        price_position = (current_price - current_lower) / bb_width if bb_width > 0 else 0.5
        
        # Determine signal
        if current_price < current_lower:
            signal = "BUY"
            reason = "Price below lower band (oversold)"
        elif current_price > current_upper:
            signal = "SELL"
            reason = "Price above upper band (overbought)"
        elif price_position < 0.3:
            signal = "BUY"
            reason = "Price near lower band"
        elif price_position > 0.7:
            signal = "SELL"
            reason = "Price near upper band"
        else:
            signal = "NEUTRAL"
            reason = "Price in middle of bands"
        
        return {
            "signal": signal,
            "current_price": round(current_price, 2),
            "upper_band": round(current_upper, 2),
            "middle_band": round(current_sma, 2),
            "lower_band": round(current_lower, 2),
            "position_pct": round(price_position * 100, 2),
            "reason": reason
        }
        
    except Exception as e:
        return {
            "signal": "ERROR",
            "error": str(e)
        }


def _analyze_stochastic(hist: pd.DataFrame, k_period: int = 14) -> Dict[str, Any]:
    """Analyze Stochastic Oscillator signals."""
    try:
        high = hist['High']
        low = hist['Low']
        close = hist['Close']
        
        # Calculate Stochastic
        lowest_low = low.rolling(window=k_period).min()
        highest_high = high.rolling(window=k_period).max()
        
        k = 100 * ((close - lowest_low) / (highest_high - lowest_low))
        d = k.rolling(window=3).mean()
        
        current_k = k.iloc[-1]
        current_d = d.iloc[-1]
        
        # Determine signal
        if current_k < 20 and current_d < 20:
            signal = "BUY"
            reason = "Stochastic oversold (< 20)"
        elif current_k > 80 and current_d > 80:
            signal = "SELL"
            reason = "Stochastic overbought (> 80)"
        elif current_k > current_d and k.iloc[-2] <= d.iloc[-2]:
            signal = "BUY"
            reason = "Stochastic bullish crossover"
        elif current_k < current_d and k.iloc[-2] >= d.iloc[-2]:
            signal = "SELL"
            reason = "Stochastic bearish crossover"
        else:
            signal = "NEUTRAL"
            reason = "Stochastic neutral"
        
        return {
            "signal": signal,
            "k_value": round(current_k, 2),
            "d_value": round(current_d, 2),
            "reason": reason
        }
        
    except Exception as e:
        return {
            "signal": "ERROR",
            "error": str(e)
        }


def _analyze_volume(hist: pd.DataFrame) -> Dict[str, Any]:
    """Analyze Volume signals."""
    try:
        volume = hist['Volume']
        close = hist['Close']
        
        # Calculate average volume
        avg_volume = volume.rolling(window=20).mean().iloc[-1]
        current_volume = volume.iloc[-1]
        
        # Price change
        price_change = close.iloc[-1] - close.iloc[-2]
        
        # Determine signal
        if current_volume > avg_volume * 1.5:
            if price_change > 0:
                signal = "BUY"
                reason = "High volume with price increase"
            else:
                signal = "SELL"
                reason = "High volume with price decrease"
        elif current_volume > avg_volume:
            signal = "NEUTRAL"
            reason = "Above average volume"
        else:
            signal = "NEUTRAL"
            reason = "Below average volume"
        
        return {
            "signal": signal,
            "current_volume": int(current_volume),
            "average_volume": int(avg_volume),
            "volume_ratio": round(current_volume / avg_volume, 2) if avg_volume > 0 else 0,
            "reason": reason
        }
        
    except Exception as e:
        return {
            "signal": "ERROR",
            "error": str(e)
        }


def _calculate_overall_signal(signals: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate overall signal from all indicators."""
    try:
        buy_score = 0
        sell_score = 0
        total_signals = 0
        
        # Weight different indicators
        weights = {
            "moving_averages": 3,
            "rsi": 2,
            "macd": 2,
            "bollinger_bands": 2,
            "stochastic": 1,
            "volume": 1
        }
        
        for indicator, data in signals.items():
            if "signal" in data:
                weight = weights.get(indicator, 1)
                total_signals += weight
                
                if indicator == "moving_averages":
                    # Use buy/sell counts
                    buy_score += data.get("buy_signals", 0) * 0.5
                    sell_score += data.get("sell_signals", 0) * 0.5
                else:
                    signal = data["signal"]
                    if signal == "BUY":
                        buy_score += weight
                    elif signal == "SELL":
                        sell_score += weight
        
        # Calculate percentages
        total = buy_score + sell_score
        if total > 0:
            buy_pct = (buy_score / total) * 100
            sell_pct = (sell_score / total) * 100
        else:
            buy_pct = 50
            sell_pct = 50
        
        # Determine overall signal
        if buy_pct >= 65:
            overall = "STRONG BUY"
            confidence = "High"
        elif buy_pct >= 55:
            overall = "BUY"
            confidence = "Medium"
        elif sell_pct >= 65:
            overall = "STRONG SELL"
            confidence = "High"
        elif sell_pct >= 55:
            overall = "SELL"
            confidence = "Medium"
        else:
            overall = "NEUTRAL / HOLD"
            confidence = "Low"
        
        # Generate recommendation
        if "STRONG BUY" in overall:
            recommendation = "Consider buying this stock. Multiple indicators show strong bullish signals."
        elif "BUY" in overall:
            recommendation = "This stock shows bullish signals. Consider buying on dips."
        elif "STRONG SELL" in overall:
            recommendation = "Consider selling this stock. Multiple indicators show strong bearish signals."
        elif "SELL" in overall:
            recommendation = "This stock shows bearish signals. Consider selling or avoiding."
        else:
            recommendation = "Hold current positions. No clear directional signals at this time."
        
        return {
            "signal": overall,
            "score": f"{round(buy_pct, 1)}% Buy / {round(sell_pct, 1)}% Sell",
            "buy_percentage": round(buy_pct, 1),
            "sell_percentage": round(sell_pct, 1),
            "confidence": confidence,
            "recommendation": recommendation
        }
        
    except Exception as e:
        return {
            "signal": "ERROR",
            "error": str(e)
        }


def _generate_summary(signals: Dict[str, Any], overall: Dict[str, Any]) -> str:
    """Generate text summary of all signals."""
    try:
        summary_parts = [f"Overall Signal: {overall['signal']} ({overall['confidence']} confidence)"]
        
        # Add key insights
        if "moving_averages" in signals and signals["moving_averages"]["signal"] != "ERROR":
            ma = signals["moving_averages"]
            summary_parts.append(f"Moving Averages: {ma['signal']} ({ma['buy_signals']} bullish, {ma['sell_signals']} bearish)")
        
        if "rsi" in signals and signals["rsi"]["signal"] != "ERROR":
            rsi = signals["rsi"]
            summary_parts.append(f"RSI: {rsi['value']} - {rsi['reason']}")
        
        if "macd" in signals and signals["macd"]["signal"] != "ERROR":
            macd = signals["macd"]
            summary_parts.append(f"MACD: {macd['reason']}")
        
        return " | ".join(summary_parts)
        
    except Exception:
        return "Summary generation error"
