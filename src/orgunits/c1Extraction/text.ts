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
 *
 * A full stop after a one- or two-digit number (a German ordinal day) never
 * ends a sentence (rules v3).
 *
 * `full` is the chosen sentence BEFORE the cap (rules v2): every contact
 * check runs on it, never on the capped quote, so a cap can never cut a
 * number in half and let the first half through.
 */
export function quoteOf(
  unit: TextUnit,
  required: readonly ScriptAwarePhrase[],
): { readonly quote: string; readonly truncated: boolean; readonly full: string } {
  // A full stop after a one- or two-digit number is an ordinal day (`am 5. Oktober 2026`),
  // never a sentence end (rules v3): splitting there would part a date from its line.
  const sentences = unit.text
    .split(/(?<=[.!?])(?<!(?:^|\D)\d{1,2}\.)\s+|(?<=[。！？])/u)
    .filter((s) => s.trim() !== '');
  const containsAll = (text: string) => {
    const tokens = tokeniseScriptAware(text);
    return required.every((p) => containsScriptAwarePhrase(tokens, p));
  };
  const chosen = (sentences.find(containsAll) ?? unit.text).trim();
  const codePoints = Array.from(chosen);
  return codePoints.length <= QUOTE_MAX_CODE_POINTS
    ? { quote: chosen, truncated: false, full: chosen }
    : { quote: codePoints.slice(0, QUOTE_MAX_CODE_POINTS).join(''), truncated: true, full: chosen };
}

// ---------------------------------------------------------------------------
// Guards (rules v2): phrases with gaps, and the fixed exceptions to them.
// ---------------------------------------------------------------------------

/** The gap marker in a guard phrase: 0-3 whole tokens (`ne … plus`). */
export const GUARD_GAP = '…';
export const GUARD_GAP_MAX_TOKENS = 3;

/** One guard phrase, compiled: its segments must occur in order, each gap 0-3 tokens. */
export interface CompiledGuard<P> {
  readonly phrase: string;
  readonly language: C1Language;
  readonly segments: readonly ScriptAwarePhrase[];
  readonly payload: P;
}

export function compileGuards<P>(
  entries: readonly { phrase: string; language: C1Language; payload: P }[],
): CompiledGuard<P>[] {
  return entries.map((e) => {
    const segments = e.phrase.split(GUARD_GAP).map((part) => compileScriptAwarePhrase(part));
    if (segments.length > 1 && segments.some((s) => s.kind !== 'tokens' || s.tokens.length === 0)) {
      throw new Error(`guard ${JSON.stringify(e.phrase)}: a gap joins Latin-script segments only`);
    }
    return { phrase: e.phrase, language: e.language, segments, payload: e.payload };
  });
}

/** Every start index at which a token phrase occurs in `tokens`. */
function startsOf(tokens: readonly ScriptToken[], phrase: readonly string[], from = 0): number[] {
  const out: number[] = [];
  for (let i = from; i + phrase.length <= tokens.length; i += 1) {
    if (phrase.every((t, k) => tokens[i + k]!.text === t)) out.push(i);
  }
  return out;
}

/** The token spans `[start, end)` a guard occupies in the unit (CJK: the run that contains it). */
function guardSpans(unit: TextUnit, guard: CompiledGuard<unknown>): [number, number][] {
  const [first, ...rest] = guard.segments;
  if (first === undefined) return [];
  if (first.kind === 'cjk') {
    return unit.tokens.flatMap((t, i): [number, number][] =>
      t.cjk && t.text.includes(first.text) ? [[i, i + 1]] : [],
    );
  }
  const spans: [number, number][] = [];
  for (const start of startsOf(unit.tokens, first.tokens)) {
    let end = start + first.tokens.length;
    let ok = true;
    for (const seg of rest) {
      const tokens = seg.kind === 'tokens' ? seg.tokens : [];
      const next = startsOf(unit.tokens, tokens, end).find((i) => i - end <= GUARD_GAP_MAX_TOKENS);
      if (next === undefined) {
        ok = false;
        break;
      }
      end = next + tokens.length;
    }
    if (ok) spans.push([start, end]);
  }
  return spans;
}

/**
 * Every guard the unit contains, in lexicon order. A Latin-script guard
 * occurrence lying wholly inside an exception phrase (`not-for-profit`,
 * `don't miss`) does not count; a CJK guard does not count inside a CJK
 * exception that contains it.
 */
export function guardsIn<P>(
  unit: TextUnit,
  guards: readonly CompiledGuard<P>[],
  exceptions: readonly CompiledPhrase<unknown>[],
): CompiledGuard<P>[] {
  const excepted: [number, number][] = [];
  const exceptedCjk: string[] = [];
  for (const e of exceptions) {
    if (e.compiled.kind === 'cjk') exceptedCjk.push(e.compiled.text);
    else {
      const len = e.compiled.tokens.length;
      for (const s of startsOf(unit.tokens, e.compiled.tokens)) excepted.push([s, s + len]);
    }
  }
  return guards.filter((g) =>
    guardSpans(unit, g).some(([s, e]) => {
      const first = g.segments[0]!;
      if (first.kind === 'cjk') {
        const run = unit.tokens[s]!.text;
        return !exceptedCjk.some((x) => x.includes(first.text) && run.includes(x));
      }
      return !excepted.some(([xs, xe]) => xs <= s && e <= xe);
    }),
  );
}

