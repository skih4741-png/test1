
import * as cheerio from 'cheerio';
const { json } = require('./_util.js');

export default async (req) => {
  const cookie = process.env.VIC_COOKIE;
  if (!cookie) return json({warning:'VIC_COOKIE not set; skipping VIC fetch'});
  try{
    const res = await fetch('https://valueinvestorsclub.com/ideas', { headers:{ cookie } });
    const html = await res.text();
    const $ = cheerio.load(html);
    const ideas = [];
    $('.ideas-list .idea').each((_,el)=>{
      const title = $(el).find('.title').text().trim();
      const ticker = (title.match(/\(([A-Z.]+)\)/)||[])[1];
      ideas.push({title, ticker});
    });
    return json({ideas});
  }catch(e){ return json({error:String(e)},500); }
}
