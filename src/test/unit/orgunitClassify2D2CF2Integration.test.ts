/**
 * PHASE 2B-2D2C-F2 — THE INTEGRATED V6 + F0Z RUNTIME IDENTITY.
 *
 * This build is the approved V6 SEMANTIC prompt running on the accepted F0Z
 * EXECUTION/RELIABILITY harness. Those are two SEPARATE lineages and this
 * file pins both, by exact value, so neither can drift into the other:
 *
 *   SEMANTIC SOURCE          a0da2c462a698823fd9536347edf22ecfbf80f64
 *                            `orgunit-classifier-prompt-v6`,
 *                            SHA-256 06262d43…0513b7,
 *                            16,007 code points / 16,093 UTF-8 bytes
 *
 *   EXECUTION / RELIABILITY  805d39b6043a69cedf809ca9b2151168e1f88a58
 *                            RELIABILITY_SEMANTICS_V2_TIMEOUT_CONTINUATION
 *
 * THIS IS NOT A NEW SEMANTIC V7. The prompt bytes are v6's, unmodified; the
 * runtime bytes are F0Z's, unmodified. The integration is exactly one file.
 *
 * It also pins the §1 DATA-CONTRACT CHECKS: the exact serialized evidence
 * fields the V6 semantic design was built around, read from the canonical
 * DEV corpus itself, so a future fixture refactor cannot silently remove the
 * title/heading/body distinctions R1, R2 and R3 depend on.
 *
 * ZERO PROVIDER. No inference, no auth-status invocation, no HOLDOUT, no
 * scoring of any real run.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';
import {
  MAX_EXCERPT_CODE_POINTS,
  MAX_HEADINGS_PER_DOCUMENT,
} from '../../orgunits/classify/constants.js';
import {
  RELIABILITY_SEMANTICS_V1_HISTORICAL,
  RELIABILITY_SEMANTICS_V2,
  RELIABILITY_SEMANTICS_VERSION,
  FROZEN_DEFAULT_MAX_TURNS,
  FROZEN_MAX_TRANSIENT_RETRIES,
  FROZEN_TIER1_SOFT_DEADLINE_MS,
  FROZEN_TIER1_TOTAL_BUDGET_MS,
  FROZEN_TIER1_GRACE_MS,
  FROZEN_TIER2_WATCHDOG_MS,
  FROZEN_TIER2_GRACE_MS,
  MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
} from '../harness/phase2b2d2c/constants.js';
import {
  v1FromV2,
  v2FromV3,
  v3FromV4,
  v4FromV5,
  v5FromV6,
  v6FromV5,
  V1_PROMPT_SHA256,
  V2_PROMPT_SHA256,
  V3_PROMPT_SHA256,
  V4_PROMPT_SHA256,
  V5_PROMPT_SHA256,
  V6_PROMPT_SHA256,
  V6_PROMPT_SIZE,
  V6_PROMPT_VERSION,
  V6_R1_OPERATOR_DEFINITION,
  V6_R2_EXTERNAL_SCHEME_STRUCTURE,
  V6_R3_THIN_EVIDENCE_PRECEDENCE,
} from '../harness/phase2b2d2c/promptLineage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The two lineage commits this build is composed from. Pinned as VALUES, never resolved from Git at test time. */
const SEMANTIC_SOURCE_COMMIT = 'a0da2c462a698823fd9536347edf22ecfbf80f64';
const RELIABILITY_BASE_COMMIT = '805d39b6043a69cedf809ca9b2151168e1f88a58';

const CANONICAL_CORPUS_PATH =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl';

interface CorpusDocument {
  readonly url: string;
  readonly title: string | null;
  readonly declaredLang: string | null;
  readonly headings: readonly { readonly level: number; readonly text: string }[];
  readonly excerpt: string;
  readonly excerptTruncated: boolean;
  readonly mainTextTruncated: boolean;
}

const CORPUS: ReadonlyMap<string, CorpusDocument> = new Map(
  readFileSync(join(ROOT, CANONICAL_CORPUS_PATH), 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const row = JSON.parse(line) as { goldId: string; document: CorpusDocument };
      return [row.goldId, row.document] as const;
    }),
);

const headingTextsOf = (goldId: string): readonly string[] => {
  const document = CORPUS.get(goldId);
  if (document === undefined) throw new Error(`gold id ${goldId} is not in the canonical corpus.`);
  return document.headings.map((heading) => heading.text);
};

const documentOf = (goldId: string): CorpusDocument => {
  const document = CORPUS.get(goldId);
  if (document === undefined) throw new Error(`gold id ${goldId} is not in the canonical corpus.`);
  return document;
};

