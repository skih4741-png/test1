
// ======= helpers =======
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt2 = n => (isFinite(n) ? Number(n).toFixed(2) : '');
const pct = n => (isFinite(n) ? (n*100).toFixed(2)+'%' : '');
const sleep = ms => new Promise(r=>setTimeout(r, ms));

function showErr(m){
  const el = $('#err'); if(!el) return;
  el.style.display='block'; el.textContent = m;
}
window.addEventListener('error', e => showErr('[ERROR] '+e.message));
window.addEventListener('unhandledrejection', e => showErr('[REJECTION] '+(e.reason?.message || String(e.reason))));

async function j(url, opt){
  const r = await fetch(url, opt);
  if(!r.ok) throw new Error(r.status+' '+r.statusText);
  return r.json();
}

// ======= backend wrappers (stable endpoints) =======
async function apiYahooQuote(t){ const jn = await j(`/.netlify/functions/yahoo?f=quote&ticker=${encodeURIComponent(t)}`); return jn; }
async function apiYahooChart(t, range='6mo'){ return await j(`/.netlify/functions/yahoo?f=chart&ticker=${encodeURIComponent(t)}&range=${range}`); }
async function apiYahooProfile(t){ return await j(`/.netlify/functions/yahoo?f=profile&ticker=${encodeURIComponent(t)}`); }
async function apiYahooDivs(t, range='12y'){ return await j(`/.netlify/functions/yahoo?f=dividends&ticker=${encodeURIComponent(t)}&range=${range}`); }
async function apiMacro(t){ return await j(`/.netlify/functions/macrotrends?ticker=${encodeURIComponent(t)}`); }
async function apiDataroma(){ const r = await j('/.netlify/functions/dataroma'); return r.tickers || r || []; }
async function apiNews(q){ return await j(`/.netlify/functions/news?q=${encodeURIComponent(q)}`); }
async function apiScreener(tickersCSV){ return await j('/.netlify/functions/screener' + (tickersCSV? `?tickers=${encodeURIComponent(tickersCSV)}` : '')); }

// Alerts
async function alertList(){ return await j('/.netlify/functions/alert'); }
async function alertSave(payload){
  const r = await fetch('/.netlify/functions/alert', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload)});
  if(!r.ok) throw new Error('alert save '+r.status);
  return r.json();
}
async function alertDeleteByTicker(t){ return await j(`/.netlify/functions/alert?ticker=${encodeURIComponent(t)}`, { method:'DELETE' }); }

// ======= state =======
const state = {
  positions: JSON.parse(localStorage.getItem('positions')||'[]'),
  fx: Number($('#fxInput')?.value || 1350),
  fee: Number($('#feeInput')?.value || 0.1),
  tax: Number($('#taxInput')?.value || 15),
  reinvest: !!$('#reinvestInput')?.checked
};
function saveState(){
  localStorage.setItem('positions', JSON.stringify(state.positions));
}

// ======= portfolio render =======
async function renderPositions(){
  const tb = $('#positionsTbody'); if(!tb) return;
  tb.innerHTML = '';
  for(const [i,p] of state.positions.entries()){
    // fetch current
    const q = await apiYahooQuote(p.ticker);
    const cur = Number(q.price || 0);
    const pl = (cur - p.avg) * p.qty;
    const feeAdj = pl - Math.abs(pl) * (state.fee/100);
    const pnlPct = (p.avg>0? (feeAdj / (p.avg*p.qty)) : 0);
    tb.insertAdjacentHTML('beforeend', `<tr>
      <td>${p.ticker}</td>
      <td class="num">${p.qty}</td>
      <td class="num">${fmt2(p.avg)}</td>
      <td class="num">${fmt2(cur)}</td>
      <td class="num">${fmt2(feeAdj)}</td>
      <td class="num">${(pnlPct*100).toFixed(2)}%</td>
      <td><button class="delRow" data-idx="${i}">삭제</button></td>
    </tr>`);
  }
  $$('.delRow').forEach(b => b.onclick = (e)=>{
    const idx = Number(e.currentTarget.dataset.idx);
    state.positions.splice(idx,1); saveState(); renderPositions();
  });
  drawSignal(); // RSI canvas
}

