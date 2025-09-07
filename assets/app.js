
// ======== Global guards & helpers ========
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function safeOn(sel, evt, fn){
  const el = $(sel);
  if(!el) return console.warn('[bind-miss]', sel);
  el.addEventListener(evt, fn);
}
function showErr(msg){
  const el = $('#err'); if(!el) return;
  el.style.display = 'block'; el.textContent = msg;
}
window.addEventListener('error', e => showErr('[ERROR] ' + e.message));
window.addEventListener('unhandledrejection', e => showErr('[REJECTION] ' + (e.reason?.message || String(e.reason))));

// ======== State ========
const LS_POS = 'smart.positions';
const LS_SET = 'smart.settings';
let positions = [];
window.settings = { fx:1350, fee:0.1, tax:15, reinvest:false, timing:'rsi14' };

function saveLS(){
  try{
    localStorage.setItem(LS_POS, JSON.stringify(positions));
    localStorage.setItem(LS_SET, JSON.stringify(window.settings));
  }catch(e){ console.warn('localStorage', e); }
}
function loadLS(){
  try{
    positions = JSON.parse(localStorage.getItem(LS_POS)||'[]');
    const s = JSON.parse(localStorage.getItem(LS_SET)||'{}');
    window.settings = {...window.settings, ...s};
  }catch{}
  $('#fxInput')?.setAttribute('value', window.settings.fx);
  $('#feeInput')?.setAttribute('value', window.settings.fee);
  $('#taxInput')?.setAttribute('value', window.settings.tax);
}

// ======== Backend proxies (CORS-safe) ========
async function apiYahooQuote(t){ const r=await fetch(`/.netlify/functions/yahoo?f=quote&ticker=${encodeURIComponent(t)}`); const j=await r.json(); return j.price; }
async function apiYahooChart(t, range='6mo'){ const r=await fetch(`/.netlify/functions/yahoo?f=chart&ticker=${encodeURIComponent(t)}&range=${range}`); const j=await r.json(); return j; }
async function apiYahooProfile(t){ const r=await fetch(`/.netlify/functions/yahoo?f=profile&ticker=${encodeURIComponent(t)}`); return await r.json(); }
async function apiYahooDivs(t){ const r=await fetch(`/.netlify/functions/yahoo?f=dividends&ticker=${encodeURIComponent(t)}&range=12y`); return await r.json(); }
async function apiMacro(t){ const r=await fetch(`/.netlify/functions/macrotrends?ticker=${encodeURIComponent(t)}`); return await r.json(); }
async function apiDataroma(){ const r=await fetch('/.netlify/functions/dataroma'); const j=await r.json(); return j.tickers || j || []; }
async function apiNews(q){ const r=await fetch(`/.netlify/functions/news?q=${encodeURIComponent(q)}`); return await r.json(); }

// ======== Portfolio ========
function renderPositionsRow(p, idx, cur){
  const pl = (cur - p.avg) * p.qty;
  const kr = pl - Math.abs(pl)*window.settings.fee/100;
  return `<tr>
    <td>${p.ticker}</td><td class="num">${p.qty}</td><td class="num">${p.avg.toFixed(2)}</td>
    <td class="num">${(cur||0).toFixed(2)}</td><td class="num">${pl.toFixed(2)}</td>
    <td class="num">${((kr/(p.avg*p.qty))*100||0).toFixed(2)}%</td>
    <td><button class="delRow" data-idx="${idx}">삭제</button></td>
  </tr>`;
}
async function renderPositions(){
  const tb = $('#positionsTbody'); if(!tb) return;
  tb.innerHTML = '<tr><td colspan="7">로딩…</td></tr>';
  const prices = {};
  for(const p of positions){ try{ prices[p.ticker] = await apiYahooQuote(p.ticker) }catch{} }
  tb.innerHTML = positions.map((p,i)=>renderPositionsRow(p,i,prices[p.ticker])).join('') || '<tr><td colspan="7">없음</td></tr>';
  tb.addEventListener('click', (e)=>{
    const b = e.target.closest('.delRow'); if(!b) return;
    positions.splice(+b.dataset.idx,1); saveLS(); recalcAll();
  }, { once: true });
}

