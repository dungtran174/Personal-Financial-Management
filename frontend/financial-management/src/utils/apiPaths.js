export const BASE_URL = "http://localhost:8000";

// utils/apiPaths.js
export const API_PATHS = {
  AUTH: {
    LOGIN: "/api/v1/auth/login",
    REGISTER: "/api/v1/auth/register",
    GET_USER_INFO: "/api/v1/auth/getUser",
    FORGOT_PASSWORD: "/api/v1/auth/forgot-password",
    RESET_PASSWORD: "/api/v1/auth/reset-password",
  },
  DASHBOARD: {
    GET_DATA: "/api/v1/dashboard",
    GET_DATA_BY_TIME: "/api/v1/dashboard/search",
  },
  INCOME: {
    ADD_INCOME: "/api/v1/income/add",
    GET_ALL_INCOME: "/api/v1/income/get",
    GET_INCOME_BY_TIME: "/api/v1/income/search",
    GET_UNIQUE_SOURCES: "/api/v1/income/sources",
    UPDATE_INCOME: (incomeId) => `/api/v1/income/${incomeId}`,
    DELETE_INCOME: (incomeId) => `/api/v1/income/${incomeId}`,
    DOWNLOAD_INCOME: `/api/v1/income/downloadexcel`,
  },
  EXPENSE: {
    ADD_EXPENSE: "/api/v1/expense/add",
    GET_ALL_EXPENSE: "/api/v1/expense/get",
    GET_EXPENSE_BY_TIME: "/api/v1/expense/search",
    GET_UNIQUE_CATEGORIES: "/api/v1/expense/categories",
    UPDATE_EXPENSE: (expenseId) => `/api/v1/expense/${expenseId}`,
    DELETE_EXPENSE: (expenseId) => `/api/v1/expense/${expenseId}`,
    DOWNLOAD_EXPENSE: `/api/v1/expense/downloadexcel`,
  },
  NEWS: {
    GET_NEWS: "/api/v1/news",
  },
  TICKER: {
    GET_TICKER_BAR: "/api/v1/ticker/get-bar",
  },
  DETAILS_STOCK: {
    GET_DETAILS_STOCK: "/api/v1/market/ticker-detail",
  },
  MARKET: {
    GET_TICKERS: "/api/v1/market/tickers",
    VN_GAINERS: "/api/v1/market/vn-gainers",
    VN_LOSERS: "/api/v1/market/vn-losers",
    SUMMARY: "/api/v1/market/summary",
  },
  PRICE: {
    GET_CANDLES: "/api/v1/price/candles",
  },
  ASSETS: {
    SEARCH: "/api/v1/assets",
  },
  WATCHLIST: {
    GET: "/api/v1/watchlist",
    ADD: "/api/v1/watchlist/add",
    STAR: "/api/v1/watchlist/star",
    REMOVE: symbol => `/api/v1/watchlist/remove/${symbol}`
  }
};