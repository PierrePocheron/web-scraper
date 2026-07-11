import { NextResponse } from 'next/server';
import { z } from 'zod';
import { importContent } from '@/lib/importer';

const bodySchema = z.object({
  format: z.enum(['csv', 'json']),
  content: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
  }
  const recap = importContent(parsed.data.content, parsed.data.format);
  return NextResponse.json(recap);
}
