const $ = (q)=>document.querySelector(q);
const $$ = (q)=>document.querySelectorAll(q);
const fmtUSD = (v)=>Number(v).toLocaleString('en-US',{style:'currency',currency:'USD'});
const fmtKRW = (v)=>Number(v).toLocaleString('ko-KR',{style:'currency',currency:'KRW'});

const state = {
  holdings: [], // {sym, qty, avg}
  fx: 1350, fee: 0.1, tax: 15, drip: false, timing: 'rsi',
  alerts: [] // {sym, thr, phone}
};

// Tabs
$$('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  $$('.panel').forEach(p=>p.classList.remove('active'));
  $('#'+btn.dataset.tab).classList.add('active');
}));

// Save/Load
$('#btn-save').onclick = ()=>{
  localStorage.setItem('smart_trader_state', JSON.stringify(state));
  alert('저장 완료');
};
$('#btn-load').onclick = ()=>{
  const s = localStorage.getItem('smart_trader_state');
  if(!s) return alert('저장 데이터가 없습니다');
  Object.assign(state, JSON.parse(s));
  renderHoldings();
  renderAlerts();
};

// Sample portfolio (from user's typical ETFs & stocks)
$('#load-sample').onclick = ()=>{
  state.holdings = [
    {sym:'TQQQ',qty:10,avg:50}, {sym:'QQQ',qty:5,avg:450},
    {sym:'VOO',qty:7,avg:380}, {sym:'FSK',qty:40,avg:20},
    {sym:'MO',qty:20,avg:45}, {sym:'NWN',qty:15,avg:38},
    {sym:'VZ',qty:30,avg:35}, {sym:'NLY',qty:60,avg:18},
    {sym:'JNJ',qty:6,avg:150}, {sym:'QQQY',qty:10,avg:18},
    {sym:'CONY',qty:20,avg:11}, {sym:'ULTI',qty:100,avg:11}
  ];
  renderHoldings();
};

// Add holding
$('#add').onclick = ()=>{
  const sym = $('#sym').value.trim().toUpperCase();
  const qty = Number($('#qty').value);
  const avg = Number($('#avg').value);
  if(!sym||!qty||!avg) return alert('티커/수량/평균매입가를 입력하세요');
  state.holdings.push({sym,qty,avg});
  $('#sym').value='';$('#qty').value='';$('#avg').value='';
  renderHoldings();
};

// Params
$('#fx').onchange = e=>state.fx = Number(e.target.value);
$('#fee').onchange = e=>state.fee = Number(e.target.value);
$('#tax').onchange = e=>state.tax = Number(e.target.value);
$('#drip').onchange = e=>state.drip = e.target.checked;
$('#timing').onchange = e=>state.timing = e.target.value;
$('#recalc').onclick = ()=>renderHoldings();

async function fetchQuote(sym){
  const res = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`);
  if(!res.ok) throw new Error('quote failed');
  return await res.json(); // {price, history:[{t, c}], rsi, smaFast, smaSlow, bb:{upper, lower}}
}

async function renderHoldings(){
  const tb = $('#holdings tbody'); tb.innerHTML='';
  const fx = state.fx, fee = state.fee, tax = state.tax;
  let labels=[], dataset=[];
  for(const h of state.holdings){
    try{
      const q = await fetchQuote(h.sym);
      const cur = q.price;
      const plUSD = (cur - h.avg) * h.qty - (cur*h.qty*fee/100);
      const plKRW = plUSD * fx;
      const rrKRW = (plKRW / (h.avg*h.qty*fx)) * 100;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${h.sym}</td>
        <td>${h.qty}</td>
        <td>${fmtUSD(h.avg)}</td>
        <td>${fmtUSD(cur)}</td>
        <td style="color:${plUSD>=0?'#7CFC7C':'#ff8f8f'}">${fmtUSD(plUSD)}</td>
        <td>${rrKRW.toFixed(2)}%</td>
        <td><button class="del" data-sym="${h.sym}">삭제</button></td>`;
      tb.appendChild(tr);
      labels = q.history.map(p=>new Date(p.t).toISOString().slice(0,10));
      dataset = q.history.map(p=>p.c);
      renderSignals(q, h.sym);
    }catch(e){
      console.error(e);
    }
  }
  drawLineChart(labels, dataset);
  // delete handlers
  $$('#holdings .del').forEach(btn=>btn.onclick = ()=>{
    const sym = btn.dataset.sym;
    state.holdings = state.holdings.filter(x=>x.sym!==sym);
    renderHoldings();
  });
}

