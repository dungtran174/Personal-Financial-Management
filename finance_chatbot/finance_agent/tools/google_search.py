import os
import requests
import logging

logger = logging.getLogger(__name__)

# 
# SERPAPI_KEY = os.environ.get("SERPAPI_KEY")
SERPAPI_KEY="d836f2f5a4eb9745402cc34aec553a84052c8c4112710812a61d39727ef584af"
SERPAPI_URL = "https://serpapi.com/search.json"

def google_search(query: str):
    if not query:
        return {"query": query, "results": []}

    if SERPAPI_KEY:
        try:
            params = {
                "q": query,
                "engine": "google",
                "api_key": SERPAPI_KEY
            }
            resp = requests.get(SERPAPI_URL, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            results = []
            for item in data.get("organic_results", []):
                results.append({
                    "title": item.get("title"),
                    "snippet": item.get("snippet"),
                    "link": item.get("link")
                })
            return {"query": query, "results": results}
        except Exception as e:
            logger.error("SerpAPI error: %s", e)
            return {"query": query, "results": [], "error": str(e)}

    # fallback nếu không có key
    return {
        "query": query,
        "results": [{"title": f"Mock result for {query}", "snippet": "This is a mock snippet."}]
    }
