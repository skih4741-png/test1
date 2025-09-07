
const { json } = require('./_util.js');

exports.handler = async () => {
  try{
    const res = await fetch('https://www.dataroma.com/m/home');
    const html = await res.text();
    const tickers = Array.from(new Set((html.match(/>[A-Z.]{1,6}</g)||[]).map(s=>s.slice(1,-1)))).slice(0,50);
    return json({tickers});
  }catch(e){ return json({error:String(e)},500); }
}
