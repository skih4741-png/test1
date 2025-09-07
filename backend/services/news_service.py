from typing import List, Dict, Any
import requests
from bs4 import BeautifulSoup
from readability import Document

def fetch_article_clean(url: str) -> str:
    try:
        r = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
        if not r.ok:
            return ''
        doc = Document(r.text)
        html = doc.summary()
        soup = BeautifulSoup(html, 'lxml')
        text = soup.get_text('\n')
        return text.strip()
    except Exception:
        return ''
