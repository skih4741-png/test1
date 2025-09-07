import fetch from "node-fetch";

export const handler = async (event)=>{
  const {symbol, tax='15'} = event.queryStringParameters||{};
  if(!symbol) return {statusCode:400, body:"symbol required"};
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?events=div&range=2y&interval=1d`;
  const r = await fetch(url); const j = await r.json();
  const res = j.chart?.result?.[0];
  const events = res?.events?.dividends || {};
  const items = Object.values(events).map(e=>({ts:e.date*1000, amount:e.amount}));
  const monthly = {}; // month => after tax
  items.forEach(d=>{
    const m = new Date(d.ts).getMonth()+1;
    const after = d.amount*(1-Number(tax)/100);
    monthly[m] = (monthly[m]||0) + after;
  });
  return {statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({items, monthly})};
};
