# FinancialApp – AI-powered Finance Agent

## Introduction
**FinancialApp** is an AI-driven finance agent that combines large language models, financial data sources, and lightweight orchestration to answer investor-style questions. It demonstrates how to build an agent that (1) decomposes questions into sub-questions, (2) chooses and calls tools (price, fundamentals, news, parsers), and (3) synthesizes a final answer.

Use cases:
- Quick stock lookups and ratio calculations (EPS, P/E, ROE).
- Research assistant for basic company fundamentals and headlines.
- Demonstration of an LLM + tools orchestration architecture for portfolio/AI demos.

## Features
- Natural-language queries for stocks and companies.
- Automatic tool selection: `get_stock_symbol`, `get_stock_price`, `get_fundamentals`, `search_news`, `calculate_ratios`, and more.
- Basic financial computations: EPS, P/E, ROE (with fallbacks if data missing).
- Optional web search integration (SerpAPI or local search endpoint).
- Vector index for tool/document retrieval (FAISS + HuggingFace embeddings).
- Unit tests and manual tool tests included.

## Tech Stack
- Python 3.10+ (3.13 recommended)
- LLM: Gemini / Google Generative AI (wrapper included) or mock mode for offline dev
- Data sources: `yfinance`, SerpAPI (optional)
- Vector search: FAISS + sentence-transformers (`all-MiniLM-L6-v2`)

## Installation

1. Clone:
```bash
git clone https://github.com/your-username/FinancialApp.git
cd FinancialApp
```
2. Create & activate venv:
```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment variables:
Create a .env file in the repo root with keys you need. Example:
```bash
SERPAPI_KEY=your_serpapi_key_here
GEMINI_API_KEY=your_gemini_or_google_key_here
LOCAL_SEARCH_ENDPOINT=http://127.0.0.1:8000/search   # optional
```

## Running
-Manual tool checks:
```bash
python manual_test_tools.py
```
-Agent demo:
```bash
python run_example.py
```
## Example queries to try
-"What is the current price of AAPL?"

-"What is Vinamilk's ticker and latest news?"

-"Calculate P/E and ROE for Apple."

-"Show a small price chart for MSFT last 30 days."