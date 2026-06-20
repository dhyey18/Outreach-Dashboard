export async function POST() {
  const { waManager } = await import('../../../lib/whatsapp-manager');
  await waManager.disconnect();
  return Response.json({ ok: true });
}
