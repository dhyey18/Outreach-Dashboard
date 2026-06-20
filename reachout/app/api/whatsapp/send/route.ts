import { NextRequest } from 'next/server';
import type { WAEvent } from '../../../lib/whatsapp-manager';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'data');

function loadJSON(p: string) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function norm(raw: string) {
  let n = String(raw || '').replace(/[\s\-+()]/g, '');
  if (n.length === 10) n = '91' + n;
  return n;
}

export async function POST(req: NextRequest) {
  const { waManager } = await import('../../../lib/whatsapp-manager');

  const body = await req.json();
  const { city = 'ahmedabad', industry, stage = 1, batchSize = 40, delayMs = 25000, contactName = 'Dhyey', contactPhone = '+91 94291 84788' } = body;

  if (!industry) return Response.json({ error: 'industry required' }, { status: 400 });

  const state = waManager.getState();
  if (state !== 'ready') {
    return Response.json({ error: `WhatsApp not ready (state: ${state})` }, { status: 400 });
  }

  // Load and filter leads
  const leadsDir = (city && city.toLowerCase() !== 'ahmedabad')
    ? path.join(ROOT, 'leads', city.toLowerCase())
    : path.join(ROOT, 'leads');

  const raw: Record<string, unknown>[] = loadJSON(path.join(leadsDir, `${industry}_leads.json`)) || [];

  const sendLog: Record<string, unknown>[] = loadJSON(path.join(ROOT, 'send_log.json')) || [];
  const contactedMap = new Map<string, number>();
  for (const e of sendLog) {
    if (e.status === 'sent' && e.phone) {
      const p = norm(e.phone as string);
      if (((e.stage as number) || 0) > (contactedMap.get(p) || 0)) {
        contactedMap.set(p, (e.stage as number) || 1);
      }
    }
  }

  const seen = new Set<string>();
  const eligible = raw.filter(l => {
    if (!l.phone) return false;
    const k = norm(l.phone as string);
    if (seen.has(k)) return false;
    seen.add(k);
    if (stage === 2) return contactedMap.get(k) === 1;
    return !contactedMap.has(k);
  }).slice(0, batchSize);

  const enc = new TextEncoder();

  return new Response(new ReadableStream({
    async start(controller) {
      const id = 'send-' + Date.now();

      function sseEvent(event: WAEvent | { type: string; message?: string }) {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { /* stream closed */ }
      }

      waManager.subscribe(id, (e) => {
        sseEvent(e);
        if (e.type === 'done') {
          waManager.unsubscribe(id);
          try { controller.close(); } catch { /* ignore */ }
        }
      });

      sseEvent({ type: 'log', message: `Starting send: ${eligible.length} leads · stage ${stage} · ${delayMs / 1000}s delay` });

      if (eligible.length === 0) {
        sseEvent({ type: 'done', sent: 0, failed: 0, skipped: 0, total: 0 });
        waManager.unsubscribe(id);
        controller.close();
        return;
      }

      waManager.sendToLeads(eligible, {
        city, industry, stage: stage as 1 | 2, batchSize, delayMs, contactName, contactPhone,
      }).catch((err: unknown) => {
        sseEvent({ type: 'error', message: String(err) });
        waManager.unsubscribe(id);
        try { controller.close(); } catch { /* ignore */ }
      });
    },
  }), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
