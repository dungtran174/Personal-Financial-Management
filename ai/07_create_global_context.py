import polars as pl
import os
import time

def add_global_context():
    print("🌍 BẮT ĐẦU TẠO GLOBAL MACRO CONTEXT...")
    start_time = time.time()

    # --- 1. CONFIGURATION ---
    # File đầu vào (Đã làm sạch ở bước trước)
    INPUT_FILE = "dataset_ml_ready.parquet"
    OUTPUT_FILE = "dataset_with_global_context.parquet"
    
    # Định nghĩa các "Vua" của thị trường để làm tham chiếu
    # Key: Symbol trong DB của bạn | Value: Tên cột mới sẽ tạo
    MACRO_MAPPING = {
        "^GSPC": "ctx_sp500",   # S&P 500 (Tâm lý thị trường Mỹ)
        "GC=F":  "ctx_gold",    # Vàng (Trú ẩn)
        "CL=F":  "ctx_oil",     # Dầu (Lạm phát)
        "EURUSD=X": "ctx_forex" # Sức mạnh tiền tệ
    }

    if not os.path.exists(INPUT_FILE):
        print(f"❌ Không tìm thấy file {INPUT_FILE}")
        return

    # --- 2. LOAD DỮ LIỆU ---
    print("   -> Đang load dữ liệu...")
    # Dùng LazyFrame để tối ưu bộ nhớ
    lf = pl.scan_parquet(INPUT_FILE)

    # --- 3. TÁCH DỮ LIỆU MACRO (PIVOT) ---
    print("   -> Đang trích xuất dữ liệu vĩ mô...")
    
    # Chúng ta sẽ tạo ra một DataFrame chỉ chứa Time và các cột Macro
    # Lấy danh sách symbol cần tách
    macro_symbols = list(MACRO_MAPPING.keys())
    
    # Lọc lấy các dòng dữ liệu của Macro Symbols
    # Chỉ lấy cột: ts (thời gian), symbol, và các feature quan trọng (log_return, vol_relative)
    lf_macros = lf.filter(pl.col("symbol").is_in(macro_symbols)).select([
        "ts", "symbol", "log_return", "vol_relative"
    ])
    
    # Collect về RAM để Pivot (Xoay bảng)
    # Pivot: Biến dòng thành cột. 
    # Từ: 
    #  2024-01-01 | ^GSPC | 0.05
    #  2024-01-01 | GC=F  | -0.01
    # Thành:
    #  2024-01-01 | ctx_sp500_ret: 0.05 | ctx_gold_ret: -0.01
    
    df_macros = lf_macros.collect()
    
    # Pivot Return
    df_pivot_ret = df_macros.pivot(
        values="log_return",
        index="ts",
        columns="symbol",
        aggregate_function="first"
    )
    
    # Pivot Volume (Nếu muốn model học cả dòng tiền vĩ mô)
    df_pivot_vol = df_macros.pivot(
        values="vol_relative",
        index="ts",
        columns="symbol",
        aggregate_function="first"
    )

    # Đổi tên cột cho đẹp
    # Ví dụ: ^GSPC -> ctx_sp500_ret
    rename_map_ret = {k: f"{v}_ret" for k, v in MACRO_MAPPING.items()}
    rename_map_vol = {k: f"{v}_vol" for k, v in MACRO_MAPPING.items()}
    
    df_pivot_ret = df_pivot_ret.rename(rename_map_ret)
    df_pivot_vol = df_pivot_vol.rename(rename_map_vol)
    
    # Join 2 bảng pivot lại thành bảng Global Master
    df_global = df_pivot_ret.join(df_pivot_vol, on="ts", how="outer_coalesce")
    
    # Sắp xếp theo thời gian
    df_global = df_global.sort("ts")

    # --- 4. XỬ LÝ LỊCH NGHỈ LỄ (CRITICAL) ---
    print("   -> Đang xử lý đồng bộ thời gian (Forward Fill)...")
    # Vấn đề: Crypto chạy T7, CN nhưng Stock nghỉ.
    # Nếu join thường, T7 của BTC sẽ bị NULL ở cột S&P500.
    # Giải pháp: Forward Fill. Nếu T7 Stock nghỉ, lấy giá T6 đắp vào.
    
    # Chuyển thành Lazy để xử lý fill
    lf_global = df_global.lazy().select(
        [pl.col("ts")] + 
        [pl.col(c).forward_fill().fill_null(0.0) for c in df_global.columns if c != "ts"]
    )
    
    # --- 5. MERGE VÀO DATASET CHÍNH ---
    print("   -> Đang Merge vào Dataset chính (25M dòng)...")
    
    # Left Join: Giữ nguyên 25M dòng của dataset gốc, chỉ ghép thêm cột macro
    lf_final = lf.join(lf_global, on="ts", how="left")
    
    # Một lần nữa Forward Fill sau khi join (đề phòng trường hợp lệch giờ)
    macro_cols = list(rename_map_ret.values()) + list(rename_map_vol.values())
    
    lf_final = lf_final.with_columns([
        pl.col(c).forward_fill().fill_null(0.0) for c in macro_cols
    ])

    # --- 6. LƯU FILE KẾT QUẢ ---
    print(f"💾 Đang lưu file '{OUTPUT_FILE}'...")
    # Dùng sink_parquet để không bung RAM
    lf_final.sink_parquet(OUTPUT_FILE)
    
    print(f"✅ HOÀN THÀNH! Tổng thời gian: {time.time() - start_time:.2f}s")
    print("   Các cột mới đã thêm:")
    print(f"   {macro_cols}")

if __name__ == "__main__":
    add_global_context()