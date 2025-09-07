
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { json } from './_util.mjs';

export default async (req) => {
  try{
    const res = await fetch(`https://www.dataroma.com/m/home`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const out = [];
    $('table td a').each((_,el)=>{
      const t = $(el).text().trim();
      if (/^[A-Z.]{1,6}$/.test(t)) out.push(t);
    });
    return json({tickers:[...new Set(out)].slice(0,50)});
  }catch(e){ return json({error:String(e)},500); }
}
