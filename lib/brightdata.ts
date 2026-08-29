// Real Bright Data CLI client for the `external` subagent (CLAUDE.md "Bright Data"
// section). Targets + Collector IDs live in data/targets.json (config, not hardcoded
// per-run) so scrape-doctor and this backend read the same source of truth.
//
// Every scrape response is cached to ./data/raw/ before parsing (CLAUDE.md caching
// discipline). If a run comes back empty/short, the caller emits `scrape_issue` instead
// of silently treating it as "no external evidence" (CONTRACT.md rule + fallback table).

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// Demo-safety cached fallback (BOARD.tsv item 09). The OLD stripe-node collector
// (c_mtet3buh21kq1tld2u, pointed at the plain HTML releases page) genuinely completed real
// runs -- 711/711/708/674/260 real records, 100% success -- it's just slow (~21min, because it
// paginates the entire ~783-page release history) rather than broken. That's too slow to gate a
// live demo on, so a completed run's output is downloaded once and cached here as a legitimate
// fallback per CONTRACT.md's fallback table ("Bright Data scrape target itself is unreachable /
// impractically slow -> replay the last cached response from ./data/raw/, label it clearly as
// replayed, never fabricate a fresh excerpt"). Only used if the live scrape for that target
// fails or times out -- never preferred over a real live result.
const FALLBACK_CACHE_PATH: Record<string, string> = {
  stripe_node_releases: join(process.cwd(), "data", "raw", "stripe_node_releases.cached-fallback.json"),
};

export function getCachedFallback(targetName: string): { raw: string; cachePath: string } | null {
  const path = FALLBACK_CACHE_PATH[targetName];
  if (!path || !existsSync(path)) return null;
  return { raw: readFileSync(path, "utf8"), cachePath: path };
}

// 150s: bounded, not unbounded (backend-agent rule: cap retries/runtime on every harness
// call). Bumped up from an earlier 90s after observing a real, non-KYC-blocked target
// (github.com/stripe/stripe-node/releases) fall into Bright Data's slow "batch mode"
// pagination fallback that didn't complete within several minutes in testing — see
// BOARD.tsv item 06 fact rows. If a scrape hits this cap it's classified "network"
// (timeout) below and surfaces as a real, honest scrape_issue, never faked as success.
const SCRAPE_TIMEOUT_MS = 150_000;
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
  // `combined` is only used in-memory for error/blocking classification below — never
  // written to the cache file. The cache must hold the ORIGINAL verbatim stdout (our own
  // "cache raw response before parsing" rule), not a merged-and-trimmed transform of it
  // (Qodo PR #1 finding, BOARD.tsv H+2.2e). stderr is diagnostic, not part of the scraped
  // payload, so it's cached alongside as a separate sibling file instead of merged in.
  const combined = `${stdout}\n${stderr}`.trim();

  const rawDir = join(process.cwd(), "data", "raw");
  mkdirSync(rawDir, { recursive: true });
  const cachePath = join(rawDir, `${target.collectorId}_${Date.now()}.txt`);
  writeFileSync(cachePath, stdout, "utf8");
  if (stderr.trim()) {
    writeFileSync(`${cachePath}.stderr.txt`, stderr, "utf8");
  }

  // Classify error/blocking signatures regardless of exit code — bdata has been observed
  // to exit 0 while stdout is itself an error/compliance-block body (e.g. the real KYC
  // block hit in this project: "Crawler error: Forbidden: target site requires special
  // permission... complete a KYC process"), which is long enough to clear
  // MIN_HEALTHY_LENGTH and would otherwise be misclassified as a real, healthy scrape.
  //
  // BUT (BOARD.tsv item 09 verifier kickback, H+2.11/H+2.17): the keyword scan below must
  // NOT run against the full body of a genuinely large/successful scrape — a real,
  // substantial live payload (e.g. 83KB of stripe-node changelog HTML) can legitimately
  // contain ordinary substrings like "blocked" (inside the field name
  // funding_types_blocked) or "bot" (inside the word "both") that would otherwise be
  // misclassified as a bot-wall block. Every real error/compliance-block body observed so
  // far (KYC block ~500 chars, rate-limit JSON ~200 chars) is well under 2000 chars, and no
  // successful scrape of substantial content has ever been anywhere near that small — so
  // only run the keyword classifier when the process itself signaled failure (code !== 0)
  // or the body is short enough to plausibly BE an error/block body rather than real
  // content.
  const lower = combined.toLowerCase();
  const errorCause = ((): "selector_drift" | "bot_wall" | "rate_limit" | "network" | "unknown" | null => {
    if (code !== 0 || combined.length < 2000) {
      // Check rate-limit signatures before the generic bot_wall "crawler error" match below —
      // Bright Data's real rate-limit body is `{"error":"Crawler error: ... too many
      // requests","error_code":"rate_limit"}`, which also contains the literal text "crawler
      // error" and would otherwise be misclassified as bot_wall (observed live on this exact
      // target). "rate_limit" (underscore, as it appears in error_code) was previously missed
      // by a "rate limit" (space) check.
      if (
        lower.includes("rate limit") ||
        lower.includes("rate_limit") ||
        lower.includes("too many requests") ||
        lower.includes("429")
      )
        return "rate_limit";
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
    }
    // code -1 is our own ETIMEDOUT sentinel from runBdata below (process killed by
    // execFile's own timeout, e.g. Bright Data's slow "batch mode" pagination fallback on
    // github.com/stripe/stripe-node/releases never returning within SCRAPE_TIMEOUT_MS in
    // testing) — that's specifically a network/runtime-cap issue, not an unknown one.
    if (code === -1) return "network";
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
