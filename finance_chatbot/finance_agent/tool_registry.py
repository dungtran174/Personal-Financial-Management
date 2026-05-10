import inspect
from dataclasses import dataclass, field
from typing import Callable, Dict, Any


def _callable_to_schema(func: Callable) -> Dict[str, Any]:
    """
    Build a simple JSON schema for function parameters based on signature.
    Defaults to string for unknown annotations.
    """
    sig = inspect.signature(func)
    props = {}
    required = []
    for name, param in sig.parameters.items():
        if param.kind in (param.VAR_POSITIONAL, param.VAR_KEYWORD):
            continue
        # Skip 'token' parameter - it will be injected by the agent
        if name == "token":
            continue
            
        ann = param.annotation
        if ann == inspect._empty:
            t = "string"
        elif ann in (str,):
            t = "string"
        elif ann in (int,):
            t = "integer"
        elif ann in (float,):
            t = "number"
        elif ann in (bool,):
            t = "boolean"
        else:
            t = "string"
        props[name] = {"type": t, "description": f"Parameter {name} of {func.__name__}"}
        if param.default == inspect._empty:
            required.append(name)
    schema = {"type": "object", "properties": props}
    if required:
        schema["required"] = required
    return schema


@dataclass
class ToolMeta:
    """Metadata for each registered tool."""
    name: str
    description: str
    func: Callable
    parameters_schema: Dict[str, Any] = field(default_factory=dict)


class ToolRegistry:
    """Central registry for all tools."""

    def __init__(self):
        self._tools: Dict[str, ToolMeta] = {}

    def register(
        self,
        name: str,
        description: str,
        func: Callable,
        parameters_schema: Dict[str, Any] = None,
    ):
        """Register a tool into the registry."""
        if parameters_schema is None:
            parameters_schema = _callable_to_schema(func)
        meta = ToolMeta(
            name=name,
            description=description,
            func=func,
            parameters_schema=parameters_schema,
        )
        self._tools[name] = meta

    def get(self, name: str) -> ToolMeta:
        return self._tools.get(name)

    def list_tools(self) -> Dict[str, ToolMeta]:
        return self._tools


# -----------------------
# Global registry instance
# -----------------------
registry = ToolRegistry()

# Example tool registrations
# Bạn import các tool thực tế của bạn vào đây

# Existing tools
from .tools.chart import generate_price_chart
from .tools.fundamentals import get_fundamentals
from .tools.google_search import google_search
from .tools.news import search_news
from .tools.pdf_parse import parse_financial_report
from .tools.ratios import calculate_ratios
from .tools.stock_price import get_stock_price
from .tools.stock_symbol import get_stock_symbol
from .tools.stock_price_chart import generate_stock_price_chart  # New combined tool

# New tools - Phase 1
from .tools.technical_indicators import get_technical_indicators
from .tools.advanced_ratios import get_advanced_ratios
from .tools.peer_comparison import compare_with_peers

# New tools - Phase 2
from .tools.risk_metrics import get_risk_metrics
from .tools.portfolio_analytics import analyze_portfolio
from .tools.valuation import estimate_fair_value

# New tools - Phase 3
from .tools.market_overview import get_market_overview
from .tools.cashflow_analysis import analyze_cashflow

# New tools - Phase 4: Data Foundation (Group 1)
from .tools.exchange_info import get_exchange_info
from .tools.currency_rate import get_currency_rate
from .tools.macro_data import get_macro_data
from .tools.sector_mapping import get_sector_mapping

# New tools - Phase 5: Fundamental Analysis (Group 2)
from .tools.income_statement import get_income_statement
from .tools.balance_sheet import get_balance_sheet
from .tools.compare_fundamentals import compare_fundamentals

# New tools - Phase 6: Quantitative/Risk (Group 3)
from .tools.backtest import get_backtest
from .tools.correlation_matrix import get_correlation_matrix

# New tools - Phase 7: Technical Analysis (Group 4)
from .tools.pattern_recognition import get_pattern_recognition
from .tools.candlestick_analysis import get_candlestick_analysis
from .tools.signal_summary import get_signal_summary

# New tools - Phase 8: Pattern Match Predictor
from .tools.pattern_match_predictor import get_pattern_match_predictor

