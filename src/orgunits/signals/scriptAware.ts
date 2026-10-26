/**
 * SCRIPT-AWARE PHRASE MATCHING - used ONLY by `orgunit-signal-rules-v2`
 * (`scoreV2.ts`).
 *
 * A SEPARATE FILE ON PURPOSE. `normalise.ts`, `score.ts` and `types.ts` are
 * the v1 engine; `score.ts` and `types.ts` are additionally bound BY BYTES
 * (SHA-256) in OWNER decision records (the 2D-A3 K1/K2 clarifications), so
 * v1 is extended by composition, never by edit. This module imports the v1
 * folding and token-run primitives and adds the script rule on top; nothing
 * in v1 imports anything from here.
 *
 * WHY A SECOND MATCHER
 *
 *   Japanese (and Chinese) text is written without spaces, so the whole of
 *   `国際交流センターの日本語教室` is ONE v1 token, and a v1 phrase such as
 *   `日本語教室` can never equal it. A token-boundary rule is meaningless for
 *   a script that has no token boundaries.
 *
 * THE RULE
 *
 *   1. Text is folded with NFKC first (full-width `ＩＮＴＥＲＮＡＴＩＯＮＡＬ` ->
 *      `INTERNATIONAL`, half-width `ｾﾝﾀｰ` -> `センター`), then exactly as v1.
 *   2. Each space-separated token is split further at every boundary between
 *      a CJK run (Han / Hiragana / Katakana, by Script_Extensions, so the
 *      prolonged-sound mark `ー` and the iteration mark `々` stay inside
 *      their run) and a non-CJK run. A script change IS a word boundary:
 *      `erasmus留学` is the two tokens `erasmus` and `留学`.
 *   3. A phrase written in CJK matches as a SUBSTRING of one CJK run - never
 *      across a space, never across a non-CJK run.
 *   4. Every other phrase keeps the v1 rule exactly: a contiguous sequence of
 *      whole tokens. `langues` still never matches inside `languedoc`.
 *
 * A CJK phrase must be ONE CJK run. A phrase mixing CJK with Latin, or
 * containing a space, has no defined meaning under rule 3, so
 * `compileScriptAwarePhrase` refuses it at module load rather than guessing.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { containsPhrase, normaliseForMatching } from './normalise.js';

const CJK_RUN_OR_OTHER =
  /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]+|[^\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]+/gu;
const CJK_ONLY =
  /^[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]+$/u;
const HAS_CJK =
  /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]/u;

/** One comparison token under the script-aware rule. */
export interface ScriptToken {
  readonly text: string;
  /** True when the token is one CJK run, and so may be matched by substring. */
  readonly cjk: boolean;
}

/** A phrase compiled for the script-aware matcher. */
export type ScriptAwarePhrase =
  | { readonly kind: 'tokens'; readonly tokens: readonly string[] }
  | { readonly kind: 'cjk'; readonly text: string };

/** v1 folding, preceded by NFKC compatibility folding. IDEMPOTENT. */
export function normaliseForScriptAwareMatching(text: string): string {
  return normaliseForMatching(text.normalize('NFKC'));
}

/** Splits text into script-aware comparison tokens (rule 2 above). */
export function tokeniseScriptAware(text: string): ScriptToken[] {
  const normalised = normaliseForScriptAwareMatching(text);
  if (normalised === '') return [];
  const tokens: ScriptToken[] = [];
  for (const word of normalised.split(' ')) {
    for (const run of word.match(CJK_RUN_OR_OTHER) ?? []) {
      tokens.push({ text: run, cjk: CJK_ONLY.test(run) });
    }
  }
  return tokens;
}

/**
 * Compiles one rule phrase. A phrase containing any CJK character must be
 * exactly one CJK run after folding, or this throws - a rule-authoring
 * error, surfaced when the ruleset is built, never at scoring time.
 */
export function compileScriptAwarePhrase(phrase: string): ScriptAwarePhrase {
  const normalised = normaliseForScriptAwareMatching(phrase);
  if (HAS_CJK.test(normalised)) {
    if (!CJK_ONLY.test(normalised)) {
      throw new Error(
        `CJK rule phrase ${JSON.stringify(phrase)} must be one unbroken CJK run (no space, no Latin)`,
      );
    }
    return { kind: 'cjk', text: normalised };
  }
  return { kind: 'tokens', tokens: tokeniseScriptAware(phrase).map((token) => token.text) };
}

/** True when `phrase` occurs in already script-aware-tokenised field text (rules 3 and 4). */
export function containsScriptAwarePhrase(
  fieldTokens: readonly ScriptToken[],
  phrase: ScriptAwarePhrase,
): boolean {
  if (phrase.kind === 'cjk') {
    return fieldTokens.some((token) => token.cjk && token.text.includes(phrase.text));
  }
  return containsPhrase(
    fieldTokens.map((token) => token.text),
    phrase.tokens,
  );
}

/** True when any text in `texts` contains `phrase` under the script-aware rule. */
export function anyTextContainsScriptAwarePhrase(
  texts: readonly string[],
  phrase: ScriptAwarePhrase,
): boolean {
  return texts.some((text) => containsScriptAwarePhrase(tokeniseScriptAware(text), phrase));
}
