
import fetch from "node-fetch";
export const handler = async (event) => {
  try{
    const { symbols = "AAPL,MSFT" } = event.queryStringParameters || {};
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    const r = await fetch(url, { headers: { "User-Agent":"Mozilla/5.0" }});
    const j = await r.json();
    return { statusCode: 200, body: JSON.stringify(j) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
