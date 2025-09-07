# 스마트 트레이더 (Netlify + GitHub)

- **데이터 소스**: Yahoo Finance, Value Investors Club, DaraRoma, Macrotrends
- **기능**: 월별 배당 집계/차트, 현실 수익률(KRW/환율/세금/수수료/배당재투자), 멀티 종목 비교/랭킹, 뉴스 자동요약/번역, 가격 하락 SMS 알림, 매수/매도 타이밍 지표
- **호스팅**: Netlify (Functions 포함), GitHub 연동

> ⚠️ 무료/비공식 엔드포인트를 사용합니다. 상업적 사용 전 각 사이트 약관을 확인하세요.

## 환경변수 (Netlify → Site settings → Environment variables)
- `TRANSLATE_PROVIDER` = `google` 또는 `libre`
- `GOOGLE_TRANSLATE_API_KEY` = (선택) Google Cloud Translate API 키
- `LIBRE_TRANSLATE_URL` = (선택) LibreTranslate 엔드포인트 예: https://libretranslate.de
- `TWILIO_ACCOUNT_SID` = (선택) Twilio SID
- `TWILIO_AUTH_TOKEN` = (선택) Twilio Token
- `TWILIO_FROM_NUMBER` = (선택) +1234567890
- `DEFAULT_FX_BASE` = `USD`
- `DEFAULT_FX_QUOTE` = `KRW`

## 개발
```bash
npm i -g netlify-cli
netlify dev
```

## 배포
GitHub repo 에 푸시 → Netlify 에서 'New site from Git' → repo 연결 → deploy
