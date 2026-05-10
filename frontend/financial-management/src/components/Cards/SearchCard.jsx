import React, { useState } from 'react'
import Input from '../Inputs/Input'

const SearchCard = ({ onSearch, onReset }) => {
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  const handleChange = (field, value) => {
    setDateRange(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleApply = () => {
    onSearch(dateRange.startDate, dateRange.endDate);
  };

  const handleReset = () => {
    setDateRange({
      startDate: '',
      endDate: ''
    });
    onReset();
  };

  return (
    <div className='card mt-6 mb-3'>
      <div className='flex items-center gap-2 mb-4'>
        <i className='fa-solid fa-calendar-days text-primary text-lg'></i>
        <h3 className='text-lg'>Tìm kiếm theo thời gian</h3>
      </div>
      
      <div className='space-y-3 grid grid-cols-1 gap-0 md:grid-cols-3 md:gap-6'>
        <Input
          value={dateRange.startDate}
          onChange={({target}) => handleChange("startDate", target.value)}
          label="Ngày bắt đầu"
          placeholder=""
          type="date"
        />
        
        <Input
          value={dateRange.endDate}
          onChange={({target}) => handleChange("endDate", target.value)}
          label="Ngày kết thúc"
          placeholder=""
          type="date"
        />
        
        <div className='grid grid-cols-2 gap-6 items-center'>
          <button
            onClick={handleApply}
            className='add-btn add-btn-fill flex items-center justify-center gap-1.5 text-sm mt-1.5 h-12'
          >
            <i className='fa-solid fa-search text-sm'></i>
            Áp dụng
          </button>

          <button
            onClick={handleReset}
            className='bg-slate-500 hover:bg-slate-600 text-white font-medium px-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 text-sm mt-1.5 h-12'
          >
            <i className="fa-solid fa-rotate-right text-sm"></i>
            Đặt lại
          </button>
        </div>
      </div>
    </div>
  )
}

export default SearchCard
