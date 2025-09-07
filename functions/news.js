
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export const handler = async (event) => {
  try{
    const { symbol="AAPL" } = event.queryStringParameters || {};
    const url = `https://finance.yahoo.com/quote/${symbol}`;
    const html = await (await fetch(url, { headers:{ "User-Agent":"Mozilla/5.0" }})).text();
    const $ = cheerio.load(html);

    const items = [];
    $('h3 a').each((_,a)=>{
      const title = $(a).text().trim();
      let href = $(a).attr('href')||"";
      if (href && href.startsWith("/")) href = "https://finance.yahoo.com"+href;
      if (title) items.push({ title, link: href });
    });
    return { statusCode: 200, body: JSON.stringify({ symbol, items: items.slice(0,10) }) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
