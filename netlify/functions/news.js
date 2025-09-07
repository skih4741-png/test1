
const { json } = require('./_util.js');
exports.handler = async (event) => {
  const url = new URL(event.rawUrl || event.url);
  const q = url.searchParams.get('q');
  if(!q) return json({items:[]});
  try{
    const rss = await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(q)}&region=US&lang=en-US`);
    const txt = await rss.text();
    const items = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>m[1]).slice(0,30).map(it=>{
      const title = (it.match(/<title>([\s\S]*?)<\/title>/)||[])[1]?.replace(/<!\[CDATA\[|\]\]>/g,'')||'';
      const link = (it.match(/<link>(.*?)<\/link>/)||[])[1]||'';
      const date = (it.match(/<pubDate>(.*?)<\/pubDate>/)||[])[1]||'';
      return { title, url: link, time: date, source: '' };
    });
    return json({items});
  }catch(e){ return json({items:[]}); }
}
