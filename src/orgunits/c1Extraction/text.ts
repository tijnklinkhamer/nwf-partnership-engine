/**
 * WW E-X - TEXT UNITS, PHRASE MATCHING, QUOTES AND STATED COUNTS.
 *
 * A captured page is read as UNITS: its title, each h1-h3 heading and each
 * line of its main text, exactly as the stored (already redacted) page
 * evidence holds them. Every co-occurrence rule in this package is a
 * SAME-UNIT rule: an event phrase and a date count together only when one
 * line states both. Nothing is joined across lines or pages.
 *
 * Phrases match with the Engine's script-aware rule (`signals/scriptAware.ts`):
 * whole-token runs for Latin script, CJK-run substrings for Japanese.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import {
  compileScriptAwarePhrase,
  containsScriptAwarePhrase,
  tokeniseScriptAware,
  type ScriptAwarePhrase,
  type ScriptToken,
} from '../signals/scriptAware.js';
import type { C1Language } from './lexicon.js';

export type UnitField = 'TITLE' | 'HEADING' | 'MAIN';

export interface TextUnit {
  readonly field: UnitField;
  readonly text: string;
  readonly tokens: readonly ScriptToken[];
  readonly tokenSet: ReadonlySet<string>;
  readonly hasCjk: boolean;
}

export function unitOf(field: UnitField, text: string): TextUnit {
  const tokens = tokeniseScriptAware(text);
  return {
    field,
    text,
    tokens,
    tokenSet: new Set(tokens.map((t) => t.text)),
    hasCjk: tokens.some((t) => t.cjk),
  };
}

/** One lexicon phrase, compiled once, with the language it is written in and a payload. */
export interface CompiledPhrase<P> {
  readonly phrase: string;
  readonly language: C1Language;
  readonly compiled: ScriptAwarePhrase;
  readonly payload: P;
}

export function compilePhrases<P>(
  entries: readonly { phrase: string; language: C1Language; payload: P }[],
): CompiledPhrase<P>[] {
  const seen = new Set<string>();
  const out: CompiledPhrase<P>[] = [];
  for (const e of entries) {
    const compiled = compileScriptAwarePhrase(e.phrase);
    const key = `${JSON.stringify(compiled)}|${JSON.stringify(e.payload)}`;
    // The same phrase in two languages (`newsletter`) is attributed to the first listed.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ phrase: e.phrase, language: e.language, compiled, payload: e.payload });
  }
  return out;
}

const mayContain = (unit: TextUnit, phrase: ScriptAwarePhrase): boolean =>
  phrase.kind === 'cjk' ? unit.hasCjk : unit.tokenSet.has(phrase.tokens[0] ?? '');

/** Every compiled phrase the unit contains, in lexicon order. */
export function matchesIn<P>(
  unit: TextUnit,
  phrases: readonly CompiledPhrase<P>[],
): CompiledPhrase<P>[] {
  return phrases.filter(
    (p) => mayContain(unit, p.compiled) && containsScriptAwarePhrase(unit.tokens, p.compiled),
  );
}

export const QUOTE_MAX_CODE_POINTS = 300;

/**
 * The quote for a finding: the first SENTENCE of the unit that itself
 * contains every phrase in `required`, else the whole unit, capped at
 * `QUOTE_MAX_CODE_POINTS` code points (never splitting a surrogate pair).
 * Always a contiguous substring of the stored text - nothing is rewritten.
 */
export function quoteOf(
  unit: TextUnit,
  required: readonly ScriptAwarePhrase[],
): { readonly quote: string; readonly truncated: boolean } {
  const sentences = unit.text.split(/(?<=[.!?])\s+|(?<=[。！？])/u).filter((s) => s.trim() !== '');
  const containsAll = (text: string) => {
    const tokens = tokeniseScriptAware(text);
    return required.every((p) => containsScriptAwarePhrase(tokens, p));
  };
  const chosen = sentences.find(containsAll) ?? unit.text;
  const codePoints = Array.from(chosen.trim());
  return codePoints.length <= QUOTE_MAX_CODE_POINTS
    ? { quote: codePoints.join(''), truncated: false }
    : { quote: codePoints.slice(0, QUOTE_MAX_CODE_POINTS).join(''), truncated: true };
}

// ---------------------------------------------------------------------------
// Stated counts.
// ---------------------------------------------------------------------------

/** NFKC (full-width digits), diacritics stripped, lower-cased. */
const fold = (text: string): string =>
  text.normalize('NFKC').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A number as written: plain digits, or digits grouped in thousands by `,` `.` or a space
 * (NFKC has already folded a no-break or narrow no-break space to a plain one).
 */
const NUMBER = String.raw`(\d{1,3}(?:[., ]\d{3})+|\d{1,9})`;

export const MAX_COUNT = 100_000_000;

function parseNumber(text: string): number | null {
  const n = Number(text.replace(/[., ]/g, ''));
  return Number.isInteger(n) && n >= 1 && n <= MAX_COUNT ? n : null;
}

/**
 * Every `<number> <unit>` (Latin scripts) or `<unit><number>[人|名]`
 * (Japanese) the text states, for the given unit words. A decimal (`1,5`),
 * a number glued to letters, or a value above 100,000,000 is never a count.
 */
export function statedCounts(
  text: string,
  units: readonly string[],
  japanese: boolean,
): { readonly count: number; readonly unit: string }[] {
  if (units.length === 0) return [];
  const folded = fold(text);
  const alternation = units
    .map(fold)
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
  const re = japanese
    ? new RegExp(
        `(${alternation})(?:数)?\\s*(?:は|:|：)?\\s*(?:約)?\\s*${NUMBER}\\s*(?:人|名)?`,
        'gu',
      )
    : new RegExp(`(?<![\\d.,\\p{L}])${NUMBER}\\s*\\+?\\s*(${alternation})(?![\\p{L}])`, 'gu');
  const out: { count: number; unit: string }[] = [];
  for (const m of folded.matchAll(re)) {
    const [numberText, unit] = japanese ? [m[2]!, m[1]!] : [m[1]!, m[2]!];
    const count = parseNumber(numberText);
    if (count !== null) out.push({ count, unit });
  }
  return out;
}
