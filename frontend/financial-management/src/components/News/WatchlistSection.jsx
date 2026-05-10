import React, { useEffect, useMemo, useState } from "react";
import {
  Star,
  Plus,
  TrendingUp,
  TrendingDown,
  Eye,
  X,
  Search,
} from "lucide-react";
import axiosInstance from "../../utils/axiosInstance";
import { API_PATHS } from "../../utils/apiPaths";

const SYMBOL_DIRECTORY = [
  { symbol: "^VNINDEX.VN", name: "VN-Index", type: "index" },
  { symbol: "AAPL", name: "Apple Inc.", type: "stock" },
  { symbol: "MSFT", name: "Microsoft Corp.", type: "stock" },
  { symbol: "BTCUSDT", name: "Bitcoin", type: "crypto" },
  { symbol: "ETHUSDC", name: "Ethereum", type: "crypto" },
  { symbol: "FPT.VN", name: "FPT Corp", type: "stock" },
  { symbol: "VCB.VN", name: "Vietcombank", type: "stock" },
  { symbol: "VHM.VN", name: "Vinhomes", type: "stock" },
  { symbol: "MWG.VN", name: "Mobile World Group", type: "stock" },
  { symbol: "HDB.VN", name: "HDBank", type: "stock" },
  { symbol: "TSLA", name: "Tesla Inc.", type: "stock" },
  { symbol: "VIC.VN", name: "Vingroup JSC", type: "stock" },
  { symbol: "HPG.VN", name: "Hoa Phat Group", type: "stock" },
  { symbol: "SSI.VN", name: "SSI Securities", type: "stock" },
  { symbol: "VND.VN", name: "VNDirect Securities", type: "stock" },
  { symbol: "DOGE", name: "Dogecoin", type: "crypto" },
  { symbol: "SOL", name: "Solana", type: "crypto" },
];

const cleanSymbol = (symbol) => (symbol ? symbol.replace(/^\^/, "") : "");

const formatPrice = (price, type) => {
  if (type === "index" || type === "crypto") {
    return price.toFixed(2);
  }
  // For stocks, format with thousand separators
  return new Intl.NumberFormat("vi-VN").format(Math.round(price));
};

const mergeWithRealPrices = (items, priceData) => {
  const priceMap = new Map();
  if (priceData?.tickers) {
    priceData.tickers.forEach((ticker) => {
      priceMap.set(ticker.symbol, {
        price: ticker.price,
        change: ticker.changePercent24h,
        name: ticker.name,
      });
    });
  }

  return items.map((item) => {
    const meta = SYMBOL_DIRECTORY.find(
      (entry) => entry.symbol === item.symbol,
    ) || {
      symbol: item.symbol,
      name: item.symbol,
      type: item.type || "stock",
    };

    const realPrice = priceMap.get(item.symbol);

    return {
      ...meta,
      ...item,
      name: realPrice?.name || meta.name,
      price: realPrice ? formatPrice(realPrice.price, meta.type) : "---",
      change: realPrice ? parseFloat(realPrice.change.toFixed(2)) : 0,
      starred: Boolean(item.starred),
    };
  });
};

