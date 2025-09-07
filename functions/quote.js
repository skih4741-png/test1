import fetch from "node-fetch";

function rsi14(closes){
  let gains=0, losses=0;
  for(let i=1;i<15;i++){
    const ch = closes[i]-closes[i-1];
    if(ch>=0) gains+=ch; else losses+=-ch;
  }
  let avgG=gains/14, avgL=losses/14;
  for(let i=15;i<closes.length;i++){
    const ch = closes[i]-closes[i-1];
    if(ch>=0){ avgG=(avgG*13+ch)/14; avgL=(avgL*13)/14; }
    else { avgG=(avgG*13)/14; avgL=(avgL*13 + (-ch))/14; }
  }
  const rs = avgL===0?1000:avgG/avgL;
  return 100 - (100/(1+rs));
}
const sma = (arr, n)=>{
  const out=[]; let sum=0;
  for(let i=0;i<arr.length;i++){
    sum += arr[i]; if(i>=n) sum -= arr[i-n];
    if(i>=n-1) out.push(sum/n);
  } return out.at(-1);
};
function bollinger(arr, n=20, k=2){
  const window = arr.slice(-n);
  const mean = window.reduce((a,b)=>a+b,0)/n;
  const sd = Math.sqrt(window.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n);
  return {upper: mean+k*sd, lower: mean-k*sd};
}

export const handler = async (event)=>{
  const {symbol} = event.queryStringParameters||{};
  if(!symbol) return {statusCode:400, body:"symbol required"};

  // Yahoo "chart" endpoint (public)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`;
  const r = await fetch(url);
  if(!r.ok) return {statusCode:r.status, body:"yahoo failed"};
  const j = await r.json();
  const result = j.chart?.result?.[0];
  const close = result.indicators.quote[0].close.filter(Boolean);
  const time = result.timestamp.map(t=>t*1000);
  const price = close.at(-1);

  const rsi = rsi14(close);
  const smaFast = sma(close, 20);
  const smaSlow = sma(close, 50);
  const bb = bollinger(close, 20, 2);

  const history = time.map((t,i)=>({t, c: close[i]})).filter(x=>x.c!=null);

  return {
    statusCode:200,
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({price, rsi, smaFast, smaSlow, bb, history})
  };
};