async function drawSignal(){
  const c = $('#signalCanvas'); if(!c) return;
  const ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
  const last = state.positions[state.positions.length-1];
  if(!last) { $('#signalInfo').textContent=''; return; }
  const data = await apiYahooChart(last.ticker, '6mo');
  const prices = (data.prices||[]).filter(x=>x!=null);
  if(prices.length<20){ $('#signalInfo').textContent=''; return; }
  // draw price
  const w = c.width, h = c.height;
  const min = Math.min(...prices), max = Math.max(...prices);
  ctx.beginPath();
  prices.forEach((v,i)=>{
    const x = (i/(prices.length-1))*w;
    const y = h - ((v-min)/(max-min))*h;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  // RSI(14)
  const rsi = (function(src, period=14){
    let gains=0, losses=0, rsivals=[];
    for(let i=1;i<src.length;i++){
      const ch = src[i]-src[i-1];
      gains += Math.max(0,ch);
      losses += Math.max(0,-ch);
      if(i>=period){
        if(i>period){
          const ch2 = src[i]-src[i-1];
          gains = (gains*(period-1) + Math.max(0,ch2)) / period;
          losses = (losses*(period-1) + Math.max(0,-ch2)) / period;
        }else{
          gains/=period; losses/=period;
        }
        const rs = losses===0 ? 100 : gains/losses;
        const r = 100 - (100/(1+rs));
        rsivals.push(r);
      }
    }
    return rsivals;
  })(prices, 14);
  const lastRSI = rsi[rsi.length-1]||0;
  const buy = lastRSI < 30 ? 1 : 0;
  const sell = lastRSI > 70 ? 2 : 0;
  $('#signalInfo').textContent = `RSI(14): 매수 ${buy}/매도 ${sell}`;
}

// ======= bindings =======
function bindPortfolio(){
  $('#addBtn').onclick = async ()=>{
    const t = $('#tickerInput').value.trim().toUpperCase();
    const qty = Number($('#qtyInput').value||0);
    const avg = Number($('#avgInput').value||0);
    if(!t||!qty||!avg) return;
    state.positions.push({ticker:t, qty, avg});
    saveState(); renderPositions();
  };
  $('#fxSyncBtn').onclick = async ()=>{
    try{
      const q = await apiYahooQuote('USDKRW=X');
      state.fx = Number(q.price||state.fx);
      $('#fxInput').value = state.fx;
    }catch(e){ showErr('[FX] '+e.message); }
  };
  $('#recalcBtn').onclick = ()=>{
    state.fx = Number($('#fxInput').value||state.fx);
    state.fee = Number($('#feeInput').value||state.fee);
    state.tax = Number($('#taxInput').value||state.tax);
    state.reinvest = !!$('#reinvestInput').checked;
    renderPositions();
  };
}

// ======= Screener (fixed rules; honor tickers if user provided elsewhere) =======
let scrRows = [];
function renderScrTable(){
  const tb = $('#scrTbody'); if(!tb) return;
  tb.innerHTML = scrRows.map(r=>`<tr>
    <td>${r.ticker}</td><td class="num">${fmt2(r.price)}</td>
    <td class="num">${fmt2(r.per)}</td><td class="num">${fmt2(r.psr)}</td>
    <td class="num">${fmt2(r.roe)}</td><td>${r.sector||''}</td>
    <td class="num">${r.marketCap||''}</td><td></td>
  </tr>`).join('') || '<tr><td colspan="8">조건 충족 종목 없음</td></tr>';
}
function csvFrom(rows){
  const header = ['Ticker','Price','PER','PSR','ROE','Sector','MarketCap'];
  const lines = [header.join(',')].concat(rows.map(r => [
    r.ticker, r.price, r.per, r.psr, r.roe, `"${(r.sector||'').replace(/"/g,'""')}"`, r.marketCap
  ].join(',')));
  return lines.join('\n');
}
function bindScreener(){
  $('#scrBtn').onclick = async ()=>{
    $('#scrTbody').innerHTML = '<tr><td colspan="8">로딩...</td></tr>';
    try{
      // backend already filters: PBR ≤ 1.5, PSR ≥ 3, ROE ≥ 15, PER ≤ 15
      const res = await apiScreener();
      // local optional price range
      const lo = Number($('#scrMin').value||0), hi = Number($('#scrMax').value||0);
      let rows = res.rows||[];
      if(lo) rows = rows.filter(r => r.price>=lo);
      if(hi) rows = rows.filter(r => r.price<=hi);
      scrRows = rows;
      renderScrTable();
    }catch(e){ showErr('[Screener] '+e.message); $('#scrTbody').innerHTML='<tr><td colspan="8">에러</td></tr>'; }
  };
  $('#scrCsvBtn').onclick = ()=>{
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csvFrom(scrRows)], {type:'text/csv;charset=utf-8;'}));
    a.download = 'screener.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#scrXlsBtn').onclick = ()=>{
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csvFrom(scrRows)], {type:'text/csv;charset=utf-8;'}));
    a.download = 'screener.xlsx'; a.click(); URL.revokeObjectURL(a.href);
  };
}

