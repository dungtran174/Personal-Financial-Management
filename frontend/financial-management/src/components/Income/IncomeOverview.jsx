import React, { useEffect, useState } from 'react'
import { prepareIncomeChartData } from '../../utils/helper'
import CustomBarChart from '../Charts/CustomBarChart'
import CustomLineChart from '../Charts/CustomLineChart'

const IncomeOverview = ({transactions, onAddIncome}) => {
    const [chatData, setChatData] = useState([])
    useEffect(()=>{
        const result = prepareIncomeChartData(transactions)
        setChatData(result)

        return () =>{}
    }, [transactions])
  return (
    <>
        <div className = "card">
            <div className='flex items-center justify-between'>
                <div className=''>
                    <h5 className='text-lg'>Tổng quan thu nhập bằng biểu đồ cột</h5>
                </div>

                <button className='add-btn' onClick={onAddIncome}>
                    <i className="fa-solid fa-plus text-lg"></i> 
                    Thêm thu nhập
                </button>
            </div>

            <div className = "mt-10">
                <CustomBarChart data = {chatData} dataKey="source"/>
            </div>
        </div>

        <div className = "card my-2">
            <div className='flex items-center justify-between'>
                <div className=''>
                    <h5 className='text-lg'>Tổng quan thu nhập bằng biểu đồ đường</h5>
                    <p className='text-xs text-gray-400 mt-0.5'>
                    </p>
                </div>
            </div>

            <div className = "mt-10">
                <CustomLineChart  data={chatData} dataKey={"source"}/>
            </div>
        </div>
    </>
    

    
  )
}

export default IncomeOverview
