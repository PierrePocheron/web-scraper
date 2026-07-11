import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { prospects } from '@/lib/db/schema';
import { OUTREACH_STATUSES } from '@/lib/types';

const patchSchema = z
  .object({
    outreachStatus: z.enum(OUTREACH_STATUSES),
    notes: z.string().nullable(),
    businessName: z.string().nullable(),
    businessType: z.string().nullable(),
    category: z.string().nullable(),
    contactFirstName: z.string().nullable(),
    contactLastName: z.string().nullable(),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    address: z.string().nullable(),
  })
  .partial();

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
  }
  const result = db.update(prospects).set(parsed.data).where(eq(prospects.id, id)).run();
  if (result.changes === 0) {
    return NextResponse.json({ error: 'Prospect introuvable' }, { status: 404 });
  }
  const row = db.select().from(prospects).where(eq(prospects.id, id)).get();
  return NextResponse.json(row);
}

// RGPD : droit à l'effacement — suppression réelle en base.
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const result = db.delete(prospects).where(eq(prospects.id, id)).run();
  if (result.changes === 0) {
    return NextResponse.json({ error: 'Prospect introuvable' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
