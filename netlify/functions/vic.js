
const { json } = require('./_util.js');

exports.handler = async () => {
  try{
    // Public landing shows limited recent idea titles but details need login.
    const r = await fetch('https://www.valueinvestorsclub.com/');
    const html = await r.text();
    const items = [];
    // crude extraction: anchor text that looks like idea titles
    const re = /<a[^>]+href="\/idea\/[^"]+"[^>]*>(.*?)<\/a>/gi;
    let m; const seen = new Set();
    while ((m = re.exec(html)) && items.length < 20){
      const title = m[1].replace(/<[^>]+>/g,'').trim();
      if(!title || seen.has(title)) continue;
      seen.add(title);
      items.push({ title, url: 'https://www.valueinvestorsclub.com' });
    }
    if(items.length===0){
      return json({ items: [], note: 'VIC는 로그인 없이 상세 접근이 제한됩니다.' });
    }
    return json({ items, note: '상세 본문은 로그인 필요' });
  }catch(e){
    return json({ items: [], note: 'VIC 접근 실패(공개 페이지 제한 가능).', error: String(e) });
  }
};
