
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { json } from './_util.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const ticker = url.searchParams.get('ticker');
  if(!ticker) return json({error:'ticker required'},400);
  try{
    const res = await fetch(`https://www.macrotrends.net/stocks/charts/${ticker}/${ticker}/key-financial-ratios`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const text = $('body').text();
    function findNumber(re){ const m = text.match(re); return m ? parseFloat(m[1]) : null; }
    const out = {
      PER: findNumber(/Price\/Earnings Ratio.*?([0-9.]+)\s*$/m) || null,
      PBR: findNumber(/Price\/Book Ratio.*?([0-9.]+)\s*$/m) || null,
      PSR: findNumber(/Price\/Sales Ratio.*?([0-9.]+)\s*$/m) || null,
      ROE: findNumber(/Return on Equity.*?([0-9.]+)\%/m) || null
    };
    return json(out);
  }catch(e){ return json({error:String(e)},500); }
}