// ======= Compare/Ranking =======
function sparkBlocks(arr){
  if(!arr || arr.length===0) return '';
  const min = Math.min(...arr), max = Math.max(...arr)||1;
  const blocks = '▁▂▃▄▅▆▇';
  return arr.map(v=>{
    const idx = Math.min(blocks.length-1, Math.max(0, Math.floor((v-min)/(max-min+1e-9)*(blocks.length-1)) ));
    return blocks[idx];
  }).join('');
}
async function runCompare(){
  const raw = $('#cmpInput').value.trim();
  const list = raw.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
  if(list.length===0){ $('#cmpTbody').innerHTML=''; return; }
  const h = $('#cmpHzn').value || '3mo';
  $('#cmpTbody').innerHTML = '<tr><td colspan="12">로딩...</td></tr>';
  const rows = [];
  for(const t of list){
    try{
      const [chart, prof, mt] = await Promise.all([ apiYahooChart(t, h), apiYahooProfile(t), apiMacro(t) ]);
      const p = chart.prices||[];
      const first = p.find(x=>isFinite(x));
      const last = p.slice().reverse().find(x=>isFinite(x));
      const ret = (first && last) ? ((last/first)-1) : 0;
      // dividends (1sh, net)
      const divs = await apiYahooDivs(t, '2y');
      const periodDiv = (divs.items||[]).reduce((s,x)=> s + (x.amount||0), 0);
      const netDiv = periodDiv * (1 - (state.tax/100));
      const adjReturn = ret + (netDiv / (first||1));
      // KRW
      const adjKRW = adjReturn * (state.fx||1350);
      rows.push({
        ticker:t, sector: prof.sector||'', marketCap: prof.marketCap||'',
        return: ret, adjReturn, netDiv, adjKRW,
        per: mt.per, psr: mt.psr, roe: mt.roe,
        mini: sparkBlocks(p.slice(-20))
      });
      await sleep(120); // throttle
    }catch(e){
      rows.push({ticker:t, error:String(e)});
    }
  }
  // ranking (simple composite)
  const valid = rows.filter(r=>!r.error);
  const z = (arr, key)=>{
    const xs = arr.map(a=>a[key]).filter(v=>isFinite(v));
    const m = xs.reduce((s,v)=>s+v,0)/xs.length || 0;
    const sd = Math.sqrt(xs.reduce((s,v)=>s+(v-m)*(v-m),0)/xs.length || 1);
    return a=> isFinite(a[key]) ? (a[key]-m)/(sd||1) : -999;
  };
  const zr = z(valid,'adjReturn'), zroe = z(valid,'roe');
  valid.forEach(v => v.rank = (zr(v) + zroe(v)));
  valid.sort((a,b)=> b.rank - a.rank);
  $('#cmpTbody').innerHTML = valid.map(r=>`<tr>
    <td>${r.ticker}</td><td>${r.sector}</td><td>${r.marketCap}</td>
    <td class="num">${pct(r.return)}</td><td class="num">${pct(r.adjReturn)}</td>
    <td class="num">${fmt2(r.netDiv)}</td><td class="num">${fmt2(r.adjKRW)}</td>
    <td class="num">${fmt2(r.per)}</td><td class="num">${fmt2(r.psr)}</td><td class="num">${fmt2(r.roe)}</td>
    <td class="num">${fmt2(r.rank)}</td><td>${r.mini||''}</td>
  </tr>`).join('');
}
function bindCompare(){
  $('#cmpBtn').onclick = runCompare;
}

