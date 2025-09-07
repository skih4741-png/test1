
from __future__ import annotations
from typing import Dict, Any, List
import json, os, math, time
from .yfinance_service import get_quote, get_dividends
import yfinance as yf
import pandas as pd

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'portfolio.json')

def _read() -> Dict[str, Any]:
    if not os.path.exists(DATA_PATH):
        return {"base_currency":"KRW","fx_pair":"KRW=X","holdings":[]}
    with open(DATA_PATH,'r') as f:
        return json.load(f)

def _write(obj: Dict[str, Any]):
    with open(DATA_PATH,'w') as f:
        json.dump(obj,f,indent=2)

def get_portfolio() -> Dict[str, Any]:
    return _read()

def save_portfolio(obj: Dict[str, Any]) -> Dict[str, Any]:
    _write(obj)
    return {"ok": True}

def analyze_portfolio() -> Dict[str, Any]:
    p = _read()
    fx_pair = p.get("fx_pair","KRW=X")
    fx = None
    try:
        fxq = get_quote(fx_pair)
        fx = fxq.get('last_price') or 1300.0
    except Exception:
        fx = 1300.0

    commission_bps = float(p.get("commission_bps", 0))
    tax_rate_div = float(p.get("tax_rate_dividend", 0.0))

    rows: List[Dict[str,Any]] = []
    total_cost_krw = 0.0
    total_mv_krw = 0.0
    total_div_krw = 0.0

    for h in p.get("holdings", []):
        t = h["ticker"].upper()
        q = float(h.get("shares",0))
        avg = float(h.get("avg_cost",0.0))
        currency = h.get("currency","USD")

        qinfo = get_quote(t)
        px = qinfo.get("last_price") or avg
        # simple currency conversion: assume USD base if not KRW
        rate = fx if currency.upper()=='USD' and p.get('base_currency','KRW').upper()=='KRW' else 1.0

        cost = q * avg
        mv = q * px
        # commission roughly applied on round-trip
        fees = (cost + mv) * (commission_bps/10000.0)

        # trailing 12m dividend
        divs = get_dividends(t)
        trailing_div = 0.0
        if isinstance(divs, pd.Series) and not divs.empty:
            last12 = divs[divs.index >= (divs.index.max() - pd.DateOffset(years=1))]
            trailing_div = float(last12.sum()) * q

        after_tax_div = trailing_div * (1.0 - tax_rate_div)

        pnl = (mv - cost) - fees
        pnl_pct = (pnl / cost * 100.0) if cost>0 else 0.0
        yoc = (after_tax_div / cost * 100.0) if cost>0 else None
        current_yield = ( (trailing_div / mv * 100.0) if mv>0 else None )

        row = {
            "ticker": t,
            "shares": q,
            "avg_cost": avg,
            "price": px,
            "mv": mv,
            "cost": cost,
            "pnl": pnl,
            "pnl_pct": pnl_pct,
            "div_ttm": trailing_div,
            "div_after_tax": after_tax_div,
            "yoc_pct": yoc,
            "current_yield_pct": current_yield,
            "currency": currency,
            "fx_applied": rate,
            "mv_krw": mv*rate,
            "cost_krw": cost*rate,
            "div_after_tax_krw": after_tax_div*rate
        }
        rows.append(row)
        total_cost_krw += row["cost_krw"]
        total_mv_krw += row["mv_krw"]
        total_div_krw += row["div_after_tax_krw"]

    total_pnl_krw = total_mv_krw - total_cost_krw
    res = {
        "base_currency": p.get("base_currency","KRW"),
        "fx_pair": fx_pair,
        "fx": fx,
        "summary": {
            "total_cost_krw": total_cost_krw,
            "total_mv_krw": total_mv_krw,
            "total_pnl_krw": total_pnl_krw,
            "total_pnl_pct": (total_pnl_krw/total_cost_krw*100.0) if total_cost_krw>0 else 0.0,
            "after_tax_div_krw": total_div_krw
        },
        "rows": rows
    }
    return res
