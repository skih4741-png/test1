
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
