import type { Prospect } from '@/lib/types';

/** Génère le prompt d'import ERP (§ handoff FreelanceOS) avec le JSON des prospects. */
export function buildErpPrompt(prospects: Prospect[]): string {
  const json = JSON.stringify(prospects, null, 2);
  return `Voici ${prospects.length} prospects (schéma stable ci-dessous). Importe-les dans mon ERP FreelanceOS, module Prospects/CRM.
Règles :
- Clé d'unicité = domain. Si le domain existe déjà : mets à jour uniquement les champs non vides, SANS écraser mes notes ni mon statut. Sinon : crée une fiche avec outreachStatus="nouveau".
- Mapping : businessName→raison sociale, emails[0]→email principal, phones[0]→téléphone, address→adresse, url→site web, businessType/category→secteur, siteType/cms/pageCountEstimate/performanceScore→champs techniques (argumentaire refonte).
- Ignore les champs vides.
Rends-moi un récap : créés / mis à jour / ignorés.

${json}`;
}
