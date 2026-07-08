# SauberPlus Visitor Counter

The public website can be hosted as static HTML, including GitHub Pages. The visitor counter is served by a separate production backend and stores the total in Redis / Upstash.

## Frontend endpoint

The website reads the counter API URL from:

```js
window.SAUBERPLUS_CONFIG.visitorCounterApiUrl
```

Current production value:

```text
https://sauberplus.vercel.app/api/visitor-count
```

## Backend options

### Option 1: Vercel serverless

Deploy this repository to Vercel. The current public Vercel endpoint is:

```text
https://sauberplus.vercel.app/api/visitor-count
```

After DNS is configured, `api.sauberplus.plus` can point to the same Vercel project. The serverless endpoint is:

```text
api/visitor-count.js
```

### Option 2: Any Node server

Run:

```bash
node server/visitor-counter-server.js
```

Serve it behind HTTPS at:

```text
https://api.sauberplus.plus
```

## Required environment variables

Use either Vercel KV names:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

Or Upstash Redis names:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Optional:

```text
ALLOWED_ORIGINS=https://www.SauberPlus.plus,https://SauberPlus.plus
VISITOR_COUNTER_KEY=sauberplus:visitor-count
PORT=3000
```

## Behavior

- `POST /api/visitor-count` creates or reads an HTTP-only visitor session cookie.
- Redis stores both the persistent total and server-side session keys.
- The counter increments only when Redis creates a new session key.
- `GET /api/visitor-count` reads the total without incrementing.
- No `localStorage`, `sessionStorage`, random number, or browser-only fallback is used for the real counter.
- The total persists in Redis and does not reset after deployment or server restart.
