import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { prospects } from '@/lib/db/schema';

export async function GET() {
  const rows = db.select().from(prospects).orderBy(desc(prospects.discoveredAt)).all();
  return NextResponse.json(rows);
}
