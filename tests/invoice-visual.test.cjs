const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "test-results");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf"
};

function fixtureHtml() {
  return fs.readFileSync(path.join(root, "admin/invoice.html"), "utf8")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/gi, "")
    .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>/gi, "")
    .replace("<head>", '<head><base href="/admin/">')
    .replace('<select id="servicePreset" required></select>', '<select id="servicePreset" required><option value="maintenance_cleaning">Unterhaltsreinigung</option><option value="window_cleaning">Fensterreinigung</option></select>')
    .replace('id="adminShell" hidden', 'id="adminShell"');
}

function createServer() {
  return http.createServer((request, response) => {
    if (request.url === "/__invoice_fixture") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(fixtureHtml());
      return;
    }
    const relativePath = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function assertNoHorizontalOverflow(page) {
  const layout = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(layout.scrollWidth <= layout.width + 1, `Horizontal overflow: ${layout.scrollWidth}px > ${layout.width}px`);
}

async function fillQuickInvoice(page) {
  const startedAt = Date.now();
  await page.fill("#customerName", "Erika Muster");
  await page.fill("#customerAddress", "Musterweg 12\n42699 Solingen");
  await page.selectOption("#servicePreset", "maintenance_cleaning");
  await page.fill("#serviceDate", "2026-08-28");
  await page.fill("#grossAmount", "51,20");
  await page.selectOption("#paymentMethod", "bank_transfer");
  assert.ok(Date.now() - startedAt < 30000, "The normal invoice entry workflow exceeded 30 seconds");
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/__invoice_fixture`;
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    await desktop.goto(url, { waitUntil: "domcontentloaded" });
    await desktop.locator("#invoiceForm").waitFor();
    assert.equal(await desktop.locator("#advancedOptions").getAttribute("open"), null);
    await fillQuickInvoice(desktop);
    await assertNoHorizontalOverflow(desktop);
    await desktop.screenshot({ path: path.join(outputDir, "invoice-desktop.png"), fullPage: true });
    await desktop.locator("#advancedOptions summary").click();
    assert.ok(await desktop.locator(".invoice-advanced-content").isVisible(), "Advanced fields did not open on demand");

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await mobile.goto(url, { waitUntil: "domcontentloaded" });
    await mobile.locator("#invoiceForm").waitFor();
    await fillQuickInvoice(mobile);
    await assertNoHorizontalOverflow(mobile);
    await mobile.screenshot({ path: path.join(outputDir, "invoice-mobile.png"), fullPage: true });
    await mobile.evaluate(() => { document.documentElement.dir = "rtl"; document.documentElement.lang = "ar"; });
    assert.equal(await mobile.locator(".invoice-quick-form").evaluate((element) => getComputedStyle(element).direction), "rtl");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("Invoice desktop, mobile, RTL, advanced disclosure, and under-30-second visual workflow passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
