import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runSearch } from '@/lib/search';

const bodySchema = z.object({
  query: z.string().min(3),
  pagesMax: z.number().int().min(1).max(30).default(10),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }
  try {
    const recap = await runSearch(parsed.data.query, parsed.data.pagesMax);
    return NextResponse.json(recap);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
