"use strict";

const { LocalTesseractReceiptExtractionProvider } = require("../server/expense-extraction-core");

const ALLOWED_ORIGINS = new Set([
  "https://sauberplus.plus", "https://www.sauberplus.plus", "https://sauberplus.vercel.app",
  "http://127.0.0.1:8768", "http://localhost:8768"
]);

function respond(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return false;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return true;
}

async function requireSuperAdmin(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const profileResponse = await fetch(`${url}/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.id)}&select=role,disabled,archived_at`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  if (!profileResponse.ok) return null;
  const profile = (await profileResponse.json())[0];
  return profile && profile.role === "super_admin" && !profile.disabled && !profile.archived_at ? { token, userId: user.id, url, anon } : null;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 4096) throw new Error("BODY_TOO_LARGE"); }
  return raw ? JSON.parse(raw) : {};
}

async function loadReceipt(context, receiptId) {
  const headers = { apikey: context.anon, Authorization: `Bearer ${context.token}` };
  const lookup = await fetch(`${context.url}/rest/v1/expense_receipts?id=eq.${encodeURIComponent(receiptId)}&created_by=eq.${encodeURIComponent(context.userId)}&status=eq.pending&select=id,storage_path,mime_type,size_bytes`, { headers });
  if (!lookup.ok) throw new Error("RECEIPT_LOOKUP_FAILED");
  const receipt = (await lookup.json())[0];
  if (!receipt || receipt.size_bytes > 10485760) return null;
  const objectPath = receipt.storage_path.split("/").map(encodeURIComponent).join("/");
  const objectResponse = await fetch(`${context.url}/storage/v1/object/expense-receipts/${objectPath}`, { headers });
  if (!objectResponse.ok) throw new Error("RECEIPT_DOWNLOAD_FAILED");
  return { ...receipt, buffer: Buffer.from(await objectResponse.arrayBuffer()) };
}

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return respond(res, 403, { error: "ORIGIN_NOT_ALLOWED" });
  if (req.method === "OPTIONS") return respond(res, 204, {});
  if (req.method !== "POST") return respond(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try {
    const context = await requireSuperAdmin(req);
    if (!context) return respond(res, 401, { error: "UNAUTHORIZED" });
    const body = await readBody(req);
    if (!/^[0-9a-f-]{36}$/i.test(String(body.receiptId || ""))) return respond(res, 400, { error: "INVALID_RECEIPT" });
    const receipt = await loadReceipt(context, body.receiptId);
    if (!receipt) return respond(res, 404, { error: "RECEIPT_NOT_FOUND" });
    const result = await new LocalTesseractReceiptExtractionProvider().extract(receipt.buffer, receipt.mime_type);
    if (!result.available) return respond(res, 422, { error: result.reason, manualFallback: true });
    return respond(res, 200, { extraction: result.data, provider: "local_tesseract" });
  } catch (error) {
    return respond(res, error && error.message === "BODY_TOO_LARGE" ? 413 : 503, { error: error && error.message || "EXTRACTION_UNAVAILABLE", manualFallback: true });
  }
};
