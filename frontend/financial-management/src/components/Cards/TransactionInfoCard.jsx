import React from 'react'
import { addThousandsSeperator } from '../../utils/helper'

const TransactionInfoCard = ({
    title,
    icon,
    date,
    amount,
    type,
    hideDeleteBtn,
    onDelete,
    onEdit
}) => {
    const getAmountStyles = () => type === "income" ? "bg-green-50 text-green-500" : "bg-red-50 text-red-500"
    
  return (
    <div className = "group relative flex items-center gap-4 mt-2 p-3 rounded-lg hover:bg-gray-100/60">
      <div className = "w-12 h-12 flex items-center justify-center text-gray-800 bg-gray-100 rounded-full text-xl">
        {icon ? (
            <img src={`${icon}`} alt="title" className = "w-6 h-6"/>
        ) : (
            <i className="fa-solid fa-utensils"></i>
        )}
      </div>

      <div className='flex-1 flex items-center justify-between'>
        <div>
            <p className='text-sm text-gray-700 font-medium'>{title}</p>
            <p className='text-xs text-gray-400 mt-1'>{date}</p>
        </div>
        
        <div className='flex items-center gap-2'>
            {!hideDeleteBtn && (
                <>
                    <button className = "text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={onEdit}>
                        <i className="fa-solid fa-pen size-[18px]"></i>
                    </button>
                    <button className = "text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={onDelete}>
                        <i className="fa-solid fa-trash-can size-[18px]"></i>
                    </button>
                </>
            )}

            <div className = {`flex items-center gap-2 px-3 py-1.5 rounded-md ${getAmountStyles()}`}>
                <h6 className = "text-xs font-medium">
                    {type === "income" ? "+" : "-"}{addThousandsSeperator(amount)} đ
                </h6>
                {type === "income" ? (
                    <i className="fa-solid fa-arrow-up"></i>
                ) : (
                    <i className="fa-solid fa-arrow-down"></i>
                )}
            </div>
        </div>
      </div>
    </div>
  )
}

export default TransactionInfoCard
