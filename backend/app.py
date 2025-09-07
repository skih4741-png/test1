import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import pandas as pd

from services.yfinance_service import get_history, get_quote, get_dividends, get_fundamentals
from services.fx_service import get_krw_rate
from services.dividend_calc import monthly_dividend_table, compute_real_yield
from services.translate import translate_text
from services.news_service import fetch_article_clean
from indicators import generate_signals
from services.screener import screen_tickers
from services.portfolio_service import get_portfolio, save_portfolio, analyze_portfolio
from services.analytics_service import build_report, compute_portfolio_series
from alerts import start_alerts

load_dotenv()

app = FastAPI(title="Smart Trader Pro API")

origins = [o.strip() for o in os.getenv('CORS_ORIGINS','*').split(',')]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ['*'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scheduler = start_alerts()

@app.get('/api/quote')
def api_quote(ticker: str):
    q = get_quote(ticker)
    return q

@app.get('/api/history')
def api_history(ticker: str, period: str = '5y', interval: str = '1d'):
    df = get_history(ticker, period, interval)
    df = df.reset_index()
    df['Date'] = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d')
    return df.to_dict(orient='records')

@app.get('/api/dividends')
def api_dividends(ticker: str):
    div = get_dividends(ticker)
    table = monthly_dividend_table(div)
    return table.to_dict(orient='records')

@app.get('/api/real_yield')
def api_real_yield(ticker: str, shares: float, avg_cost: float, annual_dividend: float, tax_rate: float = 0.154, fee_bps: float = 8.0):
    q = get_quote(ticker)
    usdkrw = get_krw_rate() or 1350.0
    last_price = q.get('last_price') or 0.0
    data = compute_real_yield(shares, avg_cost, last_price, usdkrw, annual_dividend, tax_rate=tax_rate, fee_bps=fee_bps)
    data['usdkrw'] = usdkrw
    return data

@app.get('/api/signals')
def api_signals(ticker: str, period: str = '2y', interval: str = '1d'):
    df = get_history(ticker, period, interval)
    if df.empty:
        return {'signals': [], 'series': []}
    df2, sig = generate_signals(df[['Close']])
    df2 = df2.reset_index()
    df2['Date'] = pd.to_datetime(df2['Date']).dt.strftime('%Y-%m-%d')
    return {
        'series': df2[['Date','Close','EMA20','EMA50','RSI14','MACD','MACD_SIGNAL','MACD_HIST']].to_dict(orient='records'),
        'signals': [{'date': s['index'].strftime('%Y-%m-%d'), 'type': s['type'], 'price': s['price']} for s in sig]
    }

@app.get('/api/news')
def api_news(ticker: str, translate: bool = True):
    q = get_quote(ticker)
    items = q.get('news', []) if q else []
    out = []
    for n in items[:10]:
        title = n.get('title','')
        link = n.get('link','')
        summary = ''
        if link:
            txt = fetch_article_clean(link)[:4000]
            summary = txt[:800]
        if translate:
            title_ko = translate_text(title)
            summary_ko = translate_text(summary)
        else:
            title_ko, summary_ko = title, summary
        out.append({'title': title, 'title_ko': title_ko, 'summary': summary, 'summary_ko': summary_ko, 'link': link})
    return out

@app.get('/api/screener')
def api_screener(tickers: str, preset: str | None = None, roe_min: float | None = None, pe_max: float | None = None, pbr_max: float | None = None, psr_max: float | None = None, min_price: float | None = None, max_price: float | None = None):
    symbols = [t.strip().upper() for t in tickers.split(',') if t.strip()]
    res = screen_tickers(symbols, roe_min=roe_min, pe_max=pe_max, pbr_max=pbr_max, psr_max=psr_max, min_price=min_price, max_price=max_price, preset=preset)
    return res

@app.get('/api/fundamentals')
def api_fundamentals(ticker: str):
    return get_fundamentals(ticker)


# ---- Portfolio endpoints ----
@app.get('/api/portfolio')
def api_get_portfolio():
    return get_portfolio()

@app.post('/api/portfolio')
def api_post_portfolio(payload: dict):
    return save_portfolio(payload)

@app.get('/api/portfolio/analysis')
def api_portfolio_analysis():
    return analyze_portfolio()

import os
from apscheduler.schedulers.background import BackgroundScheduler
from twilio.rest import Client
from services.portfolio_service import get_portfolio
from services.yfinance_service import get_quote

_last_alert = {}

def start_alert_scheduler():
    acc = os.getenv('TWILIO_ACCOUNT_SID')
    tok = os.getenv('TWILIO_AUTH_TOKEN')
    from_num = os.getenv('TWILIO_FROM')
    to_num = os.getenv('ALERT_TO_PHONE')
    if not (acc and tok and from_num and to_num):
        print("Twilio not configured; SMS alerts disabled.")
        return

    client = Client(acc, tok)

    def job():
        p = get_portfolio()
        for h in p.get('holdings', []):
            t = h['ticker'].upper()
            pct = float(h.get('alert_drop_pct', 0) or 0)
            base = h.get('alert_base','close')
            if pct <= 0:
                continue
            q = get_quote(t)
            cur = q.get('last_price')
            prev_close = q.get('year_low')  # placeholder; yfinance fast_info lacks prev close reliably here
            # safer: use last_price baseline from fast_info; we treat "base==close" as previous close via get_history if needed.
            # For simplicity, we just compare against last_price checkpoint saved in _last_alert once.
            key = f"{t}:{pct}:{base}"
            baseline = _last_alert.get(key, cur)
            if cur is None:
                continue
            # trigger if drop from baseline >= pct
            if baseline and cur <= baseline * (1.0 - pct/100.0):
                msg = f"[SmartTrader] {t} dropped {pct}% from baseline {baseline:.2f} → {cur:.2f}."
                try:
                    client.messages.create(from_=from_num, to=to_num, body=msg)
                except Exception as e:
                    print("Twilio send failed:", e)
                _last_alert[key] = cur  # reset baseline to current to prevent spam

    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(job, 'interval', minutes=5, id='price_drop_watch', replace_existing=True)
    scheduler.start()

# start scheduler on import
try:
    start_alert_scheduler()
except Exception as e:
    print("Scheduler start error:", e)


# ---- Analytics endpoints ----
@app.get('/api/portfolio/report')
def api_portfolio_report(days: int = 365*3, benchmark: str = "^GSPC"):
    return build_report(days=days, benchmark=benchmark)

@app.get('/api/portfolio/series')
def api_portfolio_series(days: int = 365*3, benchmark: str = "^GSPC"):
    return compute_portfolio_series(days=days, benchmark=benchmark)
