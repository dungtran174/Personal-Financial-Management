import React from 'react'
import DashBoardLayout from '../../components/layouts/DashboardLayout'
import Summary from '../../components/News/Summary'
import { useUserAuth } from '../../hooks/useUserAuth';
import Article from '../../components/News/Article';
import CustomLineChartStock from '../../components/Charts/CustomLineChartStock';
import WatchlistSection from '../../components/News/WatchlistSection';
import { useState } from 'react';
import SearchBar from '../../components/News/SearchBar';
import axiosInstance from '../../utils/axiosInstance';
import { API_PATHS } from '../../utils/apiPaths';
import toast from 'react-hot-toast';

const News = () => {
    useUserAuth();
    const [symbol, setSymbol] = useState("BTCUSDT");
    const [watchlistKey, setWatchlistKey] = useState(0);

    const handleChangeSymbol = (newSymbol) => {
        setSymbol(newSymbol);
        console.log("Selected symbol in News page: ", newSymbol);
    }

    const handleAddToWatchlist = async (assetData) => {
        try {
            const symbol = assetData.symbol;
            const type = assetData.assetType || assetData.type || 'stock'; // Get type from data
            
            await axiosInstance.post(API_PATHS.WATCHLIST.ADD, {
                symbol: symbol,
                type: type,
                starred: false
            });
            toast.success(`Đã thêm ${symbol} vào danh sách theo dõi`);
            // Force WatchlistSection to refresh
            setWatchlistKey(prev => prev + 1);
        } catch (error) {
            const message = error?.response?.data?.message || 'Không thể thêm vào danh sách theo dõi';
            toast.error(message);
            console.error('Error adding to watchlist:', error);
        }
    }
  return (
    <DashBoardLayout activeMenu="Tin tức">
        <div className='my-5 mx-auto'>
            <div>
                <h2 className='text-2xl font-semibold mb-4'>Trang Tin Tức</h2>
            </div>
            
            <div className = "grid grid-cols-1 gap-6">
              <Summary onChange = {handleChangeSymbol}/>
              {/* Search bar */}
            </div>
             <div className="grid grid-cols-1 md:grid-cols-3 2xl:grid-cols-4 gap-4 mt-6">
                <div className="order-1 2xl:order-2 md:col-span-2">
                    <SearchBar onSelectSymbol={handleChangeSymbol} />
                    <CustomLineChartStock symbol={symbol} onAddToWatchlist={handleAddToWatchlist}/>
                </div>

                <div className="order-2 2xl:order-3 col-span-1">
                    <WatchlistSection key={watchlistKey} />
                </div>

                <div className="order-3 md:col-span-3 2xl:order-1 2xl:col-span-1 ">
                    <Article />
                </div>
            </div>
            
        </div>
    </DashBoardLayout>
  )
}

export default News
