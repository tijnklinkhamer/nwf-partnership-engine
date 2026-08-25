/**
 * THE SERVICE-SUBDOMAIN BOUNDARY: same registrable domain is NECESSARY but not
 * SUFFICIENT.
 *
 * WHY THIS EXISTS - MEASURED, NOT SUPPOSED
 *
 *   ADR 0004 s3 records it as a finding of the 2026-08-24 holdout: same-domain
 *   acquisition walks straight into an institution's internal service estate.
 *   12 of 53 fetches on ONE university burned a full connect timeout each -
 *   roughly six minutes of a run's budget - on `moodle.`, `glpi.`, `grr.`,
 *   `mail.etudiant.`, `workflow.`, `mondossierweb.`, `espace-achat.` and
 *   `espace-voyage.`. Not one of them could ever have been a partner-unit page.
 *
 * WHY IT IS A NETWORK-SCOPE GUARD AND NOT A RANKING PREFERENCE
 *
 *   This is not "these pages score badly". It is "this repository has no
 *   business opening a socket to an institution's mail server, its VPN
 *   concentrator, its ticketing system or its learning-management login". A
 *   ranking preference is applied AFTER a page has been fetched and read; this
 *   is applied BEFORE any DNS lookup, and refusing here is the difference
 *   between not connecting and connecting-then-discarding.
 *
 *   The gateway is the SECOND independent trust gate. A future bounded frontier
 *   will also decline to emit these hosts, and that is not a reason for the
 *   gateway to trust it: a gate that only holds when the layer above it is
 *   correct is not a gate. This one refuses them even if a frontier emits one
 *   by accident.
 *
 * WHY IT MATCHES LABELS AND NEVER SUBSTRINGS
 *
 *   `international-mail.example.edu` is not a mail server, and a substring
 *   match would refuse it. A hostname is a sequence of LABELS, and the question
 *   "is one of these labels a well-known service name?" is the only form of the
 *   question that has a defensible answer. Every comparison below is against a
 *   whole label.
 *
 * WHY IT IS COUNTRY-BLIND
 *
 *   ADR 0004 s12: nothing in this repository may assume a country, a language
 *   or a market. Both samples so far were French, and that is a property of the
 *   SAMPLE. What is encoded here is PRODUCT AND PROTOCOL NAMES - `moodle`,
 *   `glpi`, `grr`, `smtp`, `ldap`, `vpn` - which are the same everywhere. Two
 *   entries look French (`mondossierweb`, the `espace-` prefix) and are here
 *   only because the holdout named those exact strings; they are literal
 *   observed host labels, not a language pack, and no French-language rule is
 *   inferred from them. This file must never grow a rule that only makes sense
 *   in one country.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */

/**
 * Well-known service host labels, exactly as approved.
 *
 * DELIBERATELY SMALL. A speculative catalogue would refuse institutions for
 * reasons nobody measured, and every entry that is not evidence-backed is a
 * silent coverage loss. Adding one is a reviewed edit, not a convenience.
 *
 * The trade is asymmetric and that is why the list errs towards refusal at all:
 * a wrong refusal costs one host, is reported to the caller by name, and is
 * recoverable by editing this list; a wrong acceptance spends a connect timeout
 * on infrastructure that was never a research target, which is precisely the
 * six minutes the holdout measured.
 */
const SERVICE_LABELS: ReadonlySet<string> = new Set([
  // Learning-management and campus portals
  'moodle',
  'ent',
  'intranet',
  'mondossierweb',
  // Message transport and mailboxes
  'webmail',
  'mail',
  'smtp',
  'imap',
  // Network access, identity and directory services
  'vpn',
  'sso',
  'cas',
  'ldap',
  'wifi',
  // Internal IT service estate
  'glpi',
  'grr',
  'workflow',
  'dsi',
  // Source hosting and file sync
  'git',
  'gitlab',
  'nextcloud',
  'owncloud',
  // Conferencing
  'bbb',
  // Machine and asset endpoints, which serve no human-readable unit page
  'apps',
  'api',
  'cdn',
  'static',
  'assets',
]);

/**
 * The one approved PREFIX rule, applied to a whole label.
 *
 * The holdout observed `espace-achat.` and `espace-voyage.`; the family is
 * open-ended in a way an exact list cannot track. `espace` on its own is NOT
 * refused - that would be a guess beyond what was observed - and the prefix is
 * matched against a complete label, so `mon-espace-x.example.edu` is unaffected.
 */
const SERVICE_LABEL_PREFIXES: readonly string[] = ['espace-'];

export type HostRefusalReason = 'service_subdomain';

export interface HostRefusal {
  reason: HostRefusalReason;
  /** The exact label that was refused, so a caller can report WHICH one. */
  label: string;
}

export type HostVerdict = { ok: true } | { ok: false; refusal: HostRefusal };

/** True when one whole label is a known service name. Never a substring test. */
export function isServiceLabel(label: string): boolean {
  const normalised = label.toLowerCase();
  if (SERVICE_LABELS.has(normalised)) return true;
  return SERVICE_LABEL_PREFIXES.some(
    (prefix) => normalised.startsWith(prefix) && normalised.length > prefix.length,
  );
}

/**
 * The labels a hostname carries BELOW its registrable domain.
 *
 * Only these are examined. The registrable domain itself is the institution's
 * own name and is whatever the official source published - refusing an
 * institution because its registered domain happens to be `api.fr` would be
 * refusing the root this gateway exists to read.
 */
export function subdomainLabels(hostname: string, registrableDomain: string): string[] {
  const host = hostname.toLowerCase();
  const domain = registrableDomain.toLowerCase();
  if (host === domain) return [];
  if (!host.endsWith(`.${domain}`)) return host.split('.');
  return host.slice(0, host.length - domain.length - 1).split('.');
}

/**
 * Decides whether this gateway may open a socket to this HOST at all.
 *
 * EVERY subdomain label is examined, not just the leftmost. `www.moodle.x.fr`
 * is the moodle host with a `www` in front of it, and a leftmost-only rule
 * would let it through. The conservative direction is the correct one here for
 * the reason given above.
 *
 * A refusal produces NO evidence row, exactly like every other pre-DNS refusal
 * in this gateway: `orgunit_fetch_observations` records HTTP ATTEMPTS, and a
 * host this gateway declined to resolve produced no attempt. The refusal is
 * reported to the caller, by label, as a `WebGatewayRefusal`.
 */
export function checkHostAdmissible(hostname: string, registrableDomain: string): HostVerdict {
  for (const label of subdomainLabels(hostname, registrableDomain)) {
    if (isServiceLabel(label)) {
      return { ok: false, refusal: { reason: 'service_subdomain', label } };
    }
  }
  return { ok: true };
}
