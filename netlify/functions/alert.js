
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
  const r = await fetch(`${url}/smart-trader/${key}`, { method:'DELETE', headers: { Authorization: `Bearer ${token}` } });
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
  return { price: q.regularMarketPrice, name:q.shortName, currency:q.currency };
}

exports.handler = async (event)=>{
  const method = (event.httpMethod||'GET').toUpperCase();
  const url = new URL(event.rawUrl || event.url);
  const action = url.searchParams.get('action');

  // CRON/RUN
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

  // LIST (GET /alert)
  if (method === 'GET' && !action){
    const keys = await blobsList();
    const items = await Promise.all(keys.map(k=>blobsGet(k)));
    return json({ items: items.filter(Boolean) });
  }

  // SAVE (POST /alert  body: {ticker, drop, phone})
  if (method === 'POST'){
    try{
      const body = JSON.parse(event.body||'{}');
      const ticker = String(body.ticker||'').toUpperCase();
      const drop = parseFloat(body.drop||'0');
      const contact = toE164KR(body.phone||body.contact||'');
      if(!ticker || !drop || !contact) return json({ok:false, error:'Missing params'},400);
      const q = await yahooQuote(ticker);
      const base = q.price;
      const key = `alerts/${ticker}-${Date.now()}`;
      await blobsPut(key, { ticker, drop, contact, base });
      return json({ ok:true, key });
    }catch(e){
      return json({ ok:false, error:String(e) }, 400);
    }
  }

  // DELETE (DELETE /alert?ticker=MO or ?key=alerts/...)
  if (method === 'DELETE'){
    const key = url.searchParams.get('key');
    const ticker = (url.searchParams.get('ticker')||'').toUpperCase();
    if (key){
      await blobsDelete(key);
      return json({ ok:true });
    }
    if (ticker){
      const keys = await blobsList();
      const dels = keys.filter(k=>k.includes(`/${ticker}-`));
      await Promise.all(dels.map(blobsDelete));
      return json({ ok:true, deleted: dels.length });
    }
    return json({ ok:false, error:'Missing key or ticker' }, 400);
  }

  // GET legacy action=save&ticker=...&drop=...&contact=...
  if (action === 'save'){
    const ticker = (url.searchParams.get('ticker')||'').toUpperCase();
    const drop = parseFloat(url.searchParams.get('drop')||'0');
    const contact = toE164KR(url.searchParams.get('contact')||'');
    if (!ticker || !drop || !contact) return json({ ok:false, error:'Missing params' }, 400);
    const q = await yahooQuote(ticker);
    const base = q.price;
    const key = `alerts/${ticker}-${Date.now()}`;
    await blobsPut(key, { ticker, drop, contact, base });
    return json({ ok:true, key });
  }

  return json({ error:'unsupported request' }, 400);
};
