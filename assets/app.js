
/* ========= Core State ========= */
const LS_POS = 'smart.positions';
const LS_SET = 'smart.settings';
const $ = s => document.querySelector(s);

let positions = [];
window.settings = { fx:1350, fee:0.1, tax:15, reinvest:false, timing:'rsi14' };

function saveLS(){
  localStorage.setItem(LS_POS, JSON.stringify(positions));
  localStorage.setItem(LS_SET, JSON.stringify(window.settings));
}
function loadLS(){
  positions = JSON.parse(localStorage.getItem(LS_POS)||'[]');
  const s = JSON.parse(localStorage.getItem(LS_SET)||'{}');
  window.settings = {...window.settings, ...s};
  $('#fxInput').value = window.settings.fx;
  $('#feeInput').value = window.settings.fee;
  $('#taxInput').value = window.settings.tax;
  $('#reinvestInput').checked = !!window.settings.reinvest;
  $('#timingSelect').value = window.settings.timing || 'rsi14';
}

/* ========= Yahoo & helpers ========= */
async function yahooQuote(ticker){
  const r = await fetch(`/.netlify/functions/yahoo?f=quote&ticker=${encodeURIComponent(ticker)}`);
  const j = await r.json(); return j.price;
}
async function yahooReturnDetailed(ticker, range='3mo'){
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`);
  const j = await r.json();
  const res = j.chart?.result?.[0];
  const close = res?.indicators?.quote?.[0]?.close || [];
  const ts = res?.timestamp || [];
  const pairs = close.map((c,i)=>({c, t: ts[i]})).filter(x=>x.c!=null);
  if (pairs.length<2) return {ret:null, series:[], start:null, end:null, t0:null, t1:null};
  const start = pairs[0].c, end = pairs[pairs.length-1].c;
  const ret = (end-start)/start*100;
  return { ret, series: pairs.map(p=>p.c), start, end, t0:pairs[0].t, t1:pairs[pairs.length-1].t };
}
async function yahooProfile(ticker){
  const r = await fetch(`/.netlify/functions/yahoo?f=profile&ticker=${encodeURIComponent(ticker)}`);
  return await r.json();
}
async function fetchFX(){
  try{
    const r = await fetch(`/.netlify/functions/yahoo?f=quote&ticker=USDKRW=X`);
    const j = await r.json();
    if(j?.price){ $('#fxInput').value = j.price; window.settings.fx = +j.price; saveLS(); }
  }catch{}
}

/* ========= Portfolio ========= */
function renderPositionsRow(p, idx, cur){
  const pl = (cur - p.avg) * p.qty;
  const kr = pl - Math.abs(pl)*window.settings.fee/100;
  return `<tr>
    <td>${p.ticker}</td>
    <td class="num">${p.qty}</td>
    <td class="num">${p.avg.toFixed(2)}</td>
    <td class="num">${(cur||0).toFixed(2)}</td>
    <td class="num">${pl.toFixed(2)}</td>
    <td class="num">${((kr/(p.avg*p.qty))*100||0).toFixed(2)}%</td>
    <td><button class="delRow" data-idx="${idx}">삭제</button></td>
  </tr>`;
}
async function renderPositions(){
  const tb = $('#positionsTbody'); if(!tb) return;
  tb.innerHTML = '<tr><td colspan="7">로딩…</td></tr>';
  const prices = {};
  for(const p of positions){ prices[p.ticker]=await yahooQuote(p.ticker); }
  tb.innerHTML = positions.map((p,i)=>renderPositionsRow(p,i,prices[p.ticker])).join('') || '<tr><td colspan="7">없음</td></tr>';
}
function bindPortfolio(){
  $('#positionsTbody').addEventListener('click', (e)=>{
    const b = e.target.closest('.delRow'); if(!b) return;
    const i = +b.dataset.idx; positions.splice(i,1); saveLS(); recalcAll();
  });
  $('#addBtn').addEventListener('click', ()=>{
    const t=($('#tickerInput').value||'').trim().toUpperCase();
    const q=+$('#qtyInput').value, a=+$('#avgInput').value;
    if(!t||!q||!a) return;
    const ex = positions.find(p=>p.ticker===t);
    if(ex){ ex.qty+=q; ex.avg=(ex.avg+a)/2; } else positions.push({ticker:t, qty:q, avg:a});
    $('#qtyInput').value=''; $('#avgInput').value='';
    saveLS(); recalcAll();
  });
  $('#recalcBtn').addEventListener('click', recalcAll);
  ['#fxInput','#feeInput','#taxInput','#reinvestInput','#timingSelect']
    .forEach(sel=> $(sel).addEventListener('change', recalcAll));
  const fxBtn = document.getElementById('fxSyncBtn');
  if(fxBtn) fxBtn.onclick = async ()=>{ await fetchFX(); await recalcAll(); };
}
async function recalcAll(){
  window.settings.fx = +$('#fxInput').value||window.settings.fx;
  window.settings.fee = +$('#feeInput').value||0;
  window.settings.tax = +$('#taxInput').value||0;
  window.settings.reinvest = !!$('#reinvestInput').checked;
  window.settings.timing = $('#timingSelect').value||'rsi14';
  saveLS();
  await renderPositions();
  if(positions[0]) await drawSignal(positions[0].ticker);
}

/* ========= RSI Signal ========= */
async function historyDaily(t, range='6mo', interval='1d'){
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=${range}&interval=${interval}`;
  const r = await fetch(url); const j = await r.json();
  const close = j.chart?.result?.[0]?.indicators?.quote?.[0]?.close||[];
  const ts = j.chart?.result?.[0]?.timestamp||[];
  return ts.map((t,i)=>({t:t*1000, c:close[i]})).filter(x=>x.c!=null);
}
function calcRSI(data, n=14){
  const out = new Array(data.length).fill(null);
  let g=0, l=0;
  for(let i=1;i<=n;i++){ const d=data[i].c-data[i-1].c; if(d>=0) g+=d; else l+=-d; }
  let ag=g/n, al=l/n; out[n]=100 - 100/(1+(ag/(al||1e-9)));
  for(let i=n+1;i<data.length;i++){
    const d=data[i].c-data[i-1].c;
    ag=(ag*(n-1)+Math.max(d,0))/n; al=(al*(n-1)+Math.max(-d,0))/n;
    out[i]=100 - 100/(1+(ag/(al||1e-9)));
  } return out;
}
async function drawSignal(ticker){
  const cvs=$('#signalCanvas'), info=$('#signalInfo'); if(!cvs) return;
  const ctx=cvs.getContext('2d'); ctx.clearRect(0,0,cvs.width,cvs.height);
  info.textContent='계산 중…';
  const data=await historyDaily(ticker); if(data.length<20){ info.textContent='데이터 부족'; return; }
  const rsi=calcRSI(data,14);
  const buys=[], sells=[];
  for(let i=15;i<rsi.length;i++){ if(rsi[i-1]<30&&rsi[i]>=30) buys.push({i,px:data[i].c}); if(rsi[i-1]>70&&rsi[i]<=70) sells.push({i,px:data[i].c}); }
  const min=Math.min(...data.map(d=>d.c)), max=Math.max(...data.map(d=>d.c));
  const W=cvs.width, H=cvs.height, x=i=>i/(data.length-1)*W, y=p=>H-(p-min)/(max-min)*H;
  ctx.beginPath(); data.forEach((d,i)=>{const xx=x(i), yy=y(d.c); i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}); ctx.stroke();
  ctx.fillStyle='#2dd4bf'; buys.forEach(b=>{ctx.beginPath(); ctx.arc(x(b.i),y(b.px),3,0,Math.PI*2); ctx.fill();});
  ctx.fillStyle='#f87171'; sells.forEach(s=>{ctx.beginPath(); ctx.arc(x(s.i),y(s.px),3,0,Math.PI*2); ctx.fill();});
  info.textContent=`RSI(14): 매수 ${buys.length} / 매도 ${sells.length} • 최근 ${data.at(-1).c.toFixed(2)}`;
}

