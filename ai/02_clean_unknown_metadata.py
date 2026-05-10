import polars as pl
import os

file_path = "dataset_metadata_enriched.parquet"
if not os.path.exists(file_path):
    if os.path.exists(os.path.join("ai", file_path)):
        file_path = os.path.join("ai", file_path)
    else:
        print("❌ Không tìm thấy file dataset_metadata_enriched.parquet")
        exit()

print(f"📂 Đang đọc file: {file_path}")
df = pl.read_parquet(file_path)

initial_count = len(df)
print(f"📊 Tổng số mã ban đầu: {initial_count}")

# Lọc bỏ các mã có Sector là Unknown
df_clean = df.filter(pl.col("sector") != "Unknown")

final_count = len(df_clean)
removed_count = initial_count - final_count

print(f"🧹 Đã loại bỏ: {removed_count} mã (Unknown/Lỗi/Hủy niêm yết)")
print(f"✅ Tổng số mã còn lại: {final_count}")

# Lưu đè lại file
print(f"💾 Đang lưu file sạch: {file_path}")
df_clean.write_parquet(file_path)
print("✅ Hoàn tất dọn dẹp dữ liệu!")
