import React, { useState, useEffect } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import { API_PATHS } from '../../utils/apiPaths';
import { addThousandsSeperator } from '../../utils/helper';
import moment from 'moment';

const PredictionDisplay = ({ symbol }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const fetchPrediction = async () => {
    if (!symbol) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await axiosInstance.get(API_PATHS.PREDICTION.GET(symbol));
      setPrediction(response.data);
      console.log('Prediction loaded:', response.data);
    } catch (err) {
      console.error('Error fetching prediction:', err);
      
      // Xử lý các loại error khác nhau
      if (err.response) {
        if (err.response.status === 503) {
          setError('Dịch vụ dự đoán tạm thời không khả dụng. Vui lòng thử lại sau.');
        } else if (err.response.status === 400) {
          setError(err.response.data.message || 'Không đủ dữ liệu để dự đoán');
        } else if (err.response.status === 401) {
          setError('Vui lòng đăng nhập để xem dự đoán');
        } else {
          setError(err.response.data.message || 'Không thể tải dự đoán');
        }
      } else if (err.code === 'ECONNABORTED') {
        setError('Yêu cầu quá lâu. Vui lòng thử lại.');
      } else {
        setError('Lỗi kết nối. Vui lòng kiểm tra mạng.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrediction();
  }, [symbol]);

  const getTrendColor = (trend) => {
    if (!trend) return 'text-gray-600';
    return trend.toLowerCase().includes('bull') ? 'text-green-600' : 'text-red-600';
  };

  const getTrendIcon = (trend) => {
    if (!trend) return '→';
    return trend.toLowerCase().includes('bull') ? '↗' : '↘';
  };

  const getTrendText = (trend) => {
    if (!trend) return 'Trung lập';
    return trend.toLowerCase().includes('bull') ? 'Tăng giá' : 'Giảm giá';
  };

  const formatVietnameseDate = (dateString) => {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const date = new Date(dateString);
    const dayName = days[date.getDay()];
    return `${moment(dateString).format('DD/MM/YYYY')} (${dayName})`;
  };

  const formatPrice = (price) => {
    return addThousandsSeperator(price?.toFixed(2) || 0);
  };

  const calculateChange = (current, previous) => {
    const change = ((current - previous) / previous) * 100;
    return change.toFixed(2);
  };

  if (loading) {
    return (
      <div className="card my-4">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
          <div>
            <div className="text-lg font-semibold text-gray-800">Đang phân tích dữ liệu...</div>
            <div className="text-sm text-gray-500">Mô hình AI đang dự đoán giá cho {symbol}</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card my-4 border-l-4 border-red-500">
        <div className="flex items-start gap-3">
          <div className="text-red-500 text-2xl">⚠</div>
          <div className="flex-1">
            <div className="text-lg font-semibold text-red-700 mb-1">Không thể tải dự đoán</div>
            <div className="text-sm text-gray-600 mb-3">{error}</div>
            <button
              onClick={fetchPrediction}
              className="bg-red-100 hover:bg-red-200 text-red-700 text-sm px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Thử lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!prediction || !prediction.forecast || prediction.forecast.length === 0) {
    return null;
  }

  const firstForecast = prediction.forecast[0];
  const lastForecast = prediction.forecast[prediction.forecast.length - 1];
  const priceChange = calculateChange(lastForecast.predicted_price, prediction.last_close);
  const trend = prediction.overall_trend;

  return (
    <div className="card my-4 border-l-4 border-purple-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-4">
        <div className="flex-1 w-full sm:w-auto">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-lg font-semibold text-gray-800">Dự đoán giá AI</h3>
            {prediction.cached && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Đã lưu</span>
            )}
          </div>
          <div className="text-sm text-gray-500">
            Dự báo 5 ngày tới • Cập nhật: {moment(prediction.last_update).format('DD/MM/YYYY')}
          </div>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <span className={`text-2xl font-bold ${getTrendColor(trend)}`}>
            {getTrendIcon(trend)}
          </span>
          <div className="text-right">
            <div className={`text-xl font-bold ${getTrendColor(trend)}`}>
              {priceChange > 0 ? '+' : ''}{priceChange}%
            </div>
            <div className="text-xs text-gray-500">{getTrendText(trend)}</div>
          </div>
        </div>
      </div>

      {/* Current Price */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="w-full sm:w-auto">
            <div className="text-xs text-gray-500 mb-1">Giá hiện tại</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900">
              {formatPrice(prediction.last_close)} ₫
            </div>
          </div>
          <div className="text-left sm:text-right w-full sm:w-auto">
            <div className="text-xs text-gray-500 mb-1">Dự đoán ngày {moment(lastForecast.date).format('DD/MM')}</div>
            <div className={`text-xl sm:text-2xl font-bold ${getTrendColor(trend)}`}>
              {formatPrice(lastForecast.predicted_price)} ₫
            </div>
          </div>
        </div>
      </div>

      {/* Expand/Collapse Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-sm text-purple-600 hover:text-purple-700 font-medium mb-3 flex items-center justify-center gap-1"
      >
        {expanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}
        <span className="text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Forecast Details */}
      {expanded && (
        <div className="space-y-2">
          {prediction.forecast.map((item, index) => {
            const dayChange = index === 0 
              ? calculateChange(item.predicted_price, prediction.last_close)
              : calculateChange(item.predicted_price, prediction.forecast[index - 1].predicted_price);
            
            return (
              <div key={item.date} className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-2 mb-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-700">
                      {formatVietnameseDate(item.date)}
                    </div>
                    <div className={`text-xs ${dayChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {dayChange > 0 ? '+' : ''}{dayChange}%
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-lg font-bold text-gray-900">
                      {formatPrice(item.predicted_price)} ₫
                    </div>
                  </div>
                </div>
                
                {/* Confidence Interval */}
                <div className="text-xs text-gray-500">
                  <div className="flex flex-col sm:flex-row justify-between gap-1">
                    <span>Khoảng tin cậy:</span>
                    <span className="font-mono">
                      {formatPrice(item.predicted_price * (1 + item.confidence_intervals.p10))} - {formatPrice(item.predicted_price * (1 + item.confidence_intervals.p90))} ₫
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PredictionDisplay;
