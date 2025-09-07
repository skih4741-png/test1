import fetch from "node-fetch";
import cheerio from "cheerio";

async function translateKo(text){
  try{
    if(process.env.TRANSLATE_PROVIDER==="libre" && process.env.LIBRE_TRANSLATE_URL){
      const r = await fetch(`${process.env.LIBRE_TRANSLATE_URL}/translate`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({q:text, source:'en', target:'ko'})});
      const j = await r.json(); return j.translatedText||text;
    }
  }catch{}
  return text;
}

export const handler = async ()=>{
  const url = "https://www.dararoma.com/"; // placeholder: landing, adjust to actual path for articles
  const r = await fetch(url);
  const html = await r.text();
  const $ = cheerio.load(html);
  const items = [];
  $('a').slice(0,10).each((i,el)=>{
    const title = ($(el).text()||"").trim();
    const href = $(el).attr('href');
    if(title.length>10 && href && href.startsWith('http')) items.push({title, url:href});
  });
  for(const it of items){
    it.title_ko = await translateKo(it.title);
  }
  return {statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({items})};
};
