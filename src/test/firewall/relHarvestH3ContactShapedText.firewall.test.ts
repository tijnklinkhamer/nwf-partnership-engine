/**
 * REL HARVEST H3 FIREWALL - a SPECIFIC `CONTACT_SHAPED_TEXT` refusal, and
 * nothing else moved.
 *
 * Ported from the duplicate relf1 line (`fac310a`, REL-F1-R2 Wave 2 item d).
 * Over H3_BASE_COMMIT..H3_TERMINAL_COMMIT (the working tree while the
 * terminal is open) it pins:
 *   - the change set is the R9 evidence module, its unit test and this file;
 *   - the module changed by exactly the refusal's detail: same imports module
 *     set, same refusal code set, still a refusal (never a re-redaction), and
 *     the detail never interpolates the refused text;
 *   - the unit test only APPENDS its vectors.
 */
import { describe, expect, it } from 'vitest';

import { REFUSAL_CODES } from '../../orgunits/subjectResearchEvidence/evidence.js';
import { codeOf, git, phaseRange, readCurrent, specifiers } from '../helpers/phaseRange.js';

/** The H2 commit: this slice's parent. */
const H3_BASE_COMMIT = '198fca6558b85c002a28d3485054369a7a2932b3';

/** Open (null) until the harvest pin commit closes the range. */
const H3_TERMINAL_COMMIT: string | null = null;

const MODULE = 'src/orgunits/subjectResearchEvidence/evidence.ts';
const UNIT = 'src/test/unit/subjectResearchEvidenceR9.test.ts';

const h3 = phaseRange(H3_BASE_COMMIT, H3_TERMINAL_COMMIT);

describe.skipIf(!h3.available)('REL harvest H3: the change set over its own range', () => {
  it('is exactly the evidence module, its unit test and this firewall', () => {
    expect(h3.changeset()).toEqual(
      [
        `M\t${MODULE}`,
        `M\t${UNIT}`,
        'A\tsrc/test/firewall/relHarvestH3ContactShapedText.firewall.test.ts',
      ].sort(),
    );
  });

  it('removes exactly the old fixed-point check and its three call sites', () => {
    expect(h3.diffLines(MODULE).removed).toEqual([
      "import { redactContactData } from '../web/redact.js';",
      "/** Every exported text must already be a fixed point of the Engine's own redaction. */",
      'function redactionFixedPoint(text: string | null, detail: string): void {',
      "  if (text !== null && redactContactData(text) !== text) refuse('CONTACT_SHAPED_TEXT', detail);",
      "      redactionFixedPoint(h.text, 'page.heading');",
      "    redactionFixedPoint(p.title, 'page.title');",
      "    redactionFixedPoint(p.mainText, 'page.mainText');",
    ]);
  });

  it('only appends to the unit test', () => {
    expect(h3.diffLines(UNIT).removed).toEqual([]);
  });
});

describe('REL harvest H3: the refusal stays a refusal, and names no text', () => {
  const code = () => codeOf(readCurrent(MODULE));

  it('imports the same two modules, and from redact only the three redactors', () => {
    expect([...new Set(specifiers(code()))].sort()).toEqual(['../web/redact.js', 'node:crypto']);
    expect(code()).toMatch(
      /import \{ redactContactData, redactEmails, redactPhones \} from '\.\.\/web\/redact\.js';/,
    );
  });

  it('keeps the refusal code set unchanged', () => {
    expect(REFUSAL_CODES).toContain('CONTACT_SHAPED_TEXT');
    const block = (source: string) =>
      /export const REFUSAL_CODES = \[[\s\S]*?\] as const;/.exec(source)?.[0];
    const before = block(git('show', `${H3_BASE_COMMIT}:${MODULE}`));
    expect(before).toBeDefined();
    expect(block(readCurrent(MODULE))).toBe(before);
  });

  it('refuses before anything is emitted, and the detail never interpolates the text', () => {
    const fn = /function redactionFixedPoint\([\s\S]*?\n\}/.exec(code())?.[0] ?? '';
    expect(fn).toMatch(/if \(text === null \|\| redactContactData\(text\) === text\) return;/);
    expect(fn).toMatch(/refuse\(\s*'CONTACT_SHAPED_TEXT',/);
    const interpolated = [...fn.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]!.trim()).sort();
    expect(interpolated).toEqual(["shapes.join('+')", 'extractionRuleVersion', 'field'].sort());
    expect(fn).not.toMatch(/return\s+redact|=\s*redactContactData\(text\);/);
  });
});
