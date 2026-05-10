import polars as pl
import numpy as np
import faiss
import os
import gc 
from tqdm import tqdm
import glob

# --- CẤU HÌNH ---
WINDOW_SIZE = 30      
PREDICT_HORIZON = 5   
BATCH_SIZE = 500      
INDEX_FILE = "pattern_search.index"
META_FILE = "pattern_metadata.parquet"

def build_index():
    print("🚀 BẮT ĐẦU XÂY DỰNG SEARCH ENGINE (BATCH PROCESSING - FIXED)...")
    
    # 1. Khởi tạo FAISS Index
    index = faiss.IndexFlatL2(WINDOW_SIZE)
    
    # 2. Đọc dữ liệu nguồn
    try:
        lf = pl.scan_parquet("dataset_ml_ready.parquet")
        all_symbols = lf.select("symbol").unique().collect().to_series().to_list()
        print(f"   -> Tổng số mã cần xử lý: {len(all_symbols)}")
    except Exception as e:
        print(f"❌ Lỗi đọc file: {e}")
        return

    # Xóa file cũ nếu có để chạy lại từ đầu
    if os.path.exists(META_FILE):
        os.remove(META_FILE)
    
    # Xóa các file part cũ nếu bị crash giữa chừng
    for f in glob.glob("pattern_metadata_part_*.parquet"):
        try: os.remove(f)
        except: pass
        
    total_vectors = 0
    
    # 3. VÒNG LẶP XỬ LÝ THEO BATCH
    symbol_chunks = [all_symbols[i:i + BATCH_SIZE] for i in range(0, len(all_symbols), BATCH_SIZE)]
    
    for chunk_idx, symbols_batch in enumerate(tqdm(symbol_chunks, desc="Processing Batches")):
        
        # Load batch vào RAM
        try:
            df_batch = lf.filter(pl.col("symbol").is_in(symbols_batch)).collect().sort(["symbol", "ts"])
        except Exception as e:
            print(f"Skipping batch {chunk_idx} due to load error: {e}")
            continue

        batch_vectors = []
        # Chuẩn bị dict chứa list thuần Python
        batch_metadata = {
            "symbol": [],
            "date": [],
            "future_return": []
        }
        
        dfs = df_batch.partition_by("symbol", as_dict=True)
        
        for sym, sub_df in dfs.items():
            closes = sub_df["close"].to_numpy()
            dates = sub_df["ts"].to_numpy()
            
            if len(closes) < WINDOW_SIZE + PREDICT_HORIZON:
                continue
                
            # Sliding Window
            from numpy.lib.stride_tricks import sliding_window_view
            windows = sliding_window_view(closes[:-PREDICT_HORIZON], window_shape=WINDOW_SIZE)
            
            future_prices = closes[WINDOW_SIZE + PREDICT_HORIZON - 1:]
            current_prices = closes[WINDOW_SIZE - 1 : -PREDICT_HORIZON]
            
            min_len = min(len(windows), len(future_prices))
            windows = windows[:min_len]
            future_ret = (future_prices[:min_len] / current_prices[:min_len]) - 1
            valid_dates = dates[WINDOW_SIZE - 1 : WINDOW_SIZE - 1 + min_len]
            
            # Z-Score Normalization
            means = np.mean(windows, axis=1, keepdims=True)
            stds = np.std(windows, axis=1, keepdims=True)
            norm_windows = (windows - means) / (stds + 1e-6)
            
            # Append Vector
            batch_vectors.append(norm_windows)
            
            # --- FIX QUAN TRỌNG: Dùng .tolist() để chuyển Numpy -> Python List chuẩn ---
            batch_metadata["symbol"].extend([str(sym)] * min_len) # Ép kiểu string
            batch_metadata["date"].extend(valid_dates.tolist())   # Ép kiểu datetime chuẩn
            batch_metadata["future_return"].extend(future_ret.tolist()) # Ép kiểu float chuẩn

        # Lưu Batch
        if batch_vectors:
            X_batch = np.concatenate(batch_vectors, axis=0).astype('float32')
            index.add(X_batch)
            total_vectors += X_batch.shape[0]
            
            # --- FIX QUAN TRỌNG: Khai báo Schema rõ ràng cho Polars ---
            schema = {
                "symbol": pl.String,
                "date": pl.Datetime, # Hoặc pl.Date tùy dữ liệu gốc, pl.Datetime an toàn hơn
                "future_return": pl.Float64
            }
            
            try:
                # Tạo DataFrame với schema cứng để tránh lỗi Object
                df_meta_chunk = pl.DataFrame(batch_metadata, schema=schema)
                
                # Lưu file part
                part_filename = f"pattern_metadata_part_{chunk_idx}.parquet"
                df_meta_chunk.write_parquet(part_filename)
            except Exception as e:
                print(f"⚠️ Lỗi lưu metadata batch {chunk_idx}: {e}")

        # Dọn RAM
        del df_batch, dfs, batch_vectors, batch_metadata
        gc.collect()

    # 4. Lưu FAISS Index
    print(f"\n💾 Đang lưu Index ({total_vectors} vectors)...")
    faiss.write_index(index, INDEX_FILE)
    
    # 5. Gộp Metadata
    print("💾 Đang gộp Metadata...")
    all_parts = glob.glob("pattern_metadata_part_*.parquet")
    if all_parts:
        try:
            # Đọc tất cả file part và lưu thành 1 file
            pl.read_parquet("pattern_metadata_part_*.parquet").write_parquet(META_FILE)
            
            # Xóa file lẻ
            for f in all_parts:
                os.remove(f)
            print(f"✅ HOÀN TẤT! Đã tạo Search Engine tại: {os.getcwd()}")
        except Exception as e:
            print(f"❌ Lỗi khi gộp file metadata: {e}")
            print("Tuy nhiên các file part vẫn còn đó, bạn có thể load lẻ được.")
    else:
        print("⚠️ Không có dữ liệu metadata nào được tạo ra.")

if __name__ == "__main__":
    build_index()