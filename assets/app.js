
// Tabs
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});


async function fetchFX(){
  // Yahoo Finance FX ticker
  try{
    const r = await fetch("/.netlify/functions/yahoo?f=quote&ticker=USDKRW=X");
    const j = await r.json();
    if (j && j.price){
      document.getElementById('fxInput').value = j.price;
      const info = document.getElementById('fxInfo');
      if (info) info.textContent = `야후 기준 환율 적용: ${j.price.toFixed(2)}₩/USD`;
      return j.price;
    }
  }catch(e){
    const info = document.getElementById('fxInfo');
    if (info) info.textContent = "환율 동기화 실패 — 수동 입력값 사용";
  }
  return parseFloat(document.getElementById('fxInput').value)||1350;
}

// Local Storage
const LS_KEY = 'smarttrader_positions_v1';
const state = { positions: [] };
const tblBody = document.querySelector('#positionsTbl tbody');
function saveLS(){ localStorage.setItem(LS_KEY, JSON.stringify(state.positions)); }
function loadLS(){ const s = localStorage.getItem(LS_KEY); if (s) state.positions = JSON.parse(s); renderPositions(); }
document.getElementById('saveBtn').onclick = saveLS;
document.getElementById('loadBtn').onclick = loadLS;

document.getElementById('loadSample').onclick = () => {
  state.positions = [{ticker:'AAPL', qty:10, avg:180},{ticker:'MSFT', qty:5, avg:380},{ticker:'MO', qty:50, avg:42}];
  renderPositions();
};
document.getElementById('addBtn').onclick = () => {
  const t = document.getElementById('tickerInput').value.trim().toUpperCase();
  const q = parseFloat(document.getElementById('qtyInput').value);
  const a = parseFloat(document.getElementById('avgInput').value);
  if(!t || !q || !a) return alert('티커/수량/평균매입가 입력');
  state.positions.push({ticker:t, qty:q, avg:a}); renderPositions();
};

async function fetchQuote(ticker){ const r = await fetch(`/.netlify/functions/yahoo?f=quote&ticker=${encodeURIComponent(ticker)}`); return await r.json(); }
async function fetchChart(ticker){ const r = await fetch(`/.netlify/functions/yahoo?f=chart&ticker=${encodeURIComponent(ticker)}&range=6mo`); return await r.json(); }
async function fetchDividends(ticker){ const r = await fetch(`/.netlify/functions/yahoo?f=dividends&ticker=${encodeURIComponent(ticker)}&range=1y`); return await r.json(); }
function fmt(n, d=2){ return (n||0).toLocaleString(undefined,{maximumFractionDigits:d, minimumFractionDigits:d}); }

async function renderPositions(){
  const fx = parseFloat(document.getElementById('fxInput').value) || 1350;
  const tax = parseFloat(document.getElementById('taxInput').value) || 15;
  const fee = parseFloat(document.getElementById('feeInput').value) || 0.1;
  tblBody.innerHTML = '';
  for (const p of state.positions){
    const q = await fetchQuote(p.ticker);
    const price = q.price || 0;
    const pl = (price - p.avg) * p.qty;
    const divs = await fetchDividends(p.ticker);
    const gross = (divs.total || 0);
    const net = gross * (1 - tax/100);
    const realizedKRW = (pl + net) * fx - (Math.abs(pl)>0 ? Math.abs(pl)*fee/100*fx : 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.ticker}</td><td>${p.qty}</td><td>${fmt(p.avg)}</td><td>${fmt(price)}</td><td class="${pl>=0?'good':'bad'}">${fmt(pl)}</td><td class="${realizedKRW>=0?'good':'bad'}">${fmt(realizedKRW,0)}</td><td><button data-t="${p.ticker}" class="viewBtn">차트</button></td>`;
    tblBody.appendChild(tr);
  }
  document.querySelectorAll('.viewBtn').forEach(b=>b.onclick = ()=>showChart(b.dataset.t));
}

let chart;
async function showChart(ticker){
  const data = await fetchChart(ticker);
  const ctx = document.getElementById('priceChart').getContext('2d');
  const labels = data.timestamps.map(ts => new Date(ts*1000).toLocaleDateString());
  const ds = { labels, datasets:[{ label: ticker, data: data.prices }] };
  if (chart) chart.destroy();
  chart = new Chart(ctx, { type:'line', data:ds });
  document.getElementById('signalBox').textContent = data.signal || '';
}
document.getElementById('recalcBtn').onclick = () => { renderPositions(); loadDivSummary(); };

// Compare / ranking
document.getElementById('compareBtn').onclick = async () => {
  const tks = document.getElementById('compareTickers').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const tbody = document.querySelector('#rankTbl tbody'); tbody.innerHTML='';
  for (const t of tks){
    const r = await fetch(`/.netlify/functions/macrotrends?ticker=${t}`);
    const m = await r.json();
    const score = (15/(m.PER||15))*0.3 + (1.5/(m.PBR||1.5))*0.3 + (3/(m.PSR||3))*0.2 + ((m.ROE||0)/20)*0.2;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${t}</td><td>${fmt(m.PER)}</td><td>${fmt(m.PBR)}</td><td>${fmt(m.PSR)}</td><td>${fmt(m.ROE)}</td><td>${fmt(score,2)}</td>`;
    tbody.appendChild(tr);
  }
};

