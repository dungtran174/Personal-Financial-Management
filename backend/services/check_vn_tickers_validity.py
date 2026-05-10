import pandas as pd
import requests
import time
import os
import json

# Define paths
current_dir = os.path.dirname(os.path.abspath(__file__))
input_csv = os.path.join(current_dir, 'vietnam_tickers.csv')
output_csv = os.path.join(current_dir, 'vietnam_tickers_checked.csv')

# Load CSV
print(f"Reading from {input_csv}...")
try:
    df = pd.read_csv(input_csv)
except FileNotFoundError:
    print(f"Error: Could not find {input_csv}")
    exit(1)

# Headers to mimic a browser to avoid being blocked
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

def check_symbol_validity(symbol):
    # Using a short range to be fast
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=1d"
    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            try:
                data = response.json()
                chart = data.get('chart', {})
                result = chart.get('result')
                error = chart.get('error')
                
                if error:
                    # Explicit error in JSON
                    return 0
                
                if result and len(result) > 0:
                    # Check if we actually have quotes
                    indicators = result[0].get('indicators', {}).get('quote', [{}])[0]
                    if indicators and (len(indicators.get('close', [])) > 0 or len(indicators.get('open', [])) > 0):
                         return 1
                    
                    # Sometimes result exists but is empty meta data
                    return 0
                else:
                    return 0
            except json.JSONDecodeError:
                return 0
        else:
            return 0
    except Exception as e:
        print(f"Error checking {symbol}: {e}")
        return 0

print(f"Checking {len(df)} symbols...")

# Add column
results = []
total = len(df)

for index, row in df.iterrows():
    symbol = row['Symbol']
    is_valid = check_symbol_validity(symbol)
    results.append(is_valid)
    
    # Print progress
    if (index + 1) % 50 == 0:
        print(f"Checked {index + 1}/{total} symbols... (Found {sum(results)} valid so far)")
    
    # Sleep slightly to avoid rate limiting
    time.sleep(0.05)

df['add_to_asset'] = results

# Save
df.to_csv(output_csv, index=False)
print(f"Done! Saved to {output_csv}")
print(f"Total valid symbols: {df['add_to_asset'].sum()} / {total}")
