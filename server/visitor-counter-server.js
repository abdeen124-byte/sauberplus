const http = require("node:http");

const PORT = Number(process.env.PORT || 3000);
const COUNTER_KEY = process.env.VISITOR_COUNTER_KEY || "sauberplus:visitor-count";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.SauberPlus.plus",
  "https://SauberPlus.plus",
  "https://www.sauberplus.plus",
  "https://sauberplus.plus"
];

function getAllowedOrigins() {
  if (!process.env.ALLOWED_ORIGINS) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return process.env.ALLOWED_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getRedisConfig() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  };
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
}

function sendJson(request, response, statusCode, payload) {
  applyCors(request, response);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.end(JSON.stringify(payload));
}

async function requestRedis(command) {
  const { url, token } = getRedisConfig();

  if (!url || !token) {
    throw new Error("Visitor counter storage is not configured");
  }

  const response = await fetch(`${url}/${command}/${encodeURIComponent(COUNTER_KEY)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Visitor counter storage request failed");
  }

  const data = await response.json();
  return Number(data.result || 0);
}

async function handleVisitorCount(request, response) {
  if (request.method === "OPTIONS") {
    applyCors(request, response);
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    sendJson(request, response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const total = request.method === "POST"
      ? await requestRedis("incr")
      : await requestRedis("get");

    sendJson(request, response, 200, {
      total,
      counted: request.method === "POST"
    });
  } catch (error) {
    sendJson(request, response, 503, {
      error: "Visitor counter unavailable"
    });
  }
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/health") {
    sendJson(request, response, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname === "/api/visitor-count") {
    handleVisitorCount(request, response);
    return;
  }

  sendJson(request, response, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  process.stdout.write(`Visitor counter API listening on port ${PORT}\n`);
});
