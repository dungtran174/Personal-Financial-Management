import React from "react";
import { addThousandsSeperator } from "../../utils/helper";

const TitleStock = ({ data, onAddToWatchlist }) => {
  const handleAddToWatchlist = () => {
    if (onAddToWatchlist && data) {
      onAddToWatchlist(data);
    }
  };

  return (
    <div className="card flex flex-col sm:flex-row sm:items-start gap-4 mt-0">
      {/* --- LEFT: Name + Price --- */}
      <div>
        <div className="font-medium text-gray-800 text-xl mb-1 whitespace-nowrap">
          {data.name} ({data.symbol.replace(/^\^/, "")})
        </div>
        <p className="text-3xl font-semibold text-gray-900 whitespace-nowrap">
          {data.priceNow} ₫
        </p>
      </div>

      {/* --- RIGHT: Info section --- */}
      <div className="mt-4 sm:mt-0 flex flex-col items-start gap-6 text-sm text-gray-600">
        <button
          onClick={handleAddToWatchlist}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-full font-medium shadow-sm hover:cursor-pointer transition-colors"
        >
          + Danh sách theo dõi
        </button>

        {/* Phần thông tin thị trường */}
        <div className="flex md:flex-col lg:flex-row gap-6">
          <div>
            <div className="text-xs text-gray-500 mb-1">
              {data.isMarketOpen
                ? "Thị trường đang mở cửa"
                : "Thị trường đã đóng cửa"}
            </div>
            <p
              className={`font-medium ${
                data.changeNow < 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {addThousandsSeperator(data.changeNow)} (
              {addThousandsSeperator(data.percentChangeNow)}%)
            </p>
          </div>

          {/* Nếu không phải 1D và có dữ liệu thì hiển thị thêm */}
          {data.time && data.time !== "1D" && data.changeByTime !== undefined && (
            <div>
              <div className="text-xs text-gray-500 mb-1">{data.timeRange}</div>
              <p
                className={`font-medium ${
                  data.changeByTime < 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {addThousandsSeperator(data.changeByTime)} (
                {addThousandsSeperator(data.percentChangeByTime)}%)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TitleStock;
