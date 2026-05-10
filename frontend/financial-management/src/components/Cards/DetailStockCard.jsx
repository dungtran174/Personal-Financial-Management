import React from "react";

const DetailStockCard = ({ title, amount }) => {
  return (
    <div className="p-3 bg-gray-50 rounded-lg text-center shadow-sm">
      <div className="text-xs text-gray-500 mb-1 tracking-wide">{title}</div>
      <div className="font-semibold text-gray-900 text-sm">{amount}</div>
    </div>
  );
};

export default DetailStockCard;
