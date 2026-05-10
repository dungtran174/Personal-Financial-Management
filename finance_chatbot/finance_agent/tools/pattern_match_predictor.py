# finance_agent/tools/pattern_match_predictor.py
"""
Pattern Match Predictor Tool

Finds historical price patterns across multiple assets (stocks, crypto, forex, etc.)
and calculates the probabilistic outcome (up/down and average return) for the next N days
based on pattern similarity.

Uses FAISS index for fast similarity search across millions of historical patterns.
"""
from __future__ import annotations
import datetime
import logging
import os
from typing import Dict, Any, Optional, List
from pathlib import Path

import numpy as np
import requests

logger = logging.getLogger(__name__)

# === Configuration ===
API_BASE_URL = os.getenv("PRICE_API_BASE_URL", "http://localhost:8000")
API_TIMEOUT = 30  # seconds

# Pattern Search Configuration
WINDOW_SIZE = 30  # Must match the index (30 days pattern)
TOP_K = 9  # Number of similar patterns to find
PREDICT_HORIZON = 5  # Days to predict ahead

# Index files location (same directory as this tool)
TOOL_DIR = Path(__file__).parent
INDEX_DIR = TOOL_DIR / "patternSearchIndex"
INDEX_FILE = INDEX_DIR / "pattern_search.index"
META_FILE = INDEX_DIR / "pattern_metadata.parquet"

# Lazy load index and metadata (singleton pattern)
_faiss_index = None
_metadata_df = None


def _load_index():
    """Load FAISS index into memory (lazy loading)."""
    global _faiss_index
    
    if _faiss_index is not None:
        return _faiss_index
    
    try:
        import faiss
        
        if not INDEX_FILE.exists():
            logger.error(f"Index file not found: {INDEX_FILE}")
            return None
        
        logger.info(f"Loading FAISS index from {INDEX_FILE}...")
        _faiss_index = faiss.read_index(str(INDEX_FILE))
        logger.info(f"Loaded index with {_faiss_index.ntotal} vectors")
        return _faiss_index
    
    except ImportError:
        logger.error("faiss-cpu package not installed. Run: pip install faiss-cpu")
        return None
    except Exception as e:
        logger.error(f"Error loading FAISS index: {e}")
        return None


def _load_metadata():
    """Load metadata DataFrame (lazy loading with Polars)."""
    global _metadata_df
    
    if _metadata_df is not None:
        return _metadata_df
    
    try:
        import polars as pl
        
        if not META_FILE.exists():
            logger.error(f"Metadata file not found: {META_FILE}")
            return None
        
        logger.info(f"Loading metadata from {META_FILE}...")
        # Use lazy scan with row index for efficient querying
        _metadata_df = pl.scan_parquet(str(META_FILE)).with_row_index("row_id")
        logger.info("Metadata loaded (lazy)")
        return _metadata_df
    
    except ImportError:
        logger.error("polars package not installed. Run: pip install polars")
        return None
    except Exception as e:
        logger.error(f"Error loading metadata: {e}")
        return None


def _normalize_symbol(symbol: str) -> str:
    """
    Normalize ticker symbol for consistency.
    - Uppercase and strip spaces
    - Add .VN suffix for Vietnamese stocks if not present
    """
    symbol = symbol.strip().upper()
    
    # Vietnamese stock tickers
    vn_tickers = ['VCB', 'VNM', 'VIC', 'VHM', 'HPG', 'MSN', 'VRE', 'SAB', 
                  'GAS', 'TCB', 'MBB', 'ACB', 'BID', 'CTG', 'STB', 'VPB',
                  'FPT', 'MWG', 'PNJ', 'REE', 'DGC', 'GVR', 'PLX', 'POW']
    
    # If it's a known VN ticker without suffix, add .VN
    base_symbol = symbol.split('.')[0]
    if base_symbol in vn_tickers and '.' not in symbol:
        symbol = f"{symbol}.VN"
    
    return symbol


