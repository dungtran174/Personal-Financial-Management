import React from 'react'
import { Clock } from 'lucide-react';

const NewsCard = ({title, source, pubDate, image, link, logo}) => {
  return (
    <>
    <a href={link} target='_blank'>
        <div className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 group 2xl:my-2 my-4 md:my-0 relative">
            <div className="h-80 2xl:h-48 overflow-hidden">
                <img 
                src={image} 
                alt={title} 
                className="w-full h-full object-cover group-hover:scale-105 group-hover:cursor-pointer transition-transform duration-300" 
                />
            </div>
            {/* Gradient overlay for screens < 2xl - only bottom half */}
            <div className="absolute bottom-0 left-0 right-0 h-3/5 bg-gradient-to-t from-black/80 via-black/50 to-transparent 2xl:hidden"></div>
            
            <div className="absolute bottom-0 left-0 right-0 p-4 2xl:relative 2xl:bg-white">
                <h3 className="font-semibold text-white 2xl:text-gray-800 mb-2 line-clamp-2 group-hover:text-purple-200 2xl:group-hover:text-[#875cf5] transition-colors h-12 2xl:h-auto">
                {title}
                </h3>
                <div className="flex items-center justify-between text-sm text-gray-200 2xl:text-gray-500 mt-5 text-[12px]">
                    <div className='flex gap-2 items-center '>
                        <img src={logo} alt={source} className='w-6 h-auto mr-1 flex items-center'/>
                        <span className="font-medium ">{source}</span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{pubDate}</span>
                    </div>
                </div>
            </div>
            </div>
    </a>
    
    </>
    
  )
}

export default NewsCard
