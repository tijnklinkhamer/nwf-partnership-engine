/**
 * THE JA / ES / NL CLASSIFIER EVALUATION SLICE - an OFFLINE harness
 * (REL-F1-R2 F1-6: "a JA/ES/NL evaluation slice [is] prepared offline; any
 * run needs its own grant"; Matrix Amendment A1, classifier row). Ported
 * from the duplicate relf1 line (`8170229`) as REL harvest H4: its signals
 * come from THIS lineage's v2 packs (`signals/scoreV2.ts`, ja/es/nl/enV2) and
 * its documents carry this lineage's `orgunit-extraction-v3` label.
 *
 * WHAT IT IS
 *
 *   A fixed, content-addressed fixture of synthetic Japanese, Spanish and
 *   Dutch page evidence (`src/test/fixtures/classifierMultilingualEvalV1/`),
 *   assembled into classifier batches through the LANDED pure assembly path
 *   (`dedupeByResponseSha256` -> `orderAndBatch`), turned into exactly the
 *   `ClassifierProviderRequest` the landed orchestrator sends (frozen system
 *   prompt, canonical batch serialisation, frozen output JSON Schema), sent
 *   to an INJECTED `ClassifierProvider`, validated by the landed
 *   `validateClassifierResponse`, and compared against the fixture's labels.
 *   The documents carry `orgunit-signal-rules-v2` signals - the first caller
 *   to opt into v2, explicitly, by version string.
 *
 * WHAT IT IS NOT
 *
 *   - Not a live run. This module constructs no provider, imports nothing
 *     under `classify/provider/` but the model allowlist (`allowedModels.ts`,
 *     a constant), reads no credential, opens no socket and
 *     writes no database row. CI only ever drives it with the
 *     `ScriptedTestProvider`.
 *   - Not authorised to run against a real provider. A provider other than
 *     the scripted one is refused unless the caller passes a
 *     `MultilingualEvalGrant` whose every field matches THIS slice exactly
 *     (fixture digest, prompt version, output-schema version, an allowlisted
 *     model id) and which names the OWNER grant record by sha256. No such
 *     grant exists today, and nothing here can mint one; issuing it is the
 *     OWNER's act under its own record.
 *   - Not an acceptance gate. It reports agreement counts and NEVER a
 *     pass/fail verdict: the pilot threshold is unset (REL-F1-R2 U2), and the
 *     fixture's labels are agent-authored synthetic labels, not human gold
 *     (Matrix A1 P9 supplies those). Items marked `PROVISIONAL_U3` (non-HEI
 *     organisations, whose rubric is undefined - REL-F1-R2 U3) are reported
 *     separately and never counted as agreement or disagreement.
 *   - Not HOLDOUT access. The fixture is synthetic and DEVELOPMENT-only.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { canonicalStringify } from '../../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../../orgunits/classify/constants.js';
import { dedupeByResponseSha256 } from '../../../orgunits/classify/dedupe.js';
import { orderAndBatch } from '../../../orgunits/classify/ordering.js';
import {
  ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA,
  ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
  PAGE_KINDS,
  UNIT_TYPES,
} from '../../../orgunits/classify/outputSchema.js';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../../orgunits/classify/prompt.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../../orgunits/classify/provider/allowedModels.js';
import type {
  ClassifierProvider,
  ClassifierProviderRequest,
  ClassifierRunConfig,
} from '../../../orgunits/classify/providerContract.js';
import { ScriptedTestProvider } from '../../../orgunits/classify/scriptedProvider.js';
import type {
  ClassifierBatch,
  ClassifierRootRef,
  ClassifierSignal,
  RawEligibleCandidateRow,
  Track,
} from '../../../orgunits/classify/types.js';
import { validateClassifierResponse } from '../../../orgunits/classify/validate.js';
import {
  ORGUNIT_SIGNAL_RULE_VERSION_V2,
  scoreFetchedPageCandidateV2,
} from '../../../orgunits/signals/scoreV2.js';
import { FETCH_POLICY_VERSION } from '../../../orgunits/web/policy.js';

export const MULTILINGUAL_EVAL_SLICE_ID = 'classifier-multilingual-eval-slice-v1';

/**
 * The extraction rule version the slice's documents claim. REL harvest H4:
 * this lineage persists new page evidence under `orgunit-extraction-v3` (the
 * JP/MX/NL redaction), so the synthetic evidence carries that label - the
 * unit test pins it to the landed `EXTRACTION_RULE_VERSION` of both
 * extraction callers. A literal here, not an import, so the harness stays
 * free of the page-evidence persistence modules.
 */
