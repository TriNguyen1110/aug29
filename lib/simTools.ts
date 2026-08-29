// Simulated infra tool data for the live-triggered demo scenario ("Checkout API error
// rate spike" — CONTRACT.md / CLAUDE.md). CONTRACT.md: "An incident is simulated, not
// real infra" — there is no real checkout-service to query, so these functions stand in
// for the log-query and git tools a real logs/diff subagent would call.
//
// This is the ONLY canned content on the live path, and it is the tool layer, not the
// reasoning layer: these functions return a fixed, deterministic string representing
// what the (simulated) infra tool call returned. Every subagent's finding/hypothesis/
// claim is produced by a real TrueForge model call reasoning over this exact string —
// the model never gets to invent its own log lines, and every Evidence.excerpt is
// checked in code to be a literal substring of the tool output that produced it
// (see lib/harness.ts assertExcerptIsGrounded).
//
// Scoping is enforced here too: the logs subagent only ever calls logQuery(); the diff
// subagent only ever calls gitLog()/gitShow(). Neither has access to the other's function
// at all (rule 1, CONTRACT.md) — see lib/harness.ts for which functions each subagent's
// call site can reach.

export function logQuery(input: string): string {
  return (
    "14:58:00-15:04:00 checkout-service p95_latency=180ms error_rate=0.3% (baseline).\n" +
    "15:04:10 checkout-service ERROR rate step-changes to 38% (baseline 0.3%).\n" +
    "15:04:12 checkout-service ERROR 847 requests failed with 502: StripeConnectionError: " +
    "\"Request failed: socket hang up\" at PaymentIntentClient.confirm (payment_intent_client.ts:112)\n" +
    "15:04:12 checkout-service ERROR retry_exhausted=true retries=3 backoff_ms=[200,400,800]\n" +
    "15:09:00 checkout-service ERROR rate holding steady at 37-39%, all failures the same " +
    "StripeConnectionError at PaymentIntentClient.confirm."
  );
}

export function gitLog(_input: string): string {
  return (
    "d4e5f6a 2026-08-29T15:02:47Z deploy-bot \"Bump stripe-node 14.8.0 -> 17.0.0, switch " +
    "PaymentIntentClient.confirm to the new idempotent-retry helper\""
  );
}

export function gitShow(_input: string): string {
  return (
    "- const stripe = new Stripe(key, { apiVersion: '2023-10-16', timeout: 20000, maxNetworkRetries: 3 });\n" +
    "+ const stripe = new Stripe(key, { apiVersion: '2023-10-16', timeout: 3000, maxNetworkRetries: 3 });\n" +
    "  // stripe-node 17 default socket timeout is shorter; not re-tuned after the bump"
  );
}
