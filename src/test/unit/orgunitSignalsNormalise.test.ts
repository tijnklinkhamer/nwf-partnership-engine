/**
 * TERM NORMALISATION AND TOKEN-BOUNDARY MATCHING.
 *
 * The single most important negative case is the last one: `langues` must
 * never match inside `languedoc`. A substring rule would; a token rule does
 * not.
 */
import { describe, expect, it } from 'vitest';
import {
  anyTextContainsPhrase,
  containsPhrase,
  normaliseForMatching,
  stripDiacritics,
  tokenise,
} from '../../orgunits/signals/normalise.js';

describe('normaliseForMatching: case, diacritics, hyphens, whitespace', () => {
  it('lower-cases text', () => {
    expect(normaliseForMatching('LANGUES')).toBe('langues');
    expect(normaliseForMatching('International Office')).toBe('international office');
  });

  it('strips diacritics for comparison', () => {
    expect(normaliseForMatching('étudiants')).toBe('etudiants');
    expect(normaliseForMatching('Département')).toBe('departement');
    expect(normaliseForMatching('MOBILITÉ')).toBe('mobilite');
  });

  it('treats hyphens and underscores as word boundaries', () => {
    expect(normaliseForMatching('relations-internationales')).toBe(
      normaliseForMatching('relations internationales'),
    );
    expect(normaliseForMatching('centre_de_langues')).toBe(
      normaliseForMatching('centre de langues'),
    );
  });

  it('collapses multiple whitespace to one space and trims', () => {
    expect(normaliseForMatching('  international    office  ')).toBe('international office');
    expect(normaliseForMatching('international\t\noffice')).toBe('international office');
  });

  it('is idempotent', () => {
    for (const input of [
      'LANGUES',
      'Relations-Internationales',
      '  étudiants  ',
      'Département Langues',
    ]) {
      const once = normaliseForMatching(input);
      const twice = normaliseForMatching(once);
      expect(twice).toBe(once);
    }
  });

  it('handles composed and decomposed Unicode accent forms identically', () => {
    const composed = 'e\u0301tudiants'.normalize('NFC'); // e-acute as one composed codepoint (NFC)
    const decomposed = 'e\u0301tudiants'.normalize('NFD'); // e + combining acute accent (NFD)
    expect(composed).not.toBe(decomposed); // genuinely different byte sequences
    expect(normaliseForMatching(composed)).toBe(normaliseForMatching(decomposed));
    expect(normaliseForMatching(composed)).toBe('etudiants');
  });
});

describe('tokenise: token boundaries', () => {
  it('splits on whitespace and hyphens equally', () => {
    expect(tokenise('relations-internationales')).toEqual(['relations', 'internationales']);
    expect(tokenise('relations internationales')).toEqual(['relations', 'internationales']);
  });

  it('never merges two distinct words into one token, and vice versa', () => {
    expect(tokenise('languedoc')).toEqual(['languedoc']);
    expect(tokenise('langues')).toEqual(['langues']);
    expect(tokenise('langues')).not.toEqual(tokenise('languedoc'));
  });
});

describe('containsPhrase: token-boundary phrase matching, never substring matching', () => {
  it('matches a phrase as a contiguous run of whole tokens', () => {
    expect(containsPhrase(['international', 'office'], ['international', 'office'])).toBe(true);
    expect(
      containsPhrase(
        ['the', 'international', 'office', 'welcomes', 'you'],
        ['international', 'office'],
      ),
    ).toBe(true);
  });

  it('does not match out-of-order or non-contiguous tokens', () => {
    expect(containsPhrase(['office', 'international'], ['international', 'office'])).toBe(false);
    expect(containsPhrase(['international', 'the', 'office'], ['international', 'office'])).toBe(
      false,
    );
  });

  it('THE LOAD-BEARING NEGATIVE CASE: langues never matches inside languedoc', () => {
    expect(containsPhrase(tokenise('languedoc'), tokenise('langues'))).toBe(false);
    expect(containsPhrase(tokenise('la region du languedoc'), tokenise('langues'))).toBe(false);
    expect(containsPhrase(tokenise('le departement des langues'), tokenise('langues'))).toBe(true);
  });

  it('an empty phrase never matches, and a phrase longer than the field never matches', () => {
    expect(containsPhrase(['international'], [])).toBe(false);
    expect(containsPhrase(['international'], ['international', 'office'])).toBe(false);
  });
});

describe('anyTextContainsPhrase: across several independent text spans', () => {
  it('matches when any one text contains the phrase', () => {
    expect(
      anyTextContainsPhrase(
        ['Assessment Regulations', 'International Office'],
        ['international', 'office'],
      ),
    ).toBe(true);
  });

  it('does not let a phrase bleed across two separate texts', () => {
    // "international" ending one heading and "office" starting the next must
    // NOT be treated as one contiguous phrase - each text is matched on its
    // own.
    expect(
      anyTextContainsPhrase(['Our International', 'Office Hours'], ['international', 'office']),
    ).toBe(false);
  });
});

describe('stripDiacritics', () => {
  it('removes accents while leaving the base letters', () => {
    expect(stripDiacritics('étudiants entrants')).toBe('etudiants entrants');
    expect(stripDiacritics('Département')).toBe('Departement');
  });
});