// Dividends
async function loadDivSummary(){
  const months = Array.from({length:12}, (_,i)=>i+1);
  const sums = new Array(12).fill(0);
  for (const p of state.positions){
    const d = await fetchDividends(p.ticker);
    for (const item of (d.items||[])){
      const m = new Date(item.date*1000).getMonth();
      sums[m] += item.amount * p.qty * (1 - (parseFloat(document.getElementById('taxInput').value)||15)/100) * (parseFloat(document.getElementById('fxInput').value)||1350);
    }
  }
  const tbody = document.querySelector('#divTbl tbody'); tbody.innerHTML='';
  months.forEach((m,i)=>{ const tr = document.createElement('tr'); tr.innerHTML = `<td>${m}월</td><td>${fmt(sums[i],0)}</td>`; tbody.appendChild(tr); });
  const ctx = document.getElementById('divChart').getContext('2d');
  new Chart(ctx, {type:'bar', data:{labels:months.map(m=>m+'월'), datasets:[{label:'세후 배당(원)', data:sums}]}});
}

// News
document.getElementById('newsBtn').onclick = async () => {
  const t = document.getElementById('newsTicker').value.trim().toUpperCase();
  if(!t) return;
  const r = await fetch(`/.netlify/functions/news?ticker=${t}`);
  const payload = await r.json();
  const box = document.getElementById('newsList'); box.innerHTML='';
  for (const n of payload.items){
    const div = document.createElement('div'); div.className='card';
    div.innerHTML = `<strong>${n.title}</strong><div class="hint">${n.source} • ${new Date(n.time*1000).toLocaleString()}</div><p>${n.summary_ko||n.summary}</p>`;
    box.appendChild(div);
  }
};

// Alerts — KR phone normalization
function toE164KR(input){
  if(!input) return '';
  const d = String(input).replace(/\D/g,'');
  if (String(input).trim().startsWith('+82')) return '+82' + d.replace(/^82/, '');
  if (d.startsWith('82')) return '+' + d;
  if (d.startsWith('0')) return '+82' + d.slice(1);
  if (d.length===10 || d.length===11) return '+82' + d;
  return '+82' + d;
}

document.getElementById('alertSave').onclick = async () => {
  const t = document.getElementById('alertTicker').value.trim().toUpperCase();
  const drop = parseFloat(document.getElementById('alertDrop').value);
  const phone = toE164KR(document.getElementById('alertPhone').value.trim());
  const r = await fetch('/.netlify/functions/alert', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ticker:t, drop, phone})});
  const j = await r.json();
  document.getElementById('alertInfo').textContent = (j.message || JSON.stringify(j)) + (j.phone?` • 대상: ${j.phone}`:'');
};

// Screener
document.getElementById('screenBtn').onclick = async () => {
  const qs = new URLSearchParams({
    per: document.getElementById('critPER').value,
    pbr: document.getElementById('critPBR').value,
    psr: document.getElementById('critPSR').value,
    roe: document.getElementById('critROE').value,
    budgetMin: document.getElementById('budgetMin').value,
    budgetMax: document.getElementById('budgetMax').value
  });
  const r = await fetch('/.netlify/functions/screen?'+qs.toString());
  const out = await r.json();
  const tbody = document.querySelector('#screenTbl tbody'); tbody.innerHTML='';
  for (const s of out.results){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.ticker}</td><td>${s.name||''}</td><td>${s.PER??''}</td><td>${s.PBR??''}</td><td>${s.PSR??''}</td><td>${s.ROE??''}</td><td>${(s.sources||[]).join(', ')}</td>`;
    tbody.appendChild(tr);
  }
};

// Init
loadLS();

const fxBtn = document.getElementById('fxSyncBtn'); if (fxBtn) fxBtn.onclick = async ()=>{ await fetchFX(); await renderPositions(); await loadDivSummary(); };
