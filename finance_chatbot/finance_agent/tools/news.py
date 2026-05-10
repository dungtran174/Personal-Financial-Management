# finance_agent/tools/news.py
from typing import Dict, Any, Optional, List
import requests, os, logging

from .backend_api import get_market_news as backend_get_news, BackendAPIError

logger = logging.getLogger(__name__)

# SERPAPI_KEY = os.environ.get("SERPAPI_KEY")
SERPAPI_KEY="d836f2f5a4eb9745402cc34aec553a84052c8c4112710812a61d39727ef584af"


def _serpapi_fallback(query: str) -> Dict[str, Any]:
    """
    Fallback to SerpAPI for news search.
    
    Args:
        query: Search query string
    
    Returns:
        Dict with query and results list
    """
    url = "https://serpapi.com/search.json"
    params = {
        "engine": "google_news",
        "q": f"{query}",
        "api_key": SERPAPI_KEY,
        "hl": "en",
        "gl": "us"
    }

    try:
        logger.info(f"Fetching news from SerpAPI fallback: {query}")
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        news = []
        for item in data.get("news_results", []):
            news.append({
                "title": item.get("title"),
                "link": item.get("link"),
                "date": item.get("date"),
                "snippet": item.get("snippet"),
                "source": "serpapi-fallback"
            })
        
        logger.info(f"✅ SerpAPI returned {len(news)} news articles")
        return {"query": query, "results": news, "source": "serpapi-fallback"}
        
    except Exception as e:
        logger.error("SerpAPI fallback failed: %s", e)
        return {"query": query, "results": [], "error": str(e), "source": "serpapi-error"}


def search_news(query: Optional[str] = None, ticker: Optional[str] = None, limit: int = 10) -> Dict[str, Any]:
    """
    Search financial news by query or ticker.
    
    Primary source: Backend API (RSS feed from backend)
    Fallback: SerpAPI Google News
    
    Args:
        query: Search query string
        ticker: Stock ticker to search news for
        limit: Maximum number of articles to return
    
    Returns:
        Dict with query and results list containing news articles
    """
    if not query and ticker:
        query = f"{ticker} stock news"

    if not query:
        return {"error": "query or ticker required", "results": [], "source": "invalid"}

    # ============================================================
    # PRIMARY: Try backend API first (RSS feed)
    # ============================================================
    try:
        logger.info(f"Attempting to fetch news from backend API")
        news_response = backend_get_news(limit=limit * 2)  # Fetch more for filtering
        
        # Backend returns: {status, data: [...], total, lastUpdated}
        if isinstance(news_response, dict) and 'data' in news_response:
            news_articles = news_response['data']
        elif isinstance(news_response, list):
            news_articles = news_response
        else:
            logger.warning(f"Unexpected backend news response format: {type(news_response)}")
            raise BackendAPIError("Unexpected response format")
        
        if news_articles:
            # Filter by query/ticker if provided
            filtered_news = []
            query_lower = query.lower()
            
            for article in news_articles:
                title = article.get("title", "").lower()
                description = article.get("description", "").lower()
                
                # Check if query terms appear in title or description
                if query_lower in title or query_lower in description:
                    filtered_news.append({
                        "title": article.get("title"),
                        "link": article.get("link"),
                        "date": article.get("published") or article.get("pubDate"),
                        "snippet": article.get("description"),
                        "source": "backend-api-rss"
                    })
                    
                    if len(filtered_news) >= limit:
                        break
            
            # If no matches found with filtering, return recent news anyway
            if not filtered_news:
                logger.warning(f"No news matched query '{query}', returning recent news")
                filtered_news = [
                    {
                        "title": article.get("title"),
                        "link": article.get("link"),
                        "date": article.get("published") or article.get("pubDate"),
                        "snippet": article.get("description"),
                        "source": "backend-api-rss-unfiltered"
                    }
                    for article in news_articles[:limit]
                ]
            
            logger.info(f"✅ Backend API returned {len(filtered_news)} news articles")
            return {
                "query": query,
                "results": filtered_news,
                "source": "backend-api",
                "total_fetched": len(news_articles)
            }
        else:
            logger.warning("Backend returned empty news list")
            
    except BackendAPIError as e:
        logger.warning(f"Backend API failed for news: {e}. Falling back to SerpAPI...")
    except Exception as e:
        logger.error(f"Unexpected error with backend news API: {e}")
    
    # ============================================================
    # FALLBACK: Use SerpAPI
    # ============================================================
    logger.info(f"Using SerpAPI fallback for news search: {query}")
    return _serpapi_fallback(query)

