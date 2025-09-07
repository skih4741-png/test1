const API = (path, params={}) => {
  const u = new URL((window.BACKEND_URL || 'http://127.0.0.1:8000') + path);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
  return fetch(u).then(r=>r.json());
};

let priceChart;
async function loadSignals(){
  const tickers = document.getElementById('tickers').value || 'AAPL';
  const t = tickers.split(',')[0].trim();
  const series = await API('/api/signals',{ticker:t});
  const ctx = document.getElementById('priceChart').getContext('2d');
  const labels = series.series.map(x=>x.Date);
  const close = series.series.map(x=>x.Close);
  const ema20 = series.series.map(x=>x.EMA20);
  const ema50 = series.series.map(x=>x.EMA50);
  if(priceChart) priceChart.destroy();
  priceChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Close', data: close },
      { label: 'EMA20', data: ema20 },
      { label: 'EMA50', data: ema50 },
    ]},
    options: { responsive: true, scales: { x: { display: false } } }
  });
  const sigDiv = document.getElementById('signals');
  sigDiv.innerHTML = '<b>Signals:</b><br>' + series.signals.map(s=>`${s.date} → ${s.type} @ ${s.price.toFixed(2)}`).join('<br>');
}

async function loadDividends(){
  const t = document.getElementById('divTicker').value || 'AAPL';
  const rows = await API('/api/dividends',{ticker:t});
  const tbl = document.getElementById('divTable');
  tbl.innerHTML = '<tr><th>Year</th><th>Month</th><th>Div</th></tr>' + rows.map(r=>`<tr><td>${r.year}</td><td>${r.month}</td><td>${r.dividends.toFixed(4)}</td></tr>`).join('');
  const ctx = document.getElementById('divChart').getContext('2d');
  const labels = rows.map(r=>`${r.year}-${String(r.month).padStart(2,'0')}`);
  const data = rows.map(r=>r.dividends);
  if(window.divChart) window.divChart.destroy();
  window.divChart = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'Monthly Dividends', data }] }, options:{ responsive:true } });
}

async function loadRealYield(){
  const t = document.getElementById('ryTicker').value || 'AAPL';
  const shares = document.getElementById('ryShares').value;
  const avg = document.getElementById('ryAvg').value;
  const div = document.getElementById('ryAnnualDiv').value;
  const res = await API('/api/real_yield',{ticker:t, shares, avg_cost:avg, annual_dividend:div});
  document.getElementById('ryOut').textContent = JSON.stringify(res,null,2);
}

async function loadNews(){
  const tickers = document.getElementById('tickers').value || 'AAPL';
  const t = tickers.split(',')[0].trim();
  const items = await API('/api/news',{ticker:t, translate:true});
  const sigDiv = document.getElementById('signals');
  sigDiv.innerHTML = '<b>뉴스 요약/번역 (상위 10)</b><br>' + items.map(n=>`<div style="margin:6px 0"><a href="${n.link}" target="_blank">${n.title}</a><br>${n.title_ko}<br><small>${n.summary_ko?.slice(0,240) || ''}...</small></div>`).join('');
}

async function runScreen(){
  const t = document.getElementById('scrTickers').value || 'AAPL,MSFT,AMZN,GOOGL,TSLA,JNJ,VZ,NLY,FSK,MO,NWN,QQQ,VOO';
  const rows = await API('/api/screener',{ tickers:t, per_min:1.5, psr_min:3, roe_min:15, per_max:15 });
  const tbl = document.getElementById('scrTable');
  tbl.innerHTML = '<tr><th>Ticker</th><th>ROE%</th><th>PER</th><th>PSR</th></tr>' + rows.map(r=>`<tr><td>${r.ticker}</td><td>${(r.roe??0).toFixed(2)}</td><td>${(r.pe??0).toFixed(2)}</td><td>${(r.psr??0).toFixed(2)}</td></tr>`).join('');
}


async function loadPortfolio(){
  const data = await API('/api/portfolio');
  document.getElementById('portfolioJson').value = JSON.stringify(data, null, 2);
}
async function savePortfolio(){
  const raw = document.getElementById('portfolioJson').value;
  try{
    const obj = JSON.parse(raw);
    await API('/api/portfolio', obj, 'POST');
    alert('저장 완료');
  }catch(e){
    alert('JSON 형식 오류');
  }
}
async function analyzePortfolio(){
  const res = await API('/api/portfolio/analysis');
  const sum = res.summary;
  document.getElementById('pfSummary').innerHTML =
    `총원가(KRW): ${sum.total_cost_krw.toFixed(0)} | 평가액(KRW): ${sum.total_mv_krw.toFixed(0)} | 손익(KRW): ${sum.total_pnl_krw.toFixed(0)} (${sum.total_pnl_pct.toFixed(2)}%) | 세후배당(KRW): ${sum.after_tax_div_krw.toFixed(0)}`;
  const rows = res.rows||[];
  const tbl = document.getElementById('pfTable');
  tbl.innerHTML = '<tr><th>Ticker</th><th>수량</th><th>평단</th><th>현재가</th><th>원가</th><th>평가</th><th>P/L</th><th>P/L%</th><th>세후TTM배당</th><th>YoC%</th><th>현재배당%</th></tr>' +
    rows.map(r=>`<tr><td>${r.ticker}</td><td>${r.shares}</td><td>${r.avg_cost.toFixed(2)}</td><td>${r.price?.toFixed(2)||'-'}</td><td>${r.cost.toFixed(2)}</td><td>${r.mv.toFixed(2)}</td><td>${r.pnl.toFixed(2)}</td><td>${(r.pnl_pct||0).toFixed(2)}</td><td>${(r.div_after_tax||0).toFixed(2)}</td><td>${(r.yoc_pct||0).toFixed(2)}</td><td>${(r.current_yield_pct||0).toFixed(2)}</td></tr>`).join('');
}


async function runReport(){
  const bm = document.getElementById('benchmark').value || '^GSPC';
  const days = parseInt(document.getElementById('lookback').value||'1095');
  const rep = await API(`/api/portfolio/report?benchmark=${encodeURIComponent(bm)}&days=${days}`);
  document.getElementById('reportJson').textContent = JSON.stringify(rep, null, 2);

  // draw equity chart
  const ser = await API(`/api/portfolio/series?benchmark=${encodeURIComponent(bm)}&days=${days}`);
  const labels = Object.keys(ser.series.portfolio_equity);
  const p = Object.values(ser.series.portfolio_equity);
  const b = Object.values(ser.series.benchmark_equity);
  const ctx = document.getElementById('eqChart').getContext('2d');
  if(window._eqc) window._eqc.destroy();
  window._eqc = new Chart(ctx, {
    type:'line', data:{ labels, datasets:[
      {label:'Portfolio', data:p},
      {label:'Benchmark', data:b}
    ]}
  });

  // sector pie
  const sectors = rep.sectors||[];
  const sctx = document.getElementById('sectorChart').getContext('2d');
  if(window._sc) window._sc.destroy();
  window._sc = new Chart(sctx, {
    type:'pie', data:{ labels: sectors.map(s=>s.sector), datasets:[{ data: sectors.map(s=>s.weight_pct) }]}
  });
}
