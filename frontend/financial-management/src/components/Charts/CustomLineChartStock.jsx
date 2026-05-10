import React, { useState, useEffect } from "react";
import { XAxis, YAxis, ResponsiveContainer, CartesianGrid, Area, AreaChart, Tooltip } from "recharts";
import StockMarket from "../News/StockMarket";
import TitleStock from "../News/TitleStock";
import { addThousandsSeperator } from "../../utils/helper";
import axiosInstance from "../../utils/axiosInstance";
import { API_PATHS } from "../../utils/apiPaths";
import moment from "moment";

const CustomLineChartStock = ({symbol, onAddToWatchlist}) => {
  const [selectedRange, setSelectedRange] = useState('1D');
  const [chartData, setChartData] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dataLimitWarning, setDataLimitWarning] = useState(null); // null | string date
  
  // Time range mapping
  const TIME_RANGE_LABELS = {
    '1D': '1 NGÀY QUA',
    '5D': '5 NGÀY QUA',
    '1M': '1 THÁNG QUA',
    '3M': '3 THÁNG QUA',
    'YTD': 'ĐẦU NĂM ĐẾN NAY',
    '1Y': '1 NĂM QUA',
    '2Y': '2 NĂM QUA'
  };

  // Calculate start time based on selected range
  const getTimeParams = (range) => {
    const end = new Date();
    let start = new Date();
    let timeframe = '1m';

    // Limit = max candles to fetch. Must be large enough to cover the full range.
    // Daily ranges: ~252 trading days/year. Add 20% buffer for holidays/gaps.
      const LIMIT_MAP = {
        '1D':  600,
        '5D':  2000,
        '1M':  40,
        '3M':  100,
        'YTD': 250,
        '1Y':  400,
        '2Y':  1000, // Increased limit
      };

    switch(range) {
      case '1D':
        timeframe = '1m';
        start.setDate(end.getDate() - 1);
        break;
      case '5D':
        timeframe = '5m';
        start.setDate(end.getDate() - 7);
        break;
      case '1M':
        timeframe = '1d';
        start.setMonth(end.getMonth() - 1);
        break;
      case '3M':
        timeframe = '1d';
        start.setMonth(end.getMonth() - 3);
        break;
      case 'YTD':
        timeframe = '1d';
        start = new Date(end.getFullYear(), 0, 1);
        break;
      case '1Y':
        timeframe = '1d';
        start.setFullYear(end.getFullYear() - 1);
        break;
      case '2Y':
        timeframe = '1d';
        start.setFullYear(end.getFullYear() - 2);
        break;
      default:
        timeframe = '1m';
        start.setDate(end.getDate() - 1);
    }

    return {
      timeframe,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: LIMIT_MAP[range] || 500
    };
  };

  // Fetch summary data from API
  const fetchSummaryData = async () => {
    if (!symbol) return;
    
    try {
      const response = await axiosInstance.get(`${API_PATHS.MARKET.SUMMARY}?symbol=${symbol}`);
      setSummaryData(response.data);
      console.log("Summary data loaded:", response.data);
    } catch (error) {
      console.error("Error fetching summary data:", error);
      setSummaryData(null);
    }
  };

  // Fetch chart data from API
  const fetchChartData = async () => {
    if (!symbol) return;
    
    setLoading(true);
    try {
      const { timeframe, start, end, limit } = getTimeParams(selectedRange);
      
      const response = await axiosInstance.get(`${API_PATHS.PRICE.GET_CANDLES}`, {
        params: {
          symbol,
          timeframe,
          start,
          end,
          limit  // Pass explicit limit per range to avoid cutting off data
        }
      });

      // Transform API data to chart format (candles array from response)
      const candles = response.data.candles || [];

      // Sort by timestamp ASC to guarantee chronological order
      const sortedCandles = [...candles].sort((a, b) => new Date(a.ts) - new Date(b.ts));

      const formattedData = sortedCandles.map(item => ({
        // 5D: 'DD/MM HH:mm' (unique across days)
        // 1D: 'HH:mm'  |  daily+: 'DD/MM'
        time: selectedRange === '1D'
          ? moment(item.ts).format('HH:mm')
          : selectedRange === '5D'
            ? moment(item.ts).format('DD/MM HH:mm')
            : selectedRange === '1Y' || selectedRange === '2Y'
              ? moment(item.ts).format('DD/MM/YY') // Show year for long ranges
              : moment(item.ts).format('DD/MM'),
        price: item.close,
        timestamp: item.ts
      }));

      setChartData(formattedData);

      // DATA LIMIT WARNING: Check if returned range is shorter than requested
      // e.g. user picks 3M but DB only has 1 month of data
      const EXPECTED_MIN_DAYS = { '1M': 25, '3M': 75, 'YTD': 50, '1Y': 240, '2Y': 600 };
      const minDays = EXPECTED_MIN_DAYS[selectedRange];
      if (minDays && sortedCandles.length > 0) {
        const firstTs = new Date(sortedCandles[0].ts);
        const lastTs  = new Date(sortedCandles[sortedCandles.length - 1].ts);
        const actualDays = (lastTs - firstTs) / (1000 * 60 * 60 * 24);
        if (actualDays < minDays * 0.6) {
          // Has less than 60% of expected data → show warning
          setDataLimitWarning(moment(firstTs).format('DD/MM/YYYY'));
        } else {
          setDataLimitWarning(null);
        }
      } else {
        setDataLimitWarning(null);
      }

      // Calculate changeByTime and percentChangeByTime from candles
      if (sortedCandles.length > 0) {
        const firstPrice = sortedCandles[0].close;
        const lastPrice = sortedCandles[sortedCandles.length - 1].close;
        const changeByTime = lastPrice - firstPrice;
        const percentChangeByTime = (changeByTime / firstPrice) * 100;

        // Update summary data with calculated values using callback to avoid dependency
        setSummaryData(prevData => {
          if (!prevData) return null;
          return {
            ...prevData,
            changeByTime: changeByTime,
            percentChangeByTime: percentChangeByTime,
            time: selectedRange,
            timeRange: TIME_RANGE_LABELS[selectedRange]
          };
        });
      }

      console.log("Chart data loaded:", formattedData);

    } catch (error) {
      console.error("Error fetching chart data:", error);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch summary data only when symbol changes
  useEffect(() => {
    fetchSummaryData();
    
    // Auto refresh summary every 5 minutes
    const intervalId = setInterval(() => {
      fetchSummaryData();
    }, 5 * 60 * 1000); // 5 minutes
    
    return () => clearInterval(intervalId);
  }, [symbol]);

  // Fetch chart data when symbol or range changes
  useEffect(() => {
    fetchChartData();
    
    // Auto refresh every 2 minutes
    const intervalId = setInterval(() => {
      fetchChartData();
    }, 2 * 60 * 1000); 
    
    // Cleanup interval on unmount or when dependencies change
    return () => clearInterval(intervalId);
  }, [symbol, selectedRange]);

  // Custom Tooltip
  const CustomTooltip = ({active, payload}) => {
    if(active && payload && payload.length){
      const item = payload[0].payload;
      
      // Format time based on range for detailed tooltip
      let displayTime = item.time;
      if (item.timestamp) {
        if (selectedRange === '1D' || selectedRange === '5D') {
          displayTime = moment(item.timestamp).format('HH:mm DD/MM');
        } else {
          displayTime = moment(item.timestamp).format('DD/MM/YYYY');
        }
      }
      
      return (
        <div className="bg-white shadow-md rounded-lg p-2 border border-gray-300">
          <p className='text-xs font-semibold text-purple-800 mb-1'>{displayTime}</p>
          <p className="text-sm text-gray-600">
            Giá: <span className='text-sm font-medium text-gray-900'>{addThousandsSeperator(item.price)}</span>
          </p>
        </div>
      )
    }
    return null;
  };

  // YTD is kept in timeRanges but now works correctly (uses '1d' timeframe)
  const timeRanges = ['1D', '5D', '1M', '3M', 'YTD', '1Y', '2Y'];

  // Calculate Y-axis domain with ±5% padding
  const getYAxisDomain = () => {
    if (chartData.length === 0) return [0, 'auto'];
    
    const prices = chartData.map(item => item.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    const yDomainMin = minPrice - (minPrice * 0.005);
    const yDomainMax = maxPrice + (maxPrice * 0.005);
    
    return [yDomainMin, yDomainMax];
  };

  // Generate exactly 5 ticks for Y-axis (4 equal intervals)
  const getYAxisTicks = () => {
    if (chartData.length === 0) return [];
    
    const [min, max] = getYAxisDomain();
    const step = (max - min) / 4; // 4 intervals = 5 ticks
    
    return [
      min,
      min + step,
      min + step * 2,
      min + step * 3,
      max
    ];
  };

  // Generate X-axis ticks from actual data
  // For 5D: mark day boundaries (first candle of each day) so user sees date transitions
  // For other ranges: evenly spaced 5 ticks
  const getXAxisTicks = () => {
    if (chartData.length === 0) return [];
    if (chartData.length <= 5) return chartData.map(item => item.time);

    if (selectedRange === '5D') {
      // Show the first candle of each trading day as a tick
      const seen = new Set();
      const dayTicks = [];
      chartData.forEach(item => {
        // Extract 'DD/MM' from 'DD/MM HH:mm'
        const day = item.time.slice(0, 5);
        if (!seen.has(day)) {
          seen.add(day);
          dayTicks.push(item.time);
        }
      });
      // Also add last point so chart doesn't clip
      const last = chartData[chartData.length - 1].time;
      if (!dayTicks.includes(last)) dayTicks.push(last);
      return dayTicks;
    }

    const step = Math.floor((chartData.length - 1) / 4);
    return [
      chartData[0].time,
      chartData[step].time,
      chartData[step * 2].time,
      chartData[step * 3].time,
      chartData[chartData.length - 1].time
    ];
  };

  const chartColor = chartData.length > 0 
    ? (chartData[chartData.length - 1].price >= chartData[0].price ? '#22c55e' : '#ef4444')
    : '#875cf5';

  return (
    <StockMarket symbol={symbol}>
      {summaryData && <TitleStock data={summaryData} onAddToWatchlist={onAddToWatchlist}/>}
      
      {/* Time Range Filter Buttons */}
      <div className="card my-4">
        <div className="flex gap-2 mb-4 flex-wrap">
          {timeRanges.map((range) => (
            <button
              key={range}
              onClick={() => setSelectedRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedRange === range
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range}
            </button>
          ))}
        </div>

        {/* Data limit warning banner */}
        {dataLimitWarning && !loading && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Dữ liệu lịch sử chỉ có từ <strong>{dataLimitWarning}</strong> — khoảng thời gian hiển thị ngắn hơn dự kiến.</span>
          </div>
        )}

        {/* Chart */}
        {loading ? (
          <div className="h-[300px] flex items-center justify-center text-gray-500">
            Đang tải dữ liệu...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-gray-500">
            Không có dữ liệu cho mã {symbol}
          </div>
        ) : (
          <div className='bg-white'>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0"/>
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 11, fill: "#555"}} 
                  stroke='none'
                  ticks={getXAxisTicks()}
                  interval={0}
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: "#555"}} 
                  stroke='none'
                  domain={getYAxisDomain()}
                  ticks={getYAxisTicks()}
                  tickFormatter={(value) => addThousandsSeperator(value)} 
                />

                <Tooltip content={<CustomTooltip/>} />
                
                <Area
                  // type="monotone"
                  dataKey="price"
                  stroke={chartColor}
                  fill="url(#priceGradient)"
                  strokeWidth={3}
                  // dot={{ r: 1, fill: "#ab8df8" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </StockMarket>
  );
};

export default CustomLineChartStock;
