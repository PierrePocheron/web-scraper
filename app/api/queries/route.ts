import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { savedQueries } from '@/lib/db/schema';

export async function GET() {
  const rows = db.select().from(savedQueries).orderBy(desc(savedQueries.lastRunAt)).all();
  return NextResponse.json(rows);
}
