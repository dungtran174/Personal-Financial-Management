import React from 'react'
import TransactionInfoCard from '../Cards/TransactionInfoCard'
import moment from 'moment'

const ExpenseList = ({transactions, onEdit, onDelete, onDownload}) => {
  return (
    <div className = "card">
        <div className='flex items-center justify-between'>
            <div className=''>
                <h5 className='text-lg'>Nguồn chi tiêu</h5>
            </div>

            <button className='card-btn' onClick={onDownload}>
                <i className="fa-solid fa-download text-lg"></i>
                Tải xuống
            </button>
        </div>

        <div className = "grid grid-cols-1 md:grid-cols-2">
            {transactions?.map((expense) =>(
                <TransactionInfoCard
                    key={expense._id}
                    title = {expense.category}
                    icon = {expense.icon}
                    date = {moment(expense.date).format("DD/MM/YYYY")}
                    amount={expense.amount}
                    type="expense"
                    onEdit={() => onEdit(expense)}
                    onDelete={()=>onDelete(expense._id)}
                />
            ))}
        </div>
    </div>
  )
}

export default ExpenseList
