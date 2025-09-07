
const $ = s => document.querySelector(s);
const showErr = m => { const e=$('#err'); e.style.display='block'; e.textContent = m; };
async function j(u){ const r = await fetch(u); if(!r.ok) throw new Error(r.status+' '+r.statusText); return r.json(); }

// Yahoo
$('#btnQuote').onclick = async ()=>{
  try{
    const t = $('#yhTicker').value.trim();
    const data = await j(`/.netlify/functions/yahoo?f=quote&ticker=${encodeURIComponent(t)}`);
    $('#yhOut').textContent = JSON.stringify(data, null, 2);
  }catch(e){ showErr('[Yahoo:quote] '+e.message); }
};
$('#btnDiv').onclick = async ()=>{
  try{
    const t = $('#yhTicker').value.trim();
    const data = await j(`/.netlify/functions/yahoo?f=dividends&ticker=${encodeURIComponent(t)}&range=12y`);
    $('#yhOut').textContent = JSON.stringify(data, null, 2);
  }catch(e){ showErr('[Yahoo:dividends] '+e.message); }
};
$('#btnSum').onclick = async ()=>{
  try{
    const t = $('#yhTicker').value.trim();
    const data = await j(`/.netlify/functions/yahoo?f=summary&ticker=${encodeURIComponent(t)}`);
    $('#yhOut').textContent = JSON.stringify(data, null, 2);
  }catch(e){ showErr('[Yahoo:summary] '+e.message); }
};
$('#btnChart').onclick = async ()=>{
  try{
    const t = $('#yhTicker').value.trim();
    const data = await j(`/.netlify/functions/yahoo?f=chart&ticker=${encodeURIComponent(t)}&range=6mo`);
    $('#yhOut').textContent = JSON.stringify({ points: data.prices?.length }, null, 2);
    // very simple canvas draw
    const c = $('#yhChart'); const ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
    const p = (data.prices||[]).filter(x=>x!=null); if(p.length<2) return;
    const w = c.clientWidth, h = c.clientHeight; c.width = w; c.height = h;
    const min = Math.min(...p), max = Math.max(...p);
    const sx = w/(p.length-1), sy = (max===min?1:(h-20)/(max-min));
    ctx.beginPath();
    p.forEach((v,i)=>{
      const x = i*sx, y = h - ((v-min)*sy) - 10;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  }catch(e){ showErr('[Yahoo:chart] '+e.message); }
};

// Dataroma
$('#btnDR').onclick = async ()=>{
  try{
    const data = await j('/.netlify/functions/dataroma');
    $('#drOut').textContent = JSON.stringify(data, null, 2);
  }catch(e){ showErr('[Dataroma] '+e.message); }
};

// Macrotrends
$('#btnMT').onclick = async ()=>{
  try{
    const t = $('#mtTicker').value.trim();
    const data = await j(`/.netlify/functions/macrotrends?ticker=${encodeURIComponent(t)}`);
    $('#mtOut').textContent = JSON.stringify(data, null, 2);
  }catch(e){ showErr('[Macrotrends] '+e.message); }
};

// VIC
$('#btnVIC').onclick = async ()=>{
  try{
    const data = await j('/.netlify/functions/vic');
    $('#vicOut').textContent = JSON.stringify(data, null, 2);
  }catch(e){ showErr('[VIC] '+e.message); }
};


// --- Alert save (test) ---
document.querySelector('#alSave').onclick = async ()=>{
  try{
    const t = document.querySelector('#alTicker').value.trim().toUpperCase();
    const d = parseFloat(document.querySelector('#alDrop').value||'0');
    const c = document.querySelector('#alContact').value.trim();
    // fetch current price as base
    const q = await j(`/.netlify/functions/yahoo?f=quote&ticker=${encodeURIComponent(t)}`);
    const base = q.price;
    const res = await j(`/.netlify/functions/alert?action=save&ticker=${encodeURIComponent(t)}&drop=${d}&contact=${encodeURIComponent(c)}&base=${base}`);
    document.querySelector('#alOut').textContent = JSON.stringify(res, null, 2);
  }catch(e){ showErr('[Alert] '+e.message); }
};


// ---- Fixed Criteria Screener ----
let scData = [];
async function runScreener(){
  const tickers = document.querySelector('#scTickers').value.trim();
  document.querySelector('#scBody').innerHTML = `<tr><td colspan="8">로딩...</td></tr>`;
  const url = `/.netlify/functions/screener` + (tickers? `?tickers=${encodeURIComponent(tickers)}` : '');
  const res = await j(url);
  scData = res.rows || [];
  if (scData.length === 0){
    document.querySelector('#scBody').innerHTML = `<tr><td colspan="8">결과 없음</td></tr>`;
    return;
  }
  const rows = scData.map(r => `<tr>
    <td>${r.ticker}</td>
    <td>${r.price ?? ''}</td>
    <td>${r.per ?? ''}</td>
    <td>${r.pbr ?? ''}</td>
    <td>${r.psr ?? ''}</td>
    <td>${r.roe ?? ''}</td>
    <td>${r.sector ?? ''}</td>
    <td>${r.marketCap ?? ''}</td>
  </tr>`).join('');
  document.querySelector('#scBody').innerHTML = rows;
}
document.querySelector('#scRun').onclick = ()=> runScreener();

function dl(name, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8;'}));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function toCSV(arr){
  const header = ['Ticker','Price','PER','PBR','PSR','ROE','Sector','MarketCap'];
  const lines = [header.join(',')].concat(arr.map(r => [
    r.ticker, r.price, r.per, r.pbr, r.psr, r.roe, `"${(r.sector||'').replace(/"/g,'""')}"`, r.marketCap
  ].join(',')));
  return lines.join('\n');
}
document.querySelector('#scCsv').onclick = ()=>{
  const csv = toCSV(scData);
  dl('screener.csv', csv);
};
document.querySelector('#scXls').onclick = ()=>{
  const csv = toCSV(scData); // simple CSV with .xlsx extension for convenience
  dl('screener.xlsx', csv);
};
