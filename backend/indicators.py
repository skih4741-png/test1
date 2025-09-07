import pandas as pd
import numpy as np

def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()

def macd(close: pd.Series, fast=12, slow=26, signal=9):
    macd_line = ema(close, fast) - ema(close, slow)
    signal_line = ema(macd_line, signal)
    hist = macd_line - signal_line
    return macd_line, signal_line, hist

def rsi(close: pd.Series, period: int = 14):
    delta = close.diff()
    up = delta.clip(lower=0)
    down = -1 * delta.clip(upper=0)
    ma_up = up.ewm(com=period-1, adjust=False).mean()
    ma_down = down.ewm(com=period-1, adjust=False).mean()
    rs = ma_up / (ma_down + 1e-9)
    rsi = 100 - (100 / (1 + rs))
    return rsi

def generate_signals(df: pd.DataFrame):
    df = df.copy()
    df['EMA20'] = ema(df['Close'], 20)
    df['EMA50'] = ema(df['Close'], 50)
    df['RSI14'] = rsi(df['Close'], 14)
    macd_line, signal_line, hist = macd(df['Close'])
    df['MACD'] = macd_line
    df['MACD_SIGNAL'] = signal_line
    df['MACD_HIST'] = hist

    signals = []
    for i in range(1, len(df)):
        buy = df['EMA20'].iloc[i] > df['EMA50'].iloc[i] and df['EMA20'].iloc[i-1] <= df['EMA50'].iloc[i-1] and df['RSI14'].iloc[i] < 70 and df['MACD'].iloc[i] > df['MACD_SIGNAL'].iloc[i]
        sell = df['EMA20'].iloc[i] < df['EMA50'].iloc[i] and df['EMA20'].iloc[i-1] >= df['EMA50'].iloc[i-1] and df['RSI14'].iloc[i] > 30 and df['MACD'].iloc[i] < df['MACD_SIGNAL'].iloc[i]
        if buy:
            signals.append({'index': df.index[i], 'type': 'BUY', 'price': float(df['Close'].iloc[i])})
        elif sell:
            signals.append({'index': df.index[i], 'type': 'SELL', 'price': float(df['Close'].iloc[i])})
    return df, signals
