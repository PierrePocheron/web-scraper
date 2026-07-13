/**
 * Validation bout-en-bout réelle — `npm run test:e2e`
 * Recherche Serper (2 pages, ~2 crédits) puis enrichit 4 sites trouvés.
 * Écrit dans la vraie base : c'est le pipeline de production.
 */
// .env chargé AVANT l'import de lib/config (imports dynamiques obligatoires)
process.loadEnvFile('.env');

async function main() {
  const { eq, inArray } = await import('drizzle-orm');
  const { runSearch } = await import('../lib/search');
  const { startEnrichment, getRunStatus } = await import('../lib/enrich/runner');
  const { enrichEvents } = await import('../lib/enrich/events');
  const { db } = await import('../lib/db');
  const { prospects } = await import('../lib/db/schema');
  const { DEFAULT_DORK } = await import('../lib/types');

  const noSearch = process.argv.includes('--no-search');
  const force = process.argv.includes('--force');

  if (!noSearch) {
    console.log(`Recherche : ${DEFAULT_DORK}`);
    const recap = await runSearch(DEFAULT_DORK, 2);
    console.log(
      `→ ${recap.totalResults} résultats sur ${recap.pagesFetched} page(s) : ${recap.created} nouveaux, ${recap.known} déjà en base`
    );
    console.log(`→ nouveaux : ${recap.newDomains.join(', ') || '(aucun)'}\n`);
  }

  // --force : reprend les 4 plus anciens quel que soit leur statut ; sinon les pending
  const targets = force
    ? db.select().from(prospects).orderBy(prospects.discoveredAt).limit(4).all()
    : db
        .select()
        .from(prospects)
        .where(eq(prospects.enrichmentStatus, 'pending'))
        .limit(4)
        .all();

  if (targets.length === 0) {
    console.log('Aucun prospect pending à enrichir.');
    return;
  }

  console.log(`Enrichissement de ${targets.length} site(s)…`);
  enrichEvents.on('event', (ev) => {
    if (ev.type === 'site') {
      console.log(`  [${ev.domain}] ${ev.step}${ev.error ? ` — ${ev.error}` : ''}`);
    }
  });

  startEnrichment({ ids: targets.map((t) => t.id), force });
  while (getRunStatus().active) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log('\n--- Fiches obtenues ---');
  const rows = db
    .select()
    .from(prospects)
    .where(inArray(prospects.id, targets.map((t) => t.id)))
    .all();
  for (const r of rows) {
    console.log(`\n■ ${r.domain} [${r.enrichmentStatus}]${r.enrichmentError ? ` (${r.enrichmentError})` : ''}`);
    console.log(`  nom: ${r.businessName} | type: ${r.businessType} | secteur: ${r.category}`);
    console.log(`  emails: ${r.emails.join(', ') || '—'} | tél: ${r.phones.join(', ') || '—'}`);
    console.log(`  dirigeant: ${[r.contactFirstName, r.contactLastName].filter(Boolean).join(' ') || '—'} | resp. publication: ${r.publicationManager ?? '—'} | SIRET: ${r.siret ?? '—'}`);
    console.log(`  adresse: ${r.address ?? '—'}`);
    console.log(`  cms: ${r.cms ?? '—'} | type site: ${r.siteType} | pages: ${r.pageCountEstimate ?? '—'} (sitemap: ${r.hasSitemap ? 'oui' : 'non'}) | https: ${r.isHttps ? 'oui' : 'non'}`);
    console.log(`  mentions légales: ${r.legalNoticeUrl ?? '—'}`);
  }
}

main().then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
