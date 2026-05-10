import React, { useEffect, useState } from "react";
import axiosInstance from "../../utils/axiosInstance";
import { API_PATHS } from "../../utils/apiPaths";
import DetailStockCard from "../Cards/DetailStockCard";
import { addThousandsSeperator } from "../../utils/helper";

const StockMarket = ({ children, symbol }) => {
  const [detail, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDetailsStock = async () => {
    if (!symbol) return;
    try {
      setLoading(true);
      const res = await axiosInstance.get(
        `${API_PATHS.DETAILS_STOCK.GET_DETAILS_STOCK}?symbol=${symbol}`
      );
      setDetails(res.data);
      console.log("Chi tiết:", res.data);
    } catch (err) {
      console.error("❌ Lỗi khi lấy detail:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetailsStock();

    const interval = setInterval(fetchDetailsStock, 30 * 60 * 1000); // 30 phút
    return () => clearInterval(interval);
  }, [symbol]);

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">Đang tải dữ liệu...</div>
    );
  }

  if (!detail) {
    return (
      <div className="p-4 text-center text-red-500">
        Không có dữ liệu cho mã {symbol}
      </div>
    );
  }

  return (
    <>
      <div className="">{children}</div>
      <div className="card">
        {/* Các thông tin chi tiết */}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          <DetailStockCard title="Giá mở" amount={addThousandsSeperator(detail.open)} />
          <DetailStockCard title="Cao nhất trong ngày" amount={addThousandsSeperator(detail.high)} />
          <DetailStockCard title="Thấp nhất trong ngày" amount={addThousandsSeperator(detail.low)} />
          <DetailStockCard title="Giá đóng cửa trước đó" amount={addThousandsSeperator(detail.prevClose)} />
          <DetailStockCard title="Khối lượng giao dịch" amount={addThousandsSeperator(detail.volume)} />
          <DetailStockCard
            title="Cao nhất trong 52 tuần"
            amount={addThousandsSeperator(detail.fiftyTwoWeekHigh)}
          />
          <DetailStockCard
            title="Thấp nhất trong 52 tuần"
            amount={addThousandsSeperator(detail.fiftyTwoWeekLow)}
          />
        </div>

        {/* Phần lợi nhuận theo khoảng thời gian */}
        <div className="mt-6">
          <h3 className="font-semibold text-gray-800 mb-2">Lợi nhuận</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DetailStockCard title="1 tháng" amount={`${detail.profit["1M"] ?? "--"}%`} />
            <DetailStockCard title="3 tháng" amount={`${detail.profit["3M"] ?? "--"}%`} />
            <DetailStockCard title="6 tháng" amount={`${detail.profit["6M"] ?? "--"}%`} />
            <DetailStockCard title="1 năm" amount={`${detail.profit["1Y"] ?? "--"}%`} />
          </div>
        </div>
      </div>
    </>
  );
};

export default StockMarket;