describe('2D2C-F2: the integrated prompt IS the approved V6 semantic source, byte for byte', () => {
  it('exports exactly the frozen v6 version, hash and size', () => {
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe('orgunit-classifier-prompt-v6');
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe(V6_PROMPT_VERSION);
    expect(sha256(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)).toBe(
      '06262d43352375231eb83afdd485babc8564675d783da0b7409bc15dca0513b7',
    );
    expect(sha256(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)).toBe(V6_PROMPT_SHA256);
    expect([...ORGUNIT_CLASSIFIER_SYSTEM_PROMPT]).toHaveLength(16_007);
    expect(Buffer.byteLength(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, 'utf8')).toBe(16_093);
    expect(V6_PROMPT_SIZE).toEqual({ characters: 16_007, utf8Bytes: 16_093 });
  });

  it('carries each of the three approved V6 replacements exactly once, and no v5 region they replaced', () => {
    for (const replacement of [
      V6_R1_OPERATOR_DEFINITION,
      V6_R2_EXTERNAL_SCHEME_STRUCTURE,
      V6_R3_THIN_EVIDENCE_PRECEDENCE,
    ]) {
      expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.split(replacement)).toHaveLength(2);
    }
  });

  it('reverses cleanly down the whole reviewed lineage to v1, every hash exact', () => {
    const v5 = v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    const v4 = v4FromV5(v5);
    const v3 = v3FromV4(v4);
    const v2 = v2FromV3(v3);
    const v1 = v1FromV2(v2);
    expect(sha256(v5)).toBe(V5_PROMPT_SHA256);
    expect(sha256(v4)).toBe(V4_PROMPT_SHA256);
    expect(sha256(v3)).toBe(V3_PROMPT_SHA256);
    expect(sha256(v2)).toBe(V2_PROMPT_SHA256);
    expect(sha256(v1)).toBe(V1_PROMPT_SHA256);
  });

  it('re-applying the V6 delta to the reconstructed v5 reproduces the integrated prompt byte for byte', () => {
    const v5 = v5FromV6(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    expect(v6FromV5(v5)).toBe(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
  });

  it('names the semantic source commit, and does not claim to be a new semantic version', () => {
    expect(SEMANTIC_SOURCE_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).not.toContain('v7');
  });
});

describe('2D2C-F2: the execution/reliability base is the accepted F0Z runtime, unchanged', () => {
  it('runs under RELIABILITY_SEMANTICS_V2_TIMEOUT_CONTINUATION', () => {
    expect(RELIABILITY_SEMANTICS_V2).toBe('RELIABILITY_SEMANTICS_V2_TIMEOUT_CONTINUATION');
    expect(RELIABILITY_SEMANTICS_VERSION).toBe(RELIABILITY_SEMANTICS_V2);
    expect(RELIABILITY_SEMANTICS_V1_HISTORICAL).toBe('RELIABILITY_SEMANTICS_V1_RECOVERY_1');
    expect(RELIABILITY_SEMANTICS_VERSION).not.toBe(RELIABILITY_SEMANTICS_V1_HISTORICAL);
    expect(RELIABILITY_BASE_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });

  it('leaves every frozen duration, retry and turn constant exactly where F0Z left it', () => {
    expect(FROZEN_TIER1_SOFT_DEADLINE_MS).toBe(300_000);
    expect(FROZEN_TIER1_GRACE_MS).toBe(10_000);
    expect(FROZEN_TIER1_TOTAL_BUDGET_MS).toBe(600_000);
    expect(FROZEN_TIER2_WATCHDOG_MS).toBe(700_000);
    expect(FROZEN_TIER2_GRACE_MS).toBe(10_000);
    expect(FROZEN_MAX_TRANSIENT_RETRIES).toBe(2);
    expect(FROZEN_DEFAULT_MAX_TURNS).toBe(3);
    expect(MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE).toBe(2);
  });

  it('C2 is NOT implemented, and the integration did not implement it', () => {
    const stopConditions = readFileSync(
      join(ROOT, 'src/test/harness/phase2b2d2c/stopConditions.ts'),
      'utf8',
    );
    // C2 would downgrade the watchdog/child-exit race. F0Z deliberately left
    // it out; this slice changed one prompt file and nothing else.
    expect(stopConditions).not.toContain('CHILD_EXIT_RACED_WATCHDOG');
  });

  it('the integrated prompt module imports nothing — it cannot reach a provider, a socket or a clock', () => {
    const prompt = readFileSync(join(ROOT, 'src/orgunits/classify/prompt.ts'), 'utf8');
    expect(prompt).not.toMatch(/^import\s/m);
    for (const forbidden of ['node:http', 'node:net', 'fetch(', 'Date.now', 'process.env']) {
      expect(prompt).not.toContain(forbidden);
    }
  });
});

describe('2D2C-F2 §1: the real DEV inference payload supports the structural distinctions V6 relies on', () => {
  it('the canonical DEV corpus is the exact frozen 49-item artifact', () => {
    expect(CORPUS.size).toBe(49);
    expect(sha256(readFileSync(join(ROOT, CANONICAL_CORPUS_PATH), 'utf8'))).toBe(
      'c5a9923a35689fd8b0950d615ee5339c6ccc63e83ac067960760497b6a9c4536',
    );
  });

  it('A. g6458a35: a generic title, the office only in headings, and NO body text at all', () => {
    const document = documentOf('g6458a352bc79ca01');
    // The title is generic, and is NOT the office's own name - so R3's first
    // exception (title/leading heading IS the office name) must not fire.
    expect(document.title).toBe('Contacts');
    expect(document.headings[0]?.text).toBe('Contacts');
    expect(document.title).not.toContain('Direction');
    // The office headings ARE present to the model.
    expect(headingTextsOf('g6458a352bc79ca01')).toEqual([
      'Contacts',
      'Correspondants RI',
      'Direction de la Recherche et des Relations Internationales',
      'International',
    ]);
    // No body text is supplied - the precondition R3's blocker names.
    expect(document.excerpt).toBe('');
    expect(document.excerptTruncated).toBe(false);
  });

  it("B. g7e9744e8: the office's own name IS the title and the leading heading (R3 exception 1)", () => {
    const document = documentOf('g7e9744e811f58e20');
    expect(document.title).toBe('Centre de documentation - Irtess');
    expect(document.headings[0]).toEqual({ level: 1, text: 'Centre de documentation' });
    // The exception is load-bearing here: without it the empty body would
    // trigger the same blocker that g6458a35 must trigger.
    expect(document.excerpt).toBe('');
  });

  it('C. ge789b0f0: headings themselves state strategy and eligibility (R3 exception 2)', () => {
    const headings = headingTextsOf('ge789b0f0aedc398c');
    expect(headings).toContain(
      "La stratégie de l'IMS pour la Mobilité internationale dans le cadre du programme Erasmus",
    );
    expect(headings).toContain('Qui peut en bénéficier ?');
    expect(documentOf('ge789b0f0aedc398c').excerpt).toBe('');
  });

  it('D. g0ec0d43 vs g536c8b14: the heading-versus-running-text distinction R2 tests is REAL', () => {
    // g0ec0d43 - the DAI has headings OF ITS OWN (its address, its opening
    // hours, how it is reached). R2's affirmative limb is observable.
    const withOwnHeadings = documentOf('g0ec0d43dad311a77');
    const daiHeadings = headingTextsOf('g0ec0d43dad311a77');
    expect(daiHeadings).toContain('Contacter la DAI');
    expect(daiHeadings).toContain('Adresse et horaires de la DAI');
    expect(withOwnHeadings.excerpt).not.toContain('DAI');

    // g536c8b14 - the DRI appears ONLY inside running text, as the mailbox to
    // write to. R2's negative limb is observable. The two are complementary.
    const runningTextOnly = documentOf('g536c8b148048fcbc');
    expect(headingTextsOf('g536c8b148048fcbc').join(' || ')).not.toContain('DRI');
    expect(runningTextOnly.excerpt).toContain('DRI');
    expect(runningTextOnly.excerpt).toContain('contacter la DRI');
  });

  it('E. g04d170f4: the ONLY entity named as administering the aid is the organisation itself (R1)', () => {
    const document = documentOf('g04d170f4d3fda759');
    const headings = headingTextsOf('g04d170f4d3fda759');
    expect(headings).toContain('Les aides à la mobilité gérées par Université Paris Cité');
    // No named office, department, centre or standing service anywhere in the
    // payload - which is precisely R1's "no operator is evidenced" condition.
    const wholePayload = [document.title ?? '', ...headings, document.excerpt].join(' || ');
    for (const officeWord of ['bureau', 'Bureau', 'Direction', 'service', 'Service', 'centre']) {
      expect(wholePayload).not.toContain(officeWord);
    }
  });

  it('F. g66010a25 is present and thin, and V6 deliberately does not target it', () => {
    const document = documentOf('g66010a25ac194274');
    expect(document.title).toBe('Erasmus + - Irtess');
    expect(document.excerpt).toBe('Erasmus +');
  });

  it('the payload bounds the model actually sees are the frozen ones', () => {
    expect(MAX_EXCERPT_CODE_POINTS).toBe(2_000);
    expect(MAX_HEADINGS_PER_DOCUMENT).toBe(12);
    for (const document of CORPUS.values()) {
      expect([...document.excerpt].length).toBeLessThanOrEqual(MAX_EXCERPT_CODE_POINTS);
      expect(document.headings.length).toBeLessThanOrEqual(MAX_HEADINGS_PER_DOCUMENT);
    }
  });
});