# ========== NEW: Backend-integrated tools ==========
from .tools.fetch_crypto_price import fetch_crypto_price
from .tools.calculate_moving_average import calculate_moving_average
from .tools.calculate_rsi import calculate_rsi
from .tools.detect_support_resistance import detect_support_resistance


# ========== Register Existing Tools ==========

# Old chart tool - disabled in favor of generate_stock_price_chart
# registry.register(
#     name="generate_price_chart",
#     description="Generate a price chart for a given stock ticker",
#     func=generate_price_chart,
# )

# New improved chart tool that handles everything
registry.register(
    name="generate_stock_price_chart",
    description="Generate a stock price chart with historical data for a given ticker. Automatically fetches historical prices and creates a chart. Use period like '1d', '5d', '1mo', '3mo', '6mo', '1y' to specify time range. Perfect for visualizing price movements.",
    func=generate_stock_price_chart,
)

registry.register(
    name="get_fundamentals",
    description="Retrieve fundamental information for a stock ticker including market cap, sector, revenue, and earnings",
    func=get_fundamentals,
)
registry.register(
    name="google_search",
    description="Perform a Google search and return snippets",
    func=google_search,
)
registry.register(
    name="search_news",
    description="Search for the latest financial news about a stock ticker or company",
    func=search_news,
)
registry.register(
    name="parse_financial_report",
    description="Parse PDF financial report and extract sections",
    func=parse_financial_report,
)
registry.register(
    name="calculate_ratios",
    description="Calculate basic financial ratios (EPS, P/E, ROE) for a stock ticker",
    func=calculate_ratios,
)
registry.register(
    name="get_stock_price",
    description="Fetch current or historical stock price for a ticker symbol",
    func=get_stock_price,
)
registry.register(
    name="get_stock_symbol",
    description="Find stock ticker symbol from a company name",
    func=get_stock_symbol,
)

# ========== Register New Tools - Phase 1: Core Analysis ==========

registry.register(
    name="get_technical_indicators",
    description="Calculate technical analysis indicators (RSI, MACD, Moving Averages, Bollinger Bands, Stochastic) for a stock ticker. Use this to analyze price trends and trading signals.",
    func=get_technical_indicators,
)

registry.register(
    name="get_advanced_ratios",
    description="Calculate advanced financial ratios including valuation (P/B, P/S, PEG, EV/EBITDA), leverage (Debt-to-Equity, Interest Coverage), liquidity (Current Ratio, Quick Ratio), profitability margins, and efficiency metrics for a stock ticker.",
    func=get_advanced_ratios,
)

registry.register(
    name="compare_with_peers",
    description="Compare a company's financial metrics with peer companies in the same sector. Provides ranking, percentile, and competitive position analysis across valuation, profitability, and growth metrics.",
    func=compare_with_peers,
)

# ========== Register New Tools - Phase 2: Risk & Portfolio ==========

registry.register(
    name="get_risk_metrics",
    description="Calculate comprehensive risk metrics for a stock including Beta, Alpha, Volatility, Sharpe Ratio, Sortino Ratio, Maximum Drawdown, and Value at Risk (VaR). Use this to assess investment risk relative to a benchmark.",
    func=get_risk_metrics,
)

registry.register(
    name="analyze_portfolio",
    description="Analyze and optimize a portfolio of stocks. Calculate expected return, volatility, Sharpe ratio, diversification score, correlation matrix, and provide rebalancing suggestions. Use this for portfolio construction and optimization.",
    func=analyze_portfolio,
)

registry.register(
    name="estimate_fair_value",
    description="Estimate fair value of a stock using multiple valuation methods: DCF (Discounted Cash Flow), DDM (Dividend Discount Model), and PEG ratio analysis. Provides upside/downside potential and buy/sell/hold recommendation.",
    func=estimate_fair_value,
)

# ========== Register New Tools - Phase 3: Market Intelligence ==========

registry.register(
    name="get_market_overview",
    description="Get comprehensive market overview including major indices performance (US, Vietnam, Asia, Europe), sector performance, market breadth, and sentiment analysis. Use this to understand overall market conditions.",
    func=get_market_overview,
)

registry.register(
    name="analyze_cashflow",
    description="Analyze company's cash flow including Operating Cash Flow (OCF), Free Cash Flow (FCF), Cash Conversion Cycle, and cash flow quality assessment. Use this to evaluate financial health and cash generation capability.",
    func=analyze_cashflow,
)

