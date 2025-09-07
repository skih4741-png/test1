import pandas as pd

def monthly_dividend_table(div_series: pd.Series):
    if div_series is None or div_series.empty:
        return pd.DataFrame(columns=['year','month','dividends'])
    df = div_series.rename('div').to_frame()
    df['year'] = df.index.year
    df['month'] = df.index.month
    table = df.groupby(['year','month'])['div'].sum().reset_index().rename(columns={'div':'dividends'})
    return table

def compute_real_yield(total_shares: float, avg_cost_usd: float, last_price_usd: float, usdkrw: float, annual_dividend_usd: float, tax_rate=0.15, fee_bps=8.0, reinvest=False):
    # fee_bps: round-trip fee in basis points (e.g., 8 bps = 0.08%)
    # tax_rate: withholding on dividends
    invested_usd = total_shares * avg_cost_usd
    market_value_usd = total_shares * last_price_usd
    invested_krw = invested_usd * usdkrw
    market_value_krw = market_value_usd * usdkrw

    net_div_usd = annual_dividend_usd * total_shares * (1 - tax_rate)
    net_div_krw = net_div_usd * usdkrw

    yoc = net_div_usd / invested_usd if invested_usd else 0.0
    current_yield = net_div_usd / market_value_usd if market_value_usd else 0.0

    fee_factor = 1 - (fee_bps/10000.0)
    effective_market_value_krw = market_value_krw * fee_factor

    return {
        'invested_krw': invested_krw,
        'market_value_krw': effective_market_value_krw,
        'net_div_krw': net_div_krw,
        'yoc': yoc,
        'current_yield': current_yield
    }
