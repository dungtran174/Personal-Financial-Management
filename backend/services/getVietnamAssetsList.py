import pandas as pd
from vnstock import Listing

# Khởi tạo đối tượng Listing
listing = Listing()

# Lấy danh sách tất cả các công ty niêm yết
# Kết quả trả về là một Pandas DataFrame
df_listings = listing.all_symbols() 

# Hoặc lấy danh sách chia theo sàn
# df_by_exchange = listing.symbols_by_exchange() 

# Kiểm tra DataFrame và chọn các cột cần thiết (Symbol, Name, Exchange)
# Các cột trong DataFrame thường là:
# 'ticker' (Symbol), 'companyName' (Name), 'groupCode' (Exchange/Sàn)

df_output = df_listings[['symbol', 'organ_name']]
print(df_listings.head(5))

# Đổi tên cột cho dễ hiểu (tùy chọn)
df_output.columns = ['Symbol', 'Name']

# Add a new column 'Exchange' with default value 'VnStock'
df_output['Exchange'] = 'VnStock'

# Append '.VN' to all values in the 'Symbol' column
df_output['Symbol'] = df_output['Symbol'] + '.VN'

print(df_output.head())

# Lưu ra file CSV
df_output.to_csv('vietnam_tickers.csv', index=False)