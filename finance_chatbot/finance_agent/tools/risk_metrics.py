# finance_agent/tools/risk_metrics.py
import logging
import datetime
from typing import Dict, Any, Optional
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

USE_YFINANCE = False
try:
    import yfinance as yf
    USE_YFINANCE = True
except Exception:
    logger.warning("yfinance not available; risk_metrics will return mock data.")


def calculate_returns(prices: pd.Series) -> pd.Series:
    """Calculate daily returns from price series."""
    return prices.pct_change().dropna()


def calculate_volatility(returns: pd.Series, annualize: bool = True) -> float:
    """
    Calculate volatility (standard deviation of returns).
    
    Args:
        returns: Series of returns
        annualize: If True, annualize the volatility (multiply by sqrt(252))
    
    Returns:
        Volatility as a decimal (e.g., 0.25 = 25% volatility)
    """
    vol = returns.std()
    if annualize:
        vol *= np.sqrt(252)  # 252 trading days in a year
    return float(vol)


def calculate_beta(stock_returns: pd.Series, market_returns: pd.Series) -> float:
    """
    Calculate beta (systematic risk relative to market).
    
    Beta = Covariance(stock, market) / Variance(market)
    """
    # Align the two series
    aligned = pd.DataFrame({"stock": stock_returns, "market": market_returns}).dropna()
    
    if len(aligned) < 30:  # Need sufficient data
        return None
    
    covariance = aligned["stock"].cov(aligned["market"])
    market_variance = aligned["market"].var()
    
    if market_variance == 0:
        return None
    
    return float(covariance / market_variance)


def calculate_alpha(stock_returns: pd.Series, market_returns: pd.Series, risk_free_rate: float = 0.02) -> float:
    """
    Calculate alpha (excess return over expected return based on beta).
    
    Alpha = Stock Return - (Risk Free Rate + Beta * (Market Return - Risk Free Rate))
    """
    beta = calculate_beta(stock_returns, market_returns)
    if beta is None:
        return None
    
    stock_avg_return = stock_returns.mean() * 252  # Annualized
    market_avg_return = market_returns.mean() * 252  # Annualized
    
    expected_return = risk_free_rate + beta * (market_avg_return - risk_free_rate)
    alpha = stock_avg_return - expected_return
    
    return float(alpha)


def calculate_sharpe_ratio(returns: pd.Series, risk_free_rate: float = 0.02) -> float:
    """
    Calculate Sharpe Ratio.
    
    Sharpe = (Average Return - Risk Free Rate) / Volatility
    """
    avg_return = returns.mean() * 252  # Annualized
    vol = calculate_volatility(returns, annualize=True)
    
    if vol == 0:
        return None
    
    sharpe = (avg_return - risk_free_rate) / vol
    return float(sharpe)


def calculate_sortino_ratio(returns: pd.Series, risk_free_rate: float = 0.02) -> float:
    """
    Calculate Sortino Ratio (similar to Sharpe but only considers downside volatility).
    
    Sortino = (Average Return - Risk Free Rate) / Downside Deviation
    """
    avg_return = returns.mean() * 252  # Annualized
    
    # Downside deviation: only consider negative returns
    downside_returns = returns[returns < 0]
    downside_std = downside_returns.std() * np.sqrt(252)
    
    if downside_std == 0 or len(downside_returns) == 0:
        return None
    
    sortino = (avg_return - risk_free_rate) / downside_std
    return float(sortino)


def calculate_max_drawdown(prices: pd.Series) -> Dict[str, Any]:
    """
    Calculate maximum drawdown (largest peak-to-trough decline).
    
    Returns:
        Dictionary with max_drawdown (as percentage), peak_date, trough_date
    """
    # Calculate cumulative returns
    cumulative = (1 + prices.pct_change()).cumprod()
    
    # Calculate running maximum
    running_max = cumulative.cummax()
    
    # Calculate drawdown
    drawdown = (cumulative - running_max) / running_max
    
    max_dd = drawdown.min()
    max_dd_idx = drawdown.idxmin()
    
    # Find the peak before this drawdown
    peak_idx = cumulative[:max_dd_idx].idxmax()
    
    return {
        "max_drawdown": float(max_dd),
        "max_drawdown_pct": float(max_dd * 100),
        "peak_date": str(peak_idx.date()) if hasattr(peak_idx, "date") else str(peak_idx),
        "trough_date": str(max_dd_idx.date()) if hasattr(max_dd_idx, "date") else str(max_dd_idx),
    }


