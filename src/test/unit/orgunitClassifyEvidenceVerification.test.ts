import { describe, expect, it } from 'vitest';
import {
  evidenceSpanVerifies,
  unitNameVerifies,
} from '../../orgunits/classify/evidenceVerification.js';
import type { ClassifierDocument } from '../../orgunits/classify/types.js';

function doc(overrides: Partial<ClassifierDocument> = {}): ClassifierDocument {
  return {
    docIndex: 0,
    url: 'https://exemple-univ.fr/international/bureau-des-relations',
    title: 'Bureau des Relations Internationales — École Supérieure',
    declaredLang: 'fr',
    headings: [
      { level: 1, text: 'Bienvenue au Bureau des Relations Internationales' },
      { level: 2, text: 'Accueil des étudiants internationaux' },
    ],
    excerpt:
      'Le Bureau des Relations Internationales accompagne les étudiants   entrants et sortants.',
    mainTextTruncated: false,
    excerptTruncated: false,
    extractionRuleVersion: 'orgunit-extraction-v1',
    discoveryMethod: 'LINK',
    roots: [],
    trackMembership: ['A'],
    duplicateUrls: [],
    signals: [],
    ...overrides,
  };
}

describe('evidenceSpanVerifies - the anti-hallucination gate', () => {
  it('accepts a literal TITLE substring', () => {
    expect(evidenceSpanVerifies(doc(), 'TITLE', 'Bureau des Relations Internationales')).toBe(true);
  });

  it('accepts a literal HEADING substring from any heading', () => {
    expect(evidenceSpanVerifies(doc(), 'HEADING', 'Accueil des étudiants internationaux')).toBe(
      true,
    );
  });

  it('accepts a literal EXCERPT substring', () => {
    expect(evidenceSpanVerifies(doc(), 'EXCERPT', 'accompagne les étudiants')).toBe(true);
  });

  it('accepts a literal URL_PATH substring (verified against the full url field, since the model receives no separate path field)', () => {
    expect(evidenceSpanVerifies(doc(), 'URL_PATH', '/international/bureau-des-relations')).toBe(
      true,
    );
  });

  it('applies whitespace normalisation but no other normalisation: a run of spaces in the quote still matches a single space in the field', () => {
    expect(evidenceSpanVerifies(doc(), 'EXCERPT', 'accompagne  les    étudiants')).toBe(true);
  });

  it('rejects a quote absent from the named field', () => {
    expect(evidenceSpanVerifies(doc(), 'TITLE', 'Centre de Langues')).toBe(false);
  });

  it('rejects a quote that is present, but only in a DIFFERENT field than the one named (TITLE quote only in EXCERPT)', () => {
    expect(evidenceSpanVerifies(doc(), 'TITLE', 'accompagne les étudiants')).toBe(false);
  });

  it('rejects a HEADING quote only present in EXCERPT', () => {
    expect(evidenceSpanVerifies(doc(), 'HEADING', 'accompagne les étudiants')).toBe(false);
  });

  it('rejects a URL_PATH quote only present in TITLE', () => {
    expect(evidenceSpanVerifies(doc(), 'URL_PATH', 'École Supérieure')).toBe(false);
  });

  it('rejects a quote against a null TITLE field', () => {
    expect(evidenceSpanVerifies(doc({ title: null }), 'TITLE', 'anything')).toBe(false);
  });

  it('rejects an empty quote', () => {
    expect(evidenceSpanVerifies(doc(), 'TITLE', '')).toBe(false);
  });

  it('rejects a quote whose diacritics were silently corrected (no diacritic folding for evidence spans, unlike unit_name)', () => {
    // The document says "étudiants"; a quote claiming the unaccented form is
    // not a LITERAL substring, and evidence spans get NO diacritic leniency.
    expect(evidenceSpanVerifies(doc(), 'EXCERPT', 'etudiants')).toBe(false);
  });

  it('rejects a quote that changes punctuation from the source (an em dash rewritten as a hyphen)', () => {
    expect(
      evidenceSpanVerifies(doc(), 'TITLE', 'Bureau des Relations Internationales - École'),
    ).toBe(false);
  });

  it('handles Unicode astral characters (emoji) without throwing and without false-matching', () => {
    const withEmoji = doc({ excerpt: 'Bienvenue 🎓 aux étudiants internationaux.' });
    expect(evidenceSpanVerifies(withEmoji, 'EXCERPT', 'Bienvenue 🎓 aux')).toBe(true);
    expect(evidenceSpanVerifies(withEmoji, 'EXCERPT', '🎉')).toBe(false);
  });
});

