from typing import List, Dict, Any, Optional
from .yfinance_service import get_fundamentals

BUFFETT_PRESET = {
    'pbr_max': 1.5,
    'psr_max': 3.0,
    'roe_min': 15.0,
    'pe_max': 15.0,
}

def screen_tickers(
    tickers: List[str],
    roe_min: Optional[float] = None,
    pe_max: Optional[float] = None,
    pbr_max: Optional[float] = None,
    psr_max: Optional[float] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    preset: Optional[str] = None,
):
    if preset == 'buffett':
        cfg = BUFFETT_PRESET
        roe_min = cfg['roe_min']
        pe_max = cfg['pe_max']
        pbr_max = cfg['pbr_max']
        psr_max = cfg['psr_max']

    results = []
    for t in tickers:
        f = get_fundamentals(t) or {}
        roe = f.get('roe')
        pe  = f.get('pe')
        pbr = f.get('pbr')
        psr = f.get('psr')
        price = f.get('last_price')

        # price range check
        if min_price is not None and (price is None or price < min_price):
            continue
        if max_price is not None and (price is None or price > max_price):
            continue

        # apply thresholds
        conds = []
        if roe_min is not None: conds.append(roe is not None and float(roe) >= float(roe_min))
        if pe_max  is not None: conds.append(pe  is not None and float(pe)  <= float(pe_max))
        if pbr_max is not None: conds.append(pbr is not None and float(pbr) <= float(pbr_max))
        if psr_max is not None: conds.append(psr is not None and float(psr) <= float(psr_max))

        if all(conds) if conds else True:
            results.append({'ticker': t, 'roe': roe, 'pe': pe, 'pbr': pbr, 'psr': psr, 'last_price': price})

    results.sort(key=lambda x: (x['roe'] is not None, x['roe']), reverse=True)
    return results
