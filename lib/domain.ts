/**
 * Normalise une URL ou un domaine en domaine enregistrable — clé d'unicité de toute l'app.
 * Ex : "HTTPS://www.Plombier-Durand.fr/contact?x=1" → "plombier-durand.fr"
 */
export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  const cut = s.search(/[/?#]/);
  if (cut !== -1) s = s.slice(0, cut);
  s = s.replace(/\/+$/, '');
  // retire un éventuel port
  s = s.replace(/:\d+$/, '');
  return s;
}
