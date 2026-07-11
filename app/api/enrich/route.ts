import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRunStatus, startEnrichment, RunActiveError } from '@/lib/enrich/runner';

const bodySchema = z.object({
  mode: z.enum(['all', 'retry']).optional(),
  ids: z.array(z.string()).optional(),
  force: z.boolean().optional(),
});

export async function GET() {
  return NextResponse.json(getRunStatus());
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
  }
  try {
    const result = startEnrichment(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RunActiveError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