/* ========= Macrotrends / Dataroma via Functions ========= */
async function fundamentals(ticker){
  const r = await fetch(`/.netlify/functions/macrotrends?ticker=${encodeURIComponent(ticker)}`);
  return await r.json(); // {PER,PSR,ROE,...}
}
async function dataromaTop(){
  const r = await fetch('/.netlify/functions/dataroma');
  const j = await r.json();
  return j.tickers || j || [];
}

/* ========= Screener & Compare (Union 150, Dividend-adjusted) ========= */
window.lastScreened = [];
const UNION_CAP = 150;

function adjustedReturnWithDiv_1share(start, end, divUSD){
  const fx=+window.settings.fx||1350, fee=+window.settings.fee||0, tax=+window.settings.tax||0;
  const plUSD=end-start, feeUSD=Math.abs(plUSD)*(fee/100), netDiv=divUSD*(1-tax/100);
  const totalUSD=plUSD - feeUSD + netDiv;
  return { adjPct: start? (totalUSD/start)*100 : null, adjKRW: totalUSD*fx, netDivUSD: netDiv, fx, fee, tax };
}
async function yahooDividendsBetweenUSD(ticker, t0, t1){
  const r = await fetch(`/.netlify/functions/yahoo?f=dividends&ticker=${encodeURIComponent(ticker)}&range=10y`);
  const j = await r.json(); const from=(t0||0)*1000, to=(t1||0)*1000;
  const items=(j.items||[]).map(it=>({ts:it.date*1000, amount:it.amount}));
  return items.filter(d=>(!from||d.ts>=from)&&(!to||d.ts<=to)).reduce((a,b)=>a+b.amount,0);
}

