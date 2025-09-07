
# Smart Trader (Netlify, KR-ready)

- Yahoo Finance / DataRoma / Macrotrends / (opt) VIC 연동
- 뉴스 자동 요약/번역(LibreTranslate)
- 월별 배당 합산/차트
- 현실 수익률(원화) 계산(환율·세금·수수료·재투자 옵션)
- 멀티 종목 비교·랭킹
- 버핏식 스크리너 (PER≤15, PBR≤1.5, PSR<3, ROE≥15 기본값)
- 가격 하락 알림(SMS, KR 번호 자동 변환)

## 배포
- GitHub에 푸시 → Netlify 연결.
- 환경변수:
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+8210xxxxxxx
ALERT_TO_LIST=+8210xxxxxxx    # 연락처 입력이 비어있을 때만 사용
TRANSLATE_URL=https://libretranslate.de/translate
TRANSLATE_API_KEY=            # optional
VIC_COOKIE=                   # optional
```
- 스케줄: **5분(*/5 * * * *)**

## 한국 번호 자동 변환(E.164)
- `010-1234-5678` → `+821012345678` 로 UI/서버 모두 변환·검증.

