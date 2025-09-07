
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
async function blobsGet(key){
  const url = process.env.NETLIFY_BLOBS_URL;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const r = await fetch(`${url}/smart-trader/${key}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}
async function blobsSet(key, obj){
  const url = process.env.NETLIFY_BLOBS_URL;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  await fetch(`${url}/smart-trader/${key}`, { method:'PUT', headers:{ Authorization:`Bearer ${token}`, 'content-type':'application/json' }, body: JSON.stringify(obj) });
}
async function yahooPrice(ticker){
  const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`);
  const j = await r.json();
  const q = j.quoteResponse.result[0] || {};
  return q.regularMarketPrice;
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

exports.handler = async (event) => {
  async function getAll(){ return (await blobsGet('alerts.json')) || []; }
  async function saveAll(arr){ await blobsSet('alerts.json', arr); }

  if (event.httpMethod === 'GET'){
    const items = await getAll();
    return json({items});
  }
  if (event.httpMethod === 'DELETE'){
    const url = new URL(event.rawUrl || event.url);
    const ticker = (url.searchParams.get('ticker')||'').toUpperCase();
    if(!ticker) return json({error:'ticker required'},400);
    const items = await getAll();
    const next = items.filter(a => a.ticker !== ticker);
    await saveAll(next);
    return json({ok:true, count: next.length});
  }
  if (event.httpMethod === 'POST'){
    const body = JSON.parse(event.body||'{}');
    let {ticker, drop, phone} = body;
    phone = toE164KR(phone);
    ticker = (ticker||'').toUpperCase();
    if(!ticker || !drop) return json({error:'ticker/drop required'},400);

    const arr = await getAll();
    const price = await yahooPrice(ticker);
    const found = arr.find(a=>a.ticker===ticker);
    if (found){ found.drop = drop; found.base = price; found.phone = phone || found.phone; }
    else arr.push({ticker, drop, base: price, phone});
    await saveAll(arr);
    return json({message:`저장됨: ${ticker} 기준 ${price} 하락 ${drop}%`, phone});
  }

  // Scheduled run
  const arr = await getAll();
  for (const a of arr){
    const price = await yahooPrice(a.ticker);
    if (price <= a.base * (1 - a.drop/100)){
      await twilioSMS(`[SmartTrader] ${a.ticker} ${a.drop}% 하락: 현재 ${price} (기준 ${a.base})`, a.phone);
      a.base = price;
    }
  }
  await saveAll(arr);
  return json({ok:true, count: arr.length});
}
