
import fetch from "node-fetch";
const URL = process.env.TRANSLATE_URL;

export const handler = async (event) => {
  try{
    const { text="", source="en", target="ko" } = JSON.parse(event.body||"{}");
    if(!URL) return { statusCode: 500, body: JSON.stringify({ error:"TRANSLATE_URL not set" }) };
    const r = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ q:text, source, target, format:"text" })
    });
    const j = await r.json();
    const translated = j.translatedText || j.data?.translatedText || "";
    return { statusCode: 200, body: JSON.stringify({ translated }) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
