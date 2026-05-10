# finance_agent/tools/technical_indicators.py
import logging
import datetime
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

USE_YFINANCE = False
try:
    import yfinance as yf
    USE_YFINANCE = True
except Exception:
    logger.warning("yfinance not available; technical_indicators will use mock data.")


def calculate_rsi(prices: pd.Series, period: int = 14) -> float:
    """Calculate Relative Strength Index (RSI)."""
    if len(prices) < period + 1:
        return None
    
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return float(rsi.iloc[-1])


def calculate_macd(prices: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, float]:
    """Calculate MACD (Moving Average Convergence Divergence)."""
    if len(prices) < slow + signal:
        return {"macd_line": None, "signal_line": None, "histogram": None}
    
    ema_fast = prices.ewm(span=fast, adjust=False).mean()
    ema_slow = prices.ewm(span=slow, adjust=False).mean()
    
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    
    return {
        "macd_line": float(macd_line.iloc[-1]),
        "signal_line": float(signal_line.iloc[-1]),
        "histogram": float(histogram.iloc[-1])
    }


def calculate_moving_averages(prices: pd.Series, periods: List[int]) -> Dict[str, float]:
    """Calculate Simple Moving Averages for multiple periods."""
    mas = {}
    for period in periods:
        if len(prices) >= period:
            ma = prices.rolling(window=period).mean().iloc[-1]
            mas[f"sma_{period}"] = float(ma)
        else:
            mas[f"sma_{period}"] = None
    return mas


def calculate_ema(prices: pd.Series, periods: List[int]) -> Dict[str, float]:
    """Calculate Exponential Moving Averages."""
    emas = {}
    for period in periods:
        if len(prices) >= period:
            ema = prices.ewm(span=period, adjust=False).mean().iloc[-1]
            emas[f"ema_{period}"] = float(ema)
        else:
            emas[f"ema_{period}"] = None
    return emas


def calculate_bollinger_bands(prices: pd.Series, period: int = 20, std_dev: int = 2) -> Dict[str, float]:
    """Calculate Bollinger Bands."""
    if len(prices) < period:
        return {"upper": None, "middle": None, "lower": None, "width": None}
    
    sma = prices.rolling(window=period).mean()
    std = prices.rolling(window=period).std()
    
    upper_band = sma + (std * std_dev)
    lower_band = sma - (std * std_dev)
    
    return {
        "upper": float(upper_band.iloc[-1]),
        "middle": float(sma.iloc[-1]),
        "lower": float(lower_band.iloc[-1]),
        "width": float((upper_band.iloc[-1] - lower_band.iloc[-1]) / sma.iloc[-1] * 100)
    }


def calculate_stochastic(high: pd.Series, low: pd.Series, close: pd.Series, k_period: int = 14, d_period: int = 3) -> Dict[str, float]:
    """Calculate Stochastic Oscillator."""
    if len(close) < k_period:
        return {"k": None, "d": None}
    
    lowest_low = low.rolling(window=k_period).min()
    highest_high = high.rolling(window=k_period).max()
    
    k_percent = 100 * ((close - lowest_low) / (highest_high - lowest_low))
    d_percent = k_percent.rolling(window=d_period).mean()
    
    return {
        "k": float(k_percent.iloc[-1]),
        "d": float(d_percent.iloc[-1])
    }


def interpret_rsi(rsi: float) -> Dict[str, str]:
    """Interpret RSI value."""
    if rsi is None:
        return {"signal": "unknown", "interpretation": "Insufficient data"}
    
    if rsi < 30:
        return {
            "signal": "oversold",
            "interpretation": "RSI < 30 indicates oversold condition. Potential buying opportunity."
        }
    elif rsi > 70:
        return {
            "signal": "overbought",
            "interpretation": "RSI > 70 indicates overbought condition. Potential selling opportunity."
        }
    else:
        return {
            "signal": "neutral",
            "interpretation": f"RSI at {rsi:.2f} is in neutral range (30-70)."
        }


def interpret_macd(macd_data: Dict[str, float]) -> Dict[str, str]:
    """Interpret MACD signal."""
    if macd_data["macd_line"] is None or macd_data["signal_line"] is None:
        return {"signal": "unknown", "interpretation": "Insufficient data"}
    
    histogram = macd_data["histogram"]
    
    if histogram > 0:
        signal = "bullish"
        interp = "MACD line above signal line indicates bullish momentum."
    elif histogram < 0:
        signal = "bearish"
        interp = "MACD line below signal line indicates bearish momentum."
    else:
        signal = "neutral"
        interp = "MACD lines are converging."
    
    return {"signal": signal, "interpretation": interp}


def interpret_bollinger_bands(bb_data: Dict[str, float], current_price: float) -> Dict[str, str]:
    """Interpret Bollinger Bands position."""
    if bb_data["upper"] is None:
        return {"signal": "unknown", "interpretation": "Insufficient data"}
    
    upper = bb_data["upper"]
    lower = bb_data["lower"]
    middle = bb_data["middle"]
    
    if current_price >= upper:
        return {
            "signal": "overbought",
            "interpretation": f"Price at upper band ({upper:.2f}). Potential reversal or consolidation."
        }
    elif current_price <= lower:
        return {
            "signal": "oversold",
            "interpretation": f"Price at lower band ({lower:.2f}). Potential buying opportunity."
        }
    elif current_price > middle:
        return {
            "signal": "bullish",
            "interpretation": f"Price above middle band. Bullish trend."
        }
    else:
        return {
            "signal": "bearish",
            "interpretation": f"Price below middle band. Bearish trend."
        }


