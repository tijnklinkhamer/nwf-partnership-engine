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

/** Pinned by the REL harvest pin commit to this slice's own commit (closed range). */
const H3_TERMINAL_COMMIT: string | null = 'fe6cba113b3e035c994fd2599049e02945263df9';

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

  it('imports the same two modules, and from redact only the version-aware redactor choice', () => {
    expect([...new Set(specifiers(code()))].sort()).toEqual(['../web/redact.js', 'node:crypto']);
    // WW H-EX (P2-9): the three redactors are no longer imported directly - a stored row is
    // judged by the redactors its own extraction rule version names (`redactorsForStoredExtraction`:
    // v3 by the frozen v3 redactor, everything else by the current one). Still a refusal.
    expect(code()).toMatch(
      /import \{ redactorsForStoredExtraction \} from '\.\.\/web\/redact\.js';/,
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
    expect(fn).toMatch(/const judge = redactorsForStoredExtraction\(extractionRuleVersion\);/);
    expect(fn).toMatch(/if \(text === null \|\| judge\.contactData\(text\) === text\) return;/);
    expect(fn).toMatch(/refuse\(\s*'CONTACT_SHAPED_TEXT',/);
    const interpolated = [...fn.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]!.trim()).sort();
    // `judge.rules` is a constant label (`current` / the frozen version), never page text.
    expect(interpolated).toEqual(
      ["shapes.join('+')", 'extractionRuleVersion', 'field', 'judge.rules'].sort(),
    );
    expect(fn).not.toMatch(
      /return\s+(redact|judge)|=\s*redactContactData\(text\);|=\s*judge\.contactData\(text\);/,
    );
  });
});