def calculate_var(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Calculate Value at Risk (VaR) - the maximum expected loss at a given confidence level.
    
    Args:
        returns: Series of returns
        confidence: Confidence level (0.95 = 95%)
    
    Returns:
        VaR as a negative percentage (e.g., -0.05 = 5% maximum loss)
    """
    var = np.percentile(returns, (1 - confidence) * 100)
    return float(var)


def calculate_cvar(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Calculate Conditional Value at Risk (CVaR) - the expected loss beyond VaR.
    Also known as Expected Shortfall.
    
    Args:
        returns: Series of returns
        confidence: Confidence level (0.95 = 95%)
    
    Returns:
        CVaR as a negative percentage
    """
    var = calculate_var(returns, confidence)
    cvar = returns[returns <= var].mean()
    return float(cvar)


def classify_risk_level(volatility: float, beta: float, sharpe_ratio: float) -> str:
    """
    Classify overall risk level based on multiple metrics.
    
    Returns: "low", "moderate", "high", or "very high"
    """
    risk_score = 0
    
    # Volatility contribution
    if volatility is not None:
        if volatility > 0.40:
            risk_score += 3
        elif volatility > 0.25:
            risk_score += 2
        elif volatility > 0.15:
            risk_score += 1
    
    # Beta contribution
    if beta is not None:
        if beta > 1.5:
            risk_score += 2
        elif beta > 1.2:
            risk_score += 1
    
    # Sharpe ratio contribution (inverse - lower sharpe = higher risk)
    if sharpe_ratio is not None:
        if sharpe_ratio < 0.5:
            risk_score += 2
        elif sharpe_ratio < 1.0:
            risk_score += 1
    
    if risk_score >= 5:
        return "very high"
    elif risk_score >= 3:
        return "high"
    elif risk_score >= 1:
        return "moderate"
    else:
        return "low"


def get_risk_metrics(
    ticker: str,
    benchmark: str = "^GSPC",  # S&P 500
    period: str = "1y",
    risk_free_rate: float = 0.02
) -> Dict[str, Any]:
    """
    Calculate comprehensive risk metrics for a stock.
    
    Args:
        ticker: Stock ticker symbol
        benchmark: Benchmark index ticker (default: ^GSPC for S&P 500)
                  Use ^VNI for Vietnam market
        period: Time period for analysis (1y, 2y, 5y)
        risk_free_rate: Annual risk-free rate (default: 2%)
    
    Returns:
        Dictionary with all risk metrics and interpretation
    """
    if not USE_YFINANCE:
        return {
            "ticker": ticker,
            "error": "yfinance not available",
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
    
    try:
        # Fetch stock data
        stock = yf.Ticker(ticker)
        stock_hist = stock.history(period=period)
        
        if stock_hist.empty:
            return {
                "ticker": ticker,
                "error": "No data available for ticker",
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        stock_prices = stock_hist["Close"]
        stock_returns = calculate_returns(stock_prices)
        
        # Fetch benchmark data
        try:
            benchmark_stock = yf.Ticker(benchmark)
            benchmark_hist = benchmark_stock.history(period=period)
            benchmark_prices = benchmark_hist["Close"]
            benchmark_returns = calculate_returns(benchmark_prices)
        except Exception as e:
            logger.warning("Could not fetch benchmark data for %s: %s", benchmark, e)
            benchmark_returns = None
        
        result = {
            "ticker": ticker,
            "benchmark": benchmark,
            "period": period,
            "risk_free_rate": risk_free_rate,
            "risk_metrics": {},
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # Calculate volatility
        volatility = calculate_volatility(stock_returns, annualize=True)
        result["risk_metrics"]["volatility"] = round(volatility, 4)
        result["risk_metrics"]["volatility_pct"] = round(volatility * 100, 2)
        
        # Calculate beta and alpha (if benchmark available)
        if benchmark_returns is not None and not benchmark_returns.empty:
            beta = calculate_beta(stock_returns, benchmark_returns)
            alpha = calculate_alpha(stock_returns, benchmark_returns, risk_free_rate)
            
            result["risk_metrics"]["beta"] = round(beta, 3) if beta is not None else None
            result["risk_metrics"]["alpha"] = round(alpha, 4) if alpha is not None else None
        else:
            result["risk_metrics"]["beta"] = None
            result["risk_metrics"]["alpha"] = None
        
        # Calculate Sharpe Ratio
        sharpe = calculate_sharpe_ratio(stock_returns, risk_free_rate)
        result["risk_metrics"]["sharpe_ratio"] = round(sharpe, 3) if sharpe is not None else None
        
        # Calculate Sortino Ratio
        sortino = calculate_sortino_ratio(stock_returns, risk_free_rate)
        result["risk_metrics"]["sortino_ratio"] = round(sortino, 3) if sortino is not None else None
        
        # Calculate Maximum Drawdown
        max_dd = calculate_max_drawdown(stock_prices)
        result["risk_metrics"]["max_drawdown"] = max_dd
        
        # Calculate VaR and CVaR
        var_95 = calculate_var(stock_returns, 0.95)
        cvar_95 = calculate_cvar(stock_returns, 0.95)
        
        result["risk_metrics"]["var_95"] = round(var_95, 4)
        result["risk_metrics"]["var_95_pct"] = round(var_95 * 100, 2)
        result["risk_metrics"]["cvar_95"] = round(cvar_95, 4)
        result["risk_metrics"]["cvar_95_pct"] = round(cvar_95 * 100, 2)
        
        # Classify risk level
        risk_level = classify_risk_level(
            volatility,
            result["risk_metrics"]["beta"],
            result["risk_metrics"]["sharpe_ratio"]
        )
        result["risk_level"] = risk_level
        
        # Interpretation
        interpretations = []
        
        # Volatility interpretation
        if volatility < 0.15:
            interpretations.append(f"Low volatility ({volatility*100:.1f}%) indicates stable price movements.")
        elif volatility < 0.25:
            interpretations.append(f"Moderate volatility ({volatility*100:.1f}%) is typical for most stocks.")
        else:
            interpretations.append(f"High volatility ({volatility*100:.1f}%) indicates significant price swings.")
        
        # Beta interpretation
        beta_val = result["risk_metrics"]["beta"]
        if beta_val is not None:
            if beta_val < 0.8:
                interpretations.append(f"Beta of {beta_val:.2f} suggests lower market sensitivity (defensive stock).")
            elif beta_val > 1.2:
                interpretations.append(f"Beta of {beta_val:.2f} indicates higher market sensitivity (aggressive stock).")
            else:
                interpretations.append(f"Beta of {beta_val:.2f} suggests average market sensitivity.")
        
        # Sharpe ratio interpretation
        if sharpe is not None:
            if sharpe > 2.0:
                interpretations.append(f"Excellent Sharpe ratio ({sharpe:.2f}) - strong risk-adjusted returns.")
            elif sharpe > 1.0:
                interpretations.append(f"Good Sharpe ratio ({sharpe:.2f}) - acceptable risk-adjusted returns.")
            elif sharpe > 0:
                interpretations.append(f"Low Sharpe ratio ({sharpe:.2f}) - returns may not justify the risk.")
            else:
                interpretations.append(f"Negative Sharpe ratio ({sharpe:.2f}) - underperforming risk-free rate.")
        
        # Max drawdown interpretation
        max_dd_pct = max_dd["max_drawdown_pct"]
        if max_dd_pct < -50:
            interpretations.append(f"Severe maximum drawdown ({max_dd_pct:.1f}%) indicates high risk of large losses.")
        elif max_dd_pct < -30:
            interpretations.append(f"Significant maximum drawdown ({max_dd_pct:.1f}%) suggests notable downside risk.")
        else:
            interpretations.append(f"Moderate maximum drawdown ({max_dd_pct:.1f}%) is within normal range.")
        
        result["interpretation"] = " ".join(interpretations)
        
        return result
        
    except Exception as e:
        logger.exception("Error calculating risk metrics for %s: %s", ticker, e)
        return {
            "ticker": ticker,
            "error": str(e),
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
