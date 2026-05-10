import polars as pl
import os
import time

def process_data_lazy():
    print("Bắt đầu quy trình (Chế độ Lazy - Tiết kiệm RAM)...")
    start_time = time.time()

    # --- 1. KIỂM TRA FILE ---
    if not os.path.exists("dataset_ohlcv.parquet") or not os.path.exists("dataset_assets.parquet"):
        print("Lỗi: Thiếu file nguồn. Hãy chạy lại export_data.py.")
        return

    try:
        # --- 2. SỬ DỤNG SCAN (LAZY LOADING) ---
        # scan_parquet thay vì read_parquet -> Không tốn RAM ngay lập tức
        print("   -> Đang quét dữ liệu (Lazy Scan)...")
        lf_prices = pl.scan_parquet("dataset_ohlcv.parquet")
        lf_assets = pl.scan_parquet("dataset_assets.parquet")

        # Chuẩn bị bảng Assets
        lf_assets_clean = lf_assets.select([
            pl.col("id").alias("asset_id"), 
            "symbol", 
            "asset_type", 
            "exchange"
        ])

        # Join (Lazy)
        lf_final = lf_prices.join(lf_assets_clean, on="asset_id", how="left")
        
        # Sắp xếp (Bắt buộc cho Time-series)
        lf_final = lf_final.sort(["symbol", "ts"])

        # --- 3. FEATURE ENGINEERING (LAZY) ---
        print("   -> Đang lập kế hoạch tính toán (Plan)...")
        
        LAG_DAYS = 5 

        # Tính toán các cột (Logic vẫn giữ nguyên nhưng dùng Lazy Frame)
        lf_final = lf_final.with_columns([
            # Forward Fill để lấp lỗ hổng dữ liệu
            pl.col("close").forward_fill().over("symbol"),
            pl.col("volume").forward_fill().over("symbol"),
            pl.col("open").forward_fill().over("symbol"),
            pl.col("high").forward_fill().over("symbol"),
            pl.col("low").forward_fill().over("symbol"),
        ]).with_columns([
            # Target: Log Return
            (pl.col("close").log().diff().over("symbol").fill_null(0.0)).alias("log_return"),
            # Feature: Log Range
            (pl.col("high").log() - pl.col("low").log()).fill_null(0.0).alias("log_range"),
            # Feature: Log Volume Change
            (pl.col("volume").log1p().diff().over("symbol").fill_null(0.0)).alias("vol_change_log"),
             # Feature: Relative Volume (Sửa min_periods -> min_samples)
            (pl.col("volume") / pl.col("volume").rolling_mean(window_size=20, min_samples=1).over("symbol"))
            .fill_nan(1.0).fill_null(1.0).alias("vol_relative")
        ])

        # Tạo Lagged Features
        # Lưu ý: Viết vòng lặp trong Lazy hơi khác một chút, ta dùng list comprehension
        lagged_exprs = [
            pl.col("log_return").shift(i).over("symbol").alias(f"lag_return_{i}")
            for i in range(1, LAG_DAYS + 1)
        ]
        lf_final = lf_final.with_columns(lagged_exprs)

        # --- 4. LỌC VÀ LÀM SẠCH ---
        # Sửa lỗi Warning: Dùng .len() thay vì .count()
        # Tính độ dài chuỗi dữ liệu cho mỗi mã để lọc rác
        # Ta cần thực hiện bước này tách biệt một chút vì Lazy khó join với chính nó sau khi group
        
        # Để an toàn và chắc chắn chạy được, ta sẽ COLLECT (Load vào RAM) ở bước này
        # Vì sau khi lọc bớt dữ liệu rác, RAM sẽ chịu tải được.
        print("   -> Đang thực thi tính toán và load vào RAM (Bước này mất khoảng 30s-1p)...")
        df_final = lf_final.collect() 

        print(f"   -> Đã load vào RAM: {len(df_final)} dòng. Đang lọc mã rác...")

        # --- 5. LỌC MÃ RÁC (EAGER MODE - CHẠY TRÊN RAM) ---
        # Sửa lỗi crash cũ tại đây: Dùng .len() và cột "len"
        symbol_counts = df_final.group_by("symbol").len() # Tạo ra cột "symbol" và "len"
        
        # Lấy danh sách mã hợp lệ (> 60 ngày)
        valid_symbols = symbol_counts.filter(pl.col("len") > 60).select("symbol")
        
        # Filter dữ liệu chính
        df_final = df_final.join(valid_symbols, on="symbol", how="inner")

        # Làm sạch NaN lần cuối
        df_final = df_final.filter(
            ~pl.col("log_return").is_infinite() & 
            ~pl.col("vol_change_log").is_infinite()
        ).drop_nulls(subset=["log_return", "lag_return_5"])

        # Encode (Chuyển chữ sang số)
        df_final = df_final.with_columns([
            pl.col("asset_type").cast(pl.Categorical).to_physical().alias("type_encoded"),
            pl.col("exchange").cast(pl.Categorical).to_physical().alias("exchange_encoded"),
            pl.col("symbol").cast(pl.Categorical).to_physical().alias("symbol_encoded")
        ])

        # --- 6. LƯU FILE ---
        output_file = "dataset_ml_ready.parquet"
        print(f"💾 Đang lưu file '{output_file}'...")
        df_final.write_parquet(output_file)
        
        print(f"✅ THÀNH CÔNG! Tổng thời gian: {time.time() - start_time:.2f}s")
        print(f"   Số dòng dữ liệu sạch: {len(df_final)}")

    except Exception as e:
        print("\n❌ CÓ LỖI XẢY RA:")
        print(e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    process_data_lazy()