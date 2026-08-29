// One-off verification for item 16: Timeline tool_call/subagent_result rows show a short
// preview + "View details" trigger that opens the full raw content in the Modal. Run
// manually with `node scripts/verify-item16.mjs`; not part of the test suite.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "/tmp/item16-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
let failed = false;

async function check(viewport, name) {
  const page = await browser.newPage({ viewport });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`${name} console: ${msg.text()}`);
  });
  page.on("requestfailed", (req) => {
    errors.push(`${name} requestfailed: ${req.url()}`);
  });

  await page.goto("http://localhost:3000/incidents/inc_auth500", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  // Timeline tab should already be selected by default; screenshot the collapsed state.
  await page.screenshot({ path: `${OUT}/${name}-timeline-collapsed.png`, fullPage: true });

  const viewDetailsButtons = page.getByRole("button", { name: "View details" });
  const count = await viewDetailsButtons.count();
  console.log(`${name}: found ${count} "View details" triggers`);
  if (count === 0) {
    errors.push(`${name}: expected at least one View details trigger, found 0`);
    failed = true;
    await page.close();
    return;
  }

  // Grab the full raw text of the corresponding row before opening, to compare against modal.
  const firstButton = viewDetailsButtons.first();
  const row = firstButton.locator("xpath=ancestor::*[contains(@class,'relative') and contains(@class,'overflow-hidden')][1]");
  const rowText = await row.textContent();

  await firstButton.click();
  await page.waitForTimeout(200);

  const modal = page.locator("div.fixed.z-50.flex.max-h-\\[85vh\\]");
  const modalVisible = await modal.isVisible().catch(() => false);
  if (!modalVisible) {
    errors.push(`${name}: modal did not open after clicking View details`);
    failed = true;
  } else {
    const modalText = await modal.textContent();
    console.log(`${name}: modal opened, text length ${modalText?.length ?? 0}`);
    if (!modalText || modalText.length < 50) {
      errors.push(`${name}: modal content looks too short/placeholder: "${modalText}"`);
      failed = true;
    }
    await page.screenshot({ path: `${OUT}/${name}-modal-open.png`, fullPage: true });

    // close via the X button
    await page.getByRole("button", { name: "Close" }).click();
    await page.waitForTimeout(200);
    const stillVisible = await modal.isVisible().catch(() => false);
    if (stillVisible) {
      errors.push(`${name}: modal did not close after clicking Close`);
      failed = true;
    } else {
      console.log(`${name}: modal closed correctly`);
    }
  }

  await page.close();
}

await check({ width: 1280, height: 1400 }, "desktop");
await check({ width: 390, height: 1600 }, "mobile");

await browser.close();

console.log("\nScreenshots written to", OUT);
if (errors.length) {
  console.log("ERRORS:\n" + errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("No console errors, failed requests, or assertion failures.");
}
process.exitCode = failed ? 1 : process.exitCode;
