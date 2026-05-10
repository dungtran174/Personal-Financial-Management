import React from 'react'
import { XAxis, YAxis, ResponsiveContainer, CartesianGrid, Area, AreaChart, Tooltip } from "recharts";
import { addThousandsSeperator } from '../../utils/helper';

const CustomLineChart = ({data, dataKey}) => {

    const CustomTooltip = ({active, payload}) => {
        if(active && payload && payload.length){
            const item = payload[0].payload;
            return (
                <div className = "bg-white shadow-md rounded-lg p-2 border border-gray-300">
                    <p className='text-xs font-semibold text-purple-800 mb-1'>{item[dataKey]}</p>
                    <p className = "text-sm text-gray-600">
                        Số tiền: <span className='text-sm font-medium text-gray-900'>{addThousandsSeperator(item.amount)} đ</span>
                    </p>
                </div>
            )
        }
        return null;
    }

  return (
    <div className='bg-white'>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data = {data}>
            <defs>
                <linearGradient id = "incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor='#875cf5' stopOpacity={0.4}/>
                    <stop offset="95%" stopColor='#875cf5' stopOpacity={0}/>
                </linearGradient>
            </defs>

            <CartesianGrid stroke = "none"/>
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#555"}} stroke='none' />
            <YAxis tick={{ fontSize: 12, fill: "#555"}} stroke='none' tickFormatter={(value) => addThousandsSeperator(value)} />

            <Tooltip content={<CustomTooltip/>} />
            
            <Area
                type="monotone"
                dataKey="amount"
                stroke="#875cf5"
                fill="url(#incomeGradient)"
                strokeWidth={3}
                dot={{ r: 3, fill: "#ab8df8" }}
            />
        
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default CustomLineChart
