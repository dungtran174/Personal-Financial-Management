import React, { useEffect, useState, useRef } from 'react'
import { Search } from 'lucide-react'
import axiosInstance from '../../utils/axiosInstance'
import { API_PATHS } from '../../utils/apiPaths'
import toast from 'react-hot-toast'

const SearchBar = ({ onSelectSymbol }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Search API with debounce
  useEffect(() => {
    const searchAssets = async () => {
      const keyword = searchTerm.trim()
      
      if (!keyword) {
        setSearchResults([])
        setIsDropdownOpen(false)
        return
      }

      setSearchLoading(true)
      setIsDropdownOpen(true)
      try {
        const response = await axiosInstance.get(
          `${API_PATHS.ASSETS.SEARCH}?q=${encodeURIComponent(keyword)}&limit=8`
        )
        
        const results = (response.data.results || []).map(item => ({
          symbol: item.symbol,
          name: item.name,
          type: item.asset_type,
          exchange: item.exchange
        }))
        
        setSearchResults(results)
      } catch (err) {
        console.error('Error searching assets:', err)
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }

    // Debounce search - wait 300ms after user stops typing
    const timeoutId = setTimeout(searchAssets, 300)
    return () => clearTimeout(timeoutId)
  }, [searchTerm])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectSymbol = (symbol) => {
    if (onSelectSymbol) {
      onSelectSymbol(symbol)
      toast.success(`Đang hiển thị dữ liệu cho ${symbol}`)
    }
    setSearchTerm('')
    setSearchResults([])
    setIsDropdownOpen(false)
  }

  return (
    <div className='mb-4shadow-sm relative' ref={dropdownRef}>
      <div className='mb-4'>
        <div className='flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 border border-gray-200 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-all'>
          <Search className='w-5 h-5 text-gray-400' />
          <input
            type='text'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => searchTerm.trim() && setIsDropdownOpen(true)}
            placeholder='Tìm kiếm cổ phiếu, crypto...'
            className='flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder-gray-400'
          />
        </div>

        {/* Dropdown Results */}
        {isDropdownOpen && (
          <div className='absolute left-0 right-0 mt-2 mx-4 bg-white border border-gray-200 shadow-lg rounded-xl z-30 max-h-80 overflow-y-auto'>
            {searchLoading && (
              <div className='p-4 text-sm text-gray-500 text-center'>
                Đang tìm kiếm...
              </div>
            )}
            {!searchLoading && searchResults.length === 0 && searchTerm.trim() && (
              <div className='p-4 text-sm text-gray-500 text-center'>
                Không tìm thấy kết quả phù hợp
              </div>
            )}
            {!searchLoading && searchResults.length > 0 && searchResults.map((result) => (
              <button
                key={result.symbol}
                onClick={() => handleSelectSymbol(result.symbol)}
                className='w-full text-left px-4 py-3 hover:bg-violet-50 transition-colors flex flex-col border-b border-gray-100 last:border-b-0'
              >
                <div className='flex items-center justify-between'>
                  <span className='text-sm font-semibold text-gray-900'>{result.symbol}</span>
                  {result.exchange && (
                    <span className='text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded'>
                      {result.exchange}
                    </span>
                  )}
                </div>
                <span className='text-xs text-gray-500 truncate mt-1'>{result.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchBar
