import React, { useEffect, useState } from 'react'
import CustomLineChartIncomeExpense from '../Charts/CustomLineChartIncomeExpense'
import { prepareExpenseLineChartData, prepareIncomeChartData } from '../../utils/helper'

const IncomeExpenseCorrelation = ({dataIncome, dataExpense}) => {
    const [chatDataExpense, setChatDataExpense] = useState([])
    useEffect(()=>{
        const result = prepareExpenseLineChartData(dataExpense)
        setChatDataExpense(result)
        return () =>{}
    }, [dataExpense])

    const [chatDataIncome, setChatDataIncome] = useState([])
    useEffect(()=>{
        const result = prepareIncomeChartData(dataIncome)
        setChatDataIncome(result)
        return () =>{}
    }, [dataIncome])

  return (
    <div className = "card mt-6">
      <div className = "flex items-center justify-between">
        <h5 className = "text-lg">Tương quan giữa thu nhập và chi tiêu</h5>
      </div>

        <CustomLineChartIncomeExpense
            expenseData = {chatDataExpense}
            incomeData = {chatDataIncome}
        />

    </div>
  )
}

export default IncomeExpenseCorrelation
