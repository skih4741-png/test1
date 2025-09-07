
import fetch from "node-fetch";
import twilio from "twilio";
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Example portfolio; replace with persistent storage (KV/DB)
const PORT = JSON.parse(process.env.ALERT_PORTFOLIO || `[{"symbol":"AAPL","avg":180,"dropPct":8},{"symbol":"MO","avg":45,"dropPct":5}]`);

export const handler = async () => {
  try{
    const q = await fetch(`/.netlify/functions/yahoo-quote?symbols=${PORT.map(p=>p.symbol).join(",")}`).then(r=>r.json());
    const m = {};
    (q.quoteResponse?.result||[]).forEach(it=> m[it.symbol]=it.regularMarketPrice);

    const alerts = PORT.filter(p=> m[p.symbol] !== undefined && ((m[p.symbol] - p.avg) / p.avg)*100 <= -p.dropPct );
    if (alerts.length) {
      const body = alerts.map(a=> `[${a.symbol}] ${m[a.symbol].toFixed(2)} USD (${a.dropPct}%↓ 기준 도달)`).join("\n");
      await client.messages.create({ from: process.env.TWILIO_FROM, to: process.env.ALERT_PHONE, body:`[가격하락 알림]\n${body}` });
    }
    return { statusCode: 200, body: JSON.stringify({ checked: PORT.length, alerts: alerts.map(a=>a.symbol) }) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error:e.message }) };
  }
};
