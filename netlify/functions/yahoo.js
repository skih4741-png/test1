
import fetch from 'node-fetch';
import { json } from './_util.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const f = url.searchParams.get('f');
  const ticker = url.searchParams.get('ticker');
  try{
    if (f === 'quote'){
      const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`);
      const j = await r.json();
      const q = j.quoteResponse.result[0] || {};
      return json({ price: q.regularMarketPrice, currency: q.currency, name:q.shortName });
    }
    if (f === 'chart'){
      const range = url.searchParams.get('range') || '6mo';
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`);
      const j = await r.json();
      const c = j.chart.result[0];
      const prices = c.indicators.quote[0].close;
      const timestamps = c.timestamp;
      function rsi(vals, period=14){
        let gains=0, losses=0; let rsis=[];
        for (let i=1;i<vals.length;i++){
          const ch = vals[i]-vals[i-1];
          if (i<=period){ if(ch>0)gains+=ch; else losses-=ch; rsis.push(null); continue; }
          if (ch>0){ gains = (gains*(period-1)+ch)/period; losses = (losses*(period-1)+0)/period; }
          else { gains = (gains*(period-1)+0)/period; losses = (losses*(period-1)-ch)/period; }
          const rs = gains/(losses||1e-9); rsis.push(100 - 100/(1+rs));
        }
        return rsis;
      }
      const rsiArr = rsi(prices);
      const lastRSI = rsiArr[rsiArr.length-1];
      let signal = '';
      if (lastRSI<=30) signal = 'RSI 과매도 → 매수 관심 구간';
      else if (lastRSI>=70) signal = 'RSI 과매수 → 매도/차익 고려';
      return json({timestamps, prices, rsi:lastRSI, signal});
    }
    if (f === 'dividends'){
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d&events=div`);
      const j = await r.json();
      const c = j.chart.result[0];
      const events = (c?.events?.dividends) || {};
      const items = Object.values(events).map(d=>({amount:d.amount, date:d.date}));
      const total = items.reduce((a,b)=>a+b.amount,0);
      return json({items, total});
    }
    return json({error:'unknown f'},400);
  }catch(e){ return json({error:String(e)} ,500); }
}
