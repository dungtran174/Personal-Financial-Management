import polars as pl
import matplotlib.pyplot as plt

def run_backtest():
    print("🚀 Đang tải dữ liệu ML-Ready...")
    # Load file parquet đã xử lý xong
    df = pl.read_parquet("dataset_ml_ready.parquet")
    
    print(f"   -> Dữ liệu: {len(df)} dòng.")
    print("   -> Đang chạy chiến lược MA Crossover (Golden Cross)...")

    # --- 1. TÍNH TOÁN CHỈ BÁO (INDICATORS) ---
    # Tính đường trung bình động MA20 và MA50 cho từng mã (over symbol)
    df = df.with_columns([
        pl.col("close").rolling_mean(window_size=20).over("symbol").alias("ma_20"),
        pl.col("close").rolling_mean(window_size=50).over("symbol").alias("ma_50")
    ])

    # --- 2. TẠO TÍN HIỆU (SIGNALS) ---
    # Mua (1) khi MA20 > MA50, ngược lại là Bán/Giữ tiền mặt (0)
    # Shift(1) vì tín hiệu hôm nay chỉ dùng để giao dịch ngày mai
    df = df.with_columns([
        (pl.col("ma_20") > pl.col("ma_50"))
        .cast(pl.Int8)
        .shift(1)
        .over("symbol")
        .fill_null(0)
        .alias("signal")
    ])

    # --- 3. TÍNH LỢI NHUẬN (STRATEGY RETURNS) ---
    # Lợi nhuận = Log Return * Signal
    df = df.with_columns([
        (pl.col("log_return") * pl.col("signal")).alias("strat_return")
    ])

    # --- 4. PHÂN TÍCH KẾT QUẢ ---
    print("\n📊 KẾT QUẢ BACKTEST:")
    
    # A. Tổng lợi nhuận tích lũy (Cumulative Return) của toàn thị trường
    total_market_return = df.select(pl.col("log_return").sum()).item()
    total_strat_return = df.select(pl.col("strat_return").sum()).item()
    
    print(f"   - Buy & Hold toàn thị trường: {total_market_return:.2f} (Log scale)")
    print(f"   - Chiến lược AI (MA Cross):   {total_strat_return:.2f} (Log scale)")

    if total_strat_return > total_market_return:
        print("   ✅ Chiến lược HIỆU QUẢ hơn nắm giữ.")
    else:
        print("   ⚠️ Chiến lược KÉM hơn nắm giữ (Bình thường với MA đơn giản).")

    # B. So sánh hiệu quả theo từng loại tài sản (Crypto vs Stock)
    # Group by asset_type (bạn cần map ngược lại từ type_encoded nếu muốn xem tên)
    # Tuy nhiên ở bước trước ta đã encode, nên giờ ta check nhanh bằng Symbol cụ thể
    
    print("\n🔍 Chi tiết một số tài sản mẫu:")
    sample_symbols = ["BTC", "ETH", "AAPL", "IBM"] # Thử cả Coin và Stock
    
    for sym in sample_symbols:
        # Lọc dữ liệu của mã đó
        df_sym = df.filter(pl.col("symbol") == sym)
        
        if len(df_sym) > 0:
            # Tính PnL tích lũy (Cumulative Sum) để vẽ biểu đồ
            df_sym = df_sym.with_columns([
                pl.col("log_return").cum_sum().alias("cum_market"),
                pl.col("strat_return").cum_sum().alias("cum_strategy")
            ])
            
            market_ret = df_sym.select(pl.col("log_return").sum()).item()
            strat_ret = df_sym.select(pl.col("strat_return").sum()).item()
            
            print(f"   - {sym}: Buy&Hold = {market_ret:.2f} | Strategy = {strat_ret:.2f}")

            # Vẽ biểu đồ so sánh (chỉ vẽ nếu chạy trên máy có màn hình)
            # Nếu chạy server headless thì comment đoạn này lại
            try:
                plt.figure(figsize=(10, 4))
                plt.plot(df_sym["cum_market"], label="Buy & Hold", alpha=0.5)
                plt.plot(df_sym["cum_strategy"], label="MA Strategy", color='orange')
                plt.title(f"Hiệu quả chiến lược trên {sym}")
                plt.legend()
                plt.show()
            except:
                pass
        else:
            print(f"   - {sym}: Không tìm thấy dữ liệu.")

if __name__ == "__main__":
    run_backtest()