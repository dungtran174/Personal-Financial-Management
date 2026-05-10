"""
Tool: get_backtest
Mô tả: Backtest chiến lược đầu tư với dữ liệu lịch sử
Data source: yfinance historical data

Strategies supported:
- Buy and Hold
- Moving Average Crossover
- RSI-based
- Bollinger Bands
- Custom portfolio rebalancing
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
import numpy as np


def get_backtest(
    symbols: List[str],
    strategy: str = "buy_hold",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    initial_capital: float = 100000000,  # 100M VND or equivalent
    **strategy_params
) -> Dict[str, Any]:
    """
    Backtest chiến lược đầu tư với dữ liệu lịch sử.
    
    Args:
        symbols: List mã cổ phiếu
        strategy: Loại chiến lược ("buy_hold", "ma_crossover", "rsi", "monthly_rebalance")
        start_date: Ngày bắt đầu (YYYY-MM-DD)
        end_date: Ngày kết thúc (YYYY-MM-DD)
        initial_capital: Vốn ban đầu
        **strategy_params: Parameters cho strategy cụ thể
    
    Returns:
        Dict chứa kết quả backtest
    
    Examples:
        >>> get_backtest(["FPT.VN"], "buy_hold", "2023-01-01", "2024-01-01")
        >>> get_backtest(["AAPL"], "ma_crossover", "2023-01-01", "2024-01-01", 
                        short_window=20, long_window=50)
        >>> get_backtest(["VCB.VN", "FPT.VN"], "monthly_rebalance", 
                        "2023-01-01", "2024-01-01", weights=[0.5, 0.5])
    """
    try:
        # Default dates
        if end_date is None:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if start_date is None:
            start_date = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
        
        # Validate symbols
        if not symbols or len(symbols) == 0:
            return {
                "status": "error",
                "error": "No symbols provided",
                "timestamp": datetime.now().isoformat()
            }
        
        # Execute strategy
        if strategy == "buy_hold":
            result = _backtest_buy_hold(symbols, start_date, end_date, initial_capital)
        elif strategy == "ma_crossover":
            result = _backtest_ma_crossover(symbols[0], start_date, end_date, initial_capital, **strategy_params)
        elif strategy == "rsi":
            result = _backtest_rsi(symbols[0], start_date, end_date, initial_capital, **strategy_params)
        elif strategy == "monthly_rebalance":
            result = _backtest_monthly_rebalance(symbols, start_date, end_date, initial_capital, **strategy_params)
        else:
            return {
                "status": "error",
                "error": f"Unknown strategy: {strategy}",
                "available_strategies": ["buy_hold", "ma_crossover", "rsi", "monthly_rebalance"],
                "timestamp": datetime.now().isoformat()
            }
        
        return result
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def _backtest_buy_hold(symbols: List[str], start_date: str, end_date: str, initial_capital: float) -> Dict[str, Any]:
    """Buy and Hold strategy backtest."""
    try:
        # Equal weight allocation
        allocation = initial_capital / len(symbols)
        portfolio_values = []
        
        results = {}
        for symbol in symbols:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(start=start_date, end=end_date)
            
            if hist.empty:
                return {
                    "status": "error",
                    "error": f"No data for {symbol}",
                    "timestamp": datetime.now().isoformat()
                }
            
            # Calculate returns
            initial_price = hist['Close'].iloc[0]
            final_price = hist['Close'].iloc[-1]
            shares = allocation / initial_price
            final_value = shares * final_price
            
            returns = ((final_price - initial_price) / initial_price) * 100
            
            results[symbol] = {
                "initial_price": round(initial_price, 2),
                "final_price": round(final_price, 2),
                "shares_bought": round(shares, 2),
                "initial_value": round(allocation, 2),
                "final_value": round(final_value, 2),
                "return_pct": round(returns, 2),
                "profit_loss": round(final_value - allocation, 2)
            }
            
            portfolio_values.append(final_value)
        
        # Portfolio summary
        total_final_value = sum(portfolio_values)
        total_return = ((total_final_value - initial_capital) / initial_capital) * 100
        
        return {
            "status": "success",
            "strategy": "buy_hold",
            "period": {
                "start": start_date,
                "end": end_date
            },
            "initial_capital": initial_capital,
            "final_value": round(total_final_value, 2),
            "total_return_pct": round(total_return, 2),
            "total_profit_loss": round(total_final_value - initial_capital, 2),
            "positions": results,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def _backtest_ma_crossover(symbol: str, start_date: str, end_date: str, 
                          initial_capital: float, short_window: int = 20, 
                          long_window: int = 50) -> Dict[str, Any]:
    """Moving Average Crossover strategy."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(start=start_date, end=end_date)
        
        if hist.empty or len(hist) < long_window:
            return {
                "status": "error",
                "error": f"Insufficient data for {symbol}",
                "timestamp": datetime.now().isoformat()
            }
        
        # Calculate moving averages
        hist['MA_Short'] = hist['Close'].rolling(window=short_window).mean()
        hist['MA_Long'] = hist['Close'].rolling(window=long_window).mean()
        
        # Generate signals
        hist['Signal'] = 0
        hist.loc[hist['MA_Short'] > hist['MA_Long'], 'Signal'] = 1  # Buy
        hist['Position'] = hist['Signal'].diff()
        
        # Backtest
        cash = initial_capital
        shares = 0
        trades = []
        
        for idx, row in hist.iterrows():
            if row['Position'] == 1:  # Buy signal
                if cash > 0:
                    shares = cash / row['Close']
                    trades.append({
                        "date": idx.strftime("%Y-%m-%d"),
                        "action": "BUY",
                        "price": round(row['Close'], 2),
                        "shares": round(shares, 2),
                        "value": round(cash, 2)
                    })
                    cash = 0
            elif row['Position'] == -1:  # Sell signal
                if shares > 0:
                    cash = shares * row['Close']
                    trades.append({
                        "date": idx.strftime("%Y-%m-%d"),
                        "action": "SELL",
                        "price": round(row['Close'], 2),
                        "shares": round(shares, 2),
                        "value": round(cash, 2)
                    })
                    shares = 0
        
        # Final value
        final_price = hist['Close'].iloc[-1]
        if shares > 0:
            final_value = shares * final_price
        else:
            final_value = cash
        
        total_return = ((final_value - initial_capital) / initial_capital) * 100
        
        return {
            "status": "success",
            "strategy": "ma_crossover",
            "symbol": symbol,
            "parameters": {
                "short_window": short_window,
                "long_window": long_window
            },
            "period": {
                "start": start_date,
                "end": end_date
            },
            "initial_capital": initial_capital,
            "final_value": round(final_value, 2),
            "total_return_pct": round(total_return, 2),
            "total_profit_loss": round(final_value - initial_capital, 2),
            "num_trades": len(trades),
            "trades": trades[:10],  # Show first 10 trades
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def _backtest_rsi(symbol: str, start_date: str, end_date: str, 
                 initial_capital: float, rsi_period: int = 14,
                 oversold: int = 30, overbought: int = 70) -> Dict[str, Any]:
    """RSI-based strategy."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(start=start_date, end=end_date)
        
        if hist.empty or len(hist) < rsi_period + 1:
            return {
                "status": "error",
                "error": f"Insufficient data for {symbol}",
                "timestamp": datetime.now().isoformat()
            }
        
        # Calculate RSI
        delta = hist['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=rsi_period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=rsi_period).mean()
        rs = gain / loss
        hist['RSI'] = 100 - (100 / (1 + rs))
        
        # Generate signals
        hist['Signal'] = 0
        hist.loc[hist['RSI'] < oversold, 'Signal'] = 1  # Buy when oversold
        hist.loc[hist['RSI'] > overbought, 'Signal'] = -1  # Sell when overbought
        hist['Position'] = hist['Signal'].diff()
        
        # Backtest
        cash = initial_capital
        shares = 0
        trades = []
        
        for idx, row in hist.iterrows():
            if pd.notna(row['RSI']):
                if row['Signal'] == 1 and cash > 0:  # Buy
                    shares = cash / row['Close']
                    trades.append({
                        "date": idx.strftime("%Y-%m-%d"),
                        "action": "BUY",
                        "price": round(row['Close'], 2),
                        "rsi": round(row['RSI'], 2),
                        "shares": round(shares, 2)
                    })
                    cash = 0
                elif row['Signal'] == -1 and shares > 0:  # Sell
                    cash = shares * row['Close']
                    trades.append({
                        "date": idx.strftime("%Y-%m-%d"),
                        "action": "SELL",
                        "price": round(row['Close'], 2),
                        "rsi": round(row['RSI'], 2),
                        "value": round(cash, 2)
                    })
                    shares = 0
        
        # Final value
        final_price = hist['Close'].iloc[-1]
        final_value = shares * final_price if shares > 0 else cash
        total_return = ((final_value - initial_capital) / initial_capital) * 100
        
        return {
            "status": "success",
            "strategy": "rsi",
            "symbol": symbol,
            "parameters": {
                "rsi_period": rsi_period,
                "oversold": oversold,
                "overbought": overbought
            },
            "period": {
                "start": start_date,
                "end": end_date
            },
            "initial_capital": initial_capital,
            "final_value": round(final_value, 2),
            "total_return_pct": round(total_return, 2),
            "total_profit_loss": round(final_value - initial_capital, 2),
            "num_trades": len(trades),
            "trades": trades[:10],
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def _backtest_monthly_rebalance(symbols: List[str], start_date: str, end_date: str,
                                initial_capital: float, weights: Optional[List[float]] = None) -> Dict[str, Any]:
    """Monthly portfolio rebalancing strategy."""
    try:
        # Default equal weights
        if weights is None:
            weights = [1.0 / len(symbols)] * len(symbols)
        
        if len(weights) != len(symbols):
            return {
                "status": "error",
                "error": "Weights length must match symbols length",
                "timestamp": datetime.now().isoformat()
            }
        
        # Download data for all symbols
        data = {}
        for symbol in symbols:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(start=start_date, end=end_date)
            if hist.empty:
                return {
                    "status": "error",
                    "error": f"No data for {symbol}",
                    "timestamp": datetime.now().isoformat()
                }
            data[symbol] = hist['Close']
        
        # Create DataFrame
        df = pd.DataFrame(data)
        df = df.dropna()
        
        # Resample to monthly
        monthly = df.resample('M').last()
        
        # Calculate portfolio value
        portfolio_value = initial_capital
        rebalance_dates = []
        
        for idx, row in monthly.iterrows():
            rebalance_dates.append({
                "date": idx.strftime("%Y-%m-%d"),
                "value": round(portfolio_value, 2)
            })
            
            # Calculate returns for next month
            if idx != monthly.index[-1]:
                next_idx = monthly.index[monthly.index > idx][0]
                returns = (monthly.loc[next_idx] - row) / row
                portfolio_return = sum([w * r for w, r in zip(weights, returns)])
                portfolio_value *= (1 + portfolio_return)
        
        final_value = portfolio_value
        total_return = ((final_value - initial_capital) / initial_capital) * 100
        
        return {
            "status": "success",
            "strategy": "monthly_rebalance",
            "symbols": symbols,
            "weights": weights,
            "period": {
                "start": start_date,
                "end": end_date
            },
            "initial_capital": initial_capital,
            "final_value": round(final_value, 2),
            "total_return_pct": round(total_return, 2),
            "total_profit_loss": round(final_value - initial_capital, 2),
            "num_rebalances": len(rebalance_dates),
            "rebalance_history": rebalance_dates[:12],  # Show first year
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