function renderSignals(q, sym){
  const container = $('#signals');
  const div = document.createElement('div');
  div.className='badge';
  let msg='';
  if(state.timing==='rsi'){
    msg = q.rsi<=30 ? `💚 ${sym} RSI 과매도 -> 매수 유리` : (q.rsi>=70?`💥 ${sym} RSI 과매수 -> 매도 유력`:`😶 ${sym} 중립`);
  }else if(state.timing==='sma'){
    msg = q.smaFast>q.smaSlow ? `📈 ${sym} 골든크로스`:`📉 ${sym} 데드크로스`;
  }else{
    const last = q.history[q.history.length-1]?.c ?? 0;
    msg = last>=q.bb.upper ? `⚠️ ${sym} 상단 밴드 접근(과열)` : (last<=q.bb.lower?`✅ ${sym} 하단 밴드(저가 구간)`:`😶 ${sym} 밴드 내`);
  }
  div.textContent = msg;
  container.appendChild(div);
}

let priceChart;
function drawLineChart(labels, data){
  const ctx = $('#chart');
  if(priceChart){ priceChart.destroy(); }
  priceChart = new Chart(ctx, {
    type:'line',
    data:{labels, datasets:[{label:'가격', data, tension:0.2}]},
    options:{responsive:true, scales:{x:{display:false}}}
  });
}

// Compare
$('#cmp-run').onclick = async ()=>{
  const list = $('#cmp-input').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const tb = $('#cmp-table tbody'); tb.innerHTML='';
  for(const sym of list){
    try{
      const d = await (await fetch(`/api/factors?symbol=${sym}`)).json();
      const score = (d.ytd + d.oneY + d.divYld*2 + (1/d.pbr)*10 - d.volatility).toFixed(2);
      tb.insertAdjacentHTML('beforeend', `<tr>
        <td>${sym}</td><td>${d.ytd.toFixed(2)}%</td><td>${d.oneY.toFixed(2)}%</td><td>${d.divYld.toFixed(2)}%</td>
        <td>${d.pbr.toFixed(2)}</td><td>${d.volatility.toFixed(2)}</td><td>${score}</td>
      </tr>`);
    }catch{}
  }
};

// Dividends
$('#div-run').onclick = async ()=>{
  const sym = $('#div-ticker').value.trim().toUpperCase();
  if(!sym) return;
  const res = await (await fetch(`/api/dividends?symbol=${sym}&tax=${state.tax}`)).json();
  const months = Object.keys(res.monthly).sort((a,b)=>Number(a)-Number(b));
  const data = months.map(m=>res.monthly[m]);
  $('#div-table tbody').innerHTML = months.map((m,i)=>`<tr><td>${m}월</td><td>${data[i].toFixed(2)}</td></tr>`).join('');
  const ctx = $('#div-chart');
  new Chart(ctx, {type:'bar', data:{labels:months.map(m=>m+'월'), datasets:[{label:'세후 배당(USD)', data}]}});
};

// News translate/summarize
$('#news-run').onclick = async ()=>{
  const q = $('#news-q').value.trim();
  if(!q) return;
  const res = await (await fetch(`/api/news?q=${encodeURIComponent(q)}`)).json();
  $('#news-list').innerHTML = res.items.map(it=>`
    <div class="item">
      <h4>${it.title_ko || it.title}</h4>
      <div class="hint">${new Date(it.time).toLocaleString()}</div>
      <p>${it.summary_ko || it.summary}</p>
      <a href="${it.url}" target="_blank">원문</a>
    </div>`).join('');
};

// Alerts
$('#alert-add').onclick = ()=>{
  const sym = $('#alert-ticker').value.trim().toUpperCase();
  const thr = Number($('#alert-thr').value);
  const phone = $('#alert-phone').value.trim();
  if(!sym || !thr) return alert('티커와 임계치 %를 입력하세요');
  state.alerts.push({sym, thr, phone});
  renderAlerts();
  fetch('/api/alerts', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(state.alerts)});
  $('#alert-ticker').value=''; $('#alert-thr').value=''; $('#alert-phone').value='';
};
function renderAlerts(){
  const ul = $('#alert-items'); ul.innerHTML='';
  for(const a of state.alerts){
    const li = document.createElement('li');
    li.textContent = `${a.sym} ▼${a.thr}% ${a.phone?`→ ${a.phone}`:''}`;
    ul.appendChild(li);
  }
}