def _fetch_candle_data(
    symbol: str,
    timeframe: str = "1d",
    limit: int = 30
) -> Dict[str, Any]:
    """
    Fetch candle data from the price API.
    
    Args:
        symbol: Stock symbol (e.g., 'VCB.VN', 'AAPL')
        timeframe: Candle timeframe ('1d', '1h', etc.)
        limit: Number of candles to fetch
        
    Returns:
        API response containing candle data
    """
    url = f"{API_BASE_URL}/api/v1/price/candles"
    params = {
        "symbol": symbol,
        "timeframe": timeframe,
        "limit": limit
    }
    
    try:
        response = requests.get(url, params=params, timeout=API_TIMEOUT)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        logger.error(f"Timeout fetching candle data for {symbol}")
        return {"error": f"Request timeout for {symbol}"}
    except requests.exceptions.ConnectionError:
        logger.error(f"Connection error fetching candle data for {symbol}")
        return {"error": f"Cannot connect to price API at {API_BASE_URL}"}
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error fetching candle data for {symbol}: {e}")
        return {"error": f"HTTP error: {e.response.status_code} - {e.response.text}"}
    except Exception as e:
        logger.error(f"Error fetching candle data for {symbol}: {e}")
        return {"error": str(e)}


def _extract_closes_from_candles(candles: List[Dict]) -> List[float]:
    """Extract close prices from candle data."""
    closes = []
    for candle in candles:
        close = candle.get("close") or candle.get("c")
        if close is not None:
            closes.append(float(close))
    return closes


def _z_score_normalize(prices: np.ndarray) -> np.ndarray:
    """
    Z-Score normalize prices for pattern comparison.
    This allows comparing relative shapes regardless of absolute price levels.
    """
    mean = np.mean(prices)
    std = np.std(prices)
    return (prices - mean) / (std + 1e-6)


def _search_similar_patterns(
    query_vector: np.ndarray,
    top_k: int = TOP_K
) -> Dict[str, Any]:
    """
    Search for similar patterns in FAISS index.
    
    Args:
        query_vector: Normalized price vector (shape: 1 x WINDOW_SIZE)
        top_k: Number of similar patterns to return
        
    Returns:
        Dict with search results or error
    """
    import polars as pl
    
    index = _load_index()
    metadata_lf = _load_metadata()
    
    if index is None:
        return {"error": "Failed to load FAISS index"}
    if metadata_lf is None:
        return {"error": "Failed to load metadata"}
    
    # Ensure correct shape and type for FAISS
    query_vector = query_vector.reshape(1, -1).astype('float32')
    
    # Search in FAISS index
    # D = distances (L2), I = indices
    distances, indices = index.search(query_vector, top_k)
    
    found_ids = indices[0].tolist()
    found_distances = distances[0].tolist()
    
    # Retrieve metadata for found patterns
    df_results = metadata_lf.filter(
        pl.col("row_id").is_in(found_ids)
    ).collect()
    
    # Sort results by search order (smallest distance first)
    order_map = {id_: i for i, id_ in enumerate(found_ids)}
    results_list = df_results.to_dicts()
    results_list.sort(key=lambda x: order_map.get(x['row_id'], 999))
    
    # Enrich results with distance and reconstructed pattern
    enriched_results = []
    for i, res in enumerate(results_list):
        row_id = res['row_id']
        
        # Reconstruct the matched pattern vector from index
        matched_vector = index.reconstruct(row_id).tolist()
        
        # Calculate similarity score (convert L2 distance to similarity)
        # L2 distance of 0 = perfect match, higher = less similar
        # Similarity = 1 / (1 + distance) gives 0-1 range
        distance = found_distances[i] if i < len(found_distances) else 0
        similarity_score = 1 / (1 + distance)
        
        future_return = res['future_return'] * 100  # Convert to percentage
        
        enriched_results.append({
            "rank": i + 1,
            "symbol": res['symbol'],
            "date": str(res['date'])[:10] if res['date'] else None,
            "distance": round(distance, 4),
            "similarity_score": round(similarity_score, 4),
            "future_return_percent": round(future_return, 2),
            "direction": "UP" if future_return > 0 else "DOWN",
            "pattern_vector": matched_vector,  # The normalized pattern shape
        })
    
    return {
        "matches": enriched_results,
        "total_patterns_in_index": index.ntotal,
    }


