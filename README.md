
# Smart Trader – Fixed Build

## What was broken
- `index.html` loaded `assets/app.js`, but the file was located at the project root (`/app.js`). This prevented **all UI buttons** from binding, so nothing worked.
- Serverless functions were at the project root while `netlify.toml` expects them under `netlify/functions/`.

## What was fixed
- Placed the app script at `assets/app.js` and ensured `index.html` points to it.
- Moved all functions into `netlify/functions/` to match `netlify.toml`.
- Kept your existing logic intact.

## How to run locally (Netlify CLI)
```bash
npm i -g netlify-cli
netlify dev
```
Then open the printed localhost URL.

## How to deploy
- Push this folder to a repo and connect to Netlify, or run:
```bash
netlify deploy --prod --dir="."
```
Netlify will build functions from `netlify/functions/` as specified in `netlify.toml`.
The alert job is scheduled via:
```
[[scheduled]]
  path = "/.netlify/functions/alert"
  schedule = "*/5 * * * *"
```

## Notes
- Yahoo Finance endpoints are accessed via your serverless `/.netlify/functions/*` to avoid CORS.
- For SMS alerts, set env variables on Netlify: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, and optionally `ALERT_TO_LIST` (comma-separated default recipients).


## 4개 사이트 연동 점검용 UI
- `/` 페이지에서 각 버튼으로 호출
- 서버리스 엔드포인트
  - `/.netlify/functions/yahoo?f=quote&ticker=USDKRW=X`
  - `/.netlify/functions/dataroma`
  - `/.netlify/functions/macrotrends?ticker=AAPL`
  - `/.netlify/functions/vic`

### 주의
- Value Investors Club 상세 본문은 로그인 필요. 본 함수는 공개 페이지에서 가능한 수준만 노출.
- 기존 `alert.js`는 업로드본 손상으로 제외했습니다. 사용 의사가 있으면 원본 전체 코드를 주시면 런타임 호환 포맷으로 복구해 드립니다.