async function screenerRun(){
  const min=+$('#scrMin').value||0, max=+$('#scrMax').value||1e12;
  const tb=document.getElementById('scrTbody'); tb.innerHTML='<tr><td colspan="8">로딩…</td></tr>';
  const tickers=await dataromaTop(); const res=[];
  for(const t of tickers.slice(0,150)){
    try{
      const [fn, price, prof] = await Promise.all([ fundamentals(t), yahooQuote(t), yahooProfile(t) ]);
      if(!fn||!price) continue;
      const per=fn.PER, psr=fn.PSR, roe=fn.ROE;
      if(per!=null && psr!=null && roe!=null && per<=15 && per>=1.5 && psr>=3 && roe>=15){
        const qty=Math.floor(max/price);
        if(price*qty>=min && qty>0) res.push({ticker:t, price, per, psr, roe, qty, sector:prof?.sector||'', marketCap:prof?.marketCap??null});
      }
    }catch(e){ console.error('screener',t,e); }
  }
  window.lastScreened=res.map(r=>r.ticker);
  window._scrData=res;
  tb.innerHTML = res.map(r=>`
    <tr><td>${r.ticker}</td><td class="num">${r.price.toFixed(2)}</td>
    <td class="num">${r.per}</td><td class="num">${r.psr}</td><td class="num">${r.roe}%</td>
    <td>${r.sector||'-'}</td><td class="num">${r.marketCap??'-'}</td><td class="num">${r.qty}</td></tr>
  `).join('') || '<tr><td colspan="8">조건 충족 종목 없음</td></tr>';
}
function bindScreener(){
  $('#scrBtn').addEventListener('click', screenerRun);
  $('#scrCsvBtn').addEventListener('click', async ()=>{
    const rows=[['Ticker','Price','PER','PSR','ROE','Sector','MarketCap','Qty','AdjReturnPct(1sh)','AdjReturnKRW(1sh)','NetDividendUSD(1sh)','FX','Fee%','Tax%']];
    const range=$('#cmpHzn')?.value||'3mo';
    for(const r of (window._scrData||[])){
      const d=await yahooReturnDetailed(r.ticker, range);
      let adj={adjPct:null, adjKRW:null, netDivUSD:0, fx:window.settings.fx, fee:window.settings.fee, tax:window.settings.tax};
      if(d.start!=null && d.end!=null){ const div=await yahooDividendsBetweenUSD(r.ticker,d.t0,d.t1); adj=adjustedReturnWithDiv_1share(d.start,d.end,div); }
      rows.push([r.ticker,r.price,r.per,r.psr,r.roe,r.sector||'',r.marketCap??'',r.qty,
        adj.adjPct!=null?adj.adjPct.toFixed(2):'', Math.round(adj.adjKRW||0), adj.netDivUSD!=null?adj.netDivUSD.toFixed(3):'',
        adj.fx, adj.fee, adj.tax]);
    }
    const csv = rows.map(r=>r.map(v=>{const s=(v==null?'':String(v)); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='screener.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
  $('#scrXlsBtn').addEventListener('click', async ()=>{
    const headers=['Ticker','Price','PER','PSR','ROE','Sector','MarketCap','Qty','AdjReturnPct(1sh)','AdjReturnKRW(1sh)','NetDividendUSD(1sh)','FX','Fee%','Tax%'];
    const rows=[]; const range=$('#cmpHzn')?.value||'3mo';
    for(const r of (window._scrData||[])){
      const d=await yahooReturnDetailed(r.ticker, range);
      let adj={adjPct:null, adjKRW:null, netDivUSD:0, fx:window.settings.fx, fee:window.settings.fee, tax:window.settings.tax};
      if(d.start!=null && d.end!=null){ const div=await yahooDividendsBetweenUSD(r.ticker,d.t0,d.t1); adj=adjustedReturnWithDiv_1share(d.start,d.end,div); }
      rows.push([r.ticker,r.price,r.per,r.psr,r.roe,r.sector||'',r.marketCap??'',r.qty,
        adj.adjPct!=null?adj.adjPct.toFixed(2):'', Math.round(adj.adjKRW||0), adj.netDivUSD!=null?adj.netDivUSD.toFixed(3):'',
        adj.fx, adj.fee, adj.tax]);
    }
    const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const cols=headers.map(()=>'<Column ss:AutoFitWidth="1"/>').join('');
    const headerRow='<Row>'+headers.map(h=>`<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join('')+'</Row>';
    const dataRows=rows.map(r=>'<Row>'+r.map(v=>{const n=Number(v); return (!isNaN(n)&&v!==''&&v!=null)?`<Cell><Data ss:Type="Number">${n}</Data></Cell>`:`<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;}).join('')+'</Row>').join('');
    const xml=`<?xml version="1.0"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Worksheet ss:Name="Screener"><Table>${cols}${headerRow}${dataRows}</Table></Worksheet>
      </Workbook>`;
    const blob=new Blob([xml],{type:'application/vnd.ms-excel'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='screener.xlsx'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
}
bindScreener();

async function compareUnion(){
  const manual=($('#cmpInput')?.value||'').split(/[,\\s]+/).map(s=>s.toUpperCase()).filter(Boolean);
  const set=new Set([...manual, ...(window.lastScreened||[])]);
  const tickers=Array.from(set).slice(0,UNION_CAP);
  if(tickers.length===0){ alert('티커 입력 또는 스크리너 결과가 없습니다.'); return; }
  const range=$('#cmpHzn')?.value||'3mo', tb=document.getElementById('cmpTbody');
  tb.innerHTML='<tr><td colspan="12">로딩…</td></tr>';
  const rows=[];
  await Promise.all(tickers.map(async t=>{
    const [retRes, fn, prof] = await Promise.all([ yahooReturnDetailed(t, range), fundamentals(t), yahooProfile(t) ]);
    const divUSD = (retRes.t0&&retRes.t1) ? await yahooDividendsBetweenUSD(t, retRes.t0, retRes.t1) : 0;
    const adj = (retRes.start!=null && retRes.end!=null) ? adjustedReturnWithDiv_1share(retRes.start,retRes.end,divUSD) : {adjPct:null, adjKRW:null, netDivUSD:0};
    rows.push({ticker:t, ret:retRes.ret, adjPct:adj.adjPct, adjKRW:adj.adjKRW, netDivUSD:adj.netDivUSD,
               PER:fn?.PER??null, PSR:fn?.PSR??null, ROE:fn?.ROE??null, sector:prof?.sector||'', marketCap:prof?.marketCap??null,
               series:retRes.series});
  }));
  rows.forEach(r=>{ const s1=r.ret==null?-1000:r.ret, s2=r.PER==null?-100:-r.PER, s3=r.PSR==null?-100:-r.PSR, s4=r.ROE==null?-100:r.ROE; r.score=(s1*0.5)+(s2*0.2)+(s3*0.1)+(s4*0.2); });
  rows.sort((a,b)=>b.score-a.score);
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
      <td class="num">${rank+1}</td><td class="spark"></td>`;
    tb.appendChild(tr);
    const cvs=document.createElement('canvas'); cvs.width=120; cvs.height=36; const ctx=cvs.getContext('2d');
    if(r.series&&r.series.length>1){ const min=Math.min(...r.series), max=Math.max(...r.series); const x=i=>i/(r.series.length-1)*118+1, y=v=>35-(v-min)/(max-min||1)*34; ctx.beginPath(); r.series.forEach((v,i)=>{const xx=x(i),yy=y(v); i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}); ctx.stroke(); }
    tr.querySelector('.spark').appendChild(cvs);
  });
}
document.getElementById('cmpBtn').addEventListener('click', compareUnion);

/* ========= Dividends Pivot ========= */
(function(){
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  async function fetchDivs(t){ const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=12y&interval=1mo&events=div`); const j=await r.json(); const ev=j.chart?.result?.[0]?.events?.dividends||{}; return Object.values(ev).map(e=>({ts:e.date*1000, amount:e.amount})).sort((a,b)=>a.ts-b.ts); }
  function pivot(list){ const by=new Map(); list.forEach(d=>{const dt=new Date(d.ts), y=dt.getFullYear(), m=dt.getMonth(); if(!by.has(y)) by.set(y,{sum:Array(12).fill(0), cnt:Array(12).fill(0)}); const row=by.get(y); row.sum[m]+=d.amount; row.cnt[m]+=1;}); const years=[...by.keys()].sort((a,b)=>a-b); const sumRows=years.map(y=>[y,...by.get(y).sum]); const avgRows=years.map(y=>{const r=by.get(y); return [y, ...r.sum.map((v,i)=> r.cnt[i]?v/r.cnt[i]:0)];}); const totals={sum:Array(12).fill(0), cnt:Array(12).fill(0)}; years.forEach(y=>{const r=by.get(y); r.sum.forEach((v,i)=>totals.sum[i]+=v); r.cnt.forEach((v,i)=>totals.cnt[i]+=v);}); const grandSum=totals.sum.reduce((a,b)=>a+b,0); const grandAvg=totals.sum.map((v,i)=>totals.cnt[i]?v/totals.cnt[i]:0); return {years,sumRows,avgRows,totals,grandSum,grandAvg}; }
  function td(n){ return `<td class="num">${n===0?'-':n.toFixed(3)}</td>`; }
  function render(p){ const sumB=document.getElementById('divPivotSum'), avgB=document.getElementById('divPivotAvg'), info=document.getElementById('divPivotInfo'); sumB.innerHTML=p.sumRows.map(r=>`<tr><td>${r[0]}</td>${r.slice(1).map(td).join('')}</tr>`).join('')||'<tr><td colspan="13">No data</td></tr>'; avgB.innerHTML=p.avgRows.map(r=>`<tr><td>${r[0]}</td>${r.slice(1).map(td).join('')}</tr>`).join('')||'<tr><td colspan="13">No data</td></tr>'; if(info) info.textContent=`총 배당 합계: ${p.grandSum.toFixed(3)} USD  •  월평균(전체): ${p.grandAvg.map(v=>v.toFixed(3)).join(' | ')}`; const cvs=document.getElementById('divPivotChart'); if(!cvs) return; const ctx=cvs.getContext('2d'), w=cvs.width, h=cvs.height; ctx.clearRect(0,0,w,h); const totals=p.totals.sum; const mx=Math.max(...totals); const bw=Math.max(10,(w-40)/12); ctx.font='10px sans-serif'; totals.forEach((v,i)=>{const x=20+i*bw, bh=(v/(mx||1))*(h-30); ctx.fillRect(x,h-20-bh,bw-3,bh); ctx.fillText(MONTHS[i],x,h-6);}); }
  async function onLoad(){ const t=($('#divPivotTicker')?.value||'').trim().toUpperCase(); if(!t) return; document.getElementById('divPivotSum').innerHTML='<tr><td colspan="13">Loading…</td></tr>'; const list=await fetchDivs(t); render(pivot(list)); }
  const btn=document.getElementById('divPivotBtn'); if(btn && !btn._bind){ btn._bind=true; btn.addEventListener('click', onLoad); }
})();

/* ========= News (source/time/sentiment) ========= */
(function(){
  function hostname(u){ try{ return new URL(u).hostname.replace(/^www\\./,''); }catch{ return ''; } }
  function toLocal(s){ try{ const d=new Date(s); if(!isNaN(+d)) return d.toLocaleString(); }catch{} return ''; }
  const POS=['beat','surge','gain','grow','profit','record','up','buy','strong','bull','upgrade'];
  const NEG=['miss','plunge','drop','loss','down','sell','weak','bear','downgrade','fraud','lawsuit','default','layoff'];
  function senti(t){ t=(t||'').toLowerCase(); let s=0; POS.forEach(w=>{if(t.includes(w)) s+=1}); NEG.forEach(w=>{if(t.includes(w)) s-=1}); return s===0?'0':(s>0?'+':'-'); }
  async function fetchNews(q){
    try{ const r=await fetch(`/.netlify/functions/news?q=${encodeURIComponent(q)}`); if(r.ok){ const j=await r.json(); if(j?.items?.length) return j.items.map(x=>({title:x.title,url:x.url,source:x.source||hostname(x.url),time:x.time||x.publishedAt||'',senti:senti(x.title+' '+(x.summary||''))})); } }catch{}
    const rss=await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(q)}&region=US&lang=en-US`); const txt=await rss.text(); const items=[...txt.matchAll(/<item>([\\s\\S]*?)<\\/item>/g)].map(m=>m[1]);
    return items.map(it=>{ const title=(it.match(/<title>([\\s\\S]*?)<\\/title>/)||[])[1]?.replace(/<!\\[CDATA\\[|\\]\\]>/g,'')||''; const url=(it.match(/<link>(.*?)<\\/link>/)||[])[1]||''; const date=(it.match(/<pubDate>(.*?)<\\/pubDate>/)||[])[1]||''; return {title,url,source:hostname(url),time:date,senti:senti(title)}; });
  }
  async function run(){ const q=($('#newsInput')?.value||'').trim(); if(!q) return; const tb=document.getElementById('newsTbody'); tb.innerHTML='<tr><td colspan="5">Loading…</td></tr>'; const list=await fetchNews(q); tb.innerHTML=list.slice(0,30).map(it=>`<tr><td>${it.source||''}</td><td>${toLocal(it.time)}</td><td>${it.senti}</td><td><a href="${it.url}" target="_blank">${it.title}</a></td><td><a href="${it.url}" target="_blank">${it.url}</a></td></tr>`).join('')||'<tr><td colspan="5">No result</td></tr>'; }
  const btn=document.getElementById('newsBtn'); if(btn && !btn._bind){ btn._bind=true; btn.addEventListener('click', run); }
})();

/* ========= Alerts (GET/POST/DELETE) ========= */
async function alertList(){
  try{
    const r=await fetch('/.netlify/functions/alert'); const j=await r.json(); const arr=j.items||j||[];
    const tb=document.getElementById('alertTbody'); tb.innerHTML = arr.map(a=>`
      <tr><td>${a.ticker}</td><td class="num">${a.drop}%</td><td>${a.phone||'-'}</td><td class="num">${a.base??'-'}</td>
      <td><button class="alertDel" data-t="${a.ticker}">삭제</button></td></tr>
    `).join('') || '<tr><td colspan="5">등록 없음</td></tr>';
  }catch(e){ console.error(e); }
}
async function alertSave(){
  const t=$('#alertTicker').value.trim().toUpperCase(), d=+$('#alertDrop').value, p=($('#alertPhone')?.value||'').trim();
  if(!t||!d) return;
  await fetch('/.netlify/functions/alert', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ticker:t, drop:d, phone:p})});
  await alertList();
}
async function alertDelete(t){ await fetch(`/.netlify/functions/alert?ticker=${encodeURIComponent(t)}`,{method:'DELETE'}); await alertList(); }
function bindAlerts(){
  $('#alertSaveBtn').addEventListener('click', alertSave);
  const tb=document.getElementById('alertTbody');
  tb.addEventListener('click', e=>{ const b=e.target.closest('.alertDel'); if(b) alertDelete(b.dataset.t); });
  alertList();
}

/* ========= Init ========= */
(async function init(){
  loadLS(); bindPortfolio(); bindAlerts(); await fetchFX(); await recalcAll();
})();
