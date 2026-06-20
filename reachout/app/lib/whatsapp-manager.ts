// Server-side singleton — survives across API requests in Next.js dev server.
// Never import this in client components.
// whatsapp-web.js is in serverExternalPackages — Turbopack does NOT bundle it.

import path from 'path';
import { createRequire } from 'module';

const AUTH_PATH = path.join(process.cwd(), 'data', '.wwebjs_auth');
const ROOT = path.join(process.cwd(), 'data');

// createRequire lets us load CJS modules by package name at runtime.
// Called lazily inside initialize() so Turbopack never sees a static require() call.
const _req = createRequire(import.meta.url);

// ─── Types ───────────────────────────────────────────────────────────────────

export type WAState = 'idle' | 'initializing' | 'qr' | 'ready' | 'sending' | 'disconnected';

export interface WAEvent {
  type: 'state' | 'qr' | 'progress' | 'done' | 'error' | 'log';
  state?: WAState;
  qrDataUrl?: string;
  sent?: number;
  failed?: number;
  skipped?: number;
  total?: number;
  phone?: string;
  name?: string;
  status?: string;
  note?: string;
  message?: string;
}

export interface SendConfig {
  city: string;
  industry: string;
  stage: 1 | 2;
  batchSize: number;
  delayMs: number;
  contactName: string;
  contactPhone: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WAClient = { on: (event: string, cb: (...a: any[]) => unknown) => void; initialize: () => void; isRegisteredUser: (id: string) => Promise<boolean>; sendMessage: (id: string, msg: string) => Promise<void>; destroy: () => Promise<void> };

// ─── Singleton ────────────────────────────────────────────────────────────────

class WhatsAppManager {
  private client: WAClient | null = null;
  private state: WAState = 'idle';
  private listeners = new Map<string, (e: WAEvent) => void>();
  private sendLog: unknown[] = [];

  getState(): WAState { return this.state; }

  subscribe(id: string, cb: (e: WAEvent) => void) { this.listeners.set(id, cb); }
  unsubscribe(id: string) { this.listeners.delete(id); }

  private emit(event: WAEvent) {
    for (const cb of this.listeners.values()) cb(event);
  }

  private setState(s: WAState) {
    this.state = s;
    this.emit({ type: 'state', state: s });
  }

  async initialize() {
    if (this.state === 'ready' || this.state === 'initializing' || this.state === 'qr') return;
    this.setState('initializing');

    try {
      // These are in serverExternalPackages — Node resolves them up the dir tree
      const { Client, LocalAuth } = _req('whatsapp-web.js') as { Client: new (opts: unknown) => WAClient; LocalAuth: new (opts: unknown) => unknown };
      const QRCode = _req('qrcode') as { toDataURL: (qr: string, opts: unknown) => Promise<string> };

      const client = new Client({
        authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        },
      });

      client.on('qr', async (qr: string) => {
        this.setState('qr');
        const dataUrl: string = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
        this.emit({ type: 'qr', state: 'qr', qrDataUrl: dataUrl });
      });

      client.on('authenticated', () => {
        this.emit({ type: 'log', message: 'Authenticated — session saved.' });
      });

      client.on('auth_failure', (msg: string) => {
        this.setState('disconnected');
        this.emit({ type: 'error', message: 'Auth failed: ' + msg });
      });

      client.on('ready', () => {
        this.setState('ready');
        this.emit({ type: 'log', message: 'WhatsApp Web ready!' });
      });

      client.on('disconnected', (reason: string) => {
        this.setState('disconnected');
        this.client = null;
        this.emit({ type: 'log', message: 'Disconnected: ' + reason });
      });

      client.on('loading_screen', (percent: number, msg: string) => {
        this.emit({ type: 'log', message: `Loading ${percent}% — ${msg}` });
      });

      this.client = client;
      client.initialize();
    } catch (err: unknown) {
      this.setState('disconnected');
      this.emit({ type: 'error', message: String(err) });
    }
  }

  async disconnect() {
    if (this.client) {
      try { await this.client.destroy(); } catch { /* ignore */ }
      this.client = null;
    }
    this.setState('idle');
  }

  async sendToLeads(leads: unknown[], config: SendConfig) {
    if (this.state !== 'ready') throw new Error(`WhatsApp not ready (state: ${this.state})`);

    const { buildMessage } = await import('./message-builder');
    const fs = await import('fs');
    const nodePath = await import('path');

    this.setState('sending');

    const logFile = nodePath.join(ROOT, 'send_log.json');
    try { this.sendLog = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch { this.sendLog = []; }

    const client = this.client!;
    let sent = 0, failed = 0, skipped = 0;
    const total = Math.min(leads.length, config.batchSize);
    const batch = (leads as Record<string, unknown>[]).slice(0, total);

    for (let i = 0; i < batch.length; i++) {
      const lead = batch[i];
      const phone = String(lead.phone || '');
      const norm = normalise(phone);
      const waId = norm + '@c.us';
      const name = String(lead.name || lead.title || 'there');
      const message = buildMessage(lead, config.stage, config.city, config.contactName, config.contactPhone);

      try {
        const isReg = await client.isRegisteredUser(waId);
        if (!isReg) {
          skipped++;
          this.emit({ type: 'progress', sent, failed, skipped, total, phone, name, status: 'skipped', note: 'Not on WhatsApp' });
        } else {
          await client.sendMessage(waId, message);
          sent++;
          this.emit({ type: 'progress', sent, failed, skipped, total, phone, name, status: 'sent', note: `Stage ${config.stage}` });
          this.sendLog.push({ timestamp: new Date().toISOString(), status: 'sent', phone, name, note: `Stage ${config.stage}`, stage: config.stage });
        }
      } catch (err: unknown) {
        failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        this.emit({ type: 'progress', sent, failed, skipped, total, phone, name, status: 'failed', note: errMsg });
        this.sendLog.push({ timestamp: new Date().toISOString(), status: 'failed', phone, name, note: errMsg, stage: config.stage });
      }

      try { fs.writeFileSync(logFile, JSON.stringify(this.sendLog, null, 2)); } catch { /* ignore */ }

      if (i < batch.length - 1) await delay(config.delayMs);
    }

    this.setState('ready');
    this.emit({ type: 'done', sent, failed, skipped, total });
  }
}

function normalise(raw: string) {
  let n = String(raw).replace(/[\s\-+()]/g, '');
  if (n.length === 10) n = '91' + n;
  return n;
}

function delay(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

const globalForWA = globalThis as typeof globalThis & { __wa?: WhatsAppManager };
if (!globalForWA.__wa) globalForWA.__wa = new WhatsAppManager();
export const waManager = globalForWA.__wa;