// ======= Dividend pivot =======
function monthIdx(ts){ const d = new Date(ts*1000); return [d.getUTCFullYear(), d.getUTCMonth()]; }
function emptyYearRow(y){ return {y, m:Array(12).fill(0)}; }
async function loadPivot(){
  const t = $('#divPivotTicker').value.trim().toUpperCase();
  if(!t) return;
  $('#divPivotSum').innerHTML = '<tr><td colspan="13">로딩...</td></tr>';
  const divs = await apiYahooDivs(t, '12y');
  const items = divs.items || [];
  const byYear = new Map();
  for(const it of items){
    if(!isFinite(it.amount) || !it.ts) continue;
    const d = new Date(it.ts*1000);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    if(!byYear.has(y)) byYear.set(y, emptyYearRow(y));
    byYear.get(y).m[m] += Number(it.amount||0);
  }
  const years = Array.from(byYear.keys()).sort((a,b)=>a-b);
  const rows = years.map(y=>{
    const r = byYear.get(y);
    return `<tr><td>${y}</td>${r.m.map(v=>`<td class="num">${fmt2(v)}</td>`).join('')}</tr>`;
  }).join('');
  $('#divPivotSum').innerHTML = rows || '<tr><td colspan="13">데이터 없음</td></tr>';
  $('#divPivotAvg').innerHTML = rows || '<tr><td colspan="13">데이터 없음</td></tr>';
}
function bindPivot(){ $('#divPivotBtn').onclick = loadPivot; }

// ======= News =======
function bindNews(){
  $('#newsBtn').onclick = async ()=>{
    $('#newsTbody').innerHTML = '<tr><td colspan="5">로딩...</td></tr>';
    try{
      const q = $('#newsInput').value.trim(); const data = await apiNews(q||'NVDA');
      const rows = (data.items||[]).map(it=>`<tr>
        <td>${it.source||''}</td><td>${it.time||''}</td><td>${it.delta||''}</td>
        <td>${it.title||''}</td><td><a href="${it.url}" target="_blank">link</a></td>
      </tr>`).join('');
      $('#newsTbody').innerHTML = rows || '<tr><td colspan="5">없음</td></tr>';
    }catch(e){ showErr('[News] '+e.message); $('#newsTbody').innerHTML = '<tr><td colspan="5">에러</td></tr>'; }
  };
}

// ======= Alerts =======
async function refreshAlerts(){
  const data = await alertList();
  const arr = data.items || data || [];
  const tb = $('#alertTbody');
  tb.innerHTML = arr.map(a=>`<tr>
    <td>${a.ticker}</td><td class="num">${fmt2(a.drop)}</td><td>${a.contact||''}</td><td class="num">${fmt2(a.base)}</td>
    <td><button class="delAlert" data-t="${a.ticker}">삭제</button></td>
  </tr>`).join('') || '<tr><td colspan="5">등록 없음</td></tr>';
  $$('.delAlert').forEach(b => b.onclick = async (e)=>{
    const t = e.currentTarget.dataset.t;
    await fetch(`/.netlify/functions/alert?ticker=${encodeURIComponent(t)}`, {method:'DELETE'});
    refreshAlerts();
  });
}
function bindAlerts(){
  $('#alertSaveBtn').onclick = async ()=>{
    const t = $('#alertTicker').value.trim().toUpperCase();
    const d = Number($('#alertDrop').value||0);
    const p = $('#alertPhone').value.trim();
    if(!t || !d || !p) return;
    await alertSave({ ticker:t, drop:d, phone:p });
    await refreshAlerts();
  };
}

// ======= init =======
function init(){
  bindPortfolio();
  bindScreener();
  bindCompare();
  bindPivot();
  bindNews();
  bindAlerts();
  renderPositions();
  refreshAlerts();
}
document.addEventListener('DOMContentLoaded', init);
