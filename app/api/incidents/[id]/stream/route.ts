import { getEvents, getIncident } from "@/lib/store";
import { subscribe } from "@/lib/bus";
import type { IncidentEvent } from "@/lib/types";

// GET /api/incidents/:id/stream — SSE. Emits a JSON IncidentEvent per line as the
// harness produces one (CONTRACT.md). Replays everything already in the store first so
// a client connecting mid-run (or after a refresh) gets the full history, then stays
// open and pushes new events live via lib/bus.ts.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!getIncident(id)) {
    return new Response(JSON.stringify({ error: `No incident with id ${id}` }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: IncidentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      for (const event of getEvents(id)) send(event);

      unsubscribe = subscribe(id, send);

      request.signal.addEventListener("abort", () => {
        unsubscribe?.();
        controller.close();
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
