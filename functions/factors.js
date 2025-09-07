import fetch from "node-fetch";

export const handler = async (event)=>{
  const {symbol} = event.queryStringParameters||{};
  if(!symbol) return {statusCode:400, body:"symbol required"};
  const base = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const r = await fetch(base); if(!r.ok) return {statusCode:r.status, body:"yahoo failed"};
  const j = await r.json();
  const res = j.chart?.result?.[0];
  const c = res.indicators.quote[0].close.filter(Boolean);
  const start = c[0], end = c.at(-1);
  const oneY = (end/start - 1)*100;
  const ytd = oneY; // proxy
  // Dividend yield & PBR via Yahoo summary (approx scrape)
  const sumUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics`;
  const s = await fetch(sumUrl); const sj = await s.json();
  const sd = sj.quoteSummary?.result?.[0]?.summaryDetail || {};
  const ks = sj.quoteSummary?.result?.[0]?.defaultKeyStatistics || {};
  const divYld = sd.dividendYield?.raw ? sd.dividendYield.raw*100 : 0;
  const pbr = ks.priceToBook?.raw || 0;
  // Volatility: stdev of daily returns
  const rets = c.slice(1).map((x,i)=>x/c[i]-1);
  const mean = rets.reduce((a,b)=>a+b,0)/rets.length;
  const vol = Math.sqrt(rets.reduce((a,b)=>a+(b-mean)*(b-mean),0)/rets.length)*100;
  return {statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ytd, oneY, divYld, pbr, volatility:vol})};
};
