
const { json } = require('./_util.js');

function summarize(text, max=400){
  const sents = text.split(/[.!?]\s+/).slice(0,6);
  return sents.join('. ') + (sents.length>0?'.':'');
}

async function translateKO(text){
  const url = process.env.TRANSLATE_URL;
  if(!url) return null;
  try{
    const res = await fetch(url, {method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({q:text, source:'en', target:'ko', format:'text', api_key: process.env.TRANSLATE_API_KEY||undefined})});
    const j = await res.json();
    return j.translatedText || null;
  }catch{ return null; }
}

export default async (req) => {
  const url = new URL(req.url);
  const ticker = url.searchParams.get('ticker');
  try{
    const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${ticker}`);
    const j = await r.json();
    const news = (j.news || []).slice(0,6).map(n=>({title:n.title, link:n.link, source:n.publisher, time:n.providerPublishTime, summary:n.summary||''}));
    for (const n of news){
      const s = n.summary || n.title;
      n.summary = summarize(s);
      n.summary_ko = await translateKO(n.summary);
    }
    return json({items: news});
  }catch(e){ return json({error:String(e)},500); }
}
