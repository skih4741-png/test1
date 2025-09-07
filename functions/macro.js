import fetch from "node-fetch";
import cheerio from "cheerio";

export const handler = async (event)=>{
  const {symbol} = event.queryStringParameters||{};
  if(!symbol) return {statusCode:400, body:"symbol required"};
  // Macrotrends P/E scrape example
  const url = `https://www.macrotrends.net/stocks/charts/${encodeURIComponent(symbol)}/${encodeURIComponent(symbol)}/pe-ratio`;
  const r = await fetch(url);
  const html = await r.text();
  const $ = cheerio.load(html);
  const table = $('#style-1 table tbody tr');
  const last = table.first();
  const date = last.find('td').eq(0).text().trim();
  const pe = parseFloat(last.find('td').eq(1).text().trim());
  return {statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({date, pe})};
};
