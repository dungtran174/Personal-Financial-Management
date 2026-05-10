"""
Personal Financial Management (PFM) Tools.
Wraps backend APIs for Income, Expense, Dashboard, and Watchlist.
Requires user authentication token.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

from .backend_api import _make_request, BackendAPIError

logger = logging.getLogger(__name__)

# ==============================================================================
# DASHBOARD & REPORTING
# ==============================================================================

def pfm_get_financial_summary(token: str, user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get financial summary (income, expense, balance) for the current user.
    
    Args:
        token: JWT authentication token
        user_id: User ID (optional, mainly for logging/context)
        
    Returns:
        Dict with totalIncome, totalExpense, balance, recentTransactions
    """
    try:
        response = _make_request(
            endpoint="/api/v1/dashboard",
            token=token
        )
        return response.json()
    except BackendAPIError as e:
        logger.error(f"PFM Summary failed: {e}")
        return {"error": str(e)}


def pfm_get_report_by_time(
    token: str,
    start_date: str,
    end_date: str
) -> Dict[str, Any]:
    """
    Get financial report for a specific time range.
    
    Args:
        token: JWT authentication token
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
    """
    try:
        response = _make_request(
            endpoint="/api/v1/dashboard/search",
            params={"startDate": start_date, "endDate": end_date},
            token=token
        )
        return response.json()
    except BackendAPIError as e:
        logger.error(f"PFM Report failed: {e}")
        return {"error": str(e)}


# ==============================================================================
# EXPENSE MANAGEMENT
# ==============================================================================

def pfm_add_expense(
    token: str,
    amount: float,
    category: str = "General",
    title: Optional[str] = None,
    description: Optional[str] = "",
    date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Add a new expense transaction.
    
    Args:
        token: JWT authentication token
        amount: Amount (positive number)
        category: Category (e.g., "Food", "Transport"). Defaults to "General".
        title: Title of expense (e.g., "Lunch"). Optional, defaults to Category name.
        description: Optional details
        date: Date (YYYY-MM-DD), defaults to today if None
    """
    try:
        payload = {
            "title": title or category,
            "amount": amount,
            "category": category,
            "description": description,
            "date": date or datetime.now().strftime("%Y-%m-%d")
        }
        
        response = _make_request(
            endpoint="/api/v1/expense/add",
            method="POST",
            json_data=payload,
            token=token
        )
        return response.json()
    except BackendAPIError as e:
        logger.error(f"Add Expense failed: {e}")
        return {"error": str(e)}


def pfm_search_expenses(
    token: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Search expense history.
    """
    try:
        params = {}
        # Default to last 30 days if not provided
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
            
        params["startDate"] = start_date
        params["endDate"] = end_date
        if category: params["category"] = category
        
        response = _make_request(
            endpoint="/api/v1/expense/search",
            params=params,
            token=token
        )
        return response.json()
    except BackendAPIError as e:
        logger.error(f"Search Expense failed: {e}")
        return {"error": str(e)}


# ==============================================================================
# INCOME MANAGEMENT
# ==============================================================================

def pfm_add_income(
    token: str,
    amount: float,
    category: str = "Income",
    title: Optional[str] = None,
    description: Optional[str] = "",
    date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Add a new income transaction.
    
    Args:
        token: JWT authentication token
        amount: Amount (positive number)
        category: Category/Source (e.g., "Salary", "Bonus"). Defaults to "Income".
        title: Title/Source. Optional, defaults to Category.
        description: Optional details
        date: Date (YYYY-MM-DD), defaults to today if None
    """
    try:
        # Backend expects 'source' instead of 'title'
        payload = {
            "source": title or category,
            "amount": amount,
            "date": date or datetime.now().strftime("%Y-%m-%d")
        }
        
        response = _make_request(
            endpoint="/api/v1/income/add",
            method="POST",
            json_data=payload,
            token=token
        )
        return response.json()
    except BackendAPIError as e:
        logger.error(f"Add Income failed: {e}")
        return {"error": str(e)}


def pfm_search_incomes(
    token: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Search income history.
    """
    try:
        params = {}
        # Default to last 30 days if not provided
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")

        params["startDate"] = start_date
        params["endDate"] = end_date
        if category: params["category"] = category
        
        response = _make_request(
            endpoint="/api/v1/income/search",
            params=params,
            token=token
        )
        return response.json()
    except BackendAPIError as e:
        logger.error(f"Search Income failed: {e}")
        return {"error": str(e)}


# ==============================================================================
# WATCHLIST MANAGEMENT
# ==============================================================================

def pfm_get_watchlist(token: str) -> List[Dict[str, Any]]:
    """
    Get user's watchlist.
    """
    try:
        response = _make_request(
            endpoint="/api/v1/watchlist",
            token=token
        )
        return response.json()
    except BackendAPIError as e:
        logger.error(f"Get Watchlist failed: {e}")
        return {"error": str(e)}


def pfm_add_to_watchlist(token: str, symbol: str, asset_type: str = "stock") -> Dict[str, Any]:
    """
    Add symbol to watchlist.
    """
    try:
        response = _make_request(
            endpoint="/api/v1/watchlist/add",
            method="POST",
            json_data={"symbol": symbol, "type": asset_type},
            token=token
        )
        return response.json()
    except BackendAPIError as e:
        logger.error(f"Add to Watchlist failed: {e}")
        return {"error": str(e)}


def pfm_remove_from_watchlist(token: str, symbol: str) -> Dict[str, Any]:
    """
    Remove symbol from watchlist.
    """
    try:
        response = _make_request(
            endpoint=f"/api/v1/watchlist/remove/{symbol}",
            method="DELETE",
            token=token
        )
        return response.json()
    except BackendAPIError as e:
        logger.error(f"Remove from Watchlist failed: {e}")
        return {"error": str(e)}