// ---------------------------------------------------------------------------
// Listing shape (rules v3): unexplained words, and a channel named as someone else's.
// ---------------------------------------------------------------------------

/** Listing-filler words, compiled: Latin-script tokens, and CJK substrings (longest first). */
export interface ListingFiller {
  readonly tokens: ReadonlySet<string>;
  readonly cjk: readonly string[];
}

const longestFirst = (a: string, b: string): number =>
  b.length - a.length || (a < b ? -1 : a > b ? 1 : 0);

export function compileFiller(words: readonly string[]): ListingFiller {
  const tokens = new Set<string>();
  const cjk = new Set<string>();
  for (const word of words) {
    const compiled = compileScriptAwarePhrase(word);
    if (compiled.kind === 'cjk') cjk.add(compiled.text);
    else for (const t of compiled.tokens) tokens.add(t);
  }
  return { tokens, cjk: [...cjk].sort(longestFirst) };
}

/** Every token index the given phrases cover in the unit (Latin-script phrases only). */
function coveredBy(unit: TextUnit, phrases: readonly CompiledPhrase<unknown>[]): Set<number> {
  const covered = new Set<number>();
  for (const p of phrases) {
    if (p.compiled.kind !== 'tokens') continue;
    const len = p.compiled.tokens.length;
    for (const s of startsOf(unit.tokens, p.compiled.tokens)) {
      for (let i = s; i < s + len; i += 1) covered.add(i);
    }
  }
  return covered;
}

/**
 * How many words of the unit are UNEXPLAINED: neither part of an `explained`
 * phrase (the channel term the line names), nor a number (a day, a year, an
 * ordinal such as `1er`), nor a listing-filler word (articles, prepositions,
 * `edition`, weekdays, month names). A CJK run counts as one unexplained word
 * when anything is left of it after the explained phrases and the filler
 * substrings are removed. `Newsletter — 3 March 2026` has none; `Our last
 * newsletter was sent on 3 March 2026` has four.
 */
export function unexplainedWords(
  unit: TextUnit,
  explained: readonly CompiledPhrase<unknown>[],
  filler: ListingFiller,
): number {
  const covered = coveredBy(unit, explained);
  const cjkExplained = [
    ...new Set(explained.flatMap((p) => (p.compiled.kind === 'cjk' ? [p.compiled.text] : []))),
  ].sort(longestFirst);
  let count = 0;
  unit.tokens.forEach((token, i) => {
    if (covered.has(i)) return;
    if (token.cjk) {
      let rest = token.text;
      for (const part of [...cjkExplained, ...filler.cjk]) rest = rest.split(part).join('');
      if (rest !== '') count += 1;
      return;
    }
    if (/^\d/.test(token.text) || filler.tokens.has(token.text)) return;
    count += 1;
  });
  return count;
}

/** How many whole tokens may separate an owner word from the channel term it qualifies. */
export const OWNER_WINDOW_TOKENS = 3;

/**
 * True when the unit names the channel (`anchors`) as SOMEONE ELSE'S: an
 * owner word (`their`, `university`, `gemeente` - `owners`) stands within
 * `OWNER_WINDOW_TOKENS` tokens BEFORE the channel term ("the university
 * newsletter", "their welcome week", "su boletín"), or within that window
 * AFTER it with a genitive link word between ("the newsletter of the
 * faculty", "la semana de bienvenida de la universidad"). A CJK owner phrase
 * counts anywhere on the line (no token boundaries to measure). "Our
 * newsletter for university students" is NOT someone else's: the owner word
 * follows the term with no genitive link.
 */
export function namesOtherOwner(
  unit: TextUnit,
  anchors: readonly CompiledPhrase<unknown>[],
  owners: readonly CompiledPhrase<unknown>[],
  genitiveLinks: ReadonlySet<string>,
): boolean {
  const present = owners.filter(
    (o) => mayContain(unit, o.compiled) && containsScriptAwarePhrase(unit.tokens, o.compiled),
  );
  if (present.some((o) => o.compiled.kind === 'cjk')) return true;
  const ownerStarts = present.flatMap((o) =>
    o.compiled.kind === 'tokens' ? startsOf(unit.tokens, o.compiled.tokens) : [],
  );
  if (ownerStarts.length === 0) return false;
  for (const a of anchors) {
    if (a.compiled.kind !== 'tokens') continue;
    const len = a.compiled.tokens.length;
    for (const start of startsOf(unit.tokens, a.compiled.tokens)) {
      const end = start + len;
      for (const o of ownerStarts) {
        if (o < start && start - o <= OWNER_WINDOW_TOKENS) return true;
        if (o >= end && o - end < OWNER_WINDOW_TOKENS + 1) {
          const between = unit.tokens.slice(end, o).map((t) => t.text);
          if (between.some((t) => genitiveLinks.has(t))) return true;
        }
      }
    }
  }
  return false;
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