// ======== RSI Signal ========
async function drawSignal(ticker){
  const cvs = $('#signalCanvas'), info = $('#signalInfo');
  if(!cvs) return;
  const ctx = cvs.getContext('2d'); ctx.clearRect(0,0,cvs.width,cvs.height);
  info && (info.textContent='계산 중…');
  const chart = await apiYahooChart(ticker, '6mo');
  const prices = (chart.prices||[]).filter(v=>v!=null);
  if(prices.length<20){ info && (info.textContent='데이터 부족'); return; }
  function calcRSI(series, n=14){
    const out = new Array(series.length).fill(null);
    let g=0,l=0; for(let i=1;i<=n;i++){ const d=series[i]-series[i-1]; if(d>=0) g+=d; else l+=-d; }
    let ag=g/n, al=l/n; out[n]=100 - 100/(1+(ag/(al||1e-9)));
    for(let i=n+1;i<series.length;i++){ const d=series[i]-series[i-1]; ag=(ag*(n-1)+Math.max(d,0))/n; al=(al*(n-1)+Math.max(-d,0))/n; out[i]=100 - 100/(1+(ag/(al||1e-9))); }
    return out;
  }
  const rsi = calcRSI(prices,14);
  const buys=[], sells=[]; for(let i=15;i<rsi.length;i++){ if(rsi[i-1]<30&&rsi[i]>=30) buys.push({i,px:prices[i]}); if(rsi[i-1]>70&&rsi[i]<=70) sells.push({i,px:prices[i]}); }
  const min=Math.min(...prices), max=Math.max(...prices);
  const W=cvs.width, H=cvs.height, x=i=>i/(prices.length-1)*W, y=p=>H-(p-min)/(max-min)*H;
  ctx.beginPath(); prices.forEach((v,i)=>{const xx=x(i),yy=y(v); i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}); ctx.stroke();
  ctx.fillStyle='#2dd4bf'; buys.forEach(b=>{ctx.beginPath(); ctx.arc(x(b.i),y(b.px),3,0,Math.PI*2); ctx.fill();});
  ctx.fillStyle='#f87171'; sells.forEach(s=>{ctx.beginPath(); ctx.arc(x(s.i),y(s.px),3,0,Math.PI*2); ctx.fill();});
  info && (info.textContent=`RSI(14): 매수 ${buys.length}/매도 ${sells.length}`);
}

// ======== Screener & Compare ========
window.lastScreened = [];
const UNION_CAP = 150;

function adjustedReturnWithDiv_1share(start, end, divUSD){
  const fx=+window.settings.fx||1350, fee=+window.settings.fee||0, tax=+window.settings.tax||0;
  const plUSD=end-start, feeUSD=Math.abs(plUSD)*(fee/100), netDiv=divUSD*(1-tax/100);
  const totalUSD=plUSD - feeUSD + netDiv;
  return { adjPct: start? (totalUSD/start)*100 : null, adjKRW: totalUSD*fx, netDivUSD: netDiv, fx, fee, tax };
}
async function dividendsBetweenUSD(t, t0, t1){
  const j = await apiYahooDivs(t);
  const from=(t0||0)*1000, to=(t1||0)*1000;
  const items=(j.items||[]).map(it=>({ts:it.date*1000, amount:it.amount}));
  return items.filter(d=>(!from||d.ts>=from)&&(!to||d.ts<=to)).reduce((a,b)=>a+b.amount,0);
}

