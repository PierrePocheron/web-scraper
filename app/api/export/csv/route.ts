import { exportCsv } from '@/lib/exporter';

export async function GET() {
  const csv = exportCsv();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="prospects-${date}.csv"`,
    },
  });
}