export const EVAL_EXTRACTION_RULE_VERSION = 'orgunit-extraction-v3';

/** The scope string an OWNER grant for this slice must carry. */
export const MULTILINGUAL_EVAL_GRANT_SCOPE = 'DEVELOPMENT_ONLY_SYNTHETIC_FIXTURE_EVALUATION';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MULTILINGUAL_EVAL_FIXTURE_PATH = resolve(
  HERE,
  '../../fixtures/classifierMultilingualEvalV1/slice.json',
);

/**
 * sha256 of the fixture FILE BYTES. Pinned so that an edit to a document or a
 * label is a reviewed change to this constant - and so that a grant, which
 * pins the same digest, stops matching the moment the fixture moves.
 *
 * REL harvest H4 changed ONE text from relf1's fixture: the NL news page's
 * "collegejaar 2026-2027 2027-2028" is phone-shaped under this lineage's
 * redaction (two adjacent year ranges reach the eight-digit floor), so it
 * would not be a redaction fixed point; it now reads "de collegejaren
 * 2026-2027 en 2027-2028". relf1's digest was c6f9bc23...2c98.
 */
export const MULTILINGUAL_EVAL_FIXTURE_SHA256 =
  '819b4ba4ba5e75dca871dc529b6ea3175e7583c620e86bd118a88c0802b997db';

// ---------------------------------------------------------------------------
// Fixture shape
// ---------------------------------------------------------------------------

const GoldSchema = z.strictObject({
  status: z.enum(['SCORED', 'PROVISIONAL_U3']),
  verdict: z.enum(['UNIT_PAGE', 'NOT_A_UNIT', 'NEEDS_REVIEW']),
  unitType: z.enum(UNIT_TYPES).nullable(),
  pageKind: z.enum(PAGE_KINDS).nullable(),
  unitName: z.string().min(1).nullable(),
});

const DocumentSchema = z.strictObject({
  path: z.string().startsWith('/'),
  title: z.string().min(1),
  headings: z.array(
    z.strictObject({
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      text: z.string(),
    }),
  ),
  mainText: z.string().min(1),
  gold: GoldSchema,
});

const OrganisationSchema = z.strictObject({
  key: z.string().regex(/^[A-Z]{2}-[A-Z]+$/),
  language: z.enum(['ja', 'es', 'nl']),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  organisationName: z.string().min(1),
  rootUrl: z.url().refine((url) => new URL(url).hostname.endsWith('.example'), {
    message: 'fixture roots must be reserved .example hosts',
  }),
  documents: z.array(DocumentSchema).min(1),
});

const FixtureSchema = z.strictObject({
  sliceId: z.literal(MULTILINGUAL_EVAL_SLICE_ID),
  labelProvenance: z.literal('AGENT_AUTHORED_SYNTHETIC'),
  note: z.string(),
  organisations: z.array(OrganisationSchema).min(1),
});

export type EvalFixture = z.infer<typeof FixtureSchema>;
export type EvalOrganisation = z.infer<typeof OrganisationSchema>;
export type EvalGold = z.infer<typeof GoldSchema>;
export type EvalLanguage = EvalOrganisation['language'];

export interface LoadedFixture {
  readonly fixture: EvalFixture;
  readonly sha256: string;
}

export function loadEvalFixture(path: string = MULTILINGUAL_EVAL_FIXTURE_PATH): LoadedFixture {
  const bytes = readFileSync(path);
  const fixture = FixtureSchema.parse(JSON.parse(bytes.toString('utf8')));
  return { fixture, sha256: createHash('sha256').update(bytes).digest('hex') };
}

