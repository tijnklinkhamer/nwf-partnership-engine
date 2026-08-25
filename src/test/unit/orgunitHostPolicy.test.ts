/**
 * THE SERVICE-SUBDOMAIN BOUNDARY, as a matrix.
 *
 * The rule is a LABEL rule, and the test that matters most is the negative one:
 * `international-mail.example.edu` must survive, because a substring rule would
 * refuse it and a substring rule is what anyone reaches for first.
 *
 * The zero-DNS / zero-transport proof for these hosts lives in the gateway
 * integration suite, which drives the real refusal path with a recording
 * transport. This file proves the policy itself.
 */
import { describe, expect, it } from 'vitest';
import {
  checkHostAdmissible,
  isServiceLabel,
  subdomainLabels,
} from '../../orgunits/web/hostPolicy.js';

const DOMAIN = 'example.edu';

function refusedLabel(hostname: string): string | null {
  const verdict = checkHostAdmissible(hostname, DOMAIN);
  return verdict.ok ? null : verdict.refusal.label;
}

describe('checkHostAdmissible: refuses the service estate the holdout walked into', () => {
  it('refuses every host ADR 0004 s3 named, by label', () => {
    // These are the eight the 2026-08-24 holdout burned six minutes of connect
    // timeouts on. Every one of them is refused before a socket can exist.
    expect(refusedLabel('moodle.example.edu')).toBe('moodle');
    expect(refusedLabel('glpi.example.edu')).toBe('glpi');
    expect(refusedLabel('grr.example.edu')).toBe('grr');
    expect(refusedLabel('mail.etudiant.example.edu')).toBe('mail');
    expect(refusedLabel('workflow.example.edu')).toBe('workflow');
    expect(refusedLabel('mondossierweb.example.edu')).toBe('mondossierweb');
    expect(refusedLabel('espace-achat.example.edu')).toBe('espace-achat');
    expect(refusedLabel('espace-voyage.example.edu')).toBe('espace-voyage');
  });

  it('refuses message transport, identity and network-access hosts', () => {
    for (const label of ['webmail', 'mail', 'smtp', 'imap', 'vpn', 'sso', 'cas', 'ldap', 'wifi']) {
      expect(refusedLabel(`${label}.example.edu`), label).toBe(label);
    }
  });

  it('refuses internal IT, source-hosting, file-sync and conferencing hosts', () => {
    for (const label of [
      'intranet',
      'ent',
      'dsi',
      'git',
      'gitlab',
      'nextcloud',
      'owncloud',
      'bbb',
    ]) {
      expect(refusedLabel(`${label}.example.edu`), label).toBe(label);
    }
  });

  it('refuses machine and asset endpoints, which serve no unit page', () => {
    for (const label of ['apps', 'api', 'cdn', 'static', 'assets']) {
      expect(refusedLabel(`${label}.example.edu`), label).toBe(label);
    }
  });

  it('examines EVERY subdomain label, not only the leftmost', () => {
    // `www.moodle.x` is the moodle host with a www in front of it. A
    // leftmost-only rule would let it through.
    expect(refusedLabel('www.moodle.example.edu')).toBe('moodle');
    expect(refusedLabel('a.b.vpn.example.edu')).toBe('vpn');
    expect(refusedLabel('login.sso.example.edu')).toBe('sso');
  });
});

describe('checkHostAdmissible: admits the hosts this phase exists to read', () => {
  it('admits ordinary institutional unit hosts', () => {
    for (const host of [
      'international.example.edu',
      'langues.example.edu',
      'www2.example.edu',
      'www.example.edu',
      'example.edu',
      'en.example.edu',
      'relations-internationales.example.edu',
    ]) {
      expect(checkHostAdmissible(host, DOMAIN), host).toEqual({ ok: true });
    }
  });

  it('NEVER matches a substring: the label must be the whole label', () => {
    // The single most important negative case. Every one of these CONTAINS a
    // denied name and none of them IS one.
    for (const host of [
      'international-mail.example.edu',
      'mailing-list-archive.example.edu',
      'apiculture.example.edu',
      'entreprises.example.edu',
      'casting.example.edu',
      'gitane.example.edu',
      'moodler.example.edu',
      'staticsite.example.edu',
      'assetstudy.example.edu',
    ]) {
      expect(checkHostAdmissible(host, DOMAIN), host).toEqual({ ok: true });
    }
  });

  it('applies the espace- prefix to a whole label and nothing wider', () => {
    expect(isServiceLabel('espace-achat')).toBe(true);
    expect(isServiceLabel('espace-voyage')).toBe(true);
    // `espace` alone was not observed and is not guessed at.
    expect(isServiceLabel('espace')).toBe(false);
    // The prefix rule is a LABEL rule: a label that merely contains it survives.
    expect(checkHostAdmissible('mon-espace-achat.example.edu', DOMAIN)).toEqual({ ok: true });
    expect(isServiceLabel('espace-')).toBe(false);
  });

  it('never refuses an institution for its own REGISTRABLE domain', () => {
    // The registrable domain is whatever the official source published. An
    // institution registered at `api.fr` is not an API endpoint, and refusing
    // it would refuse the root this gateway exists to read.
    expect(checkHostAdmissible('api.fr', 'api.fr')).toEqual({ ok: true });
    expect(checkHostAdmissible('www.mail.fr', 'mail.fr')).toEqual({ ok: true });
    expect(checkHostAdmissible('moodle.fr', 'moodle.fr')).toEqual({ ok: true });
  });
});

describe('subdomainLabels', () => {
  it('returns the labels below the registrable domain, and nothing else', () => {
    expect(subdomainLabels('www.example.edu', 'example.edu')).toEqual(['www']);
    expect(subdomainLabels('mail.etudiant.example.edu', 'example.edu')).toEqual([
      'mail',
      'etudiant',
    ]);
    expect(subdomainLabels('example.edu', 'example.edu')).toEqual([]);
  });

  it('is case-insensitive on both sides', () => {
    expect(subdomainLabels('MOODLE.Example.EDU', 'example.edu')).toEqual(['moodle']);
    expect(refusedLabel('MOODLE.example.edu')).toBe('moodle');
  });

  it('examines the whole host when it does not sit under the given domain', () => {
    // Defensive only: the gateway always passes a domain the host sits under,
    // because both come from one `validateRequestUrl` result. Falling back to
    // the whole host means a caller that got that wrong is refused MORE, not
    // less.
    expect(subdomainLabels('moodle.other.fr', 'example.edu')).toEqual(['moodle', 'other', 'fr']);
  });
});
