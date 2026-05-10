# finance_agent/tools/macro_data.py
"""
Tool: get_macro_data
Mô tả: Lấy chỉ số kinh tế vĩ mô (GDP, CPI, lãi suất, thất nghiệp...)
Data source: FRED API (Federal Reserve Economic Data) + fallback to static data

Setup:
1. Get FRED API key from https://fred.stlouisfed.org/docs/api/api_key.html
2. Set environment variable: FRED_API_KEY=your_key_here
3. Or add to .env file
"""

from typing import Dict, Any, Optional
from datetime import datetime
import yfinance as yf
import os

# Try to import fredapi
try:
    from fredapi import Fred
    FRED_AVAILABLE = True
except ImportError:
    FRED_AVAILABLE = False

# Get FRED API key from environment
FRED_API_KEY = os.getenv("FRED_API_KEY")
FRED_API_KEY="0c8110fd0d8ff8d664a89576ce736e8e"

# Initialize FRED client if key is available
fred_client = None
if FRED_AVAILABLE and FRED_API_KEY:
    try:
        fred_client = Fred(api_key=FRED_API_KEY)
    except Exception as e:
        print(f"Warning: Could not initialize FRED client: {e}")

# FRED series IDs mapping
FRED_SERIES = {
    "US": {
        "gdp": "GDP",                    # Gross Domestic Product
        "gdp_growth": "A191RL1Q225SBEA", # Real GDP Growth Rate
        "inflation_cpi": "CPIAUCSL",     # Consumer Price Index
        "unemployment": "UNRATE",        # Unemployment Rate
        "interest_rate": "FEDFUNDS",     # Federal Funds Effective Rate
        "gdp_per_capita": "A939RX0Q048SBEA",  # Real GDP per Capita
        "ppi": "PPIACO",                 # Producer Price Index
        "retail_sales": "RSXFS",         # Retail Sales
        "industrial_production": "INDPRO" # Industrial Production Index
    }
}

# Static macro data (fallback when API not available)
STATIC_MACRO_DATA = {
    "US": {
        "country": "United States",
        "gdp_growth": 2.5,  # % annual
        "inflation_cpi": 3.2,  # % annual
        "unemployment": 3.7,  # %
        "interest_rate": 5.25,  # Federal Funds Rate %
        "last_updated": "2024-Q4"
    },
    "VN": {
        "country": "Vietnam",
        "gdp_growth": 6.5,  # % annual
        "inflation_cpi": 3.8,  # % annual
        "unemployment": 2.3,  # %
        "interest_rate": 4.5,  # Policy rate %
        "last_updated": "2024-Q4"
    },
    "CN": {
        "country": "China",
        "gdp_growth": 5.0,
        "inflation_cpi": 0.5,
        "unemployment": 5.1,
        "interest_rate": 3.45,
        "last_updated": "2024-Q4"
    },
    "JP": {
        "country": "Japan",
        "gdp_growth": 1.2,
        "inflation_cpi": 2.8,
        "unemployment": 2.5,
        "interest_rate": -0.1,
        "last_updated": "2024-Q4"
    },
    "EU": {
        "country": "European Union",
        "gdp_growth": 0.8,
        "inflation_cpi": 2.9,
        "unemployment": 6.5,
        "interest_rate": 4.0,
        "last_updated": "2024-Q4"
    }
}


def _get_fred_data(series_id: str, periods: int = 1) -> Optional[float]:
    """
    Helper function to get data from FRED API.
    
    Args:
        series_id: FRED series ID
        periods: Number of latest periods to retrieve
    
    Returns:
        Latest value or None if error
    """
    if not fred_client:
        return None
    
    try:
        series = fred_client.get_series(series_id)
        if series is not None and not series.empty:
            return float(series.iloc[-1])
    except Exception as e:
        print(f"FRED API error for {series_id}: {e}")
    
    return None


