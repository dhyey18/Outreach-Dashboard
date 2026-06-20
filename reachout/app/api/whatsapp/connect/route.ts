import { NextRequest } from 'next/server';
import type { WAEvent } from '../../../lib/whatsapp-manager';

export async function GET(req: NextRequest) {
  const { waManager } = await import('../../../lib/whatsapp-manager');

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const id = 'connect-' + Date.now();

      function send(event: WAEvent | { type: string; state: string }) {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        try { controller.enqueue(enc.encode(data)); } catch { /* closed */ }
      }

      waManager.subscribe(id, (e) => {
        send(e);
        if (e.type === 'done' || (e.type === 'state' && (e.state === 'ready' || e.state === 'disconnected'))) {
          // keep open for further events
        }
      });

      // Send initial state
      send({ type: 'state', state: waManager.getState() });

      req.signal.addEventListener('abort', () => {
        waManager.unsubscribe(id);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function POST() {
  const { waManager } = await import('../../../lib/whatsapp-manager');
  const state = waManager.getState();
  if (state === 'ready') {
    return Response.json({ ok: true, state: 'ready' });
  }
  // Start initialization in background — client connects via SSE to observe
  waManager.initialize().catch(() => {});
  return Response.json({ ok: true, state: waManager.getState() });
}
