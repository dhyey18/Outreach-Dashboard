import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

const ROOT = path.join(process.cwd(), '..');

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { script, args = [] } = body as { script: string; args: string[] };

  const scriptMap: Record<string, string> = {
    scrape: 'googlesearch.js',
    analyze: 'analyze.js',
    linkedin: 'linkedin.js',
    whatsapp: 'whatsapp.js',
  };

  if (!scriptMap[script]) {
    return Response.json({ error: 'Unknown script' }, { status: 400 });
  }

  const scriptFile = path.join(ROOT, scriptMap[script]);

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const child = spawn('node', [scriptFile, ...args], {
        cwd: ROOT,
        env: { ...process.env },
      });

      child.stdout.on('data', (chunk: Buffer) => {
        controller.enqueue(enc.encode(chunk.toString()));
      });

      child.stderr.on('data', (chunk: Buffer) => {
        controller.enqueue(enc.encode('[stderr] ' + chunk.toString()));
      });

      child.on('close', (code: number) => {
        controller.enqueue(enc.encode(`\n[Process exited with code ${code}]\n`));
        controller.close();
      });

      child.on('error', (err: Error) => {
        controller.enqueue(enc.encode(`\n[Error: ${err.message}]\n`));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}
