import polars as pl
import yfinance as yf
import time
import os
import logging

# Tắt log 404 của yfinance
logging.getLogger('yfinance').setLevel(logging.CRITICAL)

# Kiểm tra file assets
file_path = "dataset_assets.parquet"
if not os.path.exists(file_path):
    # Fallback nếu chạy từ root
    if os.path.exists(os.path.join("ai", file_path)):
        file_path = os.path.join("ai", file_path)
    else:
        print(f"❌ Không tìm thấy '{file_path}' tại {os.getcwd()}")
        print("❌ Cần chạy export_data.py trước hoặc cd vào thư mục chứa file.")
        exit()

print(f"📂 Đọc dữ liệu từ: {file_path}")
df_assets = pl.read_parquet(file_path)
symbols = df_assets["symbol"].to_list()

print(f"🔍 Đang quét thông tin cho {len(symbols)} mã...")

metadata = []

# Các hậu tố tiền tệ/crypto phổ biến để thử thêm dấu gạch ngang
SUFFIXES = ["USDT", "USDC", "BTC", "ETH", "BNB", "FDUSD", "TRY", "EUR", "JPY", "GBP", "AUD", "CAD", "CHF", "CNY", "HKD", "NZD", "SEK", "SGD", "NOK", "MXN", "INR", "RUB", "ZAR", "BRL", "VND", "DAI", "UAH"]

def fetch_info(symbol):
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        if info and len(info) > 1:
            return info
    except:
        pass
    return None

# Xử lý từng mã một để kiểm soát lỗi và rate limit tốt hơn
for i, sym in enumerate(symbols):
    try:
        # Thêm delay nhỏ
        time.sleep(0.1) 
        
        # 1. Thử mã gốc
        info = fetch_info(sym)
        
        # 2. Nếu không được và mã có vẻ là crypto pair (dính liền), thử thêm dấu gạch ngang
        if not info:
            for suffix in SUFFIXES:
                if sym.endswith(suffix) and len(sym) > len(suffix):
                    modified_sym = f"{sym[:-len(suffix)]}-{suffix}"
                    # print(f"🔄 Thử lại: {sym} -> {modified_sym}")
                    info = fetch_info(modified_sym)
                    if info:
                        # print(f"✅ Tìm thấy với: {modified_sym}")
                        break
        
        if not info:
            # print(f"⚠️ Không tìm thấy thông tin: {sym}")
            raise ValueError("Empty info")

        # Lấy các trường cần thiết
        meta = {
            "symbol": sym, # Giữ nguyên symbol gốc để join
            "sector": info.get("sector", "Unknown"),
            "industry": info.get("industry", "Unknown"),
            "market_cap": info.get("marketCap", 0),
            "beta": info.get("beta", 1.0)
        }
        metadata.append(meta)
        
        # In tiến độ mỗi 50 mã
        if (i + 1) % 50 == 0:
            print(f"✅ Processed {i + 1}/{len(symbols)}: {sym} -> {meta['sector']}")
            
    except Exception as e:
        metadata.append({
            "symbol": sym, 
            "sector": "Unknown", 
            "industry": "Unknown", 
            "market_cap": 0, 
            "beta": 1.0
        })

    # Lưu tạm mỗi 500 mã
    if (i + 1) % 500 == 0:
         print(f"💾 Đang lưu tạm dữ liệu tại mốc {i+1}...")
         pl.DataFrame(metadata).write_parquet("dataset_metadata_enriched_temp.parquet")

# Lưu file cuối cùng
df_meta = pl.DataFrame(metadata)
# Fill Unknown
df_meta = df_meta.with_columns([
    pl.col("sector").fill_null("Unknown"),
    pl.col("market_cap").fill_null(0),
    pl.col("beta").fill_null(1.0)
])

output_path = "dataset_metadata_enriched.parquet"
if os.path.dirname(file_path):
    output_path = os.path.join(os.path.dirname(file_path), "dataset_metadata_enriched.parquet")

df_meta.write_parquet(output_path)
print(f"✅ Đã tạo file '{output_path}' chứa thông tin Ngành!")

if os.path.exists("dataset_metadata_enriched_temp.parquet"):
    os.remove("dataset_metadata_enriched_temp.parquet")