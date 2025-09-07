
import fetch from "node-fetch";
export const handler = async (event) => {
  try{
    const { symbol = "AAPL", range = "1y", interval = "1d" } = event.queryStringParameters || {};
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&events=div%2Csplit`;
    const r = await fetch(url, { headers: { "User-Agent":"Mozilla/5.0" }});
    const j = await r.json();
    return { statusCode: 200, body: JSON.stringify(j) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
