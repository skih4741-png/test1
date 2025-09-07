import fetch from "node-fetch";

async function sendSMS(to, msg){
  if(!process.env.TWILIO_ACCOUNT_SID) return false;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({To: to, From: from, Body: msg}).toString();
  const r = await fetch(url, {method:'POST', headers:{'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type':'application/x-www-form-urlencoded'}, body});
  return r.ok;
}

let cached = []; // Note: reset on each cold start

export const handler = async ()=>{
  // In a real app, read from durable store (e.g., D1 / KV / Supabase). Here we skip.
  if(!cached.length) return {statusCode:200, body:"no alerts"};
  const results = [];
  for(const a of cached){
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.sym)}?range=1d&interval=1m`;
    try{
      const r = await fetch(url); const j = await r.json();
      const c = j.chart.result[0].indicators.quote[0].close.filter(Boolean);
      const open = c[0], last = c.at(-1);
      const drop = (1 - last/open)*100;
      if(drop >= a.thr){
        if(a.phone) await sendSMS(a.phone, `[SmartTrader] ${a.sym} ${drop.toFixed(2)}% 하락`);
        results.push({sym:a.sym, drop});
      }
    }catch{}
  }
  return {statusCode:200, body: JSON.stringify({triggered: results})};
};
