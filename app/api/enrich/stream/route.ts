import { enrichEvents, type EnrichEvent } from '@/lib/enrich/events';
import { getRunStatus } from '@/lib/enrich/runner';

export const dynamic = 'force-dynamic';

/** Flux SSE de progression d'enrichissement. */
export async function GET() {
  let listener: ((ev: EnrichEvent) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (ev: EnrichEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          // flux fermé côté client
        }
      };

      // Snapshot initial pour un client qui (re)connecte en cours de run
      const status = getRunStatus();
      if (status.active) {
        send({ type: 'run-start', total: status.total });
        send({
          type: 'run-progress',
          done: status.done,
          failed: status.failed,
          total: status.total,
        });
      }

      listener = send;
      enrichEvents.on('event', listener);
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          // flux fermé
        }
      }, 15000);
    },
    cancel() {
      if (listener) enrichEvents.off('event', listener);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