# ========== Register New Tools - Phase 4: Data Foundation ==========

registry.register(
    name="get_exchange_info",
    description="Get information about stock exchanges including full name, country, timezone, trading hours, and currency. Supports HOSE, HNX, UPCOM (Vietnam), NYSE, NASDAQ (US), LSE, JPX, SSE, HKEX and others. Can auto-detect exchange from ticker symbol.",
    func=get_exchange_info,
)

registry.register(
    name="get_currency_rate",
    description="Get real-time currency exchange rates between different currencies (USD, EUR, GBP, JPY, CNY, VND, SGD, THB, KRW). Can convert amounts between currencies. Use this for forex rates and currency conversion.",
    func=get_currency_rate,
)

registry.register(
    name="get_macro_data",
    description="Get macroeconomic data for countries including GDP growth, inflation (CPI), unemployment rate, and interest rates. Supports US, Vietnam, China, Japan, EU. Also provides US Treasury yields. Use this for macro analysis and economic indicators.",
    func=get_macro_data,
)

registry.register(
    name="get_sector_mapping",
    description="Get sector and industry classification for a company. Returns GICS sector, industry group, and list of peer companies in the same sector. Use this to understand company's business category and find competitors.",
    func=get_sector_mapping,
)

# ========== Register New Tools - Phase 5: Fundamental Analysis ==========

registry.register(
    name="get_income_statement",
    description="Get detailed Income Statement (Profit & Loss) for a company including revenue, costs, gross profit, operating profit, net income, and profit margins. Supports both annual and quarterly statements. Use this to analyze company's profitability and revenue trends.",
    func=get_income_statement,
)

registry.register(
    name="get_balance_sheet",
    description="Get Balance Sheet for a company showing assets (current & total), liabilities (current & total), stockholders' equity, and key ratios like Current Ratio and Debt-to-Equity. Supports annual and quarterly data. Use this to assess financial position and leverage.",
    func=get_balance_sheet,
)

registry.register(
    name="compare_fundamentals",
    description="Compare fundamental metrics across multiple companies side-by-side. Analyzes valuation (P/E, P/B), profitability (ROE, margins), growth (revenue/earnings growth), and identifies best/worst performers for each metric. Use this for competitive analysis and stock comparison.",
    func=compare_fundamentals,
)

# ========== Register New Tools - Phase 6: Quantitative & Risk ==========

registry.register(
    name="get_backtest",
    description="Backtest investment strategies with historical data. Supports multiple strategies: Buy & Hold, Moving Average Crossover, RSI-based trading, and Monthly Rebalancing. Returns total return, profit/loss, and trade history. Use this to test strategy performance before investing.",
    func=get_backtest,
)

registry.register(
    name="get_correlation_matrix",
    description="Calculate correlation matrix between multiple stocks to understand relationships and diversification. Supports Pearson, Spearman, and Kendall methods. Can also compute rolling correlation over time. Use this for portfolio construction and risk assessment.",
    func=get_correlation_matrix,
)

# ========== Register New Tools - Phase 7: Technical Analysis ==========

registry.register(
    name="get_pattern_recognition",
    description="Detect chart patterns in stock price including Head & Shoulders, Double Top/Bottom, Triangle patterns (Ascending/Descending/Symmetrical), and Support/Resistance levels. Provides price targets and breakout signals. Use this for technical pattern analysis.",
    func=get_pattern_recognition,
)

registry.register(
    name="get_candlestick_analysis",
    description="Analyze Japanese candlestick patterns including Doji, Hammer, Shooting Star, Engulfing (bullish/bearish), Morning/Evening Star, Three White Soldiers, and more. Detects reversal and continuation signals. Use this for candlestick pattern trading signals.",
    func=get_candlestick_analysis,
)

registry.register(
    name="get_signal_summary",
    description="Aggregate technical signals from multiple indicators (Moving Averages, RSI, MACD, Bollinger Bands, Stochastic, Volume) into overall BUY/SELL/NEUTRAL recommendation with confidence level. Provides detailed breakdown of each indicator. Use this for comprehensive technical analysis summary.",
    func=get_signal_summary,
)

# ========== Register New Tools - Phase 8: Pattern Match Predictor ==========

