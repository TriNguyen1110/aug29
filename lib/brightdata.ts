// Real Bright Data CLI client for the `external` subagent (CLAUDE.md "Bright Data"
// section). Targets + Collector IDs live in data/targets.json (config, not hardcoded
// per-run) so scrape-doctor and this backend read the same source of truth.
//
// Every scrape response is cached to ./data/raw/ before parsing (CLAUDE.md caching
// discipline). If a run comes back empty/short, the caller emits `scrape_issue` instead
// of silently treating it as "no external evidence" (CONTRACT.md rule + fallback table).

import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import targets from "@/data/targets.json";

export type ScrapeTarget = {
  name: string;
  url: string;
  collectorId: string;
};

export function getTargets(): ScrapeTarget[] {
  return targets as ScrapeTarget[];
}

const SCRAPE_TIMEOUT_MS = 90_000;
const MIN_HEALTHY_LENGTH = 40; // below this, treat as empty/short per fallback table

export type ScrapeResult =
  | { ok: true; raw: string; cachePath: string }
  | { ok: false; cause: "selector_drift" | "bot_wall" | "rate_limit" | "network" | "unknown"; note: string; cachePath: string | null };

function runBdata(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["-p", "@brightdata/cli", "bdata", ...args],
      { timeout: SCRAPE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code: error ? (error as NodeJS.ErrnoException).code === "ETIMEDOUT" ? -1 : 1 : 0 });
      }
    );
  });
}

export async function scrapeTarget(target: ScrapeTarget): Promise<ScrapeResult> {
  const { stdout, stderr, code } = await runBdata(["scraper", "run", target.collectorId, target.url]);
  const combined = `${stdout}\n${stderr}`.trim();

  const rawDir = join(process.cwd(), "data", "raw");
  mkdirSync(rawDir, { recursive: true });
  const cachePath = join(rawDir, `${target.collectorId}_${Date.now()}.txt`);
  writeFileSync(cachePath, combined || "(empty response)", "utf8");

  // Classify error/blocking signatures regardless of exit code — bdata has been observed
  // to exit 0 while stdout is itself an error/compliance-block body (e.g. the real KYC
  // block hit in this project: "Crawler error: Forbidden: target site requires special
  // permission... complete a KYC process"), which is long enough to clear
  // MIN_HEALTHY_LENGTH and would otherwise be misclassified as a real, healthy scrape.
  const lower = combined.toLowerCase();
  const errorCause = ((): "selector_drift" | "bot_wall" | "rate_limit" | "network" | "unknown" | null => {
    if (lower.includes("rate limit") || lower.includes("429")) return "rate_limit";
    if (
      lower.includes("captcha") ||
      lower.includes("blocked") ||
      lower.includes("bot") ||
      lower.includes("forbidden") ||
      lower.includes("compliance") ||
      lower.includes("kyc") ||
      lower.includes("crawler error")
    )
      return "bot_wall";
    if (lower.includes("timeout") || lower.includes("network") || lower.includes("econn")) return "network";
    if (code !== 0) return "unknown";
    return null;
  })();

  if (errorCause) {
    return {
      ok: false,
      cause: errorCause,
      note: combined.slice(0, 500) || `bdata exited with code ${code}, no output`,
      cachePath,
    };
  }

  if (stdout.trim().length < MIN_HEALTHY_LENGTH) {
    return {
      ok: false,
      cause: "selector_drift",
      note: `Scrape returned only ${stdout.trim().length} chars, below the healthy threshold of ${MIN_HEALTHY_LENGTH} — likely a selector/structure change on ${target.url}.`,
      cachePath,
    };
  }

  return { ok: true, raw: stdout, cachePath };
}
