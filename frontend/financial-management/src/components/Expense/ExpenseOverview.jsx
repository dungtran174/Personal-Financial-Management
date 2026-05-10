import React, { useEffect, useState } from 'react'
import { prepareExpenseLineChartData } from '../../utils/helper'
import CustomLineChart from '../Charts/CustomLineChart'
import CustomBarChart from '../Charts/CustomBarChart'

const ExpenseOverview = ({transactions, onAddExpense}) => {
  const [chatData, setChatData] = useState([])
    useEffect(()=>{
      const result = prepareExpenseLineChartData(transactions)
      setChatData(result)

      return () =>{}
    }, [transactions])
  return (
    <>
      <div className = "card">
          <div className='flex items-center justify-between'>
              <div className=''>
                  <h5 className='text-lg'>Tổng quan chi tiêu bằng biểu đồ cột</h5>
              </div>

              <button className='add-btn' onClick={onAddExpense}>
                  <i className="fa-solid fa-plus text-lg"></i> 
                  Thêm chi tiêu
              </button>
          </div>

          <div className='mt-10'>
            <CustomBarChart data={chatData} dataKey = "category" />
          </div>
      </div>

      <div className = "card my-2">
          <div className='flex items-center justify-between'>
              <div className=''>
                  <h5 className='text-lg'>Tổng quan chi tiêu bằng biểu đồ đường</h5>
              </div>
          </div>

          <div className='mt-10'>
            <CustomLineChart data={chatData} dataKey = "category" />
          </div>
      </div>
    </>
    
  )
}

export default ExpenseOverview
