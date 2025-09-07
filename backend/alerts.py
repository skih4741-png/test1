import os
from apscheduler.schedulers.background import BackgroundScheduler
from twilio.rest import Client
from .services.yfinance_service import get_quote

def start_alerts():
    tickers = [t.strip().upper() for t in os.getenv('ALERT_TICKERS','').split(',') if t.strip()]
    drop_pct = float(os.getenv('ALERT_DROP_PCT','5'))
    if not tickers:
        return None

    client = None
    sid = os.getenv('TWILIO_ACCOUNT_SID')
    tok = os.getenv('TWILIO_AUTH_TOKEN')
    from_ = os.getenv('TWILIO_FROM')
    to_ = os.getenv('ALERT_TO_PHONE')
    if sid and tok and from_ and to_:
        client = Client(sid, tok)

    ref_prices = {}

    def check():
        for t in tickers:
            q = get_quote(t)
            price = q.get('last_price')
            if price is None:
                continue
            if t not in ref_prices:
                ref_prices[t] = price
                continue
            change = (price - ref_prices[t]) / ref_prices[t] * 100.0
            if change <= -abs(drop_pct):
                msg = f"{t} dropped {change:.2f}% from {ref_prices[t]:.2f} to {price:.2f}"
                if client:
                    client.messages.create(body=msg, from_=from_, to=to_)
                ref_prices[t] = price

    sch = BackgroundScheduler(timezone='Asia/Seoul')
    sch.add_job(check, 'interval', minutes=5, id='price_drop_check', replace_existing=True)
    sch.start()
    return sch
