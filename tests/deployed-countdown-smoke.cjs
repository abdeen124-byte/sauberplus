const { chromium } = require("playwright");

const baseUrl = (process.env.SMOKE_BASE_URL || "https://www.sauberplus.plus").replace(/\/$/, "");

function createAnnouncement(endDate, autoHideAfterEnd) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    placement: "homepage_banner",
    title: "Countdown smoke test",
    description: "Browser-isolated test data",
    image_path: null,
    button_label: null,
    button_url: null,
    start_date: new Date(Date.now() - 60_000).toISOString(),
    end_date: endDate,
    countdown_enabled: true,
    auto_hide_after_end: autoHideAfterEnd,
    discount_percentage: 12.5
  };
}

function remainingSeconds(values) {
  return Number(values.days) * 86_400
    + Number(values.hours) * 3_600
    + Number(values.minutes) * 60
    + Number(values.seconds);
}

async function installApiIsolation(page, getAnnouncement) {
  await page.route("**/rest/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/announcements")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([getAnnouncement()])
      });
      return;
    }
    if (pathname.endsWith("/rpc/get_public_server_time")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(new Date().toISOString())
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

async function readCountdown(page) {
  return page.locator(".countdown-live").evaluate((countdown) => {
    const values = {};
    for (const unit of ["days", "hours", "minutes", "seconds"]) {
      values[unit] = countdown.querySelector(`[data-countdown-unit="${unit}"]`).textContent;
    }
    return values;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    let announcement = createAnnouncement(new Date(Date.now() + 125_000).toISOString(), false);
    await installApiIsolation(page, () => announcement);
    await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator(".countdown-live").waitFor({ state: "visible", timeout: 15_000 });
    const beforeReload = remainingSeconds(await readCountdown(page));
    await page.waitForTimeout(1_250);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator(".countdown-live").waitFor({ state: "visible", timeout: 15_000 });
    const afterReload = remainingSeconds(await readCountdown(page));
    if (afterReload >= beforeReload) {
      throw new Error(`Countdown restarted after reload (${beforeReload} -> ${afterReload}).`);
    }

    announcement = createAnnouncement(new Date(Date.now() - 5_000).toISOString(), false);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator(".countdown-live").waitFor({ state: "visible", timeout: 15_000 });
    const expiredValues = await readCountdown(page);
    if (Object.values(expiredValues).some((value) => value !== "00")) {
      throw new Error(`Expired countdown was not clamped to zero: ${JSON.stringify(expiredValues)}`);
    }

    announcement = createAnnouncement(new Date(Date.now() - 5_000).toISOString(), true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(500);
    if (await page.locator("#cms-homepage-banner .cms-banner").count()) {
      throw new Error("Expired auto-hidden announcement remained visible.");
    }
    if (pageErrors.length) {
      throw new Error(`Production page errors: ${pageErrors.join(" | ")}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`Deployed countdown smoke checks passed for ${baseUrl}.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
