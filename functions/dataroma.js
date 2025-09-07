
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export const handler = async (event) => {
  try{
    const { symbol = "AAPL" } = event.queryStringParameters || {};
    const url = `https://www.dataroma.com/m/stock.php?sym=${symbol}`;
    const html = await (await fetch(url, { headers: { "User-Agent":"Mozilla/5.0" }})).text();
    const $ = cheerio.load(html);

    const holders = [];
    $("#grid tr").each((_, tr)=>{
      const tds = $(tr).find("td");
      if (tds.length >= 3) {
        holders.push({
          fund: $(tds[0]).text().trim(),
          percent: $(tds[1]).text().trim(),
          activity: $(tds[2]).text().trim()
        });
      }
    });
    return { statusCode: 200, body: JSON.stringify({ symbol, holders: holders.slice(0,12) }) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
