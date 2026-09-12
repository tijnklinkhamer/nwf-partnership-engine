/**
 * EVIDENCE CANONICALISATION (Phase 2B-2D2B-1): the complete 252-name HTML
 * 4.01 entity table, preserved numeric-reference handling, the deliberate
 * `&apos;` and unknown-name refusals, NFC composition, and the one-pass rule
 * that keeps `&amp;eacute;` from becoming `é`.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  HTML4_NAMED_ENTITIES,
  canonicalEvidenceText,
  composeCanonicalForm,
  decodeHtml4EntitiesOnce,
} from '../../orgunits/web/evidenceCanonical.js';

const NAMES = Object.keys(HTML4_NAMED_ENTITIES);
const codePointOf = (name: string): number => HTML4_NAMED_ENTITIES[name]!.codePointAt(0)!;

describe('the HTML 4.01 named-entity table is exactly the official 252', () => {
  it('holds exactly 252 names, each mapping to exactly one code point', () => {
    // 96 (HTMLlat1) + 124 (HTMLsymbol) + 32 (HTMLspecial) = 252.
    expect(NAMES).toHaveLength(252);
    for (const name of NAMES) {
      expect([...HTML4_NAMED_ENTITIES[name]!], `${name} maps to one code point`).toHaveLength(1);
    }
  });

  it('maps all 252 names to 252 DISTINCT code points', () => {
    // HTML 4.01 names no character twice; a duplicate would mean a
    // transcription slip that the count alone could not catch.
    expect(new Set(NAMES.map(codePointOf)).size).toBe(252);
  });

  it('covers U+00A0-U+00FF exactly and completely - the whole HTMLlat1 set', () => {
    // A structural check rather than a restatement of the table: HTMLlat1 is
    // precisely the 96 code points U+00A0..U+00FF, one name each, so the
    // Latin-1 half is provable without copying 96 rows into this test.
    const latin1 = NAMES.filter((n) => codePointOf(n) >= 0xa0 && codePointOf(n) <= 0xff);
    expect(latin1).toHaveLength(96);
    const covered = new Set(latin1.map(codePointOf));
    for (let cp = 0xa0; cp <= 0xff; cp += 1) {
      expect(covered.has(cp), `U+${cp.toString(16).toUpperCase()} has no HTML 4.01 name`).toBe(
        true,
      );
    }
  });

  it('freezes the whole table by hash, so any name or code point change fails here', () => {
    expect(
      createHash('sha256').update(canonicalStringify(HTML4_NAMED_ENTITIES), 'utf8').digest('hex'),
    ).toBe('397004c9779f672f68cf3fe727c3c9b296449906aefe5a53c8a796b64aaaeb76');
  });

  it('carries the HTML 4.01 code points for lang/rang, not HTML5’s remapped ones', () => {
    // The only two names where HTML 4.01 and the WHATWG table disagree. This
    // is the HTML 4.01 table, so U+2329/U+232A are correct here; HTML5's
    // U+27E8/U+27E9 would be a different table wearing this one's name.
    expect(codePointOf('lang')).toBe(0x2329);
    expect(codePointOf('rang')).toBe(0x232a);
  });

  it('spot-checks one name from each official entity set', () => {
    expect(HTML4_NAMED_ENTITIES['eacute']).toBe('é'); // HTMLlat1
    expect(HTML4_NAMED_ENTITIES['alpha']).toBe('α'); // HTMLsymbol
    expect(HTML4_NAMED_ENTITIES['euro']).toBe('€'); // HTMLspecial
  });

  it('is case-sensitive: HTML 4.01 names differing only in case are different characters', () => {
    expect(HTML4_NAMED_ENTITIES['Eacute']).toBe('É');
    expect(HTML4_NAMED_ENTITIES['eacute']).toBe('é');
    expect(decodeHtml4EntitiesOnce('&Eacute;cole / &eacute;cole')).toBe('École / école');
  });
});

describe('numeric character references keep working unchanged', () => {
  it('decodes decimal references', () => {
    expect(decodeHtml4EntitiesOnce('&#233;cole')).toBe('école');
    expect(decodeHtml4EntitiesOnce('&#160;')).toBe(' ');
  });

  it('decodes a lowercase-x hexadecimal reference, and leaves an uppercase-X one literal', () => {
    expect(decodeHtml4EntitiesOnce('&#xE9;cole')).toBe('école');
    // PRESERVED PRE-2D2B BEHAVIOUR, pinned here so it cannot drift silently:
    // the reference pattern admits only a lowercase `x`, so `&#XE9;` matches
    // nothing and stays literal. This slice widened the NAMED table and
    // changed nothing about numeric handling.
    expect(decodeHtml4EntitiesOnce('&#XE9;cole')).toBe('&#XE9;cole');
  });

  it('leaves a malformed numeric reference literal rather than guessing', () => {
    expect(decodeHtml4EntitiesOnce('&#abc;')).toBe('&#abc;');
  });
});

describe('what is deliberately NOT decoded', () => {
  it('leaves &apos; literal - it is an XML/HTML5 name, not one of the 252', () => {
    expect('apos' in HTML4_NAMED_ENTITIES).toBe(false);
    expect(decodeHtml4EntitiesOnce('l&apos;universit&eacute;')).toBe('l&apos;université');
    expect(canonicalEvidenceText('&apos;')).toBe('&apos;');
  });

  it('leaves an unknown named entity literal', () => {
    expect(decodeHtml4EntitiesOnce('&notarealentity;')).toBe('&notarealentity;');
    expect(canonicalEvidenceText('R&D;&nope; &eacute;')).toBe('R&D;&nope; é');
  });

  it('adds no mojibake repair - a mis-decoded byte sequence is left exactly as found', () => {
    // The 2D2B measurement observed ZERO mojibake; a repair rule with no
    // measured population to repair could only damage correct text.
    expect(canonicalEvidenceText('CoopÃ©ration')).toBe('CoopÃ©ration');
  });

  it('folds no case, whitespace, punctuation or quote style', () => {
    expect(canonicalEvidenceText('  Centre   DE  Documentation  ')).toBe(
      '  Centre   DE  Documentation  ',
    );
    expect(canonicalEvidenceText('"straight" vs “curly”')).toBe('"straight" vs “curly”');
  });
});

describe('NFC composition', () => {
  it('composes a decomposed sequence that already sits in the text', () => {
    expect(composeCanonicalForm('école')).toBe('école');
    expect(canonicalEvidenceText('école')).toBe('école');
    expect(canonicalEvidenceText('école').normalize('NFD')).toHaveLength(6);
  });

  it('composes a sequence that only EXISTS once the reference is decoded', () => {
    // NFC must run AFTER decoding: before decoding there is only the literal
    // text `e&#769;`, and nothing to compose.
    expect(canonicalEvidenceText('e&#769;cole')).toBe('école');
    expect(canonicalEvidenceText('e&#769;cole')).toBe('école');
  });

  it('uses NFC and not NFKC - compatibility characters survive unchanged', () => {
    expect(canonicalEvidenceText('ﬁn')).toBe('ﬁn'); // ﬁ ligature, not "fin"
    expect(canonicalEvidenceText('²')).toBe('²'); // superscript two, not "2"
  });
});

describe('exactly one decoding pass, never two', () => {
  it('resolves an escaped entity to its literal text, not to the character it names', () => {
    expect(canonicalEvidenceText('&amp;eacute;')).toBe('&eacute;');
    expect(canonicalEvidenceText('&amp;eacute;')).not.toBe('é');
  });

  it('decodes left to right without rescanning what it just produced', () => {
    expect(decodeHtml4EntitiesOnce('&amp;amp;')).toBe('&amp;');
    expect(decodeHtml4EntitiesOnce('&amp;#233;')).toBe('&#233;');
  });

  it('a SECOND pass would change the text - which is why the v1/v2 gate exists', () => {
    const once = canonicalEvidenceText('&amp;eacute;');
    expect(canonicalEvidenceText(once)).toBe('é');
    expect(canonicalEvidenceText(once)).not.toBe(once);
  });

  it('is a no-op on canonical text that contains no reference-shaped sequence', () => {
    const canonical = 'Coopération régionale — Université Sorbonne Nouvelle';
    expect(canonicalEvidenceText(canonical)).toBe(canonical);
  });
});
