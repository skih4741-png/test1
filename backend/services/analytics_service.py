
from __future__ import annotations
from typing import Dict, Any, List, Tuple
import numpy as np
import pandas as pd
import yfinance as yf
from .portfolio_service import get_portfolio
from .yfinance_service import get_quote

def get_sector(ticker: str) -> str:
    try:
        info = yf.Ticker(ticker).info or {}
        sec = info.get('sector') or info.get('industry') or 'Unknown'
        return sec
    except Exception:
        return 'Unknown'

def sector_weights(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # rows should include mv_krw
    total = sum([r.get('mv_krw',0.0) for r in rows]) or 0.0
    buckets = {}
    for r in rows:
        sec = get_sector(r['ticker'])
        buckets[sec] = buckets.get(sec, 0.0) + r.get('mv_krw',0.0)
    out = []
    for sec, mv in buckets.items():
        w = (mv/total*100.0) if total>0 else 0.0
        out.append({"sector": sec, "weight_pct": w, "mv_krw": mv})
    out.sort(key=lambda x: x['weight_pct'], reverse=True)
    return out

def _returns(prices: pd.Series) -> pd.Series:
    return prices.pct_change().dropna()

def _max_dd(series: pd.Series) -> Tuple[float, float, str, str]:
    # series is cumulative equity line
    cummax = series.cummax()
    dd = series / cummax - 1.0
    mdd = dd.min() if not dd.empty else 0.0
    end = dd.idxmin() if not dd.empty else None
    start = (series.loc[:end].idxmax() if end is not None else None)
    return float(mdd), float(dd.mean() if not dd.empty else 0.0), str(start) if start is not None else "", str(end) if end is not None else ""

def compute_portfolio_series(days: int = 365*3, benchmark: str = "^GSPC") -> Dict[str, Any]:
    p = get_portfolio()
    holds = p.get('holdings', [])
    if not holds:
        return {"error":"no holdings"}

    # pull price history for tickers
    tickers = [h['ticker'].upper() for h in holds]
    hist = yf.download(tickers, period=f"{days}d", interval="1d", auto_adjust=True, progress=False)['Close']
    if isinstance(hist, pd.Series):
        hist = hist.to_frame()
    hist = hist.dropna(how='all').fillna(method='ffill')

    # weights by market value using latest price
    latest = hist.dropna().iloc[-1]
    qty = {h['ticker'].upper(): float(h.get('shares',0)) for h in holds}
    mv = {}
    for t in tickers:
        px = latest.get(t, np.nan)
        if pd.isna(px): continue
        mv[t] = px * qty.get(t,0.0)
    total_mv = sum(mv.values()) or 1.0
    w = {t: (mv.get(t,0.0)/total_mv) for t in tickers}

    # portfolio daily return
    ret_df = hist.pct_change().dropna()
    p_ret = sum([ret_df[t].fillna(0.0) * w.get(t,0.0) for t in ret_df.columns])

    # equity line (start at 1.0)
    equity = (1.0 + p_ret).cumprod()

    # benchmark
    bh = yf.download(benchmark, period=f"{days}d", interval="1d", auto_adjust=True, progress=False)['Close'].dropna()
    b_ret = bh.pct_change().dropna()
    b_equity = (1.0 + b_ret).cumprod()

    # align
    df = pd.DataFrame({"portfolio": equity, "benchmark": b_equity}).dropna()

    # risk metrics
    rf = 0.0/100.0  # risk-free rate placeholder
    ann_factor = 252.0
    p_ann_vol = df['portfolio'].pct_change().std() * np.sqrt(ann_factor)
    b_ann_vol = df['benchmark'].pct_change().std() * np.sqrt(ann_factor)

    p_cagr = df['portfolio'].iloc[-1]**(ann_factor/len(df)) - 1.0
    b_cagr = df['benchmark'].iloc[-1]**(ann_factor/len(df)) - 1.0

    # Sharpe / Sortino
    excess = df['portfolio'].pct_change().dropna() - rf/ann_factor
    neg = excess.copy()
    neg[neg>0]=0
    sharpe = (excess.mean()*ann_factor) / (excess.std()*np.sqrt(ann_factor)) if excess.std()>1e-12 else np.nan
    sortino = (excess.mean()*ann_factor) / (neg.std()*np.sqrt(ann_factor)) if neg.std()>1e-12 else np.nan

    # alpha beta via regression
    import statsmodels.api as sm
    aligned = pd.concat([p_ret, b_ret], axis=1, join='inner').dropna()
    aligned.columns = ['p','b']
    X = sm.add_constant(aligned['b'])
    model = sm.OLS(aligned['p'], X).fit()
    alpha_daily = model.params['const']
    beta = model.params['b']
    alpha_ann = alpha_daily * ann_factor

    # Max drawdown
    mdd, dd_mean, start, end = _max_dd(df['portfolio'])

    out = {
        "weights": w,
        "series": {
            "portfolio_equity": df['portfolio'].round(6).to_dict(),
            "benchmark_equity": df['benchmark'].round(6).to_dict()
        },
        "metrics": {
            "CAGR": float(p_cagr),
            "Volatility_Ann": float(p_ann_vol),
            "Sharpe": float(sharpe) if sharpe==sharpe else None,
            "Sortino": float(sortino) if sortino==sortino else None,
            "Alpha_Ann": float(alpha_ann),
            "Beta": float(beta),
            "MaxDrawdown": float(mdd),
            "MeanDrawdown": float(dd_mean)
        }
    }
    return out

def build_report(days: int = 365*3, benchmark: str = "^GSPC") -> Dict[str, Any]:
    from .portfolio_service import analyze_portfolio
    base = analyze_portfolio()
    sectors = sector_weights(base['rows'])
    perf = compute_portfolio_series(days=days, benchmark=benchmark)
    report = {
        "summary": base["summary"],
        "sectors": sectors,
        "performance": perf["metrics"],
        "weights": perf["weights"]
    }
    return report
