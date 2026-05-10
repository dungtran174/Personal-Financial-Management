import React from 'react'
import { useState } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import { API_PATHS } from '../../utils/apiPaths';
import { useEffect } from 'react';
import { addThousandsSeperator } from '../../utils/helper';

const Summary = ({onChange}) => {

  const [tickers, setTickers] = useState([]);

  const handleTickerClick = (selectedSymbol) => {
    // Gọi hàm từ cha truyền xuống
    onChange(selectedSymbol);
  };

  const fetchNews = async () => {
    try {
      const res = await axiosInstance.get(`${API_PATHS.TICKER.GET_TICKER_BAR}`);
      setTickers(res.data); 
      console.log("Tickers:", res.data);
    } catch (err) {
      console.error("Lỗi khi lấy ticker:", err);
    }
  };

  useEffect(() => {
    fetchNews(); // gọi ngay khi load

    const interval = setInterval(fetchNews, 60 * 1000); // 1 phút
    return () => clearInterval(interval);
  }, []);

  return (
    <>
        <div className='bg-white p-2 rounded-2xl shadow-md shadow-gray-100 border border-gray-200/50 flex flex-nowrap w-full overflow-x-auto space-x-10 scroll-thin my-0 '>
        {tickers.map((item, index) => (
            <div key={index} className="flex items-center gap-2.5 whitespace-nowrap flex-shrink-0 hover:cursor-pointer hover:bg-primary/5 px-4 py-2 rounded-lg" 
            onClick={() => handleTickerClick(item.symbol)}
            >
                <span className="font-medium text-sm text-gray-700">
                {item.name}
                </span>
                <span className="font-semibold text-gray-900 text-sm">{addThousandsSeperator(item.price)}</span>
                <span className={`text-sm font-semibold ${item.positive ? 'text-green-500' : 'text-red-500'}`}>
                {item.positive ? '▲  +' : '▼ '}
                {item.changePercent}%
                </span>
            </div>
            ))}
        </div>
    </>
  )
}

export default Summary
