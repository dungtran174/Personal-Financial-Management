import React from 'react'
import TransactionInfoCard from '../Cards/TransactionInfoCard'
import moment from 'moment'

const IncomeList = ({transactions, onEdit, onDelete, onDownload}) => {
  return (
    <div className = "card">
        <div className='flex items-center justify-between'>
            <div className=''>
                <h5 className='text-lg'>Nguồn thu nhập</h5>
            </div>

            <button className='card-btn' onClick={onDownload}>
                <i className="fa-solid fa-download text-lg"></i>
                Tải xuống
            </button>
        </div>

        <div className = "grid grid-cols-1 md:grid-cols-2">
            {transactions?.map((income) =>(
                <TransactionInfoCard
                    key={income._id}
                    title = {income.source}
                    icon = {income.icon}
                    date = {moment(income.date).format("DD/MM/YYYY")}
                    amount={income.amount}
                    type="income"
                    onEdit={() => onEdit(income)}
                    onDelete={()=>onDelete(income._id)}
                />
            ))}
        </div>
    </div>
  )
}

export default IncomeList
