# finance_agent/tools/portfolio_simulator.py
from typing import Dict, Any
import json
import datetime

def simulate_portfolio(actions_json: str) -> Dict[str, Any]:
    """
    actions_json: JSON string describing buys/sells, e.g. [{"ticker":"AAPL","action":"buy","qty":10,"price":150}]
    Returns simple P&L summary.
    """
    if not actions_json:
        return {"error": "actions_json required"}
    try:
        actions = json.loads(actions_json)
    except Exception as e:
        return {"error": "invalid json", "details": str(e)}
    # Very simple simulation: calculate net cash flow and pretend constant price change
    total_cost = 0.0
    for a in actions:
        if a.get("action") == "buy":
            total_cost += a.get("qty", 0) * a.get("price", 0)
        elif a.get("action") == "sell":
            total_cost -= a.get("qty", 0) * a.get("price", 0)
    # mock return
    return {"summary": {"net_cost": total_cost, "estimated_return_pct": 0.05}, "timestamp": datetime.datetime.utcnow().isoformat()}
