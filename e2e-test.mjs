#!/usr/bin/env node
/**
 * CDP E2E Test — Preview iframe navigation + full user flow
 * Runs headful Chrome so the user can watch.
 */
import puppeteer from "puppeteer";

const TENANT_SUBDOMAIN = "dcinside";
const PREVIEW_BASE = `http://preview-${TENANT_SUBDOMAIN}.vibeweb.localhost`;
const LIVE_BASE = `http://${TENANT_SUBDOMAIN}.vibeweb.localhost`;
const API_BASE = "http://vibeweb.localhost";
const TIMEOUT = 10000;

function log(icon, msg) { console.log(`${icon}  ${msg}`); }
function pass(msg) { log("✅", msg); }
function fail(msg) { log("❌", msg); }
function info(msg) { log("ℹ️ ", msg); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let errors = 0;
function assert(cond, passMsg, failMsg) {
  if (cond) pass(passMsg);
  else { fail(failMsg); errors++; }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--window-size=1400,900", "--no-sandbox"],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();

  try {
    // ═══════════════════════════════════════
    // TEST 1: Preview subdomain — HTML pages
    // ═══════════════════════════════════════
    info("TEST 1: All HTML pages on preview subdomain");

    const htmlPages = ["", "write.html", "login.html", "register.html", "post.html"];
    for (const p of htmlPages) {
      const url = `${PREVIEW_BASE}/${p}`;
      const resp = await page.goto(url, { waitUntil: "networkidle2", timeout: TIMEOUT });
      const content = await page.content();
      const name = p || "index";
      assert(
        resp.status() === 200 && content.includes("<title>"),
        `${name}: HTTP 200, has <title>`,
        `${name}: HTTP ${resp.status()}, length=${content.length}`
      );
    }

    // ═══════════════════════════════════════
    // TEST 2: Link navigation preserves subdomain
    // ═══════════════════════════════════════
    info("TEST 2: Internal link navigation stays on preview subdomain");

    await page.goto(PREVIEW_BASE, { waitUntil: "networkidle2", timeout: TIMEOUT });
    const links = await page.$$eval("a[href]", (anchors) =>
      anchors
        .map((a) => ({ text: a.textContent?.trim(), href: a.getAttribute("href") }))
        .filter((l) => l.href && !l.href.startsWith("http") && !l.href.startsWith("#") && !l.href.startsWith("javascript:"))
    );
    info(`Found ${links.length} internal links`);

    // Navigate to each unique link
    const visited = new Set();
    for (const link of links) {
      if (visited.has(link.href)) continue;
      visited.add(link.href);
      const resp = await page.goto(new URL(link.href, PREVIEW_BASE).toString(), { waitUntil: "networkidle2", timeout: TIMEOUT });
      const url = page.url();
      assert(
        url.includes(`preview-${TENANT_SUBDOMAIN}`) && resp.status() === 200,
        `"${link.text}" → ${link.href}: OK (stayed on preview)`,
        `"${link.text}" → ${link.href}: FAIL (url=${url}, status=${resp.status()})`
      );
    }

    // ═══════════════════════════════════════
    // TEST 3: Query parameters preserved
    // ═══════════════════════════════════════
    info("TEST 3: Query parameters in URLs work");

    const qpUrl = `${PREVIEW_BASE}/post.html?id=1`;
    const qpResp = await page.goto(qpUrl, { waitUntil: "networkidle2", timeout: TIMEOUT });
    const qpContent = await page.content();
    assert(
      qpResp.status() === 200 && qpContent.includes("<title>"),
      "post.html?id=1: HTTP 200, page loaded with query params",
      `post.html?id=1: HTTP ${qpResp.status()}`
    );

    // ═══════════════════════════════════════
    // TEST 4: 404 for non-existent page
    // ═══════════════════════════════════════
    info("TEST 4: Non-existent page returns 404");

    const notFoundResp = await page.goto(`${PREVIEW_BASE}/nonexistent-page-abc.html`, { waitUntil: "networkidle2", timeout: TIMEOUT });
    assert(
      notFoundResp.status() === 404,
      "nonexistent-page: HTTP 404 (correct)",
      `nonexistent-page: HTTP ${notFoundResp.status()} (expected 404)`
    );

    // ═══════════════════════════════════════
    // TEST 5: /api/ routing from preview subdomain
    // ═══════════════════════════════════════
    info("TEST 5: /api/ routes to function-runner from preview subdomain");

    const apiResp = await page.goto(`${PREVIEW_BASE}/api/posts`, { waitUntil: "networkidle2", timeout: TIMEOUT });
    const apiStatus = apiResp.status();
    // 200 = function works, 500 = function error (but routed correctly), 404 = function not found on runner
    assert(
      apiStatus === 200 || apiStatus === 500,
      `/api/posts on preview: HTTP ${apiStatus} (routed to function-runner)`,
      `/api/posts on preview: HTTP ${apiStatus} (may not have reached function-runner)`
    );

    // ═══════════════════════════════════════
    // TEST 6: Live subdomain isolation
    // ═══════════════════════════════════════
    info("TEST 6: Live subdomain does NOT serve preview-only content");

    const liveResp = await page.goto(`${LIVE_BASE}/write.html`, { waitUntil: "networkidle2", timeout: TIMEOUT });
    const liveContent = await page.content();
    // Live public/ only has default index.html, so write.html should 404 or fallback to index.html
    // Key check: it should NOT contain the preview write form (글쓰기 form)
    const isPreviewContent = liveContent.includes("글 작성") || liveContent.includes("<textarea");
    assert(
      !isPreviewContent,
      `Live write.html: NOT serving preview content (HTTP ${liveResp.status()})`,
      "Live write.html: SERVING PREVIEW CONTENT! Routing leak!"
    );

    // ═══════════════════════════════════════
    // TEST 7: Reserved subdomain creation blocked
    // ═══════════════════════════════════════
    info("TEST 7: Reserved subdomain creation blocked");

    const reservedTests = [
      { sub: "preview-shop", reason: "reserved prefix" },
      { sub: "console", reason: "reserved exact" },
      { sub: "api-test", reason: "reserved prefix" },
      { sub: "www-site", reason: "reserved prefix" },
    ];
    for (const { sub, reason } of reservedTests) {
      const resp = await fetch(`${API_BASE}/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: sub, name: `Test ${sub}` }),
      });
      assert(
        resp.status === 400,
        `"${sub}": blocked (${reason})`,
        `"${sub}": NOT blocked! HTTP ${resp.status}`
      );
      // Cleanup if accidentally created
      if (resp.status === 201) {
        const t = await resp.json();
        await fetch(`${API_BASE}/tenants/${t.id}`, { method: "DELETE" });
      }
    }

    // ═══════════════════════════════════════
    // TEST 8: Form submission on preview subdomain
    // ═══════════════════════════════════════
    info("TEST 8: Form submission stays on preview subdomain");

    await page.goto(`${PREVIEW_BASE}/login.html`, { waitUntil: "networkidle2", timeout: TIMEOUT });
    // Check if there's a form
    const hasForm = await page.$("form");
    if (hasForm) {
      // Get form action
      const formAction = await page.$eval("form", (f) => f.getAttribute("action") || "");
      info(`Login form action: "${formAction}"`);

      // Fill and submit the form (expect API call or page navigation)
      const inputs = await page.$$("input[type='text'], input[type='email'], input[name]");
      for (const input of inputs.slice(0, 2)) {
        await input.type("testuser");
      }
      const pwInput = await page.$("input[type='password']");
      if (pwInput) await pwInput.type("testpass");

      // Intercept navigation to verify it stays on preview subdomain
      const [navigation] = await Promise.all([
        page.waitForNavigation({ timeout: 5000 }).catch(() => null),
        page.$eval("form", (f) => f.submit()),
      ]);

      const afterUrl = page.url();
      if (afterUrl.includes(`preview-${TENANT_SUBDOMAIN}`) || afterUrl.includes(PREVIEW_BASE)) {
        pass(`Form submit: stayed on preview (${afterUrl})`);
      } else if (!navigation) {
        // JS-handled form (no navigation) — also fine
        pass("Form submit: handled by JS (no navigation)");
      } else {
        fail(`Form submit: left preview! URL: ${afterUrl}`);
        errors++;
      }
    } else {
      info("No form found on login.html — skipping");
    }

    // ═══════════════════════════════════════
    // TEST 9: iframe embedding + in-iframe navigation
    // ═══════════════════════════════════════
    info("TEST 9: iframe embedding with in-iframe click navigation");

    await page.setContent(`
      <html><body style="margin:0">
        <iframe id="pv" src="${PREVIEW_BASE}" style="width:100%;height:100vh;border:0"></iframe>
      </body></html>
    `);

    // Wait for iframe to load
    const iframeEl = await page.waitForSelector("#pv");
    const frame = await iframeEl.contentFrame();
    if (frame) {
      await frame.waitForSelector("a", { timeout: 5000 }).catch(() => null);
      const frameContent = await frame.content();

      if (frameContent.length > 500) {
        pass("iframe loaded preview content");

        // Click a link inside the iframe
        const linkEl = await frame.$("a[href]:not([href^='http']):not([href^='#']):not([href^='javascript'])");
        if (linkEl) {
          const linkHref = await linkEl.evaluate((a) => a.getAttribute("href"));
          await linkEl.click();
          await sleep(2000);
          const frameUrl = frame.url();
          assert(
            frameUrl.includes(`preview-${TENANT_SUBDOMAIN}`),
            `iframe click → ${linkHref}: stayed on preview (${frameUrl})`,
            `iframe click → ${linkHref}: LEFT preview! (${frameUrl})`
          );
        } else {
          info("No clickable internal link in iframe");
        }
      } else {
        info("iframe content too small");
      }
    } else {
      info("Cannot access iframe frame (cross-origin expected)");
    }

    // ═══════════════════════════════════════
    // TEST 10: JS-initiated navigation within preview
    // ═══════════════════════════════════════
    info("TEST 10: JavaScript-initiated navigation");

    await page.goto(PREVIEW_BASE, { waitUntil: "networkidle2", timeout: TIMEOUT });
    await page.evaluate(() => { window.location.href = "/write.html"; });
    await page.waitForNavigation({ timeout: 5000 }).catch(() => null);
    const jsNavUrl = page.url();
    assert(
      jsNavUrl.includes(`preview-${TENANT_SUBDOMAIN}`) && jsNavUrl.includes("write.html"),
      `JS location.href: stayed on preview (${jsNavUrl})`,
      `JS location.href: WRONG! (${jsNavUrl})`
    );

  } catch (err) {
    fail(`Unexpected error: ${err.message}\n${err.stack}`);
    errors++;
  }

  // ═══════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════
  console.log("\n" + "═".repeat(50));
  if (errors === 0) log("🎉", "ALL TESTS PASSED");
  else log("💥", `${errors} TEST(S) FAILED`);
  console.log("═".repeat(50));

  info("Browser open for 10s...");
  await sleep(10000);
  await browser.close();
  process.exit(errors > 0 ? 1 : 0);
}

main();
