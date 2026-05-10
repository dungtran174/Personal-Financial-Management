# finance_agent/tools/portfolio_analytics.py
import logging
import datetime
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

USE_YFINANCE = False
try:
    import yfinance as yf
    USE_YFINANCE = True
except Exception:
    logger.warning("yfinance not available; portfolio_analytics will return limited data.")


def fetch_historical_returns(tickers: List[str], period: str = "1y") -> pd.DataFrame:
    """
    Fetch historical returns for multiple tickers.
    
    Returns:
        DataFrame with daily returns for each ticker
    """
    if not USE_YFINANCE:
        return pd.DataFrame()
    
    returns_data = {}
    
    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period=period)
            if not hist.empty:
                returns = hist["Close"].pct_change().dropna()
                returns_data[ticker] = returns
        except Exception as e:
            logger.debug("Could not fetch data for %s: %s", ticker, e)
    
    if not returns_data:
        return pd.DataFrame()
    
    # Combine into single DataFrame and align dates
    returns_df = pd.DataFrame(returns_data)
    returns_df = returns_df.dropna()
    
    return returns_df


def calculate_portfolio_metrics(
    returns_df: pd.DataFrame,
    weights: np.ndarray
) -> Dict[str, float]:
    """
    Calculate portfolio expected return, volatility, and Sharpe ratio.
    
    Args:
        returns_df: DataFrame of daily returns for each asset
        weights: Array of portfolio weights (should sum to 1.0)
    
    Returns:
        Dictionary with expected_return, volatility, sharpe_ratio
    """
    # Annualize returns (252 trading days)
    mean_returns = returns_df.mean() * 252
    cov_matrix = returns_df.cov() * 252
    
    # Portfolio return
    portfolio_return = np.dot(weights, mean_returns)
    
    # Portfolio volatility
    portfolio_volatility = np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights)))
    
    # Sharpe ratio (assuming 2% risk-free rate)
    risk_free_rate = 0.02
    sharpe_ratio = (portfolio_return - risk_free_rate) / portfolio_volatility if portfolio_volatility > 0 else 0
    
    return {
        "expected_return": float(portfolio_return),
        "volatility": float(portfolio_volatility),
        "sharpe_ratio": float(sharpe_ratio)
    }


def optimize_portfolio_sharpe(returns_df: pd.DataFrame, num_portfolios: int = 5000) -> Tuple[np.ndarray, Dict]:
    """
    Find optimal portfolio weights that maximize Sharpe ratio using Monte Carlo simulation.
    
    Args:
        returns_df: DataFrame of daily returns
        num_portfolios: Number of random portfolios to simulate
    
    Returns:
        Tuple of (optimal_weights, metrics)
    """
    num_assets = len(returns_df.columns)
    
    # Storage for results
    results = {
        "returns": [],
        "volatility": [],
        "sharpe": []
    }
    weights_record = []
    
    # Monte Carlo simulation
    for _ in range(num_portfolios):
        # Generate random weights
        weights = np.random.random(num_assets)
        weights /= np.sum(weights)  # Normalize to sum to 1
        
        weights_record.append(weights)
        
        # Calculate metrics
        metrics = calculate_portfolio_metrics(returns_df, weights)
        results["returns"].append(metrics["expected_return"])
        results["volatility"].append(metrics["volatility"])
        results["sharpe"].append(metrics["sharpe_ratio"])
    
    # Find portfolio with maximum Sharpe ratio
    max_sharpe_idx = np.argmax(results["sharpe"])
    optimal_weights = weights_record[max_sharpe_idx]
    
    optimal_metrics = {
        "expected_return": results["returns"][max_sharpe_idx],
        "volatility": results["volatility"][max_sharpe_idx],
        "sharpe_ratio": results["sharpe"][max_sharpe_idx]
    }
    
    return optimal_weights, optimal_metrics


def calculate_correlation_matrix(returns_df: pd.DataFrame) -> pd.DataFrame:
    """Calculate correlation matrix for assets in portfolio."""
    return returns_df.corr()


def calculate_diversification_score(correlation_matrix: pd.DataFrame, weights: np.ndarray) -> float:
    """
    Calculate diversification score (0-100).
    Higher score = better diversification.
    
    Based on average correlation weighted by portfolio weights.
    """
    n = len(correlation_matrix)
    if n <= 1:
        return 0.0
    
    # Calculate weighted average correlation (excluding diagonal)
    weighted_corr_sum = 0.0
    weight_sum = 0.0
    
    for i in range(n):
        for j in range(n):
            if i != j:
                weighted_corr_sum += abs(correlation_matrix.iloc[i, j]) * weights[i] * weights[j]
                weight_sum += weights[i] * weights[j]
    
    if weight_sum == 0:
        return 0.0
    
    avg_correlation = weighted_corr_sum / weight_sum
    
    # Convert to score (lower correlation = higher diversification)
    # 0 correlation = 100 score, 1 correlation = 0 score
    diversification_score = (1 - avg_correlation) * 100
    
    return float(diversification_score)


def assess_concentration_risk(weights: np.ndarray, threshold: float = 0.3) -> str:
    """
    Assess concentration risk based on weight distribution.
    
    Args:
        weights: Portfolio weights
        threshold: Weight threshold for concentration concern
    
    Returns:
        Risk level string
    """
    max_weight = np.max(weights)
    
    if max_weight > 0.5:
        return "high - portfolio is heavily concentrated"
    elif max_weight > threshold:
        return "moderate - consider further diversification"
    else:
        return "low - well diversified"


