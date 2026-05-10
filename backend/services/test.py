import pandas as pd

df = pd.read_csv("vietnam_tickers_checked.csv")

print (df['Name'].head())