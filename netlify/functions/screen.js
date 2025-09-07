
import * as cheerio from 'cheerio';
const { json } = require('./_util.js');


async function macro(ticker){
  try{
    const r = await fetch(`https://www.macrotrends.net/stocks/charts/${ticker}/${ticker}/key-financial-ratios`);
    const html = await r.text();
    function pick(re){ const m = html.match(re); return m ? parseFloat(m[1]) : null; }
    return {
      PER: pick(/Price\/Earnings Ratio[\s\S]*?<td[^>]*>([0-9.]+)<\/td>/i),
      PBR: pick(/Price\/Book Ratio[\s\S]*?<td[^>]*>([0-9.]+)<\/td>/i),
      PSR: pick(/Price\/Sales Ratio[\s\S]*?<td[^>]*>([0-9.]+)<\/td>/i),
      ROE: pick(/Return on Equity[\s\S]*?<td[^>]*>([0-9.]+)\%<\/td>/i)
    };
  }catch{ return {}; }
}

async function dataromaTop(){
  try{
    const r = await fetch('https://www.dataroma.com/m/home');
    const html = await r.text();
    const out = Array.from(new Set((html.match(/>[A-Z.]{1,6}</g)||[]).map(s=>s.slice(1,-1))));
    return out.slice(0,100);
  }catch{ return []; }
}
async function dataromaTop(){
  try{
    const r = await fetch('https://www.dataroma.com/m/home');
    const html = await r.text();
    const $ = cheerio.load(html);
    const out = [];
    $('table td a').each((_,el)=>{
      const t = $(el).text().trim();
      if (/^[A-Z.]{1,6}$/.test(t)) out.push(t);
    });
    return [...new Set(out)].slice(0,100);
  }catch{ return []; }
}

export default async (req) => {
  const url = new URL(req.url);
  const limPER = parseFloat(url.searchParams.get('per'))||15;
  const limPBR = parseFloat(url.searchParams.get('pbr'))||1.5;
  const limPSR = parseFloat(url.searchParams.get('psr'))||3;
  const limROE = parseFloat(url.searchParams.get('roe'))||15;
  const budgetMin = parseFloat(url.searchParams.get('budgetMin'))||0;
  const budgetMax = parseFloat(url.searchParams.get('budgetMax'))||1e12;
  const seeds = await dataromaTop();
  const results = [];
  for (const tk of seeds.slice(0,30)){
    const m = await macro(tk);
    if (m.PER && m.PBR && m.PSR && m.ROE){
      if (m.PER<=limPER && m.PBR<=limPBR && m.PSR<limPSR && m.ROE>=limROE){
        const q = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tk}`).then(r=>r.json()).then(j=>j.quoteResponse.result[0]||{});
        const price = q.regularMarketPrice || 0;
        if (price>=budgetMin && price<=budgetMax){
          results.push({ticker:tk, name:q.shortName, ...m, price, sources:['DataRoma','Macrotrends']});
        }
      }
    }
  }
  return json({results});
}
