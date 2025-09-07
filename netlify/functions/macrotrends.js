
const { json } = require('./_util.js');
exports.handler = async (event) => {
  const url = new URL(event.rawUrl || event.url);
  const t = url.searchParams.get('ticker');
  if(!t) return json({error:'ticker required'},400);
  try{
    const r = await fetch(`https://www.macrotrends.net/stocks/charts/${t}/${t}/key-financial-ratios`, { headers: { 'user-agent':'Mozilla/5.0', 'accept':'text/html,application/xhtml+xml' } });
    const html = await r.text();
    function pick(re){ const m = html.match(re); return m ? parseFloat(m[1]) : null; }
    const out = {
      PER: pick(/Price\/Earnings Ratio[\s\S]*?<td[^>]*>([0-9.]+)<\/td>/i),
      PBR: pick(/Price\/Book Ratio[\s\S]*?<td[^>]*>([0-9.]+)<\/td>/i),
      PSR: pick(/Price\/Sales Ratio[\s\S]*?<td[^>]*>([0-9.]+)<\/td>/i),
      ROE: pick(/Return on Equity[\s\S]*?<td[^>]*>([0-9.]+)\%<\/td>/i)
    };
    return json(out);
  }catch(e){ return json({error:String(e)},500); }
}