// ---------------------------------------------------------------------------
// Assembly through the landed pure path
// ---------------------------------------------------------------------------

export interface EvalBatch {
  readonly organisationKey: string;
  readonly language: EvalLanguage;
  readonly batch: ClassifierBatch;
  /** docIndex -> the fixture label for that document. */
  readonly goldByDocIndex: ReadonlyMap<number, EvalGold>;
}

function syntheticUuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * One candidate row per (document, track), ranked within its track by the
 * v2 candidate score - the same grain `orchestrator/candidates.ts` persists
 * and `classify/loaders.ts` reads back. Signals are reduced to exactly the
 * `ClassifierSignal` fields the model may see (no weight, no pack).
 */
function candidateRows(
  organisation: EvalOrganisation,
  rootKey: string,
  orgIndex: number,
): RawEligibleCandidateRow[] {
  const scored = organisation.documents.map((document, docIndex) => {
    const url = new URL(document.path, organisation.rootUrl).toString();
    const result = scoreFetchedPageCandidateV2({
      url,
      title: document.title,
      headings: document.headings,
    });
    return { document, docIndex, url, result };
  });

  const rows: RawEligibleCandidateRow[] = [];
  for (const track of ['A', 'B'] as const satisfies readonly Track[]) {
    const ranked = scored
      .map((entry) => ({ entry, score: entry.result.tracks.find((t) => t.track === track)! }))
      .sort((a, b) => b.score.score - a.score.score || (a.entry.url < b.entry.url ? -1 : 1));
    ranked.forEach(({ entry, score }, rank) => {
      const signals: ClassifierSignal[] = [
        ...score.matchedSignals,
        ...score.negativeSignals,
        ...score.vetoes,
      ].map((s) => ({ track, id: s.id, kind: s.kind, field: s.field }));
      rows.push({
        candidateId: syntheticUuid(orgIndex * 1000 + entry.docIndex * 10 + (track === 'A' ? 1 : 2)),
        pageEvidenceId: syntheticUuid(orgIndex * 1000 + entry.docIndex * 10),
        rootKey,
        track,
        candidateScore: score.score,
        rankWithinRoot: rank + 1,
        signals,
        title: entry.document.title,
        declaredLang: organisation.language,
        headings: entry.document.headings,
        mainText: entry.document.mainText,
        mainTextTruncated: false,
        extractionRuleVersion: EVAL_EXTRACTION_RULE_VERSION,
        url: entry.url,
        discoveryMethod: entry.document.path === '/' ? 'ROOT' : 'LINK',
        responseSha256: sha256(entry.document.mainText),
      });
    });
  }
  return rows;
}

export function assembleEvalBatches(fixture: EvalFixture): EvalBatch[] {
  return fixture.organisations.flatMap((organisation, orgIndex) => {
    const rootKey = `claim:${syntheticUuid(orgIndex + 1)}`;
    const root: ClassifierRootRef = { rootKey, authorityKind: 'claim', url: organisation.rootUrl };
    const groups = dedupeByResponseSha256(candidateRows(organisation, rootKey, orgIndex + 1));
    const ordered = orderAndBatch(
      groups,
      new Map([[rootKey, root]]),
      {
        organisationName: organisation.organisationName,
        // There is no ECHE row for a JP/MX pilot organisation (Matrix A1
        // G11); the classifier context still requires a key, so the slice
        // supplies an explicitly synthetic one.
        echeRowKey: `SYNTHETIC-EVAL|${organisation.key}`,
        countryCode: organisation.countryCode,
        runId: syntheticUuid(9000 + orgIndex),
        ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION_V2,
        fetchPolicyVersion: FETCH_POLICY_VERSION,
        assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
      },
      [root],
    );
    const goldByUrl = new Map(
      organisation.documents.map((d) => [new URL(d.path, organisation.rootUrl).toString(), d.gold]),
    );
    return ordered.map(({ batch }) => ({
      organisationKey: organisation.key,
      language: organisation.language,
      batch,
      goldByDocIndex: new Map(
        batch.documents.map((document) => [document.docIndex, goldByUrl.get(document.url)!]),
      ),
    }));
  });
}

