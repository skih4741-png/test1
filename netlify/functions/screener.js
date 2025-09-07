
const { json } = require('./_util.js');

async function call(fn, qs){
  const url = `${process.env.URL || ''}/.netlify/functions/${fn}${qs}`; // local/production both
  const r = await fetch(url);
  if (!r.ok) throw new Error(fn+' '+r.status);
  return r.json();
}

async function getUniverse(tickersParam){
  if (tickersParam){
    return tickersParam.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean).slice(0, 120);
  }
  // fallback: Dataroma top holdings
  try{
    const dr = await call('dataroma', '');
    const list = (dr.tickers || dr || []).map(x => (x.ticker||x).toUpperCase());
    return Array.from(new Set(list)).slice(0, 120);
  }catch(e){
    return ['AAPL','MSFT','GOOGL','AMZN','META','NVDA']; // safe fallback
  }
}

async function enrichOne(t){
  try{
    const [mt, yh] = await Promise.all([
      call('macrotrends', `?ticker=${encodeURIComponent(t)}`),
      call('yahoo', `?f=quote&ticker=${encodeURIComponent(t)}`),
    ]);
    const per = Number(mt.per);
    const pbr = Number(mt.pbr);
    const psr = Number(mt.psr);
    const roe = Number(mt.roe);
    const price = Number(yh.price);
    return {
      ticker: t,
      price,
      per: isFinite(per)? per : null,
      pbr: isFinite(pbr)? pbr : null,
      psr: isFinite(psr)? psr : null,
      roe: isFinite(roe)? roe : null,
      sector: yh.sector || '',
      marketCap: yh.marketCap || yh.marketcap || null
    };
  }catch(e){
    return { ticker: t, error: String(e) };
  }
}

exports.handler = async (event)=>{
  const url = new URL(event.rawUrl || event.url);
  const tickersParam = url.searchParams.get('tickers');
  const universe = await getUniverse(tickersParam);

  const rows = [];
  // process sequentially with small concurrency to avoid remote blocking
  const chunk = 4;
  for (let i=0;i<universe.length;i+=chunk){
    const batch = universe.slice(i,i+chunk);
    const part = await Promise.all(batch.map(enrichOne));
    rows.push(...part);
  }

  // FIXED FILTERS
  const filtered = rows.filter(r =>
    !r.error &&
    r.pbr !== null && r.pbr <= 1.5 &&
    r.psr !== null && r.psr >= 3 &&
    r.roe !== null && r.roe >= 15 &&
    r.per !== null && r.per <= 15
  );

  return json({ total: rows.length, passed: filtered.length, rows: filtered });
};
