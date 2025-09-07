
const { json } = require('./_util.js');

async function fetchJSON(url, opts={}){
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

async function quoteYahoo(ticker){
  const u = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`;
  const j = await fetchJSON(u, { headers: { 'user-agent':'Mozilla/5.0' } });
  const q = j.quoteResponse?.result?.[0] || {};
  return {
    price: q.regularMarketPrice,
    name: q.shortName || q.longName || ticker,
    currency: q.currency || null,
    exchange: q.fullExchangeName || q.exchange || null,
    marketCap: q.marketCap || null,
    sector: q.sector || null
  };
}

// FX fallback: exchangerate.host (USD base to KRW)
async function fxFallback(ticker){
  // supports USDKRW=X, USDKRW, KRW=X forms
  const m = /USDKRW/i.test(ticker);
  if (!m) return null;
  const j = await fetchJSON('https://api.exchangerate.host/latest?base=USD&symbols=KRW');
  const price = j?.rates?.KRW;
  if (!price) return null;
  return { price, name: 'USD/KRW', currency: 'KRW', exchange: 'exchangerate.host' };
}

exports.handler = async (event)=>{
  try{
    const url = new URL(event.rawUrl || event.url);
    const f = (url.searchParams.get('f')||'quote').toLowerCase();
    const ticker = (url.searchParams.get('ticker')||'').toUpperCase();

    if (f === 'quote'){
      try{
        const q = await quoteYahoo(ticker);
        // If yahoo didn't provide price for FX, try fallback
        if ((q.price === undefined || q.price === null) && /USDKRW/i.test(ticker)){
          const fb = await fxFallback(ticker);
          if (fb) return json(fb);
        }
        return json(q);
      }catch(e){
        // Yahoo failed → FX fallback if applicable
        if (/USDKRW/i.test(ticker)){
          try{
            const fb = await fxFallback(ticker);
            if (fb) return json(fb);
          }catch(_){} // ignore
        }
        return json({ error: 'quote_failed', detail: String(e) });
      }
    }

    if (f === 'dividends'){
      const range = url.searchParams.get('range') || '12y';
      // Yahoo chart API with events=div
      const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=1d&events=div`;
      try{
        const j = await fetchJSON(u, { headers: { 'user-agent':'Mozilla/5.0' } });
        const ev = j.chart?.result?.[0]?.events?.dividends || {};
        const items = Object.values(ev).map(x => ({ ts: Math.floor(x.date), amount: Number(x.amount) }));
        return json({ items });
      }catch(e){
        return json({ items: [], error: 'dividends_failed', detail: String(e) });
      }
    }

    if (f === 'chart'){
      const range = url.searchParams.get('range') || '6mo';
      const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}&interval=1d`;
      try{
        const j = await fetchJSON(u, { headers: { 'user-agent':'Mozilla/5.0' } });
        const res = j.chart?.result?.[0];
        const prices = (res?.indicators?.quote?.[0]?.close || []).map(v => (v===null? null : Number(v)));
        return json({ prices });
      }catch(e){
        return json({ prices: [], error: 'chart_failed', detail: String(e) });
      }
    }

    if (f === 'profile' || f === 'summary'){
      // Use quote endpoint fields; Macrotrends/dataroma give fundamentals elsewhere
      try{
        const q = await quoteYahoo(ticker);
        return json(q);
      }catch(e){
        return json({ error:'profile_failed', detail: String(e) });
      }
    }

    return json({ error:'unknown_function' }, 400);
  }catch(e){
    return json({ error:'server_error', detail: String(e) });
  }
};
