import fetch from "node-fetch";

async function translateKo(text){
  const provider = process.env.TRANSLATE_PROVIDER||"";
  if(!text) return "";
  try{
    if(provider==="google" && process.env.GOOGLE_TRANSLATE_API_KEY){
      const r = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_TRANSLATE_API_KEY}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({q:text, target:'ko'})
      });
      const j = await r.json();
      return j.data?.translations?.[0]?.translatedText || text;
    }else if(provider==="libre" && process.env.LIBRE_TRANSLATE_URL){
      const r = await fetch(`${process.env.LIBRE_TRANSLATE_URL}/translate`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({q:text, source:'en', target:'ko', format:'text'})
      });
      const j = await r.json();
      return j.translatedText || text;
    }
  }catch{}
  return text;
}

function summarize(s, n=300){
  if(!s) return "";
  return s.length>n ? s.slice(0,n)+"..." : s;
}

export const handler = async (event)=>{
  const {q} = event.queryStringParameters||{};
  if(!q) return {statusCode:400, body:"q required"};
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=8`;
  const r = await fetch(url); const j = await r.json();
  const items = (j.news||[]).map(n=>({title:n.title, url:n.link, time:(n.providerPublishTime||Date.now()*0.001)*1000}));
  const detailed = [];
  for(const it of items){
    let sumText = it.title;
    try{
      // As a placeholder, use title as "summary". In production, fetch article and summarize.
      const koTitle = await translateKo(it.title);
      const koSum = await translateKo(summarize(sumText));
      detailed.push({...it, summary: summarize(sumText), title_ko: koTitle, summary_ko: koSum});
    }catch{
      detailed.push({...it, summary: summarize(sumText)});
    }
  }
  return {statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({items:detailed})};
};