def generate_rebalancing_suggestions(
    current_weights: np.ndarray,
    optimal_weights: np.ndarray,
    tickers: List[str],
    threshold: float = 0.05
) -> List[Dict[str, Any]]:
    """
    Generate rebalancing suggestions if current weights differ significantly from optimal.
    
    Args:
        current_weights: Current portfolio weights
        optimal_weights: Optimal portfolio weights
        tickers: List of ticker symbols
        threshold: Minimum weight difference to suggest rebalancing
    
    Returns:
        List of rebalancing actions
    """
    suggestions = []
    
    for i, ticker in enumerate(tickers):
        diff = optimal_weights[i] - current_weights[i]
        
        if abs(diff) > threshold:
            action = "increase" if diff > 0 else "decrease"
            suggestions.append({
                "ticker": ticker,
                "action": action,
                "current_weight": round(float(current_weights[i]), 4),
                "optimal_weight": round(float(optimal_weights[i]), 4),
                "change": round(float(diff), 4),
                "change_pct": round(float(diff * 100), 2)
            })
    
    return suggestions


def analyze_portfolio(
    tickers: List[str],
    weights: Optional[List[float]] = None,
    optimize: bool = True,
    period: str = "1y"
) -> Dict[str, Any]:
    """
    Comprehensive portfolio analysis and optimization.
    
    Args:
        tickers: List of stock ticker symbols
        weights: Current portfolio weights (if None, use equal weights)
        optimize: Whether to optimize the portfolio
        period: Historical data period for analysis
    
    Returns:
        Complete portfolio analysis including optimization and diversification metrics
    """
    if not USE_YFINANCE:
        return {
            "error": "yfinance not available",
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
    
    if not tickers or len(tickers) < 2:
        return {
            "error": "At least 2 tickers required for portfolio analysis",
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
    
    try:
        # Set equal weights if not provided
        if weights is None:
            weights = [1.0 / len(tickers)] * len(tickers)
        
        # Validate weights
        if len(weights) != len(tickers):
            return {
                "error": "Number of weights must match number of tickers",
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        if not np.isclose(sum(weights), 1.0):
            return {
                "error": "Weights must sum to 1.0",
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        weights_array = np.array(weights)
        
        # Fetch historical data
        returns_df = fetch_historical_returns(tickers, period)
        
        if returns_df.empty:
            return {
                "error": "Could not fetch sufficient historical data for analysis",
                "tickers": tickers,
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
        
        # Filter tickers that have data
        available_tickers = list(returns_df.columns)
        if len(available_tickers) < len(tickers):
            logger.warning("Some tickers have no data. Using: %s", available_tickers)
            # Adjust weights for available tickers only
            tickers = available_tickers
            weights_array = weights_array[:len(tickers)]
            weights_array /= weights_array.sum()  # Renormalize
        
        result = {
            "tickers": tickers,
            "period": period,
            "current_portfolio": {},
            "diversification": {},
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # Calculate current portfolio metrics
        current_metrics = calculate_portfolio_metrics(returns_df, weights_array)
        result["current_portfolio"] = {
            "weights": {ticker: round(float(w), 4) for ticker, w in zip(tickers, weights_array)},
            **current_metrics
        }
        
        # Optimize portfolio if requested
        if optimize:
            try:
                optimal_weights, optimal_metrics = optimize_portfolio_sharpe(returns_df)
                
                result["optimized_portfolio"] = {
                    "weights": {ticker: round(float(w), 4) for ticker, w in zip(tickers, optimal_weights)},
                    **optimal_metrics
                }
                
                # Generate rebalancing suggestions
                rebalancing_suggestions = generate_rebalancing_suggestions(
                    weights_array,
                    optimal_weights,
                    tickers
                )
                
                result["rebalancing"] = {
                    "needed": len(rebalancing_suggestions) > 0,
                    "suggestions": rebalancing_suggestions
                }
                
                # Calculate improvement
                sharpe_improvement = optimal_metrics["sharpe_ratio"] - current_metrics["sharpe_ratio"]
                result["optimization_benefit"] = {
                    "sharpe_improvement": round(sharpe_improvement, 4),
                    "sharpe_improvement_pct": round(sharpe_improvement / current_metrics["sharpe_ratio"] * 100, 2) if current_metrics["sharpe_ratio"] != 0 else None
                }
                
            except Exception as e:
                logger.warning("Portfolio optimization failed: %s", e)
                result["optimized_portfolio"] = {"error": str(e)}
        
        # Diversification analysis
        correlation_matrix = calculate_correlation_matrix(returns_df)
        diversification_score = calculate_diversification_score(correlation_matrix, weights_array)
        concentration_risk = assess_concentration_risk(weights_array)
        
        result["diversification"] = {
            "score": round(diversification_score, 2),
            "correlation_matrix": correlation_matrix.to_dict(),
            "concentration_risk": concentration_risk,
            "num_assets": len(tickers)
        }
        
        # Interpretation
        interpretations = []
        
        if diversification_score > 75:
            interpretations.append("Excellent diversification - low correlation between assets.")
        elif diversification_score > 50:
            interpretations.append("Good diversification - moderate correlation.")
        else:
            interpretations.append("Poor diversification - assets are highly correlated.")
        
        if concentration_risk == "low - well diversified":
            interpretations.append("Portfolio weights are well balanced.")
        else:
            interpretations.append(f"Concentration risk is {concentration_risk}.")
        
        sharpe = current_metrics["sharpe_ratio"]
        if sharpe > 1.5:
            interpretations.append("Strong risk-adjusted returns (high Sharpe ratio).")
        elif sharpe > 0.8:
            interpretations.append("Acceptable risk-adjusted returns.")
        else:
            interpretations.append("Low risk-adjusted returns - consider optimization.")
        
        result["interpretation"] = " ".join(interpretations)
        
        return result
        
    except Exception as e:
        logger.exception("Error in portfolio analysis: %s", e)
        return {
            "error": str(e),
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
