# Smart Trader Pro (Netlify Frontend + FastAPI Backend)

핵심 기능
- Yahoo Finance 시세/배당/뉴스 + 기술지표(EMA/RSI/MACD) 기반 매수·매도 시그널
- 월별 배당 합산 표/차트
- 현실 수익률(원화 환산/환율·세금·수수료/배당 재투자 옵션 자리)
- 멀티 종목 비교 랭킹 & 뉴스 자동 요약/번역(DeepL API 키 사용 시)
- % 하락 시 Twilio SMS 알림(백그라운드 스케줄러)
- 조건 스크리너 (PER 1.5~15, PSR ≥ 3, ROE ≥ 15)

참고: Macrotrends / Value Investors Club / DaraRoma는 공식 API가 없어 직접 스크래핑은 권장되지 않습니다. 
본 프로젝트는 우선 Yahoo Finance/공개 뉴스 원문 요약으로 동작하며, Macrotrends/VIC/DaraRoma는 링크 수집 + 요약/번역 방식으로 확장하도록 설계했습니다.

## 로컬 원클릭 실행
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env

uvicorn app:app --reload --host 0.0.0.0 --port 8000

# 프론트: 별도 터미널에서
python -m http.server 5500 -d ../frontend
```

## Netlify + GitHub 배포
- 저장소를 GitHub에 푸시 → Netlify에서 New site from Git → `publish=frontend` 자동 배포
- 백엔드(FastAPI)는 Render/Cloud Run/EC2 등으로 배포 후 `window.BACKEND_URL`을 Netlify 환경변수로 지정

## 환경변수(.env)
- ALERT_TICKERS, ALERT_DROP_PCT, TWILIO_*, DEEPL_API_KEY, GOOGLE_TARGET_LANG, CORS_ORIGINS

## 스크리너 조건
- PER 1.5~15, PSR ≥ 3, ROE ≥ 15 기준 충족 티커를 ROE 내림차순으로 표시