registry.register(
    name="get_pattern_match_predictor",
    description="Finds historical price patterns across multiple assets (stocks, crypto, forex, etc.) and calculates the probabilistic outcome (up/down and average return) for the next 5 days based on pattern similarity. Uses FAISS vector search to find similar 30-day patterns from millions of historical patterns. Returns win rate, average return, and BULLISH/BEARISH/NEUTRAL prediction with confidence level. Use this for pattern-based price prediction and technical analysis.",
    func=get_pattern_match_predictor,
)

# ========== NEW: PFM Tools (Personal Financial Management) ==========
from .tools.pfm_tools import (
    pfm_get_financial_summary,
    pfm_get_report_by_time,
    pfm_add_expense,
    pfm_search_expenses,
    pfm_add_income,
    pfm_search_incomes,
    pfm_get_watchlist,
    pfm_add_to_watchlist,
    pfm_remove_from_watchlist
)

# ========== Register Backend-Integrated Tools ==========


registry.register(
    name="fetch_crypto_price",
    description="Fetch real-time cryptocurrency prices from backend Binance stream (primary) with CoinGecko fallback. Supports BTC, ETH, BNB, ADA, XRP, SOL, and more. Returns price, 24h change, volume. Much faster than external APIs.",
    func=fetch_crypto_price,
)

registry.register(
    name="calculate_moving_average",
    description="Calculate Moving Average (SMA or EMA) using backend OHLCV data with yfinance fallback. Returns MA value, current price, signal (BULLISH/BEARISH), and distance percentage. Supports multiple timeframes (1m to 1w). Use for trend analysis.",
    func=calculate_moving_average,
)

registry.register(
    name="calculate_rsi",
    description="Calculate RSI (Relative Strength Index) using backend OHLCV data with yfinance fallback. Returns RSI value (0-100), signal (OVERBOUGHT/OVERSOLD/NEUTRAL), and interpretation. RSI>70=overbought, RSI<30=oversold. Use for momentum analysis.",
    func=calculate_rsi,
)

registry.register(
    name="detect_support_resistance",
    description="Detect support and resistance price levels using backend OHLCV data with yfinance fallback. Returns top support/resistance levels, nearest levels, and distance to current price. Use for identifying key price zones and potential reversal points.",
    func=detect_support_resistance,
)

# ========== Register PFM Tools ==========

registry.register(
    name="pfm_get_financial_summary",
    description="Get financial summary for the current user including total income, total expense, and current balance. Use this to answer questions like 'How much money do I have left?', 'What is my financial status?'. Requires user authentication.",
    func=pfm_get_financial_summary,
)

registry.register(
    name="pfm_get_report_by_time",
    description="Get financial report for a specific time range. Returns income and expense details. Use this for questions like 'How much did I spend last month?', 'Show me my finances from Jan to March'. Requires start_date and end_date (YYYY-MM-DD).",
    func=pfm_get_report_by_time,
)

registry.register(
    name="pfm_add_expense",
    description="Add a new expense transaction. Use this when user says 'I spent 50k on food', 'Add 500k for rent'. Requires title, amount, category. Optional: description, date.",
    func=pfm_add_expense,
)

registry.register(
    name="pfm_search_expenses",
    description="Search expense history by date range or category. Use this to find past expenses like 'How much did I spend on food last week?'.",
    func=pfm_search_expenses,
)

registry.register(
    name="pfm_add_income",
    description="Add a new income transaction. Use this when user says 'I received salary 20m', 'Got bonus 5m'. Requires title, amount, category. Optional: description, date.",
    func=pfm_add_income,
)

registry.register(
    name="pfm_search_incomes",
    description="Search income history by date range or category. Use this to find past incomes.",
    func=pfm_search_incomes,
)

registry.register(
    name="pfm_get_watchlist",
    description="Get user's personal watchlist of stocks/crypto. Use this to show tracked assets.",
    func=pfm_get_watchlist,
)

registry.register(
    name="pfm_add_to_watchlist",
    description="Add a stock or crypto symbol to user's watchlist. Use this when user says 'Track VCB for me', 'Add BTC to watchlist'.",
    func=pfm_add_to_watchlist,
)

registry.register(
    name="pfm_remove_from_watchlist",
    description="Remove a symbol from user's watchlist. Use this when user says 'Stop tracking VCB', 'Remove BTC from watchlist'.",
    func=pfm_remove_from_watchlist,
)

