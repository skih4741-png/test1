from typing import List, Dict, Any
import yfinance as yf
import pandas as pd
import numpy as np

def get_history(ticker: str, period: str = "5y", interval: str = "1d") -> pd.DataFrame:
    tk = yf.Ticker(ticker)
    df = tk.history(period=period, interval=interval, auto_adjust=False)
    if not isinstance(df, pd.DataFrame) or df.empty:
        return pd.DataFrame()
    return df

def _safe_fast_info(tk):
    fi = getattr(tk, 'fast_info', {}) or {}
    if isinstance(fi, dict):
        return fi
    # yfinance fast_info can be a SimpleNamespace-like; convert safely
    try:
        return dict(fi)
    except Exception:
        return {}

def get_quote(ticker: str) -> Dict[str, Any]:
    tk = yf.Ticker(ticker)
    news = []
    try:
        news = tk.news or []
    except Exception:
        news = []
    fi = _safe_fast_info(tk)

    def _get_num(key):
        try:
            return float(fi.get(key))
        except Exception:
            return None

    return {
        'ticker': ticker,
        'last_price': _get_num('last_price'),
        'currency': fi.get('currency', None),
        'market_cap': _get_num('market_cap'),
        'pe': _get_num('pe'),
        'price_to_sales': _get_num('price_to_sales'),
        'price_to_book': _get_num('price_to_book'),
        'year_high': _get_num('year_high'),
        'year_low': _get_num('year_low'),
        'news': news
    }

def get_dividends(ticker: str) -> pd.Series:
    tk = yf.Ticker(ticker)
    try:
        div = tk.dividends
        if div is None:
            return pd.Series(dtype='float')
        return div
    except Exception:
        return pd.Series(dtype='float')

def get_fundamentals(ticker: str) -> Dict[str, float]:
    tk = yf.Ticker(ticker)
    roe = None
    try:
        fin = tk.financials
        bs = tk.balance_sheet
        if fin is not None and not fin.empty and bs is not None and not bs.empty:
            net_income = fin.loc['Net Income'].iloc[0] if 'Net Income' in fin.index else None
            equity = bs.loc["Total Stockholder Equity"].iloc[0] if "Total Stockholder Equity" in bs.index else None
            if net_income is not None and equity:
                roe = float(net_income) / float(equity) * 100.0
    except Exception:
        roe = None

    fi = _safe_fast_info(tk)
    def _get_num(key):
        try:
            return float(fi.get(key))
        except Exception:
            return None

    fundamentals = {
        'roe': roe,
        'pe': _get_num('pe'),
        'psr': _get_num('price_to_sales'),
        'pbr': _get_num('price_to_book'),
        'last_price': _get_num('last_price'),
        'currency': fi.get('currency')
    }
    return fundamentals