async function screener(){
  const tb = $('#scrTbody'); if(tb) tb.innerHTML = '<tr><td colspan="8">로딩…</td></tr>';
  const min = +($('#scrMin')?.value||0), max = +($('#scrMax')?.value||1e12);
  const list = await apiDataroma();
  const out = [];
  for(const t of list.slice(0,150)){
    try{
      const [fn, price, prof] = await Promise.all([ apiMacro(t), apiYahooQuote(t), apiYahooProfile(t) ]);
      if(!fn||!price) continue;
      if(fn.PER!=null && fn.PSR!=null && fn.ROE!=null && fn.PER<=15 && fn.PER>=1.5 && fn.PSR>=3 && fn.ROE>=15){
        const qty = Math.floor(max/price); if(price*qty>=min && qty>0) out.push({ticker:t, price, per:fn.PER, psr:fn.PSR, roe:fn.ROE, qty, sector:prof?.sector||'', marketCap:prof?.marketCap??null});
      }
    }catch(e){ console.warn('screener skip', t, e); }
  }
  window.lastScreened = out.map(r=>r.ticker); window._scrData = out;
  if(tb) tb.innerHTML = out.map(r=>`<tr><td>${r.ticker}</td><td class="num">${r.price.toFixed(2)}</td><td class="num">${r.per}</td><td class="num">${r.psr}</td><td class="num">${r.roe}%</td><td>${r.sector||'-'}</td><td class="num">${r.marketCap??'-'}</td><td class="num">${r.qty}</td></tr>`).join('') || '<tr><td colspan="8">조건 충족 종목 없음</td></tr>';
}

async function compareUnion(){
  const manual = ($('#cmpInput')?.value||'').split(/[, \t\n]+/).map(s=>s.toUpperCase()).filter(Boolean);
  const set = new Set([...(window.lastScreened||[]), ...manual]); const tickers = Array.from(set).slice(0,UNION_CAP);
  if(tickers.length===0){ alert('티커가 없습니다.'); return; }
  const range = $('#cmpHzn')?.value || '3mo'; const tb = $('#cmpTbody'); if(tb) tb.innerHTML = '<tr><td colspan="12">로딩…</td></tr>';
  const rows=[];
  await Promise.all(tickers.map(async t=>{
    const [chart, fn, prof] = await Promise.all([ apiYahooChart(t, range), apiMacro(t), apiYahooProfile(t) ]);
    const prices=(chart.prices||[]).filter(v=>v!=null);
    let start=null,end=null,ret=null; if(prices.length>1){ start=prices[0]; end=prices[prices.length-1]; ret=(end-start)/start*100; }
    const divUSD = (chart.timestamps && chart.timestamps.length>1) ? await dividendsBetweenUSD(t, chart.timestamps[0], chart.timestamps.at(-1)) : 0;
    const adj = (start!=null && end!=null) ? adjustedReturnWithDiv_1share(start,end,divUSD) : {adjPct:null, adjKRW:null, netDivUSD:0};
    rows.push({ticker:t, sector:prof?.sector||'', marketCap:prof?.marketCap??null, ret, adjPct:adj.adjPct, adjKRW:adj.adjKRW, netDivUSD:adj.netDivUSD, PER:fn?.PER??null, PSR:fn?.PSR??null, ROE:fn?.ROE??null, series:prices});
  }));
  rows.forEach(r=>{ const s1=r.ret==null?-1000:r.ret, s2=r.PER==null?-100:-r.PER, s3=r.PSR==null?-100:-r.PSR, s4=r.ROE==null?-100:r.ROE; r.score=(s1*0.5)+(s2*0.2)+(s3*0.1)+(s4*0.2); });
  rows.sort((a,b)=>b.score-a.score);
  if(tb){
    tb.innerHTML='';
    rows.forEach((r,rank)=>{
      const tr=document.createElement('tr'); tr.innerHTML=`
        <td>${r.ticker}</td><td>${r.sector||'-'}</td><td class="num">${r.marketCap??'-'}</td>
        <td class="num">${r.ret==null?'-':r.ret.toFixed(2)+'%'}</td>
        <td class="num">${r.adjPct==null?'-':r.adjPct.toFixed(2)+'%'}</td>
        <td class="num">${r.netDivUSD==null?'-':r.netDivUSD.toFixed(3)}</td>
        <td class="num">${r.adjKRW==null?'-':Math.round(r.adjKRW)}</td>
        <td class="num">${r.PER==null?'-':r.PER.toFixed(2)}</td>
        <td class="num">${r.PSR==null?'-':r.PSR.toFixed(2)}</td>
        <td class="num">${r.ROE==null?'-':r.ROE.toFixed(1)+'%'}</td>
        <td class="num">${rank+1}</td>
        <td class="spark"></td>`;
      tb.appendChild(tr);
      const cvs=document.createElement('canvas'); cvs.width=120; cvs.height=36; const ctx=cvs.getContext('2d');
      if(r.series&&r.series.length>1){ const min=Math.min(...r.series), max=Math.max(...r.series); const x=i=>i/(r.series.length-1)*118+1, y=v=>35-(v-min)/(max-min||1)*34; ctx.beginPath(); r.series.forEach((v,i)=>{ const xx=x(i), yy=y(v); i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}); ctx.stroke(); }
      tr.querySelector('.spark').appendChild(cvs);
    });
  }
}

