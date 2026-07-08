const crypto = require("node:crypto");

const COUNTER_KEY = process.env.VISITOR_COUNTER_KEY || "sauberplus:visitor-count";
const SESSION_COOKIE_NAME = process.env.VISITOR_COUNTER_COOKIE_NAME || "sp_visitor_session";
const SESSION_HEADER_NAME = "x-visitor-session";
const SESSION_TTL_SECONDS = Number(process.env.VISITOR_COUNTER_SESSION_TTL_SECONDS || 60 * 60 * 24 * 30);
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

function getHeader(request, name) {
  return request.headers[name.toLowerCase()] || request.headers[name] || "";
}

function applyCors(request, response) {
  const origin = getHeader(request, "origin");
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-Visitor-Session");
}

function sendJson(request, response, statusCode, payload) {
  applyCors(request, response);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.end(JSON.stringify(payload));
}

function parseCookies(request) {
  const cookieHeader = getHeader(request, "cookie");

  return cookieHeader.split(";").reduce((cookies, cookie) => {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) {
      return cookies;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();

    if (name) {
      cookies[name] = value;
    }

    return cookies;
  }, {});
}

function isValidSessionId(sessionId) {
  return /^[A-Za-z0-9_-]{32,80}$/.test(sessionId || "");
}

function createSessionId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return crypto.randomBytes(32).toString("hex");
}

function getCookieDomain(request) {
  if (process.env.VISITOR_COUNTER_COOKIE_DOMAIN) {
    return process.env.VISITOR_COUNTER_COOKIE_DOMAIN;
  }

  const host = getHeader(request, "host").split(":")[0].toLowerCase();

  if (host === "api.sauberplus.plus" || host.endsWith(".sauberplus.plus")) {
    return ".sauberplus.plus";
  }

  return "";
}

function buildSessionCookie(request, sessionId) {
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None"
  ];
  const cookieDomain = getCookieDomain(request);

  if (cookieDomain) {
    cookieParts.push(`Domain=${cookieDomain}`);
  }

  return cookieParts.join("; ");
}

async function requestRedis(command) {
  const { url, token } = getRedisConfig();

  if (!url || !token) {
    throw new Error("Visitor counter storage is not configured");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Visitor counter storage request failed");
  }

  const data = await response.json();

  if (data.error) {
    throw new Error("Visitor counter storage command failed");
  }

  return data.result;
}

function normalizeTotal(value) {
  const total = Number(value || 0);
  return Number.isFinite(total) && total >= 0 ? total : 0;
}

async function readTotal() {
  return normalizeTotal(await requestRedis(["GET", COUNTER_KEY]));
}

async function countSession(sessionId) {
  const sessionKey = `${COUNTER_KEY}:sessions:${sessionId}`;
  const sessionCreated = await requestRedis([
    "SET",
    sessionKey,
    "1",
    "EX",
    SESSION_TTL_SECONDS,
    "NX"
  ]);

  if (sessionCreated === "OK") {
    return {
      total: normalizeTotal(await requestRedis(["INCR", COUNTER_KEY])),
      counted: true
    };
  }

  return {
    total: await readTotal(),
    counted: false
  };
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
    if (request.method === "GET") {
      sendJson(request, response, 200, {
        total: await readTotal(),
        counted: false
      });
      return;
    }

    const cookies = parseCookies(request);
    const existingSessionId = cookies[SESSION_COOKIE_NAME];
    const headerSessionId = getHeader(request, SESSION_HEADER_NAME);
    const sessionId = isValidSessionId(existingSessionId)
      ? existingSessionId
      : isValidSessionId(headerSessionId)
        ? headerSessionId
        : createSessionId();
    const result = await countSession(sessionId);

    response.setHeader("Set-Cookie", buildSessionCookie(request, sessionId));
    sendJson(request, response, 200, result);
  } catch (error) {
    sendJson(request, response, 503, {
      error: "Visitor counter unavailable"
    });
  }
}

module.exports = {
  handleVisitorCount,
  sendJson
};
