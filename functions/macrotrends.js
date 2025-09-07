
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export const handler = async (event) => {
  try{
    const { symbol = "AAPL" } = event.queryStringParameters || {};
    const url = `https://www.macrotrends.net/stocks/charts/${symbol}/${symbol.toLowerCase()}/financial-ratios`;
    const html = await (await fetch(url, { headers: { "User-Agent":"Mozilla/5.0" }})).text();
    const $ = cheerio.load(html);

    const take = (label) => {
      const row = $(`table tr:contains("${label}")`).first();
      const val = row.find("td").eq(1).text().trim();
      return parseFloat((val||"").replace(/[^0-9.\-]/g,""));
    };

    const res = {
      symbol,
      per: take("Price to Earnings Ratio"),
      pbr: take("Price to Book Ratio"),
      psr: take("Price to Sales Ratio"),
      roe: take("Return on Equity")
    };
    return { statusCode: 200, body: JSON.stringify(res) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
