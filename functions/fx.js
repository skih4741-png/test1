
import fetch from "node-fetch";

async function fromExchangerateHost(base="USD", target="KRW"){
  const url = `https://api.exchangerate.host/latest?base=${base}&symbols=${target}`;
  const j = await (await fetch(url)).json();
  const rate = j?.rates?.[target];
  if (!rate) throw new Error("exchangerate.host fail");
  return { provider:"exchangerate.host", rate };
}

async function fromYahoo(base="USD", target="KRW"){
  const pair = `${base}${target}=X`;
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${pair}`;
  const j = await (await fetch(url, { headers:{ "User-Agent":"Mozilla/5.0" }})).json();
  const r = j?.quoteResponse?.result?.[0]?.regularMarketPrice;
  if (!r) throw new Error("yahoo fx fail");
  return { provider:"yahoo", rate: r };
}

export const handler = async (event) => {
  try{
    const { base="USD", target="KRW" } = event.queryStringParameters || {};
    try{
      const a = await fromExchangerateHost(base, target);
      return { statusCode:200, body: JSON.stringify(a) };
    }catch(_){
      const b = await fromYahoo(base, target);
      return { statusCode:200, body: JSON.stringify(b) };
    }
  }catch(e){
    return { statusCode:500, body: JSON.stringify({ error:e.message }) };
  }
};
