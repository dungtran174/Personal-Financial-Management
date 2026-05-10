import React, { useEffect, useState } from 'react'
import NewsCard from '../Cards/NewsCard';
import { API_PATHS } from '../../utils/apiPaths';
import axiosInstance from '../../utils/axiosInstance';
import { formatTimeAgo } from '../../utils/helper';

const Article = () => {
    
    const [news, setNews] = useState([]);

    const fetchNews = async () => {
    try {
      const res = await axiosInstance.get(`${API_PATHS.NEWS.GET_NEWS}`);
      setNews(res.data.data); 
      console.log("Tin tức:", res.data.data);
    } catch (err) {
      console.error("Lỗi khi lấy tin:", err);
    }
  };

  useEffect(() => {
    fetchNews(); // gọi ngay khi load

    const interval = setInterval(fetchNews, 30 * 60 * 1000); // 30 phút
    return () => clearInterval(interval);
  }, []);

  
  return (
    <div className='g-white py-6 pl-6 pr-2 rounded-2xl shadow-md shadow-gray-100 border border-gray-200/50 '>
      <div className='flex items-center justify-between'>
        <div className='w-full'>
          <h5 className='text-lg mb-2 font-medium'>Tin tức mới</h5>

          <div className="2xl:max-h-[calc(5*280px)] overflow-y-auto scroll-thin pr-2 md:grid md:grid-cols-2 2xl:grid-cols-1 md:gap-4 2xl:gap-0 ">
            {news.map((item, index) => (
              <NewsCard 
                key={index}
                title = {item.title}
                source = {item.source}
                pubDate = {formatTimeAgo(item.pubDate)}
                image = {item.image}
                link= {item.link}
                logo = {item.logo}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Article
