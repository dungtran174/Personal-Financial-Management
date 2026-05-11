# Financial Analysis Tools - Documentation

Tài liệu mô tả chi tiết các tools phân tích tài chính trong FinancialApp AI Agent.

## Table of Contents

- [Existing Tools](#existing-tools)
- [New Tools - Phase 1](#new-tools---phase-1)
- [New Tools - Phase 2](#new-tools---phase-2)
- [New Tools - Phase 3](#new-tools---phase-3)
- [API Keys & Configuration](#api-keys--configuration)
- [Dependencies](#dependencies)

---

## Existing Tools

### 1. get_stock_symbol
**File:** `finance_agent/tools/stock_symbol.py`

**Mô tả:** Tìm mã cổ phiếu (ticker) từ tên công ty.

**Input:**
- `company_name` (str): Tên công ty cần tìm
- `country` (str, optional): Quốc gia (vn, us, etc.)

**Output:**
```python
{
    "company_name": str,
    "ticker": str,
    "source": str,  # "google_search", "llm", etc.
    "confidence": float,  # 0.0 - 1.0
    "timestamp": str
}
```

**Luồng hoạt động:**
1. Tìm kiếm Google với query "company_name stock ticker"
2. Extract các ticker candidates từ kết quả
3. Validate với yfinance
4. Nếu không tìm thấy, sử dụng LLM (Gemini) để đoán ticker
5. Trả về ticker với confidence score

---

### 2. get_stock_price
**File:** `finance_agent/tools/stock_price.py`

**Mô tả:** Lấy giá cổ phiếu hiện tại hoặc lịch sử.

**Input:**
- `ticker` (str): Mã cổ phiếu (AAPL, VNM.VN, etc.)

**Output:**
```python
{
    "ticker": str,
    "price": float,
    "currency": str,  # USD, VND
    "timestamp": str,
    "source": str,  # "yfinance"
    "error": str | None
}
```

**Luồng hoạt động:**
1. Normalize ticker symbol
2. Fetch data từ yfinance với period=5d
3. Lấy Close price của ngày gần nhất
4. Detect currency dựa vào ticker suffix (.VN = VND)
5. Fallback: nếu không có dữ liệu, thử thêm .VN cho thị trường Việt Nam

**Lưu ý:**
- SSL certificate issues trên Windows được xử lý với certifi
- Yfinance cache được clear để tránh stale data

---

### 3. get_fundamentals
**File:** `finance_agent/tools/fundamentals.py`

**Mô tả:** Lấy thông tin tài chính cơ bản của công ty.

**Input:**
- `ticker` (str): Mã cổ phiếu

**Output:**
```python
{
    "ticker": str,
    "snapshot": {
        "marketCap": float,
        "sector": str,
        "country": str,
        "sharesOutstanding": float,
        "netIncome": float,
        "totalEquity": float,
        "eps": float
    },
    "retrieved": str
}
```

**Luồng hoạt động:**
1. Fetch ticker info từ yfinance
2. Lấy Market Cap, Sector, Country từ info
3. Lấy Net Income từ Income Statement (TTM)
4. Lấy Total Equity từ Balance Sheet
5. Tính EPS = Net Income / Shares Outstanding

---

### 4. calculate_ratios
**File:** `finance_agent/tools/ratios.py`

**Mô tả:** Tính các chỉ số tài chính cơ bản: EPS, P/E, ROE.

**Input:**
- `ticker` (str): Mã cổ phiếu
- `assume_pb` (float, default=4.0): Giả định P/B ratio nếu thiếu equity data

**Output:**
```python
{
    "ticker": str,
    "ratios": {
        "eps": float,
        "pe": float,
        "roe": float  # percentage
    }
}
```

**Luồng hoạt động:**
1. Gọi get_fundamentals() và get_stock_price()
2. Tính EPS = Net Income / Shares Outstanding
3. Tính P/E = Price / EPS
4. Tính ROE = Net Income / Total Equity (%)
5. Fallback: nếu thiếu equity, ước lượng từ Market Cap / P/B

---

### 5. search_news
**File:** `finance_agent/tools/news.py`

**Mô tả:** Tìm kiếm tin tức tài chính về cổ phiếu hoặc công ty.

**Input:**
- `query` (str, optional): Query tìm kiếm
- `ticker` (str, optional): Mã cổ phiếu

**Output:**
```python
{
    "query": str,
    "results": [
        {
            "title": str,
            "link": str,
            "date": str,
            "snippet": str
        }
    ]
}
```

**Luồng hoạt động:**
1. Nếu chỉ có ticker, tạo query = "{ticker} stock news"
2. Gọi SerpAPI với engine="google_news"
3. Parse kết quả và trả về list các bài báo

**Lưu ý:**
- **Yêu cầu SERPAPI_KEY** trong file .env
- API key hiện tại hardcoded trong file (nên di chuyển ra .env)

---

### 6. google_search
**File:** `finance_agent/tools/google_search.py`

**Mô tả:** Thực hiện tìm kiếm Google và trả về snippets.

**Input:**
- `query` (str): Query tìm kiếm

**Output:**
- `str`: Concatenated snippets từ kết quả tìm kiếm

**Luồng hoạt động:**
1. Gọi SerpAPI với engine="google"
2. Extract snippets từ organic results
3. Concatenate và return text

**Lưu ý:**
- **Yêu cầu SERPAPI_KEY**

---

### 7. generate_price_chart
**File:** `finance_agent/tools/chart.py`

**Mô tả:** Vẽ biểu đồ giá đơn giản (line chart).

**Input:**
- `values` (List[float]): Danh sách giá trị
- `labels` (List[str], optional): Nhãn trục x

**Output:**
- `str`: Base64-encoded PNG image

**Luồng hoạt động:**
1. Sử dụng matplotlib để plot line chart
2. Save vào BytesIO buffer
3. Encode base64 và return string

---

### 8. portfolio_simulator
**File:** `finance_agent/tools/portfolio_simulator.py`

**Mô tả:** Mô phỏng portfolio đơn giản với các giao dịch buy/sell.

**Input:**
- `actions_json` (str): JSON string chứa danh sách actions

**Output:**
```python
{
    "summary": {
        "net_cost": float,
        "estimated_return_pct": float
    },
    "timestamp": str
}
```

**Luồng hoạt động:**
1. Parse JSON actions
2. Tính tổng chi phí từ các giao dịch buy/sell
3. Trả về summary với estimated return (mock)

**Lưu ý:**
- Implementation hiện tại rất đơn giản (mock)
- Cần cải tiến để realistic hơn

---

### 9. parse_financial_report
**File:** `finance_agent/tools/pdf_parse.py`

**Mô tả:** Parse báo cáo tài chính PDF và extract sections.

**Input:**
- `pdf_path` (str): Đường dẫn file PDF

**Output:**
- `str`: Extracted text từ PDF

**Luồng hoạt động:**
- Placeholder implementation
- Cần thêm PDF parsing library (PyPDF2, pdfplumber)

---

## New Tools - Phase 1

### 10. technical_indicators
**File:** `finance_agent/tools/technical_indicators.py`

**Mô tả:** Tính toán các chỉ báo kỹ thuật (Technical Analysis).

**Chỉ báo bao gồm:**
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- SMA (Simple Moving Average)
- EMA (Exponential Moving Average)
- Bollinger Bands
- Stochastic Oscillator

**Input:**
- `ticker` (str): Mã cổ phiếu
- `period` (str, default="3mo"): Khoảng thời gian dữ liệu (1mo, 3mo, 6mo, 1y)
- `indicators` (List[str], optional): Danh sách indicators cần tính (nếu None thì tính tất cả)

**Output:**
```python
{
    "ticker": str,
    "period": str,
    "indicators": {
        "rsi": {
            "value": float,  # 0-100
            "signal": str,  # "oversold", "neutral", "overbought"
            "interpretation": str
        },
        "macd": {
            "macd_line": float,
            "signal_line": float,
            "histogram": float,
            "signal": str,  # "bullish", "bearish", "neutral"
            "interpretation": str
        },
        "sma_50": float,
        "sma_200": float,
        "ema_12": float,
        "ema_26": float,
        "bollinger_bands": {
            "upper": float,
            "middle": float,
            "lower": float,
            "width": float,
            "signal": str
        },
        "stochastic": {
            "k": float,
            "d": float,
            "signal": str
        }
    },
    "current_price": float,
    "timestamp": str
}
```

**Luồng hoạt động:**
1. Fetch historical price data từ yfinance
2. Tính RSI (14-period default)
   - RSI < 30: oversold (signal mua)
   - RSI > 70: overbought (signal bán)
3. Tính MACD (12, 26, 9)
   - MACD cross trên signal line: bullish
   - MACD cross dưới signal line: bearish
4. Tính Moving Averages (50, 200-day SMA và 12, 26-day EMA)
5. Tính Bollinger Bands (20-period, 2 std dev)
   - Giá chạm upper band: potential sell
   - Giá chạm lower band: potential buy
6. Tính Stochastic (14, 3, 3)
7. Aggregate signals và trả về

**Dependencies:**
- pandas_ta hoặc tính manual với pandas/numpy

---

### 11. advanced_ratios
**File:** `finance_agent/tools/advanced_ratios.py`

**Mô tả:** Tính các chỉ số tài chính nâng cao và margins.

**Chỉ số bao gồm:**
- Valuation: P/B, P/S, PEG, EV/EBITDA
- Leverage: Debt-to-Equity, Interest Coverage
- Liquidity: Current Ratio, Quick Ratio
- Profitability: Gross Margin, Operating Margin, Net Margin
- Efficiency: Asset Turnover, Inventory Turnover

**Input:**
- `ticker` (str): Mã cổ phiếu

**Output:**
```python
{
    "ticker": str,
    "valuation": {
        "price_to_book": float,
        "price_to_sales": float,
        "peg_ratio": float,
        "ev_to_ebitda": float
    },
    "leverage": {
        "debt_to_equity": float,
        "interest_coverage": float,
        "debt_ratio": float
    },
    "liquidity": {
        "current_ratio": float,
        "quick_ratio": float,
        "cash_ratio": float
    },
    "profitability": {
        "gross_margin": float,  # percentage
        "operating_margin": float,
        "net_margin": float,
        "roa": float,  # Return on Assets
        "roce": float  # Return on Capital Employed
    },
    "efficiency": {
        "asset_turnover": float,
        "inventory_turnover": float
    },
    "interpretation": {
        "valuation_status": str,  # "undervalued", "fairly valued", "overvalued"
        "financial_health": str,  # "strong", "moderate", "weak"
        "liquidity_status": str
    },
    "timestamp": str
}
```

**Luồng hoạt động:**
1. Fetch financial statements từ yfinance (income, balance sheet, cash flow)
2. Lấy current price
3. Tính valuation ratios:
   - P/B = Price / Book Value per Share
   - P/S = Market Cap / Revenue
   - PEG = P/E / Earnings Growth Rate
   - EV/EBITDA = Enterprise Value / EBITDA
4. Tính leverage ratios:
   - Debt-to-Equity = Total Debt / Total Equity
   - Interest Coverage = EBIT / Interest Expense
5. Tính liquidity ratios:
   - Current Ratio = Current Assets / Current Liabilities
   - Quick Ratio = (Current Assets - Inventory) / Current Liabilities
6. Tính profitability margins:
   - Gross Margin = (Revenue - COGS) / Revenue
   - Operating Margin = Operating Income / Revenue
   - Net Margin = Net Income / Revenue
7. Provide interpretation cho từng category

---

### 12. peer_comparison
**File:** `finance_agent/tools/peer_comparison.py`

**Mô tả:** So sánh công ty với các đối thủ cùng ngành.

**Input:**
- `ticker` (str): Mã cổ phiếu cần so sánh
- `top_n` (int, default=5): Số lượng peers để so sánh
- `metrics` (List[str], optional): Metrics cần so sánh

**Output:**
```python
{
    "ticker": str,
    "sector": str,
    "peers": List[str],  # List of peer tickers
    "comparison": {
        "valuation": {
            "pe_ratio": {
                "ticker_value": float,
                "peer_average": float,
                "peer_median": float,
                "rank": int,  # 1 = best
                "percentile": float
            },
            "pb_ratio": {...},
            "ps_ratio": {...}
        },
        "profitability": {
            "roe": {...},
            "roa": {...},
            "net_margin": {...}
        },
        "growth": {
            "revenue_growth": {...},
            "earnings_growth": {...}
        }
    },
    "summary": {
        "overall_rank": int,
        "strengths": List[str],
        "weaknesses": List[str],
        "competitive_position": str  # "leader", "average", "laggard"
    },
    "timestamp": str
}
```

**Luồng hoạt động:**
1. Lấy sector của ticker
2. Tìm peers trong cùng sector (từ yfinance screener hoặc predefined list)
3. Fetch metrics cho ticker và tất cả peers
4. Tính average, median cho mỗi metric
5. Rank ticker so với peers
6. Identify strengths và weaknesses
7. Trả về comparison report

---

## New Tools - Phase 2

### 13. risk_metrics
**File:** `finance_agent/tools/risk_metrics.py`

**Mô tả:** Tính các chỉ số rủi ro và volatility.

**Input:**
- `ticker` (str): Mã cổ phiếu
- `benchmark` (str, default="^GSPC"): Benchmark index (S&P500, ^VNI cho VN)
- `period` (str, default="1y"): Khoảng thời gian

**Output:**
```python
{
    "ticker": str,
    "risk_metrics": {
        "beta": float,
        "alpha": float,
        "volatility": float,  # annualized std dev
        "sharpe_ratio": float,
        "sortino_ratio": float,
        "max_drawdown": float,  # percentage
        "var_95": float,  # Value at Risk 95%
        "cvar_95": float  # Conditional VaR
    },
    "risk_level": str,  # "low", "moderate", "high", "very high"
    "interpretation": str,
    "timestamp": str
}
```

---

### 14. portfolio_analytics
**File:** `finance_agent/tools/portfolio_analytics.py`

**Mô tả:** Phân tích và tối ưu hóa portfolio.

**Input:**
- `tickers` (List[str]): Danh sách mã cổ phiếu
- `weights` (List[float], optional): Tỷ trọng hiện tại
- `optimize` (bool, default=True): Có tối ưu hóa hay không

**Output:**
```python
{
    "current_portfolio": {
        "tickers": List[str],
        "weights": List[float],
        "expected_return": float,
        "volatility": float,
        "sharpe_ratio": float
    },
    "optimized_portfolio": {
        "weights": List[float],
        "expected_return": float,
        "volatility": float,
        "sharpe_ratio": float
    },
    "diversification": {
        "score": float,  # 0-100
        "correlation_matrix": Dict,
        "concentration_risk": str
    },
    "rebalancing": {
        "needed": bool,
        "suggestions": List[Dict]
    }
}
```

---

### 15. valuation
**File:** `finance_agent/tools/valuation.py`

**Mô tả:** Định giá công ty và ước tính fair value.

**Input:**
- `ticker` (str): Mã cổ phiếu
- `method` (str, default="dcf"): Phương pháp định giá (dcf, ddm, peg)
- `growth_rate` (float, optional): Tỷ lệ tăng trưởng giả định
- `discount_rate` (float, optional): Discount rate

**Output:**
```python
{
    "ticker": str,
    "current_price": float,
    "valuation": {
        "dcf_value": float,
        "ddm_value": float,
        "peg_value": float,
        "avg_fair_value": float
    },
    "assessment": {
        "status": str,  # "undervalued", "fairly valued", "overvalued"
        "upside_potential": float,  # percentage
        "recommendation": str
    }
}
```

---

## New Tools - Phase 3

### 16. market_overview
**File:** `finance_agent/tools/market_overview.py`

**Mô tả:** Tổng quan thị trường và các chỉ số.

### 17. cashflow_analysis
**File:** `finance_agent/tools/cashflow_analysis.py`

**Mô tả:** Phân tích dòng tiền chi tiết.

---

## API Keys & Configuration

### Required API Keys

1. **GEMINI_API_KEY**
   - Service: Google Generative AI (Gemini)
   - Purpose: LLM cho agent reasoning
   - Get key: https://makersuite.google.com/app/apikey
   - Add to `.env`: `GEMINI_API_KEY=your_key_here`

2. **SERPAPI_KEY**
   - Service: SerpAPI
   - Purpose: Google search, news search
   - Get key: https://serpapi.com/manage-api-key
   - Add to `.env`: `SERPAPI_KEY=your_key_here`
   - Note: Hiện đang hardcoded trong news.py, nên di chuyển ra .env

### Optional Configuration

- `LOCAL_SEARCH_ENDPOINT`: Custom search endpoint (optional)

---

## Dependencies

### Current Dependencies (requirements.txt)
```
pydantic>=1.10
requests>=2.28
numpy>=1.24
scikit-learn>=1.2
matplotlib>=3.6
langchain>=0.1.0
langchain-community>=0.0.20
langchain-huggingface>=0.0.1
sentence-transformers>=2.2.0
faiss-cpu>=1.7.4
google-generativeai>=0.0.5
yfinance>=0.2.25
jsonschema>=4.8
```

### Additional Dependencies Needed

```
# For technical analysis
pandas-ta>=0.3.14
# Or alternative: ta-lib (harder to install)

# For statistical analysis
scipy>=1.10.0

# For advanced portfolio optimization
cvxpy>=1.3.0  # Convex optimization

# For PDF parsing (if needed)
PyPDF2>=3.0.0
pdfplumber>=0.9.0
```

---

## Usage Examples

```python
from finance_agent.agent import FinancialAgent

agent = FinancialAgent(verbose=True)

# Example queries
result = agent.answer("Tính RSI và MACD cho cổ phiếu AAPL")
result = agent.answer("So sánh P/E ratio của VNM với các công ty cùng ngành")
result = agent.answer("Phân tích rủi ro của portfolio gồm AAPL, MSFT, GOOGL")
```

---

## Notes

- Tất cả tools đều graceful fallback khi thiếu data
- Error handling để tránh crash agent
- Logging để debug
- Caching market data để giảm API calls (future improvement)

---

## Implementation Status

**Status:** ✅ **COMPLETED** - All Phase 1, 2, and 3 tools have been implemented!

**Total Tools:** 16 (9 existing + 7 new)

### Phase 1: Core Analysis Tools ✅
- ✅ **technical_indicators.py** - RSI, MACD, MA, EMA, Bollinger Bands, Stochastic
- ✅ **advanced_ratios.py** - P/B, P/S, PEG, Debt-to-Equity, margins, liquidity ratios
- ✅ **peer_comparison.py** - Compare with sector peers

### Phase 2: Risk & Portfolio Tools ✅
- ✅ **risk_metrics.py** - Beta, Volatility, Sharpe Ratio, Max Drawdown, VaR
- ✅ **portfolio_analytics.py** - Portfolio optimization, diversification analysis
- ✅ **valuation.py** - DCF, DDM, PEG valuation models

### Phase 3: Market Intelligence Tools ✅
- ✅ **market_overview.py** - Market indices and sector performance
- ✅ **cashflow_analysis.py** - OCF, FCF, Cash Conversion Cycle

---

## Quick Start

```python
from finance_agent.agent import FinancialAgent

# Initialize agent
agent = FinancialAgent(verbose=True)

# Example 1: Technical Analysis
result = agent.answer("Tính RSI và MACD cho cổ phiếu AAPL")

# Example 2: Peer Comparison
result = agent.answer("So sánh P/E ratio của Apple với các công ty cùng ngành")

# Example 3: Risk Analysis
result = agent.answer("Phân tích rủi ro của cổ phiếu TSLA so với S&P 500")

# Example 4: Portfolio Optimization
result = agent.answer("Tối ưu hóa portfolio gồm AAPL, MSFT, GOOGL, AMZN")

# Example 5: Valuation
result = agent.answer("Ước tính fair value của VNM.VN bằng DCF model")

# Example 6: Market Overview
result = agent.answer("Tổng quan thị trường Việt Nam hôm nay")

# Example 7: Cash Flow Analysis
result = agent.answer("Phân tích dòng tiền của công ty FPT")

print(result["report"])
```

---

## Testing Individual Tools

You can also test individual tools directly:

```python
from finance_agent.tools.technical_indicators import get_technical_indicators
from finance_agent.tools.advanced_ratios import get_advanced_ratios
from finance_agent.tools.peer_comparison import compare_with_peers
from finance_agent.tools.risk_metrics import get_risk_metrics
from finance_agent.tools.portfolio_analytics import analyze_portfolio
from finance_agent.tools.valuation import estimate_fair_value
from finance_agent.tools.market_overview import get_market_overview
from finance_agent.tools.cashflow_analysis import analyze_cashflow

# Technical Analysis
tech_indicators = get_technical_indicators("AAPL", period="3mo")
print(tech_indicators)

# Advanced Ratios
ratios = get_advanced_ratios("MSFT")
print(ratios)

# Peer Comparison
comparison = compare_with_peers("AAPL", top_n=5)
print(comparison)

# Risk Metrics
risk = get_risk_metrics("TSLA", benchmark="^GSPC", period="1y")
print(risk)

# Portfolio Analysis
portfolio = analyze_portfolio(
    tickers=["AAPL", "MSFT", "GOOGL", "AMZN"],
    optimize=True
)
print(portfolio)

# Valuation
valuation = estimate_fair_value("AAPL", method="all")
print(valuation)

# Market Overview
market = get_market_overview(market="US", include_sectors=True)
print(market)

# Cash Flow Analysis
cashflow = analyze_cashflow("AAPL")
print(cashflow)
```

---

**Last Updated:** 2025-01-11

**Implementation Status:** All tools completed and registered ✅
