# SauberPlus Visitor Counter

The public website can be hosted as static HTML, including GitHub Pages. The visitor counter is served by a separate production backend and stores the total in Redis / Upstash.

## Frontend endpoint

The website reads the counter API URL from:

```js
window.SAUBERPLUS_CONFIG.visitorCounterApiUrl
```

Current production value:

```text
https://api.sauberplus.plus/api/visitor-count
```

## Backend options

### Option 1: Vercel serverless

Deploy this repository to Vercel and point `api.sauberplus.plus` to the Vercel project. The serverless endpoint is:

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

- `POST /api/visitor-count` increments the Redis counter by 1.
- `GET /api/visitor-count` reads the total without incrementing.
- The browser uses `sessionStorage` only to avoid counting the same browser session twice.
- The total persists in Redis and does not reset after deployment or server restart.
