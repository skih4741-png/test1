import yfinance as yf

def get_krw_rate():
    pair = yf.Ticker('KRW=X')
    fi = getattr(pair, 'fast_info', {}) or {}
    price = fi.get('last_price')
    return float(price) if price else None
