import os
import torch
import pandas as pd
import polars as pl
import numpy as np
import matplotlib.pyplot as plt
from datetime import timedelta
from huggingface_hub import hf_hub_download
from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet
from pytorch_forecasting.data.encoders import GroupNormalizer
from pytorch_forecasting.metrics import QuantileLoss
import warnings
import gc

warnings.filterwarnings("ignore")

class TFTProductionPredictor:
    def __init__(self, repo_id, token, data_path):
        self.repo_id = repo_id
        self.token = token
        self.data_path = data_path
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Cấu hình bảo mật PyTorch (fix conflict weights_only)
        if not hasattr(torch, "original_load_func"):
            torch.original_load_func = torch.load
            def safe_load(*args, **kwargs):
                kwargs['weights_only'] = False  # Force False để load checkpoint cũ
                return torch.original_load_func(*args, **kwargs)
            torch.load = safe_load
        torch.serialization.add_safe_globals([
            GroupNormalizer, 
            QuantileLoss, 
            pd.DataFrame,
            pd.core.internals.managers.BlockManager
        ])

    def load_model(self):
        print(f"⬇️ Loading model to {self.device}...")
        model_path = hf_hub_download(repo_id=self.repo_id, filename="best_model.ckpt", token=self.token)
        self.model = TemporalFusionTransformer.load_from_checkpoint(model_path, map_location=self.device)
        self.model.eval()

    def predict_for_system(self, symbol_name, lookback_days=7):
        """Trả về dữ liệu JSON chuẩn để tích hợp Backend
        
        Args:
            symbol_name: Mã tài sản
            lookback_days: Số ngày lùi lại để lấy giá thực tế so sánh (default=7)
        """
        # 1. Lấy toàn bộ dữ liệu
        q = pl.scan_parquet(self.data_path).filter(pl.col("symbol") == symbol_name)
        df_full = q.collect()
        
        if df_full.is_empty(): return None
        
        # Lùi lại lookback_days để có giá thực tế
        cutoff_idx = max(60, len(df_full) - lookback_days - 5)  # Đảm bảo có đủ 60 ngày history
        df_raw = df_full.slice(0, cutoff_idx)
        
        # Lấy actual prices cho 5 ngày sau cutoff (để so sánh)
        actual_data = df_full.slice(cutoff_idx, min(5, len(df_full) - cutoff_idx))
        actual_prices = actual_data["close"].to_list() if not actual_data.is_empty() else []
        actual_dates = actual_data["ts"].to_list() if not actual_data.is_empty() else []
        
        # Lấy 60 ngày cuối từ dữ liệu đã cắt
        df_raw = df_raw.tail(60)
        
        # Lấy giá đóng cửa cuối cùng và ngày cuối cùng
        last_close = df_raw["close"][-1]
        last_date = df_raw["ts"][-1]
        
        # 2. Tiền xử lý
        data = df_raw.to_pandas()
        data['symbol_id'] = "0"
        data['asset_type'] = data['asset_type'].astype(str)
        data = data.replace([np.inf, -np.inf], np.nan).fillna(0.0)

        # 3. Tạo Dataset & DataLoader
        predict_ds = TimeSeriesDataSet(
            data, time_idx="time_idx", target="log_return", group_ids=["symbol_id"],
            max_encoder_length=30, max_prediction_length=5,
            static_categoricals=["symbol_id", "asset_type"],
            time_varying_known_reals=["time_idx", "day_sin", "day_cos", "month_sin", "month_cos"],
            time_varying_unknown_reals=["log_return", "vol_relative", "bb_width", "roc_10", "macd_proxy", "ctx_sp500_ret", "ctx_gold_ret", "ctx_oil_ret", "ctx_forex_ret"],
            target_normalizer=GroupNormalizer(groups=["symbol_id"], center=False, scale_by_group=True),
            add_relative_time_idx=True, add_target_scales=True, add_encoder_length=True, 
            allow_missing_timesteps=True,  # Cho phép thiếu timesteps (weekend, holidays)
            predict_mode=True
        )
        dl = predict_ds.to_dataloader(train=False, batch_size=1)

        # 4. Inference (Lấy cả các mốc phân vị cho báo cáo)
        raw_out = self.model.predict(dl, mode="raw", return_x=True)
        preds_log_ret = raw_out.output.prediction[0, :, 3].cpu().numpy() # P50 (Median)
        
        # 5. Tính toán kết quả tích hợp
        forecast_results = []
        current_price = last_close
        for i, lr in enumerate(preds_log_ret):
            current_price = current_price * np.exp(lr)
            forecast_date = last_date + timedelta(days=i+1)
            forecast_results.append({
                "date": forecast_date.strftime("%Y-%m-%d"),
                "log_return": float(lr),
                "predicted_price": round(float(current_price), 4),
                "trend": "Up" if lr > 0 else "Down"
            })

        # Vẽ biểu đồ để lưu ảnh báo cáo (truyền actual data để so sánh)
        self._generate_report_plot(raw_out, symbol_name, last_date, last_close, forecast_results, 
                                   actual_dates, actual_prices)
        
        return {
            "symbol": symbol_name,
            "last_update": last_date.strftime("%Y-%m-%d"),
            "last_close": last_close,
            "forecast": forecast_results,
            "actual_prices": [float(p) for p in actual_prices] if actual_prices else [],
            "overall_trend": "Bullish" if sum(preds_log_ret) > 0 else "Bearish"
        }

    def _generate_report_plot(self, raw_out, symbol_name, last_date, last_close, forecast_results,
                             actual_dates=None, actual_prices=None):
        """Vẽ biểu đồ chất lượng cao với giá thực tế cho báo cáo đồ án"""
        plt.style.use('seaborn-v0_8-darkgrid')
        fig, ax1 = plt.subplots(1, 1, figsize=(14, 7), dpi=150)
        
        x = raw_out.x
        preds = raw_out.output.prediction[0].cpu().numpy()
        history_log = x['encoder_target'][0].cpu().numpy()
        
        # Lấy historical prices (30 ngày cuối)
        history_dates = pd.date_range(end=last_date.replace(tzinfo=None) if hasattr(last_date, 'tzinfo') else last_date, periods=30, freq='D')
        
        # SUBPLOT 1: Giá thực tế
        # Tính giá lịch sử từ log returns
        historical_prices = [last_close]
        for lr in reversed(history_log[:-1]):
            historical_prices.insert(0, historical_prices[0] / np.exp(lr))
        
        forecast_dates = [pd.Timestamp(f['date']).tz_localize(None) if pd.Timestamp(f['date']).tz is not None else pd.Timestamp(f['date']) for f in forecast_results]
        forecast_prices = [f['predicted_price'] for f in forecast_results]
        
        # Vẽ giá lịch sử
        ax1.plot(history_dates, historical_prices, color='#2E86AB', linewidth=2.5, 
                label='Giá lịch sử (30 ngày)', marker='o', markersize=3, alpha=0.8)
        
        # Vẽ giá dự báo
        all_dates = list(history_dates[-1:]) + forecast_dates
        all_prices = [last_close] + forecast_prices
        ax1.plot(all_dates, all_prices, color='#A23B72', linewidth=2.5, 
                label='Dự báo (5 ngày)', marker='s', markersize=5, linestyle='--')
        
        # Vẽ giá thực tế (nếu có) để so sánh
        if actual_prices and actual_dates:
            actual_dates_clean = [d.replace(tzinfo=None) if hasattr(d, 'tzinfo') else d for d in actual_dates]
            ax1.plot(actual_dates_clean, actual_prices, color='#16A085', linewidth=2.5,
                    label='Giá thực tế', marker='D', markersize=6, linestyle='-', alpha=0.9)
        
        # Tính confidence interval từ quantiles
        p10_prices = [last_close]
        p90_prices = [last_close]
        current_p10 = last_close
        current_p90 = last_close
        for i in range(5):
            current_p10 = current_p10 * np.exp(preds[i, 1])  # P10
            current_p90 = current_p90 * np.exp(preds[i, 5])  # P90
            p10_prices.append(current_p10)
            p90_prices.append(current_p90)
        
        ax1.fill_between(all_dates, p10_prices, p90_prices, 
                        color='#F18F01', alpha=0.2, label='Khoảng tin cậy 80% (P10-P90)')
        
        # Đánh dấu điểm hiện tại
        ax1.axvline(x=last_date, color='red', linestyle='--', linewidth=2, alpha=0.7)
        ax1.text(last_date, ax1.get_ylim()[1], ' Hiện tại ', 
                color='red', ha='right', va='bottom', fontweight='bold', fontsize=11)
        
        # Zoom vào vùng biến động để thấy rõ hơn
        all_plot_prices = historical_prices + forecast_prices + (actual_prices if actual_prices else [])
        price_range = max(all_plot_prices) - min(all_plot_prices)
        y_margin = price_range * 0.15  # 15% margin
        ax1.set_ylim(min(all_plot_prices) - y_margin, max(all_plot_prices) + y_margin)
        
        ax1.set_title(f"DỰ BÁO GIÁ TÀI SẢN: {symbol_name}", 
                     fontsize=16, fontweight='bold', pad=15, color='#2C3E50')
        ax1.set_xlabel("Ngày", fontsize=12, fontweight='bold')
        ax1.set_ylabel("Giá (USD)", fontsize=12, fontweight='bold')
        ax1.legend(loc='best', frameon=True, facecolor='white', edgecolor='gray', fontsize=10)
        ax1.grid(True, linestyle=':', alpha=0.5)
        ax1.tick_params(axis='x', rotation=45)
        
        plt.tight_layout()
        plt.savefig(f"forecast_{symbol_name}.png", bbox_inches='tight', dpi=150)
        plt.close(fig)

# --- CHẠY THỬ ---
import os
from dotenv import load_dotenv

load_dotenv()

predictor = TFTProductionPredictor(
    repo_id="8qii/my-tft-backup",
    token=os.getenv("HUGGING_FACE_TOKEN"),
    data_path="dataset_final_kaggle.parquet"
)
predictor.load_model()

# Test với VCB.VN (Vietcombank), lùi lại 7 ngày để có giá thực tế
system_output = predictor.predict_for_system("ETHUSDT", lookback_days=7)

import json
print("\n--- JSON OUTPUT CHO HỆ THỐNG ---")
print(json.dumps(system_output, indent=4))