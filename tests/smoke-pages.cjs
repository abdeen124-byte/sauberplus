const { chromium } = require("playwright");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const baseUrl = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const projectRoot = path.resolve(__dirname, "..");
const pages = [
  { path: "/", selector: "body" },
  { path: "/admin/", selector: "#loginForm" },
  { path: "/mitarbeiter/", selector: "#loginForm" }
];
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 }
];

function startStaticServer() {
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, baseUrl);
    let relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (!relativePath || relativePath.endsWith("/")) {
      relativePath += "index.html";
    }
    const filePath = path.resolve(projectRoot, relativePath);
    if (!filePath.startsWith(projectRoot + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.setHeader("Content-Type", contentTypes[path.extname(filePath)] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(3000, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  const staticServer = process.env.SMOKE_BASE_URL ? null : await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      for (const pageDefinition of pages) {
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));

        const response = await page.goto(baseUrl + pageDefinition.path, {
          waitUntil: "domcontentloaded",
          timeout: 30000
        });
        if (!response || response.status() >= 400) {
          throw new Error(`${viewport.name} ${pageDefinition.path} returned ${response && response.status()}`);
        }
        await page.locator(pageDefinition.selector).waitFor({ state: "visible", timeout: 15000 });
        await page.waitForTimeout(1000);

        const overflow = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          offenders: [...document.querySelectorAll("body *")]
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.right > window.innerWidth + 1 || rect.left < -1;
            })
            .slice(0, 8)
            .map((element) => `${element.tagName.toLowerCase()}.${element.className || ""}`)
        }));
        const horizontalScroll = await page.evaluate(() => {
          window.scrollTo(1000, window.scrollY);
          const result = window.scrollX;
          window.scrollTo(0, window.scrollY);
          return result;
        });
        if (overflow.documentWidth > overflow.viewportWidth + 1 && horizontalScroll > 1) {
          throw new Error(`${viewport.name} ${pageDefinition.path} has horizontal overflow ${JSON.stringify(overflow)}`);
        }
        if (pageErrors.length) {
          throw new Error(`${viewport.name} ${pageDefinition.path} page errors: ${pageErrors.join(" | ")}`);
        }
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
    if (staticServer) {
      await new Promise((resolve, reject) => staticServer.close((error) => error ? reject(error) : resolve()));
    }
  }
  console.log(`Static page smoke checks passed for ${baseUrl}.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