def interpret_stochastic(stoch_data: Dict[str, float]) -> Dict[str, str]:
    """Interpret Stochastic Oscillator."""
    if stoch_data["k"] is None:
        return {"signal": "unknown", "interpretation": "Insufficient data"}
    
    k = stoch_data["k"]
    d = stoch_data["d"]
    
    if k < 20:
        return {
            "signal": "oversold",
            "interpretation": f"Stochastic %K at {k:.2f} indicates oversold. Potential buying opportunity."
        }
    elif k > 80:
        return {
            "signal": "overbought",
            "interpretation": f"Stochastic %K at {k:.2f} indicates overbought. Potential selling opportunity."
        }
    else:
        return {
            "signal": "neutral",
            "interpretation": f"Stochastic %K at {k:.2f} is in neutral range."
        }


def get_technical_indicators(
    ticker: str,
    period: str = "3mo",
    indicators: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Calculate technical indicators for a stock.
    
    Args:
        ticker: Stock ticker symbol
        period: Time period for historical data (1mo, 3mo, 6mo, 1y, 2y)
        indicators: List of indicators to calculate. If None, calculate all.
                   Options: ["rsi", "macd", "ma", "ema", "bollinger", "stochastic"]
    
    Returns:
        Dictionary with indicator values and signals
    """
    if not USE_YFINANCE:
        return {
            "ticker": ticker,
            "error": "yfinance not available",
            "indicators": {},
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
    
    try:
        # Fetch historical data
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period)
        
        if hist.empty:
            return {
                "ticker": ticker,
                "error": "No data available for ticker",
                "indicators": {},
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        close_prices = hist["Close"]
        current_price = float(close_prices.iloc[-1])
        
        # Determine which indicators to calculate
        all_indicators = ["rsi", "macd", "ma", "ema", "bollinger", "stochastic"]
        indicators_to_calc = indicators if indicators else all_indicators
        
        result = {
            "ticker": ticker,
            "period": period,
            "current_price": current_price,
            "indicators": {},
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # Calculate RSI
        if "rsi" in indicators_to_calc:
            rsi_value = calculate_rsi(close_prices)
            rsi_interp = interpret_rsi(rsi_value)
            result["indicators"]["rsi"] = {
                "value": rsi_value,
                **rsi_interp
            }
        
        # Calculate MACD
        if "macd" in indicators_to_calc:
            macd_data = calculate_macd(close_prices)
            macd_interp = interpret_macd(macd_data)
            result["indicators"]["macd"] = {
                **macd_data,
                **macd_interp
            }
        
        # Calculate Moving Averages
        if "ma" in indicators_to_calc:
            ma_data = calculate_moving_averages(close_prices, [20, 50, 200])
            result["indicators"]["moving_averages"] = ma_data
            
            # Add trend signal based on MA crossovers
            if ma_data.get("sma_50") and ma_data.get("sma_200"):
                if ma_data["sma_50"] > ma_data["sma_200"]:
                    result["indicators"]["moving_averages"]["trend"] = "bullish"
                else:
                    result["indicators"]["moving_averages"]["trend"] = "bearish"
        
        # Calculate EMA
        if "ema" in indicators_to_calc:
            ema_data = calculate_ema(close_prices, [12, 26, 50])
            result["indicators"]["exponential_moving_averages"] = ema_data
        
        # Calculate Bollinger Bands
        if "bollinger" in indicators_to_calc:
            bb_data = calculate_bollinger_bands(close_prices)
            bb_interp = interpret_bollinger_bands(bb_data, current_price)
            result["indicators"]["bollinger_bands"] = {
                **bb_data,
                **bb_interp
            }
        
        # Calculate Stochastic
        if "stochastic" in indicators_to_calc:
            stoch_data = calculate_stochastic(hist["High"], hist["Low"], hist["Close"])
            stoch_interp = interpret_stochastic(stoch_data)
            result["indicators"]["stochastic"] = {
                **stoch_data,
                **stoch_interp
            }
        
        # Overall signal aggregation
        signals = []
        for ind_name, ind_data in result["indicators"].items():
            if isinstance(ind_data, dict) and "signal" in ind_data:
                signals.append(ind_data["signal"])
        
        # Count bullish/bearish signals
        bullish_count = signals.count("bullish") + signals.count("oversold")
        bearish_count = signals.count("bearish") + signals.count("overbought")
        
        if bullish_count > bearish_count:
            overall = "bullish"
        elif bearish_count > bullish_count:
            overall = "bearish"
        else:
            overall = "neutral"
        
        result["overall_signal"] = overall
        result["signal_counts"] = {
            "bullish": bullish_count,
            "bearish": bearish_count,
            "neutral": signals.count("neutral")
        }
        
        return result
        
    except Exception as e:
        logger.exception("Error calculating technical indicators for %s: %s", ticker, e)
        return {
            "ticker": ticker,
            "error": str(e),
            "indicators": {},
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
