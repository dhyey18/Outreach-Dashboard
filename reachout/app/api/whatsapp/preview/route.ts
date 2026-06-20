import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const { buildPreviewMessage } = await import('../../../lib/message-builder');
  const { searchParams } = req.nextUrl;
  const industry = searchParams.get('industry') || 'generic';
  const stage = parseInt(searchParams.get('stage') || '1') as 1 | 2;
  const city = searchParams.get('city') || 'ahmedabad';
  const contactName = searchParams.get('contactName') || 'Dhyey';
  const contactPhone = searchParams.get('contactPhone') || '+91 94291 84788';

  const message = buildPreviewMessage(industry, stage, city, contactName, contactPhone);
  return Response.json({ message });
}
