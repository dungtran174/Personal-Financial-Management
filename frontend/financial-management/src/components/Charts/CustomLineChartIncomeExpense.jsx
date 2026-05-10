import React from 'react'
import {
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
} from "recharts";
import { addThousandsSeperator } from '../../utils/helper';

const CustomLineChartIncomeExpense = ({expenseData, incomeData}) => {
  const mergeIncomeExpenseData = (incomeData, expenseData) => {
    // Tạo map để tổng hợp dữ liệu theo ngày (dùng định dạng gốc để sort)
    const dataMap = new Map();

    // Cộng dồn thu nhập theo ngày
    incomeData.forEach(item => {
      const date = item.month; // "12th Nov" -> chuyển thành "DD/MM"
      if (dataMap.has(date)) {
        dataMap.get(date).amountIncome += item.amount || 0;
      } else {
        dataMap.set(date, {
          month: date,
          amountIncome: item.amount || 0,
          amountExpense: 0,
          // Lưu thêm date object để sort
          dateObj: new Date(item.month),
        });
      }
    });

    // Cộng dồn chi tiêu theo ngày
    expenseData.forEach(item => {
      const date = item.month; // "12th Nov" -> chuyển thành "DD/MM"
      if (dataMap.has(date)) {
        dataMap.get(date).amountExpense += item.amount || 0;
      } else {
        dataMap.set(date, {
          month: date,
          amountIncome: 0,
          amountExpense: item.amount || 0,
          // Lưu thêm date object để sort
          dateObj: new Date(item.month),
        });
      }
    });

    // Chuyển Map thành array và sort theo ngày
    // Dùng index để sort vì format "DD/MM" có thể parse được
    const sortedData = Array.from(dataMap.entries())
      .map(([key, value], index) => ({
        ...value,
        originalIndex: index
      }))
      .sort((a, b) => {
        // Parse ngày từ format "DD/MM" 
        const parseDate = (dateStr) => {
          const parts = dateStr.split('/');
          if (parts.length === 2) {
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1; // Month is 0-indexed
            return new Date(2025, month, day); // Dùng năm hiện tại
          }
          return new Date();
        };
        
        return parseDate(a.month) - parseDate(b.month);
      })
      .map(({ originalIndex, ...rest }) => rest); // Remove originalIndex

    return sortedData;
  };

  const mergedData = mergeIncomeExpenseData(incomeData, expenseData);

  // 🔸 Custom Tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-white shadow-md rounded-lg p-2 border border-gray-300">
          <p className="text-xs font-semibold text-blue-700 mb-1">{item.month}</p>
          <p className="text-sm text-gray-700">
            Thu nhập:{" "}
            <span className="text-green-600 font-semibold">{addThousandsSeperator(item.amountIncome)}</span>
          </p>
          <p className="text-sm text-gray-700">
            Chi tiêu:{" "}
            <span className="text-red-600 font-semibold">{addThousandsSeperator(item.amountExpense)}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // 🔸 Biểu đồ giữ nguyên form cũ (AreaChart có gradient)
  return (
    <div className="bg-white rounded-xl shadow p-4 mt-4">

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={mergedData}>
          <defs>
            {/* Gradient thu nhập */}
            <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>

            {/* Gradient chi tiêu */}
            <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#555" }} stroke="none" />
          <YAxis tick={{ fontSize: 12, fill: "#555" }} stroke="none" tickFormatter={(value) => addThousandsSeperator(value)} />
          <Tooltip content={<CustomTooltip />} />

          {/* Thu nhập */}
          <Area
            type="monotone"
            dataKey="amountIncome"
            stroke="#22c55e"
            fill="url(#incomeGradient)"
            strokeWidth={3}
            dot={{ r: 3, fill: "#16a34a" }}
            name="Thu nhập"
          />

          {/* Chi tiêu */}
          <Area
            type="monotone"
            dataKey="amountExpense"
            stroke="#ef4444"
            fill="url(#expenseGradient)"
            strokeWidth={3}
            dot={{ r: 3, fill: "#dc2626" }}
            name="Chi tiêu"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CustomLineChartIncomeExpense
