# finance_agent/tools/stock_price_chart.py
"""
Wrapper tool to generate stock price charts with historical data.
Combines fetching historical prices and generating chart.
"""
import base64
import datetime
import logging
from io import BytesIO
from typing import Dict, Any, Optional
import matplotlib
matplotlib.use("Agg")  # Use non-GUI backend
import matplotlib.pyplot as plt

logger = logging.getLogger(__name__)

# Try to import yfinance
USE_YFINANCE = False
try:
    import yfinance as yf
    USE_YFINANCE = True
except ImportError:
    logger.warning("yfinance not available, will use mock data for charts")


def generate_stock_price_chart(
    ticker: str,
    period: str = "1mo",  # 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
    interval: str = "1d"   # 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
) -> Dict[str, Any]:
    """
    Generate a stock price chart for the given ticker and time period.
    
    Args:
        ticker: Stock symbol (e.g., "AAPL", "GOOGL")
        period: Time period for historical data
            - Valid periods: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
        interval: Data interval
            - Valid intervals: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
            - Intraday data cannot extend last 60 days
            
    Returns:
        Dict containing:
        - ticker: The stock symbol
        - period: Time period used
        - chart_base64: Base64 encoded PNG image of the chart
        - price_data: Dict with latest, high, low, and change info
        - error: Error message if any
    """
    
    if not ticker:
        return {
            "ticker": ticker,
            "period": period,
            "chart_base64": None,
            "price_data": None,
            "error": "Ticker symbol is required"
        }
    
    # Normalize ticker
    ticker = ticker.strip().upper()
    
    if USE_YFINANCE:
        try:
            logger.info(f"Fetching {period} data for {ticker} with {interval} interval")
            
            # Create ticker object
            stock = yf.Ticker(ticker)
            
            # Get historical data
            hist = stock.history(period=period, interval=interval)
            
            if hist.empty:
                # Try with .VN suffix for Vietnamese stocks
                if "." not in ticker:
                    ticker_vn = ticker + ".VN"
                    logger.info(f"Trying Vietnamese market: {ticker_vn}")
                    stock = yf.Ticker(ticker_vn)
                    hist = stock.history(period=period, interval=interval)
                    if not hist.empty:
                        ticker = ticker_vn
            
            if hist.empty:
                return {
                    "ticker": ticker,
                    "period": period,
                    "chart_base64": None,
                    "price_data": None,
                    "error": f"No data available for {ticker}"
                }
            
            # Extract price data
            prices = hist['Close'].tolist()
            dates = hist.index.strftime('%Y-%m-%d').tolist()
            
            # Calculate statistics
            latest_price = float(hist['Close'].iloc[-1])
            first_price = float(hist['Close'].iloc[0])
            high_price = float(hist['High'].max())
            low_price = float(hist['Low'].min())
            change_pct = ((latest_price - first_price) / first_price * 100) if first_price != 0 else 0
            
            # Generate chart
            plt.figure(figsize=(10, 6))
            
            # Plot price line
            plt.plot(dates, prices, linewidth=2, color='#1E88E5')
            plt.fill_between(range(len(dates)), prices, alpha=0.3, color='#1E88E5')
            
            # Customize chart
            plt.title(f'{ticker} Stock Price - {period}', fontsize=14, fontweight='bold')
            plt.xlabel('Date', fontsize=12)
            plt.ylabel('Price', fontsize=12)
            plt.grid(True, alpha=0.3)
            
            # Rotate x-axis labels for better readability
            plt.xticks(rotation=45)
            
            # Show only every nth label to avoid crowding
            num_labels = 10  # Show max 10 labels
            if len(dates) > num_labels:
                step = len(dates) // num_labels
                plt.xticks(range(0, len(dates), step), 
                          [dates[i] for i in range(0, len(dates), step)],
                          rotation=45)
            
            # Add price annotation on latest point
            plt.annotate(f'${latest_price:.2f}', 
                        xy=(len(prices)-1, latest_price),
                        xytext=(10, 10), 
                        textcoords='offset points',
                        bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.7),
                        fontsize=10)
            
            plt.tight_layout()
            
            # Save to base64
            buf = BytesIO()
            plt.savefig(buf, format='png', dpi=100)
            plt.close()
            buf.seek(0)
            chart_base64 = base64.b64encode(buf.read()).decode('ascii')
            
            return {
                "ticker": ticker,
                "period": period,
                "chart_base64": chart_base64,
                "price_data": {
                    "latest": latest_price,
                    "first": first_price,
                    "high": high_price,
                    "low": low_price,
                    "change_percent": round(change_pct, 2),
                    "data_points": len(prices)
                },
                "error": None
            }
            
        except Exception as e:
            logger.error(f"Error generating chart for {ticker}: {str(e)}")
            return {
                "ticker": ticker,
                "period": period,
                "chart_base64": None,
                "price_data": None,
                "error": f"Failed to generate chart: {str(e)}"
            }
    
    else:
        # Mock data for testing
        logger.info(f"Using mock data for {ticker} chart (yfinance not available)")
        
        # Generate mock prices
        import random
        num_points = 30 if period == "1mo" else 7
        base_price = 100
        prices = [base_price + random.uniform(-10, 10) for _ in range(num_points)]
        
        # Generate mock dates
        today = datetime.datetime.now()
        dates = [(today - datetime.timedelta(days=num_points-i-1)).strftime('%Y-%m-%d') 
                 for i in range(num_points)]
        
        # Generate chart with mock data
        plt.figure(figsize=(10, 6))
        plt.plot(dates, prices, linewidth=2, color='#1E88E5')
        plt.fill_between(range(len(dates)), prices, alpha=0.3, color='#1E88E5')
        plt.title(f'{ticker} Stock Price (Mock Data) - {period}', fontsize=14, fontweight='bold')
        plt.xlabel('Date', fontsize=12)
        plt.ylabel('Price', fontsize=12)
        plt.grid(True, alpha=0.3)
        plt.xticks(rotation=45)
        
        # Show fewer labels
        if len(dates) > 10:
            step = len(dates) // 10
            plt.xticks(range(0, len(dates), step), 
                      [dates[i] for i in range(0, len(dates), step)],
                      rotation=45)
        
        plt.tight_layout()
        
        # Save to base64
        buf = BytesIO()
        plt.savefig(buf, format='png', dpi=100)
        plt.close()
        buf.seek(0)
        chart_base64 = base64.b64encode(buf.read()).decode('ascii')
        
        return {
            "ticker": ticker,
            "period": period,
            "chart_base64": chart_base64,
            "price_data": {
                "latest": prices[-1],
                "first": prices[0],
                "high": max(prices),
                "low": min(prices),
                "change_percent": round(((prices[-1] - prices[0]) / prices[0] * 100), 2),
                "data_points": len(prices)
            },
            "error": "Using mock data (yfinance not available)"
        }
