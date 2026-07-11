/**
 * Test de l'upsert import/export — `npx tsx scripts/test-import.ts`
 * Utilise la vraie base puis nettoie ses lignes de test.
 */
import { inArray, eq } from 'drizzle-orm';
import { importContent } from '../lib/importer';
import { exportCsv } from '../lib/exporter';
import { db } from '../lib/db';
import { prospects } from '../lib/db/schema';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`}`);
}

const TEST_DOMAINS = ['test-import-a.fr', 'test-import-b.fr'];

// nettoyage préalable
db.delete(prospects).where(inArray(prospects.domain, TEST_DOMAINS)).run();

// 1. Import JSON initial
const r1 = importContent(
  JSON.stringify([
    { url: 'https://www.test-import-a.fr/', businessName: 'Alpha', notes: 'note initiale' },
    { url: 'https://test-import-b.fr', emails: ['b@test-import-b.fr'] },
    { businessName: 'sans domaine' },
  ]),
  'json'
);
check('import 1 : créés', r1.created, 2);
check('import 1 : ignorés (sans domaine)', r1.ignored, 1);

// statut modifié à la main (simulation pipeline commercial)
db.update(prospects)
  .set({ outreachStatus: 'contacte', notes: 'ma note à moi' })
  .where(eq(prospects.domain, 'test-import-a.fr'))
  .run();

// 2. Ré-import : complète les vides, n'écrase ni notes ni statut ni businessName
const r2 = importContent(
  JSON.stringify([
    {
      url: 'https://test-import-a.fr',
      businessName: 'ÉCRASEMENT',
      phones: ['+33 4 78 00 00 00'],
      notes: 'note importée',
      outreachStatus: 'nouveau',
    },
    { url: 'https://test-import-a.fr', businessName: 'doublon fichier' },
  ]),
  'json'
);
check('import 2 : mis à jour', r2.updated, 1);
check('import 2 : doublon fichier ignoré', r2.ignored, 1);

const rowA = db.select().from(prospects).where(eq(prospects.domain, 'test-import-a.fr')).get()!;
check('businessName non écrasé', rowA.businessName, 'Alpha');
check('phones complété', rowA.phones, ['+33 4 78 00 00 00']);
check('notes préservées', rowA.notes, 'ma note à moi');
check('outreachStatus préservé', rowA.outreachStatus, 'contacte');

// 3. Aller-retour CSV : ré-import de l'export → rien de créé
const csv = exportCsv();
const r3 = importContent(csv, 'csv');
check('csv round-trip : 0 créé', r3.created, 0);

// nettoyage
db.delete(prospects).where(inArray(prospects.domain, TEST_DOMAINS)).run();
console.log(failures === 0 ? '\nImport/export : tous les checks passent ✓' : `\n${failures} échec(s) ✗`);
process.exit(failures === 0 ? 0 : 1);
