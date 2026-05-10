// src/components/MarketTicker.jsx
import React, { useEffect, useState } from "react";
import axiosInstance from "../../utils/axiosInstance";
import { API_PATHS } from "../../utils/apiPaths";

export default function MarketTicker() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTicker = async () => {
    try {
      const res = await axiosInstance.get(API_PATHS.TICKER.GET_TICKER_BAR);
      setData(Array.isArray(res.data) ? res.data : []);
      setLoading(false);
    } catch (err) {
      console.error("Ticker fetch error:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicker();
    const interval = setInterval(fetchTicker, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading)
    return <div className="p-2 text-gray-400">Loading market data...</div>;

  return (
    <div className="bg-gray-900 text-white overflow-hidden w-full shadow-md">
      <div className="whitespace-nowrap flex animate-scroll">
        {[...data, ...data].map((item, i) => (
          <div
            key={`${item.symbol}-${i}`}
            className="flex items-center gap-3 px-6 py-2 border-l border-gray-800"
          >
            <span className="font-semibold text-gray-300">{item.name}</span>
            <span className="text-white">{item.price.toLocaleString()}</span>
            <span
              className={`font-bold ${
                item.positive ? "text-green-400" : "text-red-400"
              }`}
            >
              {item.positive ? "+" : ""}
              {item.changePercent.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
      <style>{`
        .animate-scroll {
          display: inline-flex;
          animation: scroll-left 60s linear infinite;
        }
        @keyframes scroll-left {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
