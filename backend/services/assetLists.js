module.exports = {
  indices: [
    { symbol: "^VNINDEX.VN", name: "VN-Index", exchange: "HOSE", currency: "VND" },
    { symbol: "^GSPC", name: "S&P 500", exchange: "US", currency: "USD" },
    { symbol: "^DJI", name: "Dow Jones", exchange: "US", currency: "USD" },
    { symbol: "^IXIC", name: "NASDAQ", exchange: "US", currency: "USD" }
  ],

  forex: [
    { symbol: "EURUSD=X", name: "EUR/USD", currency: "USD" },
    { symbol: "USDJPY=X", name: "USD/JPY", currency: "JPY" },
    { symbol: "GBPUSD=X", name: "GBP/USD", currency: "USD" },
    { symbol: "AUDUSD=X", name: "AUD/USD", currency: "USD" },
    { symbol: "USDCAD=X", name: "USD/CAD", currency: "CAD" },
    // USD/VND sẽ dùng API riêng → ghi metadata đặc biệt
    { symbol: "USDVND", name: "USD/VND", currency: "VND", provider: "exchangerate" }
  ],

  commodities: [
    { symbol: "GC=F", name: "Gold Futures", currency: "USD" },
    { symbol: "CL=F", name: "Crude Oil WTI", currency: "USD" }
  ]
};
