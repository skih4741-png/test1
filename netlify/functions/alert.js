
import fetch from 'node-fetch';
import { createClient } from 'https://esm.sh/@netlify/blobs@6.4.0';
import Twilio from 'https://esm.sh/twilio@4.24.0';
import { json } from './_util.mjs';

const BLOB_NAME = 'alerts.json';

function toE164KR(input){
  if (!input) return null;
  const d = String(input).replace(/\D/g,'');
  if (String(input).trim().startsWith('+82')) return '+82' + d.replace(/^82/, '');
  if (d.startsWith('82')) return '+' + d;
  if (d.startsWith('0')) return '+82' + d.slice(1);
  if (d.length===10 || d.length===11) return '+82' + d;
  return '+82' + d;
}

async function loadAlerts(){
  const client = createClient({ token: process.env.NETLIFY_BLOBS_TOKEN });
  const store = client.store('smart-trader');
  const text = await store.get(BLOB_NAME, {type:'text'});
  return text ? JSON.parse(text) : [];
}
async function saveAlerts(arr){
  const client = createClient({ token: process.env.NETLIFY_BLOBS_TOKEN });
  const store = client.store('smart-trader');
  await store.set(BLOB_NAME, JSON.stringify(arr));
}

async function yahooPrice(ticker){
  const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`);
  const j = await r.json();
  const q = j.quoteResponse.result[0] || {};
  return q.regularMarketPrice;
}

async function sendSMS(msg, toOne){
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const toList = toOne ? [toOne] : (process.env.ALERT_TO_LIST||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!sid||!token||!from||toList.length===0) return;
  const tw = Twilio(sid, token);
  await Promise.all(toList.map(to => tw.messages.create({from, to, body: msg})));
}

export default async (req) => {
  if (req.method === 'POST'){
    const body = await req.json();
    let {ticker, drop, phone} = body;
    phone = toE164KR(phone);
    const arr = await loadAlerts();
    const exists = arr.find(a=>a.ticker===ticker);
    const price = await yahooPrice(ticker);
    if (exists){ exists.drop=drop; exists.base=price; exists.phone = phone || exists.phone; }
    else arr.push({ticker, drop, base:price, phone});
    await saveAlerts(arr);
    return json({message:`저장됨: ${ticker} 기준가격 ${price}, 하락 ${drop}%`, phone});
  }
  const arr = await loadAlerts();
  for (const a of arr){
    const price = await yahooPrice(a.ticker);
    if (price <= a.base * (1 - a.drop/100)){
      await sendSMS(`[SmartTrader] ${a.ticker} ${a.drop}% 하락 트리거: 현재 ${price} (기준 ${a.base})`, a.phone);
      a.base = price;
    }
  }
  await saveAlerts(arr);
  return json({ok:true, count: arr.length});
}
