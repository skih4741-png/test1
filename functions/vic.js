
import fetch from "node-fetch";
import * as cheerio from "cheerio";

export const handler = async (event) => {
  try{
    const { query = "AAPL" } = event.queryStringParameters || {};
    const url = `https://www.valueinvestorsclub.com/idea?search=${encodeURIComponent(query)}`;
    const html = await (await fetch(url, { headers: { "User-Agent":"Mozilla/5.0" }})).text();
    const $ = cheerio.load(html);

    const ideas = [];
    $("a").each((_, a)=>{
      const text = $(a).text().trim();
      if (text.toUpperCase().includes(query.toUpperCase())) {
        ideas.push({ title: text });
      }
    });
    return { statusCode: 200, body: JSON.stringify({ query, ideas: ideas.slice(0,8) }) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
