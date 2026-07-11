/**
 * Smoke test du moteur d'enrichissement — `npx tsx scripts/smoke-test.ts`
 * Vérifie les extracteurs unitaires puis le pipeline complet sur example.com.
 */
import * as cheerio from 'cheerio';
import { normalizeDomain } from '../lib/domain';
import {
  extractEmails,
  extractJsonLd,
  extractPhones,
  normalizePhoneFr,
} from '../lib/enrich/extract';
import { enrichProspect } from '../lib/enrich/enrich';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`}`);
}

// --- normalizeDomain ---
check('domain: URL complète', normalizeDomain('HTTPS://www.Plombier-Durand.fr/contact?x=1'), 'plombier-durand.fr');
check('domain: slash final', normalizeDomain('http://exemple.fr/'), 'exemple.fr');
check('domain: port', normalizeDomain('https://site.fr:8080/page'), 'site.fr');
check('domain: nu', normalizeDomain('  Site.FR  '), 'site.fr');

// --- normalizePhoneFr ---
check('phone: 04', normalizePhoneFr('04 78 12 34 56'), '+33 4 78 12 34 56');
check('phone: +33(0)', normalizePhoneFr('+33 (0)6 12 34 56 78'), '+33 6 12 34 56 78');
check('phone: 0033', normalizePhoneFr('0033.6.12.34.56.78'), '+33 6 12 34 56 78');
check('phone: invalide', normalizePhoneFr('12 34'), null);

// --- extractEmails ---
const emailHtml = `<html><body>
  <a href="mailto:Contact@Exemple.fr?subject=x">écrire</a>
  <p>direct : jean.dupont [at] exemple.fr</p>
  <p>noreply@exemple.fr sentry@foo.io image@2x.png</p>
</body></html>`;
check(
  'emails: mailto + obfuscation + filtres',
  extractEmails(cheerio.load(emailHtml), emailHtml),
  ['contact@exemple.fr', 'jean.dupont@exemple.fr']
);

// --- extractPhones ---
const phoneHtml = `<html><body>
  <a href="tel:+33478123456">appeler</a>
  <p>Tél : 04 78 12 34 56 ou 06.11.22.33.44</p>
</body></html>`;
check(
  'phones: tel + regex + dédup',
  extractPhones(cheerio.load(phoneHtml), phoneHtml),
  ['+33 4 78 12 34 56', '+33 6 11 22 33 44']
);

// --- extractJsonLd ---
const ldHtml = `<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},
{"@type":"Plumber","name":"Plomberie Durand","telephone":"0478123456",
"address":{"streetAddress":"12 rue des Lilas","postalCode":"69003","addressLocality":"Lyon"}}]}
</script></head><body></body></html>`;
const ld = extractJsonLd(cheerio.load(ldHtml));
check('jsonld: name', ld?.name, 'Plomberie Durand');
check('jsonld: type', ld?.type, 'Plumber');
check('jsonld: address', ld?.address, '12 rue des Lilas, 69003 Lyon');

// --- Pipeline complet sur example.com ---
console.log('\nPipeline complet sur https://example.com …');
enrichProspect(
  { id: 'test', domain: 'example.com', url: 'https://example.com' },
  (step) => console.log(`  étape : ${step}`)
)
  .then((updates) => {
    console.log('  résultat :', {
      businessName: updates.businessName,
      isHttps: updates.isHttps,
      siteType: updates.siteType,
      pageCountEstimate: updates.pageCountEstimate,
      hasSitemap: updates.hasSitemap,
      cms: updates.cms,
      sources: Object.keys(updates.fieldSources ?? {}),
    });
    console.log(failures === 0 ? '\nTous les checks unitaires passent ✓' : `\n${failures} check(s) en échec ✗`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error('  pipeline en échec :', err);
    process.exit(1);
  });