/** Exactly the request `classify/orchestrate.ts` sends for one batch. */
export function buildEvalRequest(
  batch: ClassifierBatch,
  modelId: string,
  runConfig: ClassifierRunConfig = {},
): ClassifierProviderRequest {
  return {
    systemPrompt: ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
    serializedBatch: canonicalStringify({ context: batch.context, documents: batch.documents }),
    outputJsonSchema: ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA,
    modelId,
    runConfig,
  };
}

// ---------------------------------------------------------------------------
// The grant boundary
// ---------------------------------------------------------------------------

/**
 * The OWNER grant a NON-scripted run of this slice would need. It authorises
 * nothing by existing in this file: the harness only CHECKS one that a
 * caller presents, field by field, against the slice it is about to run.
 */
export interface MultilingualEvalGrant {
  readonly sliceId: string;
  readonly scope: string;
  readonly fixtureSha256: string;
  readonly promptVersion: string;
  readonly outputSchemaVersion: string;
  readonly modelId: string;
  readonly grantedBy: string;
  /** sha256 of the OWNER-signed grant record this run is executed under. */
  readonly grantRecordSha256: string;
}

export class MultilingualEvalRefusal extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(`multilingual eval slice refused (${code}): ${detail}`);
    this.name = 'MultilingualEvalRefusal';
  }
}

function checkGrant(
  grant: MultilingualEvalGrant | null,
  fixtureSha256: string,
  modelId: string,
): void {
  if (grant === null) {
    throw new MultilingualEvalRefusal(
      'GRANT_REQUIRED',
      'a non-scripted provider may run this slice only under an OWNER grant',
    );
  }
  const expected: Record<string, string> = {
    sliceId: MULTILINGUAL_EVAL_SLICE_ID,
    scope: MULTILINGUAL_EVAL_GRANT_SCOPE,
    fixtureSha256,
    promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    modelId,
    grantedBy: 'OWNER',
  };
  for (const [field, value] of Object.entries(expected)) {
    const presented = (grant as unknown as Record<string, unknown>)[field];
    if (presented !== value) {
      throw new MultilingualEvalRefusal('GRANT_MISMATCH', `grant.${field} does not match this run`);
    }
  }
  if (!/^[0-9a-f]{64}$/.test(grant.grantRecordSha256)) {
    throw new MultilingualEvalRefusal('GRANT_MISMATCH', 'grant.grantRecordSha256 is not a sha256');
  }
}

// ---------------------------------------------------------------------------
// Run + compare
// ---------------------------------------------------------------------------

export interface LanguageTally {
  readonly documents: number;
  readonly scored: number;
  readonly provisional: number;
  readonly validated: number;
  readonly rejected: number;
  readonly unanswered: number;
  readonly verdictAgree: number;
  readonly verdictDisagree: number;
  readonly typeAgree: number;
  readonly typeDisagree: number;
  readonly needsReview: number;
}

export interface EvalSliceReport {
  readonly sliceId: string;
  readonly fixtureSha256: string;
  readonly signalRuleVersion: string;
  readonly promptVersion: string;
  readonly outputSchemaVersion: string;
  readonly modelId: string;
  readonly mode: 'SCRIPTED_OFFLINE' | 'GRANTED';
  readonly calls: number;
  readonly providerFailures: number;
  readonly schemaInvalidBatches: number;
  /** Counts only - there is no pass/fail field, by design (module comment). */
  readonly byLanguage: Readonly<Record<EvalLanguage, LanguageTally>>;
}

function emptyTally(): { -readonly [K in keyof LanguageTally]: number } {
  return {
    documents: 0,
    scored: 0,
    provisional: 0,
    validated: 0,
    rejected: 0,
    unanswered: 0,
    verdictAgree: 0,
    verdictDisagree: 0,
    typeAgree: 0,
    typeDisagree: 0,
    needsReview: 0,
  };
}

