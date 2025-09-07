const $ = (s)=>document.querySelector(s);
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('section').forEach(x=>x.hidden=true);
  $('#tab-'+b.dataset.tab).hidden=false;
});
const port = [];

$('#add').onclick = ()=> {
  const s = $('#sym').value.trim().toUpperCase();
  const q = +$('#qty').value, a = +$('#avg').value;
  if(!s||!q||!a) return alert('입력값 확인');
  port.push({symbol:s, qty:q, avg:a});
  render();
};

async function fetchQuotes(symbols){
  const r = await fetch(`/.netlify/functions/yahoo-quote?symbols=${encodeURIComponent(symbols.join(','))}`);
  const j = await r.json();
  const m = {};
  (j.quoteResponse?.result||[]).forEach(it=>m[it.symbol]=it.regularMarketPrice);
  return m;
}

async function render(){
  const fx=+$('#fx').value, fee=+$('#fee').value/100;
  if (port.length===0) return;
  const m = await fetchQuotes(port.map(p=>p.symbol));
  const tb = $('#ptbl tbody'); tb.innerHTML="";
  let totalPL = 0;
  port.forEach(p=>{
    const now = m[p.symbol]||0;
    const pl = (now - p.avg) * p.qty - (now*p.qty*fee);
    totalPL += pl;
    const krw = (pl*fx).toFixed(0);
    const rr = ((now - p.avg)/p.avg*100).toFixed(2);
    const row = tb.insertRow();
    row.innerHTML = `<td>${p.symbol}</td><td>${p.qty}</td><td>${p.avg.toFixed(2)}</td><td>${now.toFixed(2)}</td><td class="${pl>=0?'pos':'neg'}">${pl.toFixed(2)}</td><td class="${pl>=0?'pos':'neg'}">${krw} KRW (${rr}%)</td>`;
  });
}

$('#recalc').onclick = render;

// Multi FX sync
$('#fxSync').onclick = async ()=>{
  const j = await (await fetch('/.netlify/functions/fx?base=USD&target=KRW')).json();
  if(j.rate){
    $('#fx').value = j.rate.toFixed(2);
    $('#fxSrc').textContent = ` (src: ${j.provider})`;
    render();
  } else alert('환율 갱신 실패');
};

// CSV import/export
function parseCSV(text){
  const lines = text.trim().split(/\r?\n/);
  const out = [];
  for(const ln of lines){
    const [symbol, qty, avg] = ln.split(',').map(x=>x.trim());
    if(symbol && qty && avg) out.push({symbol, qty:+qty, avg:+avg});
  }
  return out;
}
$('#csvLoad').onclick = ()=>{
  const f = $('#csvFile').files?.[0];
  if(!f) return alert('CSV 파일 선택');
  const rd = new FileReader();
  rd.onload = (e)=>{
    const arr = parseCSV(e.target.result);
    port.length = 0;
    arr.forEach(x=>port.push(x));
    render();
  };
  rd.readAsText(f);
};

$('#csvSave').onclick = ()=>{
  const rows = port.map(p=>[p.symbol,p.qty,p.avg].join(','));
  const blob = new Blob([rows.join('\n')], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'portfolio.csv';
  a.click();
};

// Screener
$('#scan').onclick = async ()=>{
  const uni = $('#universe').value;
  const r = await fetch(`/.netlify/functions/screener?symbols=${encodeURIComponent(uni)}`);
  const j = await r.json();
  const tb = $('#rtbl tbody'); tb.innerHTML="";
  j.ranked.forEach(x=>{
    const tr = tb.insertRow();
    tr.innerHTML = `<td>${x.symbol}</td><td>${x.roe?.toFixed?.(2)}</td><td>${x.per?.toFixed?.(2)}</td><td>${x.pbr?.toFixed?.(2)}</td><td>${x.psr?.toFixed?.(2)}</td>`;
  });
};

// Dividend monthly aggregation
$('#divFetch').onclick = async ()=>{
  const sym = $('#divSym').value.trim().toUpperCase();
  const j = await (await fetch(`/.netlify/functions/yahoo-chart?symbol=${sym}&range=5y&interval=1d`)).json();
  const ts = j.chart?.result?.[0]?.events?.dividends || {};
  const byMonth = {};
  Object.values(ts).forEach(d=>{
    const m = new Date(d.date*1000).toISOString().slice(0,7);
    byMonth[m] = (byMonth[m]||0) + d.amount;
  });
  const rows = Object.entries(byMonth).sort();
  const tb = $('#divTbl tbody'); tb.innerHTML="";
  rows.forEach(([m,v])=> tb.insertRow().innerHTML = `<td>${m}</td><td>${v.toFixed(2)}</td>`);
  const ctx = document.getElementById('divChart');
  if(window._divChart) window._divChart.destroy();
  window._divChart = new Chart(ctx,{ type:'bar', data:{ labels: rows.map(r=>r[0]), datasets:[{label:'월별 배당(USD)', data: rows.map(r=>r[1])}] }});
};

// News translate
$('#newsBtn').onclick = async ()=>{
  const sym = $('#newsSym').value.trim().toUpperCase();
  const n = await (await fetch(`/.netlify/functions/news?symbol=${sym}`)).json();
  const list = $('#newsList'); list.innerHTML="";
  for (const it of n.items) {
    const t = await (await fetch('/.netlify/functions/translate',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: it.title, source:'en', target:'ko' })})).json();
    const li = document.createElement('li');
    li.innerHTML = `<a href="${it.link}" target="_blank">${t.translated || it.title}</a>`;
    list.appendChild(li);
  }
};

// Alert hint only
$('#alertSave').onclick = ()=>{
  alert('환경변수 ALERT_PORTFOLIO 에 [{"symbol":"AAPL","avg":180,"dropPct":8}, ...] 형식으로 저장하세요.');
};