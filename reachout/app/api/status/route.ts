import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'data');

function norm(raw: string) {
  let n = String(raw || '').replace(/[\s\-+()]/g, '');
  if (n.length === 10) n = '91' + n;
  return n;
}

function loadJSON(p: string) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const city = searchParams.get('city') || null;
  const stage = parseInt(searchParams.get('stage') || '1');

  const leadsDir = (city && city.toLowerCase() !== 'ahmedabad')
    ? path.join(ROOT, 'leads', city.toLowerCase())
    : path.join(ROOT, 'leads');
  const sendLog: Record<string, unknown>[] = loadJSON(path.join(ROOT, 'send_log.json')) || [];
  const batchProg: Record<string, { attempted: string[] }> = loadJSON(path.join(ROOT, 'batch_progress.json')) || {};

  const contactedMap = new Map<string, number>();
  for (const e of sendLog) {
    if (e.status === 'sent' && e.phone) {
      const p = norm(e.phone as string);
      if (((e.stage as number) || 0) > (contactedMap.get(p) || 0)) {
        contactedMap.set(p, (e.stage as number) || 1);
      }
    }
  }

  const files = fs.existsSync(leadsDir)
    ? fs.readdirSync(leadsDir).filter(f => f.endsWith('_leads.json')).sort()
    : [];

  const rows = [];
  for (const file of files) {
    const industry = file.replace('_leads.json', '');
    const raw: Record<string, unknown>[] = loadJSON(path.join(leadsDir, file)) || [];

    const seen = new Set<string>();
    const unique = raw.filter(l => {
      if (!l.phone) return false;
      const k = norm(l.phone as string);
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    const eligible = stage === 2
      ? unique.filter(l => contactedMap.get(norm(l.phone as string)) === 1)
      : unique.filter(l => !contactedMap.has(norm(l.phone as string)));

    const fileKey = (city && city.toLowerCase() !== 'ahmedabad')
      ? `leads/${city.toLowerCase()}/${file}`
      : `leads/${file}`;
    const attemptedSet = new Set<string>();
    for (const [key, val] of Object.entries(batchProg)) {
      if (key.startsWith(fileKey)) {
        (val.attempted || []).forEach((p: string) => attemptedSet.add(norm(p)));
      }
    }

    const remaining = eligible.filter(l => !attemptedSet.has(norm(l.phone as string))).length;
    const attempted = eligible.length - remaining;

    rows.push({ industry, total: unique.length, eligible: eligible.length, attempted, remaining });
  }

  // Send log stats
  const logStats = {
    totalAttempts: sendLog.length,
    sent: sendLog.filter(e => e.status === 'sent').length,
    failed: sendLog.filter(e => e.status === 'failed').length,
    skipped: sendLog.filter(e => e.status === 'skipped').length,
    stage1Sent: sendLog.filter(e => e.status === 'sent' && (e.stage as number) === 1).length,
    stage2Sent: sendLog.filter(e => e.status === 'sent' && (e.stage as number) === 2).length,
    recentLog: sendLog.slice(-50).reverse(),
  };

  return Response.json({ rows, logStats });
}