def _calculate_growth_rate(series_id: str) -> Optional[float]:
    """
    Calculate year-over-year growth rate from FRED series.
    
    Args:
        series_id: FRED series ID
    
    Returns:
        Growth rate % or None
    """
    if not fred_client:
        return None
    
    try:
        series = fred_client.get_series(series_id)
        if series is not None and len(series) >= 2:
            current = float(series.iloc[-1])
            year_ago = float(series.iloc[-5]) if len(series) >= 5 else float(series.iloc[-2])
            if year_ago != 0:
                growth = ((current - year_ago) / abs(year_ago)) * 100
                return round(growth, 2)
    except Exception as e:
        print(f"Growth calculation error for {series_id}: {e}")
    
    return None


def get_macro_data(country: str = "US", country_code: Optional[str] = None, indicator: Optional[str] = None) -> Dict[str, Any]:
    """
    Lấy dữ liệu kinh tế vĩ mô từ FRED API.
    
    Args:
        country: Mã quốc gia hoặc tên quốc gia (US, VN, CN, JP, EU, Vietnam, United States...)
        country_code: (Deprecated) Alias for country parameter
        indicator: Chỉ số cụ thể (gdp, gdp_growth, inflation, inflation_cpi, cpi, unemployment, interest_rate)
                  Nếu None, trả về tất cả chỉ số
    
    Returns:
        Dict chứa macro economic data
    
    Examples:
        >>> get_macro_data("US")  # All US indicators from FRED
        >>> get_macro_data("US", indicator="inflation_cpi")  # Just CPI
        >>> get_macro_data("VN")  # Vietnam data (static fallback)
        >>> get_macro_data(country="Vietnam", indicator="inflation")
    """
    try:
        # Use country_code if provided, otherwise use country
        code = country_code if country_code else country
        
        # Map full country names to codes
        country_name_map = {
            "vietnam": "VN",
            "việt nam": "VN",
            "united states": "US",
            "usa": "US",
            "china": "CN",
            "japan": "JP",
            "european union": "EU",
            "europe": "EU"
        }
        
        code_lower = code.lower().strip()
        if code_lower in country_name_map:
            code = country_name_map[code_lower]
        
        country_code = code.upper()
        
        # Map indicator aliases
        if indicator:
            indicator_map = {
                "inflation": "inflation_cpi",
                "cpi": "inflation_cpi",
                "lạm phát": "inflation_cpi",
                "gdp growth": "gdp_growth",
                "unemployment rate": "unemployment",
                "thất nghiệp": "unemployment",
                "lãi suất": "interest_rate",
                "interest": "interest_rate"
            }
            indicator_lower = indicator.lower().strip()
            if indicator_lower in indicator_map:
                indicator = indicator_map[indicator_lower]
        
        # Check if country is supported
        if country_code not in STATIC_MACRO_DATA:
            return {
                "status": "error",
                "error": f"Country code '{country_code}' not found",
                "available_countries": list(STATIC_MACRO_DATA.keys()),
                "timestamp": datetime.now().isoformat()
            }
        
        # For US, try to get real-time data from FRED
        if country_code == "US" and fred_client:
            try:
                data = {
                    "country": "United States"
                }
                
                # Fetch from FRED
                fred_data = {}
                for indicator_name, series_id in FRED_SERIES["US"].items():
                    value = _get_fred_data(series_id)
                    if value is not None:
                        fred_data[indicator_name] = value
                
                # Calculate specific metrics
                if "CPIAUCSL" in str(FRED_SERIES["US"].get("inflation_cpi")):
                    cpi_growth = _calculate_growth_rate("CPIAUCSL")
                    if cpi_growth is not None:
                        data["inflation_cpi"] = round(cpi_growth, 2)
                
                if "UNRATE" in str(FRED_SERIES["US"].get("unemployment")):
                    unemployment = _get_fred_data("UNRATE")
                    if unemployment is not None:
                        data["unemployment"] = round(unemployment, 2)
                
                if "FEDFUNDS" in str(FRED_SERIES["US"].get("interest_rate")):
                    fed_rate = _get_fred_data("FEDFUNDS")
                    if fed_rate is not None:
                        data["interest_rate"] = round(fed_rate, 2)
                
                if "A191RL1Q225SBEA" in str(FRED_SERIES["US"].get("gdp_growth")):
                    gdp_growth = _get_fred_data("A191RL1Q225SBEA")
                    if gdp_growth is not None:
                        data["gdp_growth"] = round(gdp_growth, 2)
                
                # Add additional indicators
                if "GDP" in str(FRED_SERIES["US"].get("gdp")):
                    gdp = _get_fred_data("GDP")
                    if gdp is not None:
                        data["gdp"] = round(gdp, 2)  # In billions
                
                data["last_updated"] = datetime.now().strftime("%Y-%m-%d")
                
                # If specific indicator requested
                if indicator:
                    indicator = indicator.lower()
                    if indicator in data:
                        return {
                            "status": "success",
                            "country_code": country_code,
                            "country": data["country"],
                            "indicator": indicator,
                            "value": data[indicator],
                            "last_updated": data["last_updated"],
                            "source": "FRED API",
                            "timestamp": datetime.now().isoformat()
                        }
                    else:
                        # Try static fallback
                        static_data = STATIC_MACRO_DATA[country_code]
                        if indicator in static_data:
                            return {
                                "status": "success",
                                "country_code": country_code,
                                "country": static_data["country"],
                                "indicator": indicator,
                                "value": static_data[indicator],
                                "last_updated": static_data["last_updated"],
                                "source": "static_fallback",
                                "warning": "Indicator not available from FRED, using static data",
                                "timestamp": datetime.now().isoformat()
                            }
                        else:
                            return {
                                "status": "error",
                                "error": f"Indicator '{indicator}' not found",
                                "available_indicators": list(data.keys()),
                                "timestamp": datetime.now().isoformat()
                            }
                
                # Return all indicators
                return {
                    "status": "success",
                    "country_code": country_code,
                    "data": data,
                    "source": "FRED API",
                    "api_key_configured": True,
                    "timestamp": datetime.now().isoformat()
                }
                
            except Exception as fred_error:
                print(f"FRED API error: {fred_error}")
                # Fall through to static data
        
        # For non-US countries or if FRED fails, use static data
        data = STATIC_MACRO_DATA[country_code].copy()
        
        # If specific indicator requested
        if indicator:
            indicator = indicator.lower()
            if indicator in data:
                return {
                    "status": "success",
                    "country_code": country_code,
                    "country": data["country"],
                    "indicator": indicator,
                    "value": data[indicator],
                    "last_updated": data["last_updated"],
                    "source": "static_data",
                    "note": "Using static data. For US real-time data, configure FRED_API_KEY",
                    "timestamp": datetime.now().isoformat()
                }
            else:
                return {
                    "status": "error",
                    "error": f"Indicator '{indicator}' not found",
                    "available_indicators": [k for k in data.keys() if k not in ["country", "last_updated"]],
                    "timestamp": datetime.now().isoformat()
                }
        
        # Return all indicators
        return {
            "status": "success",
            "country_code": country_code,
            "data": data,
            "source": "static_data",
            "note": "Using static data. For US real-time data, configure FRED_API_KEY" if country_code == "US" else "Non-US data uses static values",
            "api_key_configured": fred_client is not None,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def get_us_treasury_yields() -> Dict[str, Any]:
    """
    Lấy lãi suất trái phiếu kho bạc Mỹ (Treasury Yields).
    Uses FRED API if available, falls back to yfinance.
    
    Returns:
        Dict chứa treasury yields data
    """
    try:
        yields = {}
        source = "unknown"
        
        # Try FRED first if available
        if fred_client:
            try:
                fred_treasury = {
                    "3M": "DGS3MO",   # 3-Month Treasury
                    "6M": "DGS6MO",   # 6-Month Treasury
                    "1Y": "DGS1",     # 1-Year Treasury
                    "2Y": "DGS2",     # 2-Year Treasury
                    "5Y": "DGS5",     # 5-Year Treasury
                    "10Y": "DGS10",   # 10-Year Treasury
                    "30Y": "DGS30"    # 30-Year Treasury
                }
                
                for name, series_id in fred_treasury.items():
                    value = _get_fred_data(series_id)
                    if value is not None:
                        yields[name] = round(value, 2)
                
                if yields:
                    source = "FRED API"
            except:
                pass
        
        # Fallback to yfinance if FRED didn't work
        if not yields:
            treasury_tickers = {
                "3M": "^IRX",   # 13 Week Treasury Bill
                "10Y": "^TNX",  # 10 Year Treasury Note
                "30Y": "^TYX"   # 30 Year Treasury Bond
            }
            
            for name, ticker in treasury_tickers.items():
                try:
                    t = yf.Ticker(ticker)
                    hist = t.history(period="1d")
                    if not hist.empty:
                        yields[name] = round(hist['Close'].iloc[-1], 2)
                except:
                    yields[name] = None
            
            source = "yfinance"
        
        return {
            "status": "success",
            "country": "United States",
            "treasury_yields": yields,
            "unit": "percent",
            "timestamp": datetime.now().isoformat(),
            "source": source
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def compare_macro_indicators(country_codes: list) -> Dict[str, Any]:
    """
    So sánh các chỉ số vĩ mô giữa các quốc gia.
    
    Args:
        country_codes: List mã quốc gia
    
    Returns:
        Dict chứa so sánh macro data
    """
    try:
        comparison = {}
        
        for code in country_codes:
            data = get_macro_data(code)
            if data["status"] == "success":
                comparison[code] = data["data"]
        
        if not comparison:
            return {
                "status": "error",
                "error": "No valid country data found",
                "timestamp": datetime.now().isoformat()
            }
        
        return {
            "status": "success",
            "comparison": comparison,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def get_fred_series_info(series_id: str) -> Dict[str, Any]:
    """
    Lấy thông tin chi tiết về một FRED series.
    
    Args:
        series_id: FRED series ID (e.g., "GDP", "UNRATE", "CPIAUCSL")
    
    Returns:
        Dict chứa series info và latest values
    """
    if not fred_client:
        return {
            "status": "error",
            "error": "FRED API key not configured",
            "note": "Set FRED_API_KEY environment variable",
            "timestamp": datetime.now().isoformat()
        }
    
    try:
        # Get series data
        series = fred_client.get_series(series_id)
        series_info = fred_client.get_series_info(series_id)
        
        if series is None or series.empty:
            return {
                "status": "error",
                "error": f"No data found for series {series_id}",
                "timestamp": datetime.now().isoformat()
            }
        
        # Get latest values
        latest_values = []
        for i in range(min(5, len(series))):
            idx = -(i+1)
            latest_values.append({
                "date": series.index[idx].strftime("%Y-%m-%d"),
                "value": float(series.iloc[idx])
            })
        
        return {
            "status": "success",
            "series_id": series_id,
            "title": series_info.get("title", ""),
            "units": series_info.get("units", ""),
            "frequency": series_info.get("frequency", ""),
            "latest_value": float(series.iloc[-1]),
            "latest_date": series.index[-1].strftime("%Y-%m-%d"),
            "latest_values": latest_values,
            "source": "FRED API",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


def list_available_indicators() -> Dict[str, Any]:
    """
    Liệt kê tất cả các indicators có sẵn.
    
    Returns:
        Dict chứa danh sách indicators
    """
    return {
        "status": "success",
        "fred_available": FRED_AVAILABLE,
        "fred_configured": fred_client is not None,
        "us_indicators": {
            "fred_series": FRED_SERIES.get("US", {}) if fred_client else {},
            "description": {
                "gdp": "Gross Domestic Product (billions USD)",
                "gdp_growth": "Real GDP Growth Rate (%)",
                "inflation_cpi": "Consumer Price Index - Inflation Rate (%)",
                "unemployment": "Unemployment Rate (%)",
                "interest_rate": "Federal Funds Effective Rate (%)",
                "ppi": "Producer Price Index",
                "retail_sales": "Advance Retail Sales",
                "industrial_production": "Industrial Production Index"
            }
        },
        "supported_countries": list(STATIC_MACRO_DATA.keys()),
        "timestamp": datetime.now().isoformat()
    }
