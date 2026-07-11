import { exportJson } from '@/lib/exporter';

export async function GET() {
  const json = exportJson();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="prospects-${date}.json"`,
    },
  });
}
