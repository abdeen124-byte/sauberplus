const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "test-results");

function fixture(name) {
  let html = fs.readFileSync(path.join(root, `admin/${name}.html`), "utf8")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/gi, "")
    .replace("<head>", '<head><base href="/admin/">').replace('id="adminShell" hidden', 'id="adminShell"');
  if (name === "expense") {
    html = html.replace('<select id="categoryId" required></select>', '<select id="categoryId" required><option>Reinigungsmittel</option><option>Büro</option></select>')
      .replace('<select id="paidByPartner"></select>', '<select id="paidByPartner"><option>Mujahid</option></select>');
  } else {
    html = html.replace(/<section class="finance-summary" id="financeSummary"[^>]*>[\s\S]*?<\/section>/, '<section class="finance-summary" id="financeSummary"><article data-tone="income"><span>Einnahmen</span><strong>4.280,00 €</strong></article><article data-tone="expense"><span>Ausgaben</span><strong>1.196,40 €</strong></article><article data-tone="result"><span>Ergebnis</span><strong>3.083,60 €</strong></article><article data-tone="advance"><span>Offene Partner-Auslagen</span><strong>128,20 €</strong></article><article data-tone="contribution"><span>Einzahlungen</span><strong>270,00 €</strong></article><article data-tone="reimbursement"><span>Erstattungen</span><strong>75,00 €</strong></article></section>')
      .replace('<div id="expenseList" aria-live="polite"></div>', '<div id="expenseList"><div class="expense-table-wrap"><table class="expense-table"><thead><tr><th>Nummer</th><th>Lieferant</th><th>Datum</th><th>Kategorie</th><th>Brutto</th><th>Status</th></tr></thead><tbody><tr><td data-label="Nummer"><strong>EXP-2026-0001</strong></td><td data-label="Lieferant"><strong>METRO</strong><small>Reinigungsmaterial</small></td><td data-label="Datum">30.08.2026</td><td data-label="Kategorie">Reinigungsmittel</td><td data-label="Brutto"><strong>51,20 €</strong><small>8,17 € MwSt.</small></td><td data-label="Status"><span class="expense-status" data-status="paid">Bezahlt</span></td></tr></tbody></table></div></div>');
  }
  return html;
}

const server = http.createServer((req, res) => {
  if (req.url === "/expense" || req.url === "/expenses") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(fixture(req.url.slice(1))); }
  const file = path.resolve(root, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, ""));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": path.extname(file) === ".css" ? "text/css" : "application/octet-stream" }); fs.createReadStream(file).pipe(res);
});

(async () => {
  fs.mkdirSync(outputDir, { recursive: true }); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`; const browser = await chromium.launch({ headless: true });
  try {
    for (const spec of [{ name: "expenses", width: 1440, height: 1000 }, { name: "expense", width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport: { width: spec.width, height: spec.height } }); await page.goto(`${base}/${spec.name}`, { waitUntil: "domcontentloaded" });
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(layout.scroll <= layout.width + 1, `${spec.name} overflow ${layout.scroll}/${layout.width}`);
      await page.screenshot({ path: path.join(outputDir, `expense-${spec.name}-${spec.width}.png`), fullPage: true });
      if (spec.name === "expense") { await page.evaluate(() => { document.documentElement.dir = "rtl"; document.documentElement.lang = "ar"; }); assert.equal(await page.locator(".receipt-form").evaluate((el) => getComputedStyle(el).direction), "rtl"); }
      await page.close();
    }
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
  console.log("Expense desktop dashboard, mobile receipt flow, overflow, and RTL visual checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
