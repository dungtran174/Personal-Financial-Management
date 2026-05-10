"""
Fetch cryptocurrency prices.
Primary source: Backend API (Binance stream)
Fallback: CoinGecko API
"""

import logging
from typing import Dict, Any, Optional
import datetime

from .backend_api import get_ticker_detail, BackendAPIError

logger = logging.getLogger(__name__)

# Try to import CoinGecko for fallback
USE_COINGECKO = False
try:
    import requests
    USE_COINGECKO = True
except ImportError:
    logger.warning("requests not available - CoinGecko fallback disabled")


def _normalize_crypto_symbol(symbol: str) -> str:
    """
    Normalize crypto symbol for backend API.
    Examples: BTC -> BTCUSDT, ETH -> ETHUSDT, bitcoin -> BTCUSDT
    """
    symbol = symbol.strip().upper()
    
    # Common name to symbol mapping
    name_to_symbol = {
        "BITCOIN": "BTC",
        "ETHEREUM": "ETH",
        "BINANCE COIN": "BNB",
        "CARDANO": "ADA",
        "RIPPLE": "XRP",
        "SOLANA": "SOL",
        "POLKADOT": "DOT",
        "DOGECOIN": "DOGE",
        "SHIBA INU": "SHIB",
    }
    
    if symbol in name_to_symbol:
        symbol = name_to_symbol[symbol]
    
    # If doesn't end with USDT, add it
    if not symbol.endswith("USDT"):
        symbol = symbol + "USDT"
    
    return symbol


def _coingecko_fallback(crypto_id: str, vs_currency: str = "usd") -> Dict[str, Any]:
    """
    Fallback to CoinGecko API for crypto prices.
    
    Args:
        crypto_id: CoinGecko crypto ID (e.g., 'bitcoin', 'ethereum')
        vs_currency: Currency to price in (default: 'usd')
    """
    if not USE_COINGECKO:
        return {
            "crypto_id": crypto_id,
            "price": None,
            "currency": vs_currency.upper(),
            "source": "unavailable",
            "error": "CoinGecko fallback not available (requests not installed)"
        }
    
    try:
        url = f"https://api.coingecko.com/api/v3/simple/price"
        params = {
            "ids": crypto_id.lower(),
            "vs_currencies": vs_currency.lower(),
            "include_24hr_change": "true",
            "include_market_cap": "true"
        }
        
        logger.info(f"Fetching from CoinGecko: {crypto_id}")
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if crypto_id.lower() not in data:
            return {
                "crypto_id": crypto_id,
                "price": None,
                "currency": vs_currency.upper(),
                "source": "coingecko",
                "error": f"Crypto ID '{crypto_id}' not found"
            }
        
        crypto_data = data[crypto_id.lower()]
        price = crypto_data.get(vs_currency.lower())
        change_24h = crypto_data.get(f"{vs_currency.lower()}_24h_change")
        market_cap = crypto_data.get(f"{vs_currency.lower()}_market_cap")
        
        return {
            "crypto_id": crypto_id,
            "symbol": crypto_id.upper(),
            "price": price,
            "currency": vs_currency.upper(),
            "change_24h": change_24h,
            "market_cap": market_cap,
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "source": "coingecko-fallback"
        }
        
    except requests.exceptions.RequestException as e:
        logger.error(f"CoinGecko API error: {e}")
        return {
            "crypto_id": crypto_id,
            "price": None,
            "currency": vs_currency.upper(),
            "source": "coingecko",
            "error": f"CoinGecko API error: {str(e)}"
        }
    except Exception as e:
        logger.error(f"CoinGecko fallback unexpected error: {e}")
        return {
            "crypto_id": crypto_id,
            "price": None,
            "currency": vs_currency.upper(),
            "source": "coingecko",
            "error": f"Unexpected error: {str(e)}"
        }


def fetch_crypto_price(
    crypto: str = None,
    crypto_id: str = None,
    symbol: str = None,
    vs_currency: str = "usd"
) -> Dict[str, Any]:
    """
    Fetch cryptocurrency price.
    
    Primary source: Backend API (realtime Binance stream)
    Fallback: CoinGecko API
    
    Args:
        crypto: Crypto symbol (BTC, ETH, etc.) or name (bitcoin, ethereum)
        crypto_id: CoinGecko crypto ID (for fallback)
        symbol: Alternative param name for crypto symbol
        vs_currency: Currency to price in (default: 'usd')
    
    Returns:
        Dict with price, currency, source, and optional error
    """
    crypto_input = crypto or crypto_id or symbol
    
    if not crypto_input:
        return {
            "error": "crypto/crypto_id/symbol parameter required",
            "price": None,
            "currency": vs_currency.upper(),
            "source": "invalid"
        }
    
    # ============================================================
    # PRIMARY: Try backend API first (Binance stream)
    # ============================================================
    try:
        # Normalize to Binance format (e.g., BTCUSDT)
        backend_symbol = _normalize_crypto_symbol(crypto_input)
        
        logger.info(f"Attempting to fetch crypto price from backend API: {backend_symbol}")
        ticker_data = get_ticker_detail(backend_symbol)
        
        if ticker_data and "price" in ticker_data:
            price = float(ticker_data.get("price", 0))
            change_24h = ticker_data.get("change_24h") or ticker_data.get("priceChangePercent")
            volume_24h = ticker_data.get("volume_24h") or ticker_data.get("volume")
            
            logger.info(f"✅ Successfully fetched {backend_symbol} from backend: ${price}")
            return {
                "symbol": backend_symbol,
                "crypto_id": crypto_input.lower(),
                "price": price,
                "currency": "USDT",
                "change_24h": float(change_24h) if change_24h else None,
                "volume_24h": float(volume_24h) if volume_24h else None,
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "source": "backend-api-binance",
                "error": None
            }
        else:
            logger.warning(f"Backend returned data but missing price for {backend_symbol}")
            
    except BackendAPIError as e:
        logger.warning(f"Backend API failed for crypto {crypto_input}: {e}")
    except Exception as e:
        logger.error(f"Unexpected error with backend API for {crypto_input}: {e}")
    
    # ============================================================
    # FALLBACK: Use CoinGecko API
    # ============================================================
    logger.info(f"Using CoinGecko fallback for {crypto_input}")
    
    # Try to map symbol to CoinGecko ID
    symbol_to_id = {
        "BTC": "bitcoin",
        "BTCUSDT": "bitcoin",
        "ETH": "ethereum",
        "ETHUSDT": "ethereum",
        "BNB": "binancecoin",
        "BNBUSDT": "binancecoin",
        "ADA": "cardano",
        "ADAUSDT": "cardano",
        "XRP": "ripple",
        "XRPUSDT": "ripple",
        "SOL": "solana",
        "SOLUSDT": "solana",
        "DOT": "polkadot",
        "DOTUSDT": "polkadot",
        "DOGE": "dogecoin",
        "DOGEUSDT": "dogecoin",
        "SHIB": "shiba-inu",
        "SHIBUSDT": "shiba-inu",
    }
    
    coingecko_id = symbol_to_id.get(crypto_input.upper(), crypto_input.lower())
    return _coingecko_fallback(coingecko_id, vs_currency)
