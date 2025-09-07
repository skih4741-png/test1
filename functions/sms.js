
import twilio from "twilio";
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const handler = async (event) => {
  try{
    const { to=process.env.ALERT_PHONE, msg="Alert" } = JSON.parse(event.body||"{}");
    const r = await client.messages.create({ from: process.env.TWILIO_FROM, to, body: msg });
    return { statusCode: 200, body: JSON.stringify({ sid:r.sid }) };
  }catch(e){
    return { statusCode: 500, body: JSON.stringify({ error:e.message }) };
  }
};
