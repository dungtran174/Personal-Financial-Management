import polars as pl
import numpy as np
import faiss
import matplotlib.pyplot as plt
import os

# --- CẤU HÌNH ---
INDEX_FILE = "pattern_search.index"
META_FILE = "pattern_metadata.parquet"
WINDOW_SIZE = 30
TOP_K = 9  # Tìm 9 mẫu hình giống nhất

def search_pattern(target_symbol="BTCUSDC"):
    print(f"🔍 Đang khởi động Search Engine cho: {target_symbol}...")
    
    # 1. Load Resources
    if not os.path.exists(INDEX_FILE) or not os.path.exists(META_FILE):
        print("❌ Chưa có Index. Hãy chạy file 05_build_index.py trước.")
        return

    print("   -> Đang load Index vào RAM...")
    index = faiss.read_index(INDEX_FILE)
    
    print("   -> Đang load Metadata (Lazy)...")
    lf_meta = pl.scan_parquet(META_FILE).with_row_index("row_id")

    # 2. Lấy dữ liệu hiện tại của Target Symbol
    print("   -> Đang lấy mẫu hình hiện tại...")
    try:
        df_prices = pl.read_parquet("dataset_ml_ready.parquet")
    except:
        print("❌ Thiếu file dataset_ml_ready.parquet")
        return

    # Lấy 30 ngày cuối cùng
    df_target = df_prices.filter(pl.col("symbol") == target_symbol).tail(WINDOW_SIZE)
    
    if len(df_target) < WINDOW_SIZE:
        print(f"❌ Không đủ dữ liệu cho {target_symbol}.")
        return

    # Chuẩn bị Vector Query
    query_prices = df_target["close"].to_numpy()
    
    # Z-Score Normalize (QUAN TRỌNG: Để so sánh hình dáng tương đối)
    q_mean = np.mean(query_prices)
    q_std = np.std(query_prices)
    query_norm = (query_prices - q_mean) / (q_std + 1e-6)
    
    # Reshape cho FAISS
    query_vector = query_norm.reshape(1, -1).astype('float32')

    # 3. Thực hiện Tìm kiếm (SEARCH)
    print("   -> Đang quét hàng triệu mẫu hình...")
    D, I = index.search(query_vector, TOP_K)
    found_ids = I[0].tolist()

    # 4. Truy xuất thông tin Metadata
    print("   -> Đang truy xuất thông tin quá khứ...")
    df_results = lf_meta.filter(pl.col("row_id").is_in(found_ids)).collect()
    
    # Sắp xếp lại kết quả theo thứ tự tìm kiếm (Khoảng cách từ nhỏ đến lớn)
    order_map = {id_: i for i, id_ in enumerate(found_ids)}
    results_list = df_results.to_dicts()
    results_list.sort(key=lambda x: order_map.get(x['row_id'], 999))

    # 5. Trực quan hóa & Phân tích (ĐÃ SỬA: VẼ BIỂU ĐỒ SO SÁNH)
    print("\n📊 KẾT QUẢ TÌM KIẾM:")
    
    fig, axes = plt.subplots(3, 3, figsize=(15, 10))
    axes = axes.flatten()
    
    returns_stats = []
    
    for i, res in enumerate(results_list):
        ax = axes[i]
        
        # --- KỸ THUẬT QUAN TRỌNG: Lấy lại Vector từ Index ---
        # Thay vì query DB gốc (chậm), ta lấy vector Z-score trực tiếp từ RAM của FAISS
        # Đây chính là hình dáng mà AI "nhìn thấy"
        match_vector = index.reconstruct(res['row_id'])
        
        future_r = res['future_return'] * 100
        returns_stats.append(future_r)
        
        # Màu sắc: Xanh nếu lãi, Đỏ nếu lỗ
        color = 'green' if future_r > 0 else 'red'
        
        # --- VẼ BIỂU ĐỒ ---
        # 1. Vẽ đường Query (Target hiện tại) - Nét đứt màu xám
        ax.plot(query_norm, color='black', alpha=0.4, linestyle='--', linewidth=1.5, label='Current (Query)')
        
        # 2. Vẽ đường Match (Quá khứ) - Nét liền có màu
        ax.plot(match_vector, color=color, linewidth=2, label='History (Match)')
        
        # Trang trí
        ax.set_title(f"{res['symbol']} ({str(res['date'])[:10]})\nNext 5D: {future_r:+.2f}%", 
                     fontsize=10, color=color, fontweight='bold')
        
        ax.grid(True, alpha=0.3)
        ax.set_xticks([]) # Ẩn trục X cho gọn
        
        # Chỉ hiện chú thích ở ô đầu tiên để đỡ rối
        if i == 0:
            ax.legend(loc='upper left', fontsize='small')

    # Thống kê tổng hợp
    win_rate = sum(r > 0 for r in returns_stats) / len(returns_stats) * 100
    avg_ret = sum(returns_stats) / len(returns_stats)
    
    plt.suptitle(f"PATTERN MATCHING: {target_symbol} (Nét đứt) vs QUÁ KHỨ (Nét liền)", fontsize=16)
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    plt.show()
    
    print(f"\n🔮 DỰ BÁO XÁC SUẤT (Historical Probability):")
    print(f"   - Tỷ lệ Tăng giá: {win_rate:.1f}%")
    print(f"   - Lợi nhuận trung bình: {avg_ret:.2f}%")

if __name__ == "__main__":
    search_pattern("VCB.VN")