export interface RunEvalSliceInput {
  readonly provider: ClassifierProvider;
  readonly modelId: string;
  readonly grant?: MultilingualEvalGrant | null;
  readonly runConfig?: ClassifierRunConfig;
  readonly fixturePath?: string;
}

export async function runEvalSlice(input: RunEvalSliceInput): Promise<EvalSliceReport> {
  const { fixture, sha256: fixtureSha256 } = loadEvalFixture(input.fixturePath);
  if (fixtureSha256 !== MULTILINGUAL_EVAL_FIXTURE_SHA256 && input.fixturePath === undefined) {
    throw new MultilingualEvalRefusal(
      'FIXTURE_DRIFT',
      'the slice fixture no longer matches its pinned digest',
    );
  }
  if (!ORGUNIT_CLASSIFIER_ALLOWED_MODELS.includes(input.modelId)) {
    throw new MultilingualEvalRefusal('MODEL_NOT_ALLOWED', 'the model id is not allowlisted');
  }
  const scripted = input.provider instanceof ScriptedTestProvider;
  if (!scripted) checkGrant(input.grant ?? null, fixtureSha256, input.modelId);

  const tallies: Record<EvalLanguage, ReturnType<typeof emptyTally>> = {
    ja: emptyTally(),
    es: emptyTally(),
    nl: emptyTally(),
  };
  let calls = 0;
  let providerFailures = 0;
  let schemaInvalidBatches = 0;

  for (const evalBatch of assembleEvalBatches(fixture)) {
    const tally = tallies[evalBatch.language];
    for (const gold of evalBatch.goldByDocIndex.values()) {
      tally.documents += 1;
      if (gold.status === 'SCORED') tally.scored += 1;
      else tally.provisional += 1;
    }

    calls += 1;
    const result = await input.provider.classify(
      buildEvalRequest(evalBatch.batch, input.modelId, input.runConfig),
    );
    if (result.outcome !== 'OK') {
      providerFailures += 1;
      tally.unanswered += evalBatch.goldByDocIndex.size;
      continue;
    }
    const validation = validateClassifierResponse(result.rawOutput, evalBatch.batch);
    if (validation.kind === 'SCHEMA_INVALID') {
      schemaInvalidBatches += 1;
      tally.unanswered += evalBatch.goldByDocIndex.size;
      continue;
    }
    tally.rejected += validation.rejected.length;
    const answered = new Set<number>(
      validation.rejected.flatMap((r) => (r.docIndex === null ? [] : [r.docIndex])),
    );
    for (const accepted of validation.accepted) {
      answered.add(accepted.docIndex);
      tally.validated += 1;
      const gold = evalBatch.goldByDocIndex.get(accepted.docIndex)!;
      if (accepted.result.verdict === 'NEEDS_REVIEW') tally.needsReview += 1;
      if (gold.status !== 'SCORED') continue;
      if (accepted.result.verdict === gold.verdict) {
        tally.verdictAgree += 1;
        const predictedType =
          accepted.result.verdict === 'UNIT_PAGE'
            ? accepted.result.unit_type
            : accepted.result.page_kind;
        const goldType = gold.verdict === 'UNIT_PAGE' ? gold.unitType : gold.pageKind;
        if (predictedType === goldType) tally.typeAgree += 1;
        else tally.typeDisagree += 1;
      } else {
        tally.verdictDisagree += 1;
      }
    }
    for (const docIndex of evalBatch.goldByDocIndex.keys()) {
      if (!answered.has(docIndex)) tally.unanswered += 1;
    }
  }

  return {
    sliceId: MULTILINGUAL_EVAL_SLICE_ID,
    fixtureSha256,
    signalRuleVersion: ORGUNIT_SIGNAL_RULE_VERSION_V2,
    promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    modelId: input.modelId,
    mode: scripted ? 'SCRIPTED_OFFLINE' : 'GRANTED',
    calls,
    providerFailures,
    schemaInvalidBatches,
    byLanguage: tallies,
  };
}
