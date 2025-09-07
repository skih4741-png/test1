
const { json } = require('./_util.js');

function toE164KR(input){
  if (!input) return null;
  const d = String(input).replace(/\D/g,'');
  if (String(input).trim().startsWith('+82')) return '+82' + d.replace(/^82/, '');
  if (d.startsWith('82')) return '+' + d;
  if (d.startsWith('0')) return '+82' + d.slice(1);
  if (d.length===10 || d.length===11) return '+82' + d;
  return '+82' + d;
}

async function blobsList(){
  const url = process.env.NETLIFY_BLOBS_URL;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const r = await fetch(`${url}/smart-trader/`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.blobs||[]).filter(x=>x.key.startsWith('alerts/')).map(x=>x.key);
}
async function blobsGet(key){
  const url = process.env.NETLIFY_BLOBS_URL;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const r = await fetch(`${url}/smart-trader/${key}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status===404) return null;
  const j = await r.json();
  return j;
}
async function blobsPut(key, val){
  const url = process.env.NETLIFY_BLOBS_URL;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const r = await fetch(`${url}/smart-trader/${key}`, {
    method:'PUT',
    headers: { Authorization: `Bearer ${token}`, 'content-type':'application/json' },
    body: JSON.stringify(val)
  });
  return r.ok;
}
async function blobsDelete(key){
  const url = process.env.NETLIFY_BLOBS_URL;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const r = await fetch(`${url}/smart-trader/${key}`, {
    method:'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  return r.ok;
}

async function twilioSMS(body, toOne){
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const toList = toOne ? [toOne] : (process.env.ALERT_TO_LIST||'').split(',').map(s=>s.trim()).filter(Boolean);
  if (!sid || !token || !from || toList.length===0) return;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  await Promise.all(toList.map(to => fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method:'POST',
    headers:{ 'Authorization':`Basic ${auth}`, 'content-type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: to, Body: body })
  })));
}

async function yahooQuote(ticker){
  const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`);
  const j = await r.json();
  const q = j.quoteResponse?.result?.[0] || {};
  return { price: q.regularMarketPrice, prevClose: q.regularMarketPreviousClose, name:q.shortName, currency:q.currency };
}

exports.handler = async (event)=>{
  const url = new URL(event.rawUrl || event.url);
  const action = url.searchParams.get('action') || 'list';

  // save: ?action=save&ticker=MO&drop=1&contact=010...&base=49.5
  if (action === 'save'){
    const ticker = (url.searchParams.get('ticker')||'').toUpperCase();
    const drop = parseFloat(url.searchParams.get('drop')||'0');
    const contact = toE164KR(url.searchParams.get('contact')||'');
    const base = parseFloat(url.searchParams.get('base')||'0');
    if (!ticker || !drop || !contact || !base) return json({ ok:false, error:'Missing params' }, 400);
    const key = `alerts/${ticker}-${Date.now()}`;
    await blobsPut(key, { ticker, drop, contact, base });
    return json({ ok:true, key });
  }

  // list
  if (action === 'list'){
    const keys = await blobsList();
    const items = await Promise.all(keys.map(k=>blobsGet(k)));
    return json({ items: items.filter(Boolean) });
  }

  // delete: ?action=del&key=alerts/...
  if (action === 'del'){
    const key = url.searchParams.get('key');
    if (!key) return json({ ok:false }, 400);
    await blobsDelete(key);
    return json({ ok:true });
  }

  // run: check all alerts and send SMS
  if (action === 'run'){
    const keys = await blobsList();
    const alerts = (await Promise.all(keys.map(k=>blobsGet(k)))).filter(Boolean);
    const byTicker = alerts.reduce((m,a)=>{ (m[a.ticker]??=[]).push(a); return m; }, {});
    for (const [t, arr] of Object.entries(byTicker)){
      const q = await yahooQuote(t);
      for (const a of arr){
        const threshold = a.base * (1 - a.drop/100);
        if (q.price !== undefined && q.price <= threshold){
          const body = `[SmartTrader] ${t} 현재가 ${q.price}(${q.currency}) ≤ 기준가 ${threshold.toFixed(2)}(${a.drop}% 하락) - ${q.name||''}`;
          await twilioSMS(body, a.contact);
        }
      }
    }
    return json({ ok:true, checked: alerts.length });
  }

  return json({ error:'unknown action' }, 400);
};