def _calculate_prediction_stats(matches: List[Dict]) -> Dict[str, Any]:
    """
    Calculate prediction statistics from matched patterns.
    
    Args:
        matches: List of matched pattern results
        
    Returns:
        Dict with prediction statistics
    """
    if not matches:
        return {
            "win_rate_percent": None,
            "avg_return_percent": None,
            "median_return_percent": None,
            "max_return_percent": None,
            "min_return_percent": None,
            "up_count": 0,
            "down_count": 0,
            "total_matches": 0,
            "prediction": "INSUFFICIENT_DATA",
            "confidence": "LOW",
        }
    
    returns = [m['future_return_percent'] for m in matches]
    up_count = sum(1 for r in returns if r > 0)
    down_count = len(returns) - up_count
    
    win_rate = (up_count / len(returns)) * 100
    avg_return = sum(returns) / len(returns)
    median_return = sorted(returns)[len(returns) // 2]
    
    # Determine prediction and confidence
    if win_rate >= 70:
        prediction = "BULLISH"
        confidence = "HIGH" if win_rate >= 80 else "MEDIUM"
    elif win_rate <= 30:
        prediction = "BEARISH"
        confidence = "HIGH" if win_rate <= 20 else "MEDIUM"
    else:
        prediction = "NEUTRAL"
        confidence = "LOW"
    
    # Weight by similarity score for weighted prediction
    weighted_returns = [
        m['future_return_percent'] * m['similarity_score'] 
        for m in matches
    ]
    total_weight = sum(m['similarity_score'] for m in matches)
    weighted_avg_return = sum(weighted_returns) / total_weight if total_weight > 0 else 0
    
    return {
        "win_rate_percent": round(win_rate, 1),
        "avg_return_percent": round(avg_return, 2),
        "weighted_avg_return_percent": round(weighted_avg_return, 2),
        "median_return_percent": round(median_return, 2),
        "max_return_percent": round(max(returns), 2),
        "min_return_percent": round(min(returns), 2),
        "up_count": up_count,
        "down_count": down_count,
        "total_matches": len(returns),
        "prediction": prediction,
        "confidence": confidence,
        "prediction_horizon_days": PREDICT_HORIZON,
    }


def _build_result(
    symbol: str,
    query_pattern: Optional[Dict[str, Any]] = None,
    similar_patterns: Optional[List[Dict]] = None,
    prediction: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> Dict[str, Any]:
    """Build standardized result dictionary."""
    return {
        "symbol": symbol,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "query_pattern": query_pattern,
        "similar_patterns": similar_patterns,
        "prediction": prediction,
        "error": error,
    }


def get_pattern_match_predictor(
    symbol: str = None,
    ticker: str = None,
    stock_symbol: str = None,
    timeframe: str = "1d",
    top_k: int = TOP_K,
) -> Dict[str, Any]:
    """
    Finds historical price patterns across multiple assets and calculates 
    the probabilistic outcome (up/down and average return) for the next N days 
    based on pattern similarity.
    
    This tool:
    1. Fetches recent price data (30 days) for the given symbol
    2. Z-Score normalizes the data for shape comparison
    3. Searches millions of historical patterns using FAISS
    4. Returns similar patterns with their historical outcomes
    5. Calculates win rate and expected return based on historical patterns
    
    Args:
        symbol: Stock/crypto/forex symbol (e.g., 'VCB', 'AAPL', 'BTCUSDC')
        ticker: Alternative parameter name for symbol
        stock_symbol: Alternative parameter name for symbol  
        timeframe: Candle timeframe - '1d' for daily (default)
        top_k: Number of similar patterns to find (default: 9)
        
    Returns:
        Dict containing:
        - symbol: The queried symbol
        - timestamp: UTC timestamp of the request
        - query_pattern: Info about the current pattern being analyzed
        - similar_patterns: List of similar historical patterns found
        - prediction: Statistical prediction based on historical outcomes
        - error: Error message if any
        
    Example:
        >>> result = get_pattern_match_predictor("VCB")
        >>> print(f"Win Rate: {result['prediction']['win_rate_percent']}%")
        >>> print(f"Prediction: {result['prediction']['prediction']}")
    """
    # Handle alternative parameter names
    actual_symbol = symbol or ticker or stock_symbol
    
    # Validate input
    if not actual_symbol:
        return _build_result(
            symbol="",
            error="No symbol provided. Please provide a stock symbol (e.g., 'VCB', 'AAPL', 'BTCUSDC')"
        )
    
    actual_symbol = actual_symbol.strip()
    if not actual_symbol:
        return _build_result(
            symbol="",
            error="Empty symbol provided"
        )
    
    # Normalize symbol
    normalized_symbol = _normalize_symbol(actual_symbol)
    logger.info(f"Pattern matching for {normalized_symbol} (original: {actual_symbol})")
    
    # Step 1: Fetch candle data from API
    logger.info(f"Fetching {WINDOW_SIZE} days of candle data...")
    candle_response = _fetch_candle_data(
        symbol=normalized_symbol,
        timeframe=timeframe,
        limit=WINDOW_SIZE
    )
    
    # Check for errors in API response
    if "error" in candle_response:
        return _build_result(
            symbol=normalized_symbol,
            error=f"Failed to fetch price data: {candle_response['error']}"
        )
    
    # Extract candle data
    candles = candle_response.get("data", candle_response.get("candles", []))
    
    if not candles:
        return _build_result(
            symbol=normalized_symbol,
            error="No candle data returned from API"
        )
    
    # Step 2: Extract close prices
    closes = _extract_closes_from_candles(candles)
    
    if len(closes) < WINDOW_SIZE:
        return _build_result(
            symbol=normalized_symbol,
            error=f"Insufficient data: got {len(closes)} candles, need {WINDOW_SIZE}"
        )
    
    # Take last WINDOW_SIZE closes
    closes = closes[-WINDOW_SIZE:]
    query_prices = np.array(closes)
    
    # Calculate query pattern statistics
    latest_price = closes[-1]
    price_change = ((closes[-1] - closes[0]) / closes[0] * 100) if closes[0] else 0
    
    query_pattern_info = {
        "window_size": WINDOW_SIZE,
        "latest_price": latest_price,
        "price_change_percent": round(price_change, 2),
        "price_range": {
            "min": min(closes),
            "max": max(closes),
            "avg": round(sum(closes) / len(closes), 2),
        },
        "closes": closes,  # Raw prices for reference
    }
    
    # Step 3: Z-Score normalize for pattern comparison
    logger.info("Normalizing pattern...")
    query_normalized = _z_score_normalize(query_prices)
    query_pattern_info["normalized_pattern"] = query_normalized.tolist()
    
    # Step 4: Search similar patterns in FAISS index
    logger.info(f"Searching for {top_k} similar patterns...")
    search_result = _search_similar_patterns(query_normalized, top_k=top_k)
    
    if "error" in search_result:
        return _build_result(
            symbol=normalized_symbol,
            query_pattern=query_pattern_info,
            error=search_result["error"]
        )
    
    matches = search_result.get("matches", [])
    
    if not matches:
        return _build_result(
            symbol=normalized_symbol,
            query_pattern=query_pattern_info,
            error="No similar patterns found in historical data"
        )
    
    # Step 5: Calculate prediction statistics
    logger.info("Calculating prediction statistics...")
    prediction_stats = _calculate_prediction_stats(matches)
    prediction_stats["total_patterns_searched"] = search_result.get("total_patterns_in_index", 0)
    
    # Build final result
    return _build_result(
        symbol=normalized_symbol,
        query_pattern=query_pattern_info,
        similar_patterns=matches,
        prediction=prediction_stats,
    )


# Alias for convenience
getPatternMatchPredictor = get_pattern_match_predictor