const WatchlistSection = () => {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mutationTarget, setMutationTarget] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const fetchWatchlist = async () => {
      setLoading(true);
      try {
        // Fetch watchlist items
        const watchlistResponse = await axiosInstance.get(
          API_PATHS.WATCHLIST.GET,
        );
        const items = watchlistResponse.data.items || [];

        if (items.length === 0) {
          setWatchlist([]);
          setLoading(false);
          return;
        }

        // Extract symbols and fetch real prices
        const symbols = items.map((item) => item.symbol).join(",");
        const priceResponse = await axiosInstance.get(
          `${API_PATHS.MARKET.GET_TICKERS}?symbols=${symbols}`,
        );

        setWatchlist(mergeWithRealPrices(items, priceResponse.data));
        setError(null);
      } catch (err) {
        setError(
          err?.response?.data?.message || "Không thể tải danh sách theo dõi",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchWatchlist();

    // Auto refresh every 60 seconds
    const interval = setInterval(fetchWatchlist, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const existingSymbols = useMemo(
    () => new Set(watchlist.map((item) => item.symbol)),
    [watchlist],
  );

  // Search API with debounce
  useEffect(() => {
    const searchAssets = async () => {
      const keyword = searchTerm.trim();

      if (!keyword) {
        setSearchResults([]);
        return;
      }

      setSearchLoading(true);
      try {
        const response = await axiosInstance.get(
          `${API_PATHS.ASSETS.SEARCH}?q=${encodeURIComponent(keyword)}&limit=6`,
        );

        // Filter out symbols already in watchlist
        const filtered = (response.data.results || [])
          .filter((item) => !existingSymbols.has(item.symbol))
          .map((item) => ({
            symbol: item.symbol,
            name: item.name,
            type: item.asset_type,
            exchange: item.exchange,
          }));

        setSearchResults(filtered);
      } catch (err) {
        console.error("Error searching assets:", err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    };

    // Debounce search - wait 300ms after user stops typing
    const timeoutId = setTimeout(searchAssets, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, existingSymbols]);

  const filteredOptions = useMemo(() => {
    // If searching, use API results
    if (searchTerm.trim()) {
      return searchResults;
    }

    // If not searching, show some default options from SYMBOL_DIRECTORY
    return SYMBOL_DIRECTORY.filter(
      (option) => !existingSymbols.has(option.symbol),
    ).slice(0, 8);
  }, [searchTerm, searchResults, existingSymbols]);

  const [marketSegments, setMarketSegments] = useState({
    topGainers: [],
    topLosers: [],
    highVolume: [],
  });

  useEffect(() => {
    const fetchMarketSegments = async () => {
      try {
        // Fetch VN Gainers and Losers from API
        const [gainersResponse, losersResponse] = await Promise.all([
          axiosInstance.get(`${API_PATHS.MARKET.VN_GAINERS}?limit=10`),
          axiosInstance.get(`${API_PATHS.MARKET.VN_LOSERS}?limit=10`),
        ]);

        const formatData = (apiData) => {
          return (apiData.data || []).map((item) => ({
            symbol: item.symbol,
            name: item.name,
            price: formatPrice(item.price, item.asset_type),
            change: parseFloat(item.changePercent24h.toFixed(2)),
          }));
        };

        setMarketSegments({
          topGainers: formatData(gainersResponse.data),
          topLosers: formatData(losersResponse.data),
          highVolume: [], // Can be populated later if needed
        });
      } catch (err) {
        console.error("Error fetching market segments:", err);
      }
    };

    fetchMarketSegments();

    // Refresh every 60 seconds
    const interval = setInterval(fetchMarketSegments, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleFavorite = async (symbol) => {
    const target = watchlist.find((item) => item.symbol === symbol);
    if (!target) return;
    setMutationTarget(symbol);
    try {
      const response = await axiosInstance.patch(API_PATHS.WATCHLIST.STAR, {
        symbol,
        starred: !target.starred,
      });
      const items = response.data.items || [];

      // Fetch updated prices
      if (items.length > 0) {
        const symbols = items.map((item) => item.symbol).join(",");
        const priceResponse = await axiosInstance.get(
          `${API_PATHS.MARKET.GET_TICKERS}?symbols=${symbols}`,
        );
        setWatchlist(mergeWithRealPrices(items, priceResponse.data));
      } else {
        setWatchlist([]);
      }
      setError(null);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Không thể cập nhật trạng thái yêu thích",
      );
    } finally {
      setMutationTarget(null);
    }
  };

  const handleRemove = async (symbol) => {
    setMutationTarget(symbol);
    try {
      const response = await axiosInstance.delete(
        API_PATHS.WATCHLIST.REMOVE(symbol),
      );
      const items = response.data.items || [];

      // Fetch updated prices
      if (items.length > 0) {
        const symbols = items.map((item) => item.symbol).join(",");
        const priceResponse = await axiosInstance.get(
          `${API_PATHS.MARKET.GET_TICKERS}?symbols=${symbols}`,
        );
        setWatchlist(mergeWithRealPrices(items, priceResponse.data));
      } else {
        setWatchlist([]);
      }
      setError(null);
    } catch (err) {
      setError(
        err?.response?.data?.message || "Không thể xoá mã khỏi danh sách",
      );
    } finally {
      setMutationTarget(null);
    }
  };

  const handleAddSymbol = async (option) => {
    setMutationTarget(option.symbol);
    try {
      const response = await axiosInstance.post(API_PATHS.WATCHLIST.ADD, {
        symbol: option.symbol,
        type: option.type,
        starred: true,
      });
      const items = response.data.items || [];

      // Fetch updated prices
      if (items.length > 0) {
        const symbols = items.map((item) => item.symbol).join(",");
        const priceResponse = await axiosInstance.get(
          `${API_PATHS.MARKET.GET_TICKERS}?symbols=${symbols}`,
        );
        setWatchlist(mergeWithRealPrices(items, priceResponse.data));
      } else {
        setWatchlist([]);
      }
      setError(null);
      setIsPickerOpen(false);
      setSearchTerm("");
    } catch (err) {
      setError(
        err?.response?.data?.message || "Không thể thêm mã vào danh sách",
      );
    } finally {
      setMutationTarget(null);
    }
  };

  // Enhanced table row with color animation for changes
  const renderTableRow = (item, showFavorite = true, onRemove = null) => {
    const changeValue = Number(item.change || 0);
    const isPositive = changeValue > 0;
    const isNegative = changeValue < 0;

    return (
      <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-all duration-300 border border-transparent hover:border-gray-200 group">
        {/* Symbol and Name */}
        <div className="flex-1 flex items-center gap-3">
          {showFavorite && (
            <button
              onClick={() => handleToggleFavorite(item.symbol)}
              disabled={mutationTarget === item.symbol}
              className={`transition-all duration-300 ${
                item.starred
                  ? "text-yellow-500 hover:text-yellow-600"
                  : "text-gray-400 hover:text-yellow-500"
              }`}
            >
              <Star
                className={`w-4 h-4 ${item.starred ? "fill-current" : ""}`}
              />
            </button>
          )}
          <div className="min-w-0 flex-1" title={item.name}>
            <div className="font-bold text-gray-900 text-sm">
              {cleanSymbol(item.symbol)}
            </div>
            <div className="text-xs text-gray-500 truncate max-w-[150px]">
              {item.name}
            </div>
          </div>
        </div>

        {/* Price and Change */}
        <div className="text-right">
          <div className="font-semibold text-gray-900 text-sm">
            {item.price}
          </div>
          <div
            className={`text-xs font-semibold transition-all duration-500 flex items-center justify-end gap-1 ${
              isPositive
                ? "text-green-500 group-hover:text-green-600"
                : isNegative
                  ? "text-red-500 group-hover:text-red-600"
                  : "text-gray-500"
            }`}
          >
            {isNegative ? (
              <TrendingDown className="w-3 h-3" />
            ) : (
              <TrendingUp className="w-3 h-3" />
            )}
            <span>
              {changeValue > 0 ? "+" : ""}
              {changeValue.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Remove button for suggestions */}
        {onRemove && (
          <button
            onClick={() => onRemove(item.symbol)}
            disabled={mutationTarget === item.symbol}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-gray-400 hover:text-red-500 p-1 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Watchlist Table */}
      <div className="card bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              <h3 className="text-base font-bold text-gray-900">
                My Watchlist
              </h3>
            </div>
            <button
              onClick={() => {
                setIsPickerOpen((prev) => !prev);
                setSearchTerm("");
              }}
              className="px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-600 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Thêm mã
            </button>
          </div>
          {isPickerOpen && (
            <div className="absolute right-4 top-16 w-72 bg-white border border-gray-200 shadow-lg rounded-xl z-20">
              <div className="p-3 border-b border-gray-100 flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Tìm mã cổ phiếu hoặc crypto"
                  className="w-full text-sm outline-none"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {searchLoading && (
                  <div className="p-4 text-sm text-gray-500 text-center">
                    Đang tìm kiếm...
                  </div>
                )}
                {!searchLoading && filteredOptions.length === 0 && (
                  <div className="p-4 text-sm text-gray-500">
                    {searchTerm.trim()
                      ? "Không tìm thấy mã phù hợp."
                      : "Nhập để tìm kiếm..."}
                  </div>
                )}
                {!searchLoading &&
                  filteredOptions.map((option) => (
                    <button
                      key={option.symbol}
                      onClick={() => handleAddSymbol(option)}
                      className="w-full text-left px-4 py-3 hover:bg-violet-50 transition-colors flex flex-col"
                      disabled={mutationTarget === option.symbol}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">
                          {cleanSymbol(option.symbol)}
                        </span>
                        {option.exchange && (
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                            {option.exchange}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 truncate">
                        {option.name}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Table Header */}
        <div className="px-4 py-2 bg-gray-50 rounded-t-lg flex justify-between text-xs font-medium text-gray-600">
          <div className="pl-8">Mã</div>
          <div className="pr-8">Giá / Thay đổi</div>
        </div>

        {/* Table Content */}
        <div className="space-y-1 p-2 max-h-[580px] overflow-y-auto scroll-thin">
          {loading && (
            <div className="p-4 text-sm text-gray-500">
              Đang tải danh sách...
            </div>
          )}
          {!loading && watchlist.length === 0 && (
            <div className="p-4 text-sm text-gray-500">
              Chưa có mã nào trong danh sách của bạn.
            </div>
          )}
          {!loading &&
            watchlist.map((item) => (
              <div key={item.symbol} className="animate-slide-in">
                {renderTableRow(item, true, handleRemove)}
              </div>
            ))}
        </div>
        {error && (
          <div className="px-4 pb-4">
            <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Top Gainers */}
      <div className="card bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-3 h-3 text-green-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Top Tăng VN</h3>
          </div>
        </div>

        <div className="space-y-1 p-2 max-h-[200px] overflow-y-auto scroll-thin">
          {marketSegments.topGainers.length === 0 && (
            <div className="p-4 text-sm text-gray-500 text-center">
              Đang tải...
            </div>
          )}
          {marketSegments.topGainers.map((item) => (
            <div key={item.symbol} className="animate-slide-in">
              {renderTableRow(item, false)}
            </div>
          ))}
        </div>
      </div>

      {/* Top Losers */}
      <div className="card bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-3 h-3 text-red-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Top Giảm VN</h3>
          </div>
        </div>

        <div className="space-y-1 p-2 max-h-[200px] overflow-y-auto scroll-thin">
          {marketSegments.topLosers.length === 0 && (
            <div className="p-4 text-sm text-gray-500 text-center">
              Đang tải...
            </div>
          )}
          {marketSegments.topLosers.map((item) => (
            <div key={item.symbol} className="animate-slide-in">
              {renderTableRow(item, false)}
            </div>
          ))}
        </div>
      </div>

      {/* High Volume - Hidden for now since we're focusing on VN stocks */}
      {marketSegments.highVolume.length > 0 && (
        <div className="card bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                <Eye className="w-3 h-3 text-blue-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Khối lượng cao
              </h3>
            </div>
          </div>

          <div className="space-y-1 p-2 max-h-[200px] overflow-y-auto">
            {marketSegments.highVolume.map((item) => (
              <div key={item.symbol} className="animate-slide-in">
                {renderTableRow(item, false)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WatchlistSection;
