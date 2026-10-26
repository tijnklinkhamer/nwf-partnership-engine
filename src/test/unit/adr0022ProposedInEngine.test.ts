/**
 * REL Engine integration: ADR 0022 (Partnership Insights) lives in the Engine
 * repository because the Operator's exporter reads ADRs from HERE, and it is
 * PROPOSED - nothing in the Engine may treat it as accepted.
 *
 * The file is a byte-for-byte copy of the Operator lane L3's committed record
 * (`docs/adr/0022-member-visible-partnership-insights.md` at L3 `1066c86`).
 * Acceptance is an OWNER edit to the status line, which changes these bytes;
 * so this test pins the Proposed bytes, and a later acceptance must edit the
 * pin deliberately rather than slip through.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const ADR_0022 = 'docs/adr/0022-member-visible-partnership-insights.md';
/** SHA-256 of the L3 lane's committed Proposed text (L3 `1066c86`). */
const ADR_0022_PROPOSED_SHA256 = 'b2cdd8f569bcccd86447794ca8c5ef238fd803d62b63aaddd5f72fa87d2d0819';
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

describe('ADR 0022 in the Engine: present, byte-identical to L3, and PROPOSED', () => {
  const bytes = readFileSync(join(REPO_ROOT, ADR_0022));

  it('is the exact L3 Proposed record', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ADR_0022_PROPOSED_SHA256);
  });

  it('carries the Proposed status and no Accepted status or decision date', () => {
    const text = bytes.toString('utf8');
    const status = text.split('\n').filter((l) => l.startsWith('- **Status:**'));
    expect(status).toEqual(['- **Status:** Proposed']);
    expect(text).not.toMatch(/^- \*\*Status:\*\*\s*Accepted/m);
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