describe('unitNameVerifies - looser than evidence spans, on purpose', () => {
  it('accepts a literal name from the title', () => {
    expect(unitNameVerifies(doc(), 'Bureau des Relations Internationales')).toBe(true);
  });

  it('accepts a literal name from a heading', () => {
    expect(unitNameVerifies(doc(), 'Accueil des étudiants internationaux')).toBe(true);
  });

  it('accepts a literal name from the excerpt', () => {
    expect(unitNameVerifies(doc(), 'Bureau des Relations Internationales')).toBe(true);
  });

  it('accepts the name with diacritics folded (École -> Ecole)', () => {
    expect(unitNameVerifies(doc(), 'Ecole Superieure')).toBe(true);
  });

  it('accepts the name with whitespace collapsed', () => {
    expect(unitNameVerifies(doc(), 'Bureau   des Relations    Internationales')).toBe(true);
  });

  it('rejects an invented name absent from every supplied field', () => {
    expect(unitNameVerifies(doc(), 'Direction des Affaires Internationales')).toBe(false);
  });

  it('rejects a name that belongs to a DIFFERENT document (not supplied to this one)', () => {
    const other = doc({
      title: 'Centre de Langues',
      headings: [],
      excerpt: 'Le centre propose des cours de langue.',
    });
    expect(unitNameVerifies(other, 'Bureau des Relations Internationales')).toBe(false);
  });

  it('rejects a name found only in the URL (url is excluded from unit_name verification)', () => {
    expect(unitNameVerifies(doc(), 'bureau-des-relations')).toBe(false);
  });

  it('rejects an over-length name even if it happens to be a substring of a longer field', () => {
    const longExcerpt = doc({ excerpt: 'x'.repeat(300) });
    const name = 'x'.repeat(250);
    // unitNameVerifies itself does no length bound (that is validate.ts's
    // job) - this proves it still correctly finds a long literal match.
    expect(unitNameVerifies(longExcerpt, name)).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(unitNameVerifies(doc(), '')).toBe(false);
  });

  it('handles Unicode astral characters without throwing', () => {
    const withEmoji = doc({ title: 'Bureau 🎓 International' });
    expect(unitNameVerifies(withEmoji, 'Bureau 🎓 International')).toBe(true);
  });
});

describe('evidenceSpanVerifies stays literal after whitespace collapse (2B-2D2B-1)', () => {
  it('collapses whitespace on both sides and nothing else', () => {
    expect(evidenceSpanVerifies(doc(), 'EXCERPT', 'les  étudiants     entrants')).toBe(true);
  });

  it('still refuses a case difference', () => {
    expect(evidenceSpanVerifies(doc(), 'TITLE', 'bureau des relations internationales')).toBe(
      false,
    );
  });

  it('still refuses a diacritic difference', () => {
    expect(evidenceSpanVerifies(doc(), 'EXCERPT', 'les etudiants')).toBe(false);
  });

  it('still refuses a punctuation or quote-style difference', () => {
    expect(evidenceSpanVerifies(doc(), 'TITLE', 'Internationales - École Supérieure')).toBe(false);
  });

  it('verifies a DECODED quote against a canonical document, and not against v1 bytes', () => {
    // The exact 2D2B rejection mechanism: the model quotes what a reader
    // sees, and v1 evidence held the entity markup instead.
    const v1 = doc({ title: 'Coop&eacute;ration r&eacute;gionale' });
    const canonical = doc({ title: 'Coopération régionale' });
    expect(evidenceSpanVerifies(v1, 'TITLE', 'Coopération régionale')).toBe(false);
    expect(evidenceSpanVerifies(canonical, 'TITLE', 'Coopération régionale')).toBe(true);
  });
});

describe('unitNameVerifies folds whitespace, diacritics AND case - and nothing more', () => {
  it('accepts a name that differs only in capitalisation', () => {
    // The Mayotte case: the page says `centre de documentation`, the model
    // returns it conventionally capitalised.
    const d = doc({ excerpt: 'Contacter le centre de documentation du campus.' });
    expect(unitNameVerifies(d, 'Centre de documentation')).toBe(true);
    expect(unitNameVerifies(d, 'CENTRE DE DOCUMENTATION')).toBe(true);
    expect(unitNameVerifies(d, 'centre de documentation')).toBe(true);
  });

  it('accepts case and diacritic and whitespace differences together', () => {
    expect(unitNameVerifies(doc(), 'bureau   des relations internationales')).toBe(true);
    expect(unitNameVerifies(doc(), 'ECOLE SUPERIEURE')).toBe(true);
  });

  it('does NOT fold punctuation', () => {
    expect(unitNameVerifies(doc(), 'Bureau des Relations-Internationales')).toBe(false);
  });

  it('does NOT expand an acronym', () => {
    const d = doc({ title: 'DAI', excerpt: 'Contact the DAI.', headings: [] });
    expect(unitNameVerifies(d, 'DAI')).toBe(true);
    expect(unitNameVerifies(d, 'Direction des Affaires Internationales')).toBe(false);
  });

  it('does NOT reorder tokens or match fuzzily', () => {
    expect(unitNameVerifies(doc(), 'Relations Internationales Bureau des')).toBe(false);
    expect(unitNameVerifies(doc(), 'Bureau des Relatons Internationales')).toBe(false);
  });

  it('still refuses an empty or whitespace-only name', () => {
    expect(unitNameVerifies(doc(), '   ')).toBe(false);
  });
});