// ======== Dividends Pivot ========
async function loadDivPivot(){
  const t = ($('#divPivotTicker')?.value||'').trim().toUpperCase(); if(!t) return;
  const sumB=$('#divPivotSum'), avgB=$('#divPivotAvg'); if(sumB) sumB.innerHTML='<tr><td colspan="13">Loading…</td></tr>';
  const j = await apiYahooDivs(t);
  const items=(j.items||[]).map(e=>({ts:e.date*1000, amount:e.amount}));
  const by = new Map();
  items.forEach(d=>{ const dt=new Date(d.ts), y=dt.getFullYear(), m=dt.getMonth(); if(!by.has(y)) by.set(y,{sum:Array(12).fill(0), cnt:Array(12).fill(0)}); const r=by.get(y); r.sum[m]+=d.amount; r.cnt[m]+=1; });
  const years=[...by.keys()].sort((a,b)=>a-b);
  const sumRows=years.map(y=>[y,...by.get(y).sum]);
  const avgRows=years.map(y=>{ const r=by.get(y); return [y, ...r.sum.map((v,i)=> r.cnt[i]?v/r.cnt[i]:0)] });
  function td(n){ return `<td class="num">${n===0?'-':n.toFixed(3)}</td>`; }
  if(sumB) sumB.innerHTML = sumRows.map(r=>`<tr><td>${r[0]}</td>${r.slice(1).map(td).join('')}</tr>`).join('') || '<tr><td colspan="13">No data</td></tr>';
  if(avgB) avgB.innerHTML = avgRows.map(r=>`<tr><td>${r[0]}</td>${r.slice(1).map(td).join('')}</tr>`).join('') || '<tr><td colspan="13">No data</td></tr>';
  const cvs=$('#divPivotChart'); if(cvs){ const ctx=cvs.getContext('2d'), w=cvs.width, h=cvs.height; ctx.clearRect(0,0,w,h); const totals=Array(12).fill(0); sumRows.forEach(r=>r.slice(1).forEach((v,i)=>totals[i]+=v)); const mx=Math.max(...totals); const bw=Math.max(10,(w-40)/12); ctx.font='10px sans-serif'; const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; totals.forEach((v,i)=>{const x=20+i*bw, bh=(v/(mx||1))*(h-30); ctx.fillRect(x,h-20-bh,bw-3,bh); ctx.fillText(MONTHS[i],x,h-6);}); }
}

// ======== News ========
async function runNews(){
  const q = ($('#newsInput')?.value||'').trim(); if(!q) return;
  const tb=$('#newsTbody'); if(tb) tb.innerHTML='<tr><td colspan="5">Loading…</td></tr>';
  const j = await apiNews(q);
  const items = j.items || [];
  if(tb) tb.innerHTML = items.map(it=>`<tr><td>${it.source||''}</td><td>${it.time||''}</td><td></td><td><a href="${it.url}" target="_blank">${it.title}</a></td><td><a href="${it.url}" target="_blank">${it.url}</a></td></tr>`).join('') || '<tr><td colspan="5">No result</td></tr>';
}

