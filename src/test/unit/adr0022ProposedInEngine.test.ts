/**
 * REL Engine integration: ADR 0022 (Partnership Insights) lives in the Engine
 * repository because the Operator's exporter reads ADRs from HERE. It was
 * PROPOSED until the OWNER accepted it in R2-P3 (decision P3-6(a), signed
 * 2026-10-29T14:00:05Z): exactly the three header edits of the Insights
 * activation runbook D1.1, nothing else. Nothing in the Engine reads it.
 *
 * The file is a byte-for-byte copy of the Operator lane L3's committed record
 * (`docs/adr/0022-member-visible-partnership-insights.md` at L3 `1066c86`).
 * The acceptance changed these bytes; this test pins the ACCEPTED bytes, so any
 * later edit (a supersession included) must edit the pin deliberately - and
 * closes the Operator's INSIGHTS_AUTHORITY gate, which binds the same digest.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const ADR_0022 = 'docs/adr/0022-member-visible-partnership-insights.md';
/**
 * SHA-256 of the ACCEPTED text: the Proposed record (L3 `1066c86` with the
 * R3P3-A body amendment, `c9f5664f...b656c1`) with exactly the three D1.1
 * header edits of 2026-10-29 (Status, Decision date, authority binding).
 */
const ADR_0022_ACCEPTED_SHA256 = '38a985352a7ba7cc05da3c843b5f586f2a33f0a587dbaa98a798846d41124ec6';
const THIS_FILE = relative(REPO_ROOT, __filename);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'fixtures') walk(rel, out);
    } else if (/\.(ts|mjs|js)$/.test(rel)) out.push(rel);
  }
  return out;
}

describe('ADR 0022 in the Engine: present, and ACCEPTED by exactly the D1.1 header edits', () => {
  const bytes = readFileSync(join(REPO_ROOT, ADR_0022));

  it('is the exact accepted record (the Proposed bytes plus the three D1.1 header edits)', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ADR_0022_ACCEPTED_SHA256);
  });

  it('carries exactly the accepted status and the OWNER decision date', () => {
    const text = bytes.toString('utf8');
    const status = text.split('\n').filter((l) => l.startsWith('- **Status:**'));
    expect(status).toEqual(['- **Status:** Accepted — 2026-10-29']);
    expect(text.split('\n').filter((l) => l.startsWith('- **Decision date:**'))).toEqual([
      '- **Decision date:** 2026-10-29 (OWNER)',
    ]);
  });

  it('is the only 0022 record, and 0021 stays absent from the Engine', () => {
    const adrs = readdirSync(join(REPO_ROOT, 'docs', 'adr'));
    expect(adrs.filter((f) => f.startsWith('0022-'))).toEqual([
      '0022-member-visible-partnership-insights.md',
    ]);
    expect(adrs.filter((f) => f.startsWith('0021-'))).toEqual([]);
  });

  it('is named by no Engine source, script or other test, so nothing can treat it as an authority', () => {
    const offenders = [...walk('src'), ...walk('scripts')]
      .filter((f) => f !== THIS_FILE)
      .filter((f) => {
        const code = readFileSync(join(REPO_ROOT, f), 'utf8');
        return /0022-member-visible-partnership-insights|INSIGHTS_AUTHORITY|ADR 0022/.test(code);
      });
    expect(offenders).toEqual([]);
  });
});
