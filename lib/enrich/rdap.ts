import { config } from '@/lib/config';

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

/**
 * Date de création (enregistrement) du domaine via RDAP — le WHOIS moderne, gratuit.
 * rdap.org redirige vers le registre compétent (.fr → nic.fr, .com → Verisign…).
 */
export async function getDomainCreationDate(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/rdap+json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: RdapEvent[] };
    const registration = data.events?.find((e) => e.eventAction === 'registration');
    return registration?.eventDate ?? null;
  } catch {
    return null;
  }
}
