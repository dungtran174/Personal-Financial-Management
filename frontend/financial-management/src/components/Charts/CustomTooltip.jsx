import React from 'react'
import { addThousandsSeperator } from '../../utils/helper'

const CustomTooltip = ({active, payload}) => {
  if(active && payload && payload.length){
    return (
        <div className = "bg-white shadow-md rounded-md p-2 border border-gray-300">
            <p className='text-xs font-semibold text-purple-800 mb-1'>{payload[0].name}</p>
            <p className='text-sm text-gray-600'>
                Số tiền: <span className='text-sm font-medium text-gray-900'>{addThousandsSeperator(payload[0].value)}</span>
            </p>
        </div>
    )
  }
}

export default CustomTooltip
