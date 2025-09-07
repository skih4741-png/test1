
const { json } = require('./_util.js');
exports.handler = async (event) => {
  const url = new URL(event.rawUrl || event.url);
  const f = url.searchParams.get('f');
  const ticker = url.searchParams.get('ticker');

  try{
    if (f === 'quote'){
      const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`);
      const j = await r.json();
      const q = j.quoteResponse.result[0] || {};
      return json({ price: q.regularMarketPrice, currency: q.currency, name:q.shortName });
    }
    if (f === 'dividends'){
      const range = url.searchParams.get('range') || '10y';
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1mo&events=div`);
      const j = await r.json();
      const c = j.chart?.result?.[0];
      const events = (c?.events?.dividends) || {};
      const items = Object.values(events).map(d=>({amount:d.amount, date:d.date}));
      const total = items.reduce((a,b)=>a+b.amount,0);
      return json({items, total});
    }
    if (f === 'profile'){
      const r = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price,assetProfile`);
      const j = await r.json();
      const res = j.quoteSummary?.result?.[0] || {};
      const marketCap = res.price?.marketCap?.raw ?? null;
      const sector = res.assetProfile?.sector ?? '';
      return json({ marketCap, sector });
    }
    if (f === 'chart'){
      const range = url.searchParams.get('range') || '6mo';
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`);
      const j = await r.json();
      const c = j.chart?.result?.[0];
      const prices = c?.indicators?.quote?.[0]?.close || [];
      const timestamps = c?.timestamp || [];
      return json({timestamps, prices});
    }
    return json({error:'unknown f'},400);
  }catch(e){ return json({error:String(e)},500); }
}
