// One-off visual-check script for item 08 (rename/icons/spacing/brand pass).
// Not part of the test suite — run manually with `node scripts/shot.mjs`.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "/tmp/snitch-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function shot(path, name, viewport) {
  const page = await browser.newPage({ viewport });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`${name} console: ${msg.text()}`);
  });
  page.on("requestfailed", (req) => {
    errors.push(`${name} requestfailed: ${req.url()}`);
  });
  await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await page.close();
}

await shot("/", "list-desktop", { width: 1280, height: 900 });
await shot("/", "list-mobile", { width: 390, height: 844 });

// grab a real incident id from the list API to screenshot the detail page
const res = await fetch("http://localhost:3000/api/incidents");
const incidents = await res.json();
if (incidents.length === 0) throw new Error("no incidents to screenshot detail page against");
const id = incidents[0].id;
await shot(`/incidents/${id}`, "detail-desktop", { width: 1280, height: 1400 });
await shot(`/incidents/${id}`, "detail-mobile", { width: 390, height: 1600 });

await browser.close();

console.log("Screenshots written to", OUT);
if (errors.length) {
  console.log("ERRORS:\n" + errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("No console errors or failed requests.");
}
