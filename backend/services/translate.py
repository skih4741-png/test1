import os, requests
from typing import Optional

TARGET_LANG = os.getenv('GOOGLE_TARGET_LANG', 'ko')

def translate_text(text: str, target_lang: Optional[str] = None) -> str:
    key = os.getenv('DEEPL_API_KEY')
    lang = (target_lang or TARGET_LANG or 'ko').upper()
    if not text:
        return text
    if key:
        try:
            res = requests.post('https://api-free.deepl.com/v2/translate', data={'auth_key': key, 'text': text, 'target_lang': lang}, timeout=10)
            if res.ok:
                data = res.json()
                return '\n'.join([t['text'] for t in data.get('translations', [])])
        except Exception:
            pass
    return text
