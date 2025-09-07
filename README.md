# Smart Trader v1 (Netlify + GitHub)

Features
- Yahoo Finance chart & quotes
- Macrotrends PER/PBR/PSR/ROE scraper
- DataRoma & VIC idea/holders snapshot
- Value screener (PER≤15, PBR≤1.5, PSR<3, ROE≥15)
- Monthly dividend aggregation
- Multi FX sources (exchangerate.host → fallback Yahoo FX)
- CSV portfolio import/export
- Price drop SMS alerts (Twilio)
- Translation endpoint (LibreTranslate-compatible)

## Deploy
1) Fork repo → Netlify "Deploy from GitHub"
2) Add Environment variables:
   - TRANSLATE_URL=https://libretranslate.de/translate  (or your own)
   - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, ALERT_PHONE
3) netlify dev