// ======== Alerts ========
async function alertList(){
  try{
    const r=await fetch('/.netlify/functions/alert'); const j=await r.json(); const arr=j.items||j||[];
    const tb=$('#alertTbody'); if(tb) tb.innerHTML = arr.map(a=>`<tr><td>${a.ticker}</td><td class="num">${a.drop}%</td><td>${a.phone||'-'}</td><td class="num">${a.base??'-'}</td><td><button class="alertDel" data-t="${a.ticker}">삭제</button></td></tr>`).join('') || '<tr><td colspan="5">등록 없음</td></tr>';
  }catch(e){ console.warn(e); }
}
async function alertSave(){
  const t=$('#alertTicker')?.value?.trim()?.toUpperCase();
  const d=+($('#alertDrop')?.value||0);
  const p=($('#alertPhone')?.value||'').trim();
  if(!t||!d) return;
  await fetch('/.netlify/functions/alert', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ticker:t, drop:d, phone:p})});
  await alertList();
}
async function alertDelete(t){ await fetch(`/.netlify/functions/alert?ticker=${encodeURIComponent(t)}`,{method:'DELETE'}); await alertList(); }

// ======== Bind All Safely after DOM Ready ========
function bindAll(){
  safeOn('#fxSyncBtn','click', async()=>{ try{ const j=await fetch('/.netlify/functions/yahoo?f=quote&ticker=USDKRW=X').then(r=>r.json()); if(j?.price){ $('#fxInput').value=j.price; window.settings.fx=+j.price; saveLS(); await renderPositions(); }}catch(e){ showErr('환율 동기화 실패: '+e.message); }});
  safeOn('#recalcBtn', 'click', recalcAll);
  ['#fxInput','#feeInput','#taxInput','#reinvestInput','#timingSelect'].forEach(sel=>{ const el=$(sel); if(el) el.addEventListener('change', recalcAll); });
  safeOn('#addBtn', 'click', ()=>{
    const t=($('#tickerInput')?.value||'').trim().toUpperCase(), q=+($('#qtyInput')?.value||0), a=+($('#avgInput')?.value||0);
    if(!t||!q||!a) return;
    const ex=positions.find(p=>p.ticker===t); if(ex){ ex.qty+=q; ex.avg=(ex.avg+a)/2; } else positions.push({ticker:t, qty:q, avg:a});
    saveLS(); renderPositions().then(()=>drawSignal(t));
  });

  // Screener & Compare
  safeOn('#scrBtn','click', screener);
  safeOn('#scrCsvBtn','click', async()=>{
    const headers=['Ticker','Price','PER','PSR','ROE','Sector','MarketCap','Qty','AdjReturnPct(1sh)','AdjReturnKRW(1sh)','NetDividendUSD(1sh)','FX','Fee%','Tax%'];
    const range=$('#cmpHzn')?.value||'3mo';
    const rows=[headers];
    for(const r of (window._scrData||[])){
      const ch=await apiYahooChart(r.ticker, range);
      const prices=(ch.prices||[]).filter(v=>v!=null);
      let start=null,end=null; if(prices.length>1){ start=prices[0]; end=prices[prices.length-1]; }
      let adj={adjPct:null, adjKRW:null, netDivUSD:0, fx:window.settings.fx, fee:window.settings.fee, tax:window.settings.tax};
      if(start!=null&&end!=null){ const div=await dividendsBetweenUSD(r.ticker, ch.timestamps?.[0], ch.timestamps?.at?.(-1)); adj=adjustedReturnWithDiv_1share(start,end,div); }
      rows.push([r.ticker,r.price,r.per,r.psr,r.roe,r.sector||'',r.marketCap??'',r.qty, adj.adjPct!=null?adj.adjPct.toFixed(2):'', Math.round(adj.adjKRW||0), adj.netDivUSD!=null?adj.netDivUSD.toFixed(3):'', adj.fx, adj.fee, adj.tax]);
    }
    const csv = rows.map(r=>r.map(v=>{const s=(v==null?'':String(v)); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='screener.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
  safeOn('#scrXlsBtn','click', async()=>{
    const headers=['Ticker','Price','PER','PSR','ROE','Sector','MarketCap','Qty','AdjReturnPct(1sh)','AdjReturnKRW(1sh)','NetDividendUSD(1sh)','FX','Fee%','Tax%'];
    const range=$('#cmpHzn')?.value||'3mo'; const rows=[];
    for(const r of (window._scrData||[])){
      const ch=await apiYahooChart(r.ticker, range);
      const prices=(ch.prices||[]).filter(v=>v!=null);
      let start=null,end=null; if(prices.length>1){ start=prices[0]; end=prices[prices.length-1]; }
      let adj={adjPct:null, adjKRW:null, netDivUSD:0, fx:window.settings.fx, fee:window.settings.fee, tax:window.settings.tax};
      if(start!=null&&end!=null){ const div=await dividendsBetweenUSD(r.ticker, ch.timestamps?.[0], ch.timestamps?.at?.(-1)); adj=adjustedReturnWithDiv_1share(start,end,div); }
      rows.push([r.ticker,r.price,r.per,r.psr,r.roe,r.sector||'',r.marketCap??'',r.qty, adj.adjPct!=null?adj.adjPct.toFixed(2):'', Math.round(adj.adjKRW||0), adj.netDivUSD!=null?adj.netDivUSD.toFixed(3):'', adj.fx, adj.fee, adj.tax]);
    }
    const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const cols=headers.map(()=>'<Column ss:AutoFitWidth="1"/>').join('');
    const headerRow='<Row>'+headers.map(h=>`<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('')+'</Row>';
    const dataRows=rows.map(r=>'<Row>'+r.map(v=>{const n=Number(v); return (!isNaN(n)&&v!==''&&v!=null)?`<Cell><Data ss:Type="Number">${n}</Data></Cell>`:`<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;}).join('')+'</Row>').join('');
    const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Screener"><Table>${cols}${headerRow}${dataRows}</Table></Worksheet></Workbook>`;
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([xml],{type:'application/vnd.ms-excel'})); a.download='screener.xlsx'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
  safeOn('#cmpBtn','click', compareUnion);

  // Dividends pivot & News
  safeOn('#divPivotBtn','click', loadDivPivot);
  safeOn('#newsBtn','click', runNews);

  // Alerts
  safeOn('#alertSaveBtn','click', alertSave);
  const tb=$('#alertTbody'); if(tb) tb.addEventListener('click', e=>{ const b=e.target.closest('.alertDel'); if(b) alertDelete(b.dataset.t); });

  // initial renders
  alertList(); renderPositions();
}

// ======== Recalc (called by UI) ========
async function recalcAll(){
  const fx=$('#fxInput'), fee=$('#feeInput'), tax=$('#taxInput');
  if(fx) window.settings.fx=+fx.value||window.settings.fx;
  if(fee) window.settings.fee=+fee.value||0;
  if(tax) window.settings.tax=+tax.value||0;
  saveLS();
  await renderPositions();
  if(positions[0]) await drawSignal(positions[0].ticker);
}

// ======== DOM Ready ========
document.addEventListener('DOMContentLoaded', async ()=>{
  loadLS(); bindAll();
  try{
    // try initial FX sync silently
    const j=await fetch('/.netlify/functions/yahoo?f=quote&ticker=USDKRW=X').then(r=>r.json());
    if(j?.price){ const fx=$('#fxInput'); if(fx){ fx.value=j.price; window.settings.fx=+j.price; saveLS(); } }
  }catch{}
  await recalcAll();
});
