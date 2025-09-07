
import fetch from "node-fetch";

const MT = (s) => `/.netlify/functions/macrotrends?symbol=${s}`;

export const handler = async (event) => {
  try{
    const { symbols = "AAPL,MSFT,GOOGL,AMZN,META,JNJ,MO,KO,PG,UL", perMax=15, pbrMax=1.5, psrMax=3, roeMin=15 } = event.queryStringParameters || {};
    const list = symbols.split(",").map(s=>s.trim()).filter(Boolean);
    const results = await Promise.all(list.map(async sym=>{
      const r = await fetch(MT(sym));
      const j = await r.json();
      const pass = (j.per<=perMax) && (j.pbr<=pbrMax) && (j.psr<psrMax) && (j.roe>=roeMin);
      return { symbol: sym, ...j, pass };
    }));
    const ranked = results.filter(r=>r.pass).sort((a,b)=> (b.roe - a.roe) || (a.per - b.per));
    return { statusCode: 200, body: JSON.stringify({ criteria:{perMax,pbrMax,psrMax,roeMin}, ranked, all:results }) };
  }catch(e){
    return { statusCode:500, body: JSON.stringify({ error:e.message }) };
  }
};
