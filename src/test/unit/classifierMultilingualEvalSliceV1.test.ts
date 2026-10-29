/**
 * The OFFLINE JA / ES / NL classifier evaluation slice (REL-F1-R2 F1-6,
 * Matrix Amendment A1 classifier row; ported as REL harvest H4). Every provider here is scripted or a
 * local fake: no test in this file can reach a model, and the harness itself
 * imports no provider runtime (asserted at the bottom).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA } from '../../orgunits/classify/outputSchema.js';
import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../../orgunits/classify/prompt.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';
import type {
  ClassifierProvider,
  ClassifierProviderRequest,
  ClassifierProviderResult,
} from '../../orgunits/classify/providerContract.js';
import {
  ScriptedTestProvider,
  type ScriptedResponder,
} from '../../orgunits/classify/scriptedProvider.js';
import type { ClassifierDocument } from '../../orgunits/classify/types.js';
import { scoreFetchedPageCandidate } from '../../orgunits/signals/score.js';
import {
  ORGUNIT_SIGNAL_RULE_VERSION_V2,
  scoreFetchedPageCandidateV2,
} from '../../orgunits/signals/scoreV2.js';
import { EXTRACTION_RULE_VERSION as COLLECTED_EXTRACTION_RULE_VERSION } from '../../orgunits/orchestrator/pageCollection.js';
import { EXTRACTION_RULE_VERSION as PAGE_EVIDENCE_EXTRACTION_RULE_VERSION } from '../../orgunits/web/pageEvidence.js';
import { redactContactData } from '../../orgunits/web/redact.js';
import {
  assembleEvalBatches,
  buildEvalRequest,
  EVAL_EXTRACTION_RULE_VERSION,
  loadEvalFixture,
  MULTILINGUAL_EVAL_FIXTURE_SHA256,
  MULTILINGUAL_EVAL_GRANT_SCOPE,
  MULTILINGUAL_EVAL_SLICE_ID,
  MultilingualEvalRefusal,
  runEvalSlice,
  type EvalGold,
  type MultilingualEvalGrant,
} from '../harness/multilingualEvalV1/harness.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MODEL = ORGUNIT_CLASSIFIER_ALLOWED_MODELS[1]!;
const { fixture, sha256 } = loadEvalFixture();

const goldByUrl = new Map<string, EvalGold>(
  fixture.organisations.flatMap((o) =>
    o.documents.map((d) => [new URL(d.path, o.rootUrl).toString(), d.gold] as const),
  ),
);

function okResult(rawOutput: unknown): ClassifierProviderResult {
  return {
    outcome: 'OK',
    rawOutput,
    responseModelId: MODEL,
    inputTokens: 1,
    outputTokens: 1,
    outcomeDetail: null,
    outcomeReasonCode: null,
  };
}

/** A model answer that agrees with the fixture label, quoting the document's own title. */
function answerFor(document: ClassifierDocument, gold: EvalGold): Record<string, unknown> {
  const common = {
    doc_index: document.docIndex,
    confidence: 'HIGH',
    rationale: 'Scripted answer for the offline harness proof.',
    evidence_spans: [{ source: 'TITLE', quote: document.title }],
  };
  if (gold.verdict === 'UNIT_PAGE') {
    return {
      ...common,
      verdict: 'UNIT_PAGE',
      unit_name: gold.unitName,
      unit_type: gold.unitType,
      page_kind: null,
      serves_incoming_international_students: 'UNKNOWN',
      serves_outgoing_mobility_students: 'UNKNOWN',
      provides_language_learning_or_support: 'UNKNOWN',
    };
  }
  return {
    ...common,
    verdict: 'NOT_A_UNIT',
    unit_name: null,
    unit_type: null,
    page_kind: gold.pageKind,
    serves_incoming_international_students: null,
    serves_outgoing_mobility_students: null,
    provides_language_learning_or_support: null,
  };
}

function documentsOf(request: ClassifierProviderRequest): ClassifierDocument[] {
  return (JSON.parse(request.serializedBatch) as { documents: ClassifierDocument[] }).documents;
}

function goldResponder(
  tamper: (document: ClassifierDocument, answer: Record<string, unknown>) => void = () => {},
): ScriptedResponder {
  return (request) =>
    okResult({
      results: documentsOf(request).map((document) => {
        const answer = answerFor(document, goldByUrl.get(document.url)!);
        tamper(document, answer);
        return answer;
      }),
    });
}

function scriptedGold(
  tamper?: (document: ClassifierDocument, answer: Record<string, unknown>) => void,
): ScriptedTestProvider {
  const batches = assembleEvalBatches(fixture).length;
  return new ScriptedTestProvider(Array.from({ length: batches }, () => goldResponder(tamper)));
}

function matchingGrant(): MultilingualEvalGrant {
  return {
    sliceId: MULTILINGUAL_EVAL_SLICE_ID,
    scope: MULTILINGUAL_EVAL_GRANT_SCOPE,
    fixtureSha256: MULTILINGUAL_EVAL_FIXTURE_SHA256,
    promptVersion: 'orgunit-classifier-prompt-v7.2',
    outputSchemaVersion: 'orgunit-classifier-output-schema-v2',
    modelId: MODEL,
    grantedBy: 'OWNER',
    grantRecordSha256: 'a'.repeat(64),
  };
}

/** A non-scripted provider: local, offline, and it records whether it was ever called. */
class LocalFakeProvider implements ClassifierProvider {
  calls = 0;
  constructor(private readonly respond: ScriptedResponder) {}
  async classify(request: ClassifierProviderRequest): Promise<ClassifierProviderResult> {
    this.calls += 1;
    return typeof this.respond === 'function'
      ? await this.respond(request, this.calls - 1)
      : this.respond;
  }
}

describe('the fixture', () => {
  it('matches its pinned digest', () => {
    expect(sha256).toBe(MULTILINGUAL_EVAL_FIXTURE_SHA256);
  });

  it('covers ja, es and nl, each with an HEI and a provisional non-HEI organisation', () => {
    for (const language of ['ja', 'es', 'nl'] as const) {
      const orgs = fixture.organisations.filter((o) => o.language === language);
      expect(orgs.length, language).toBe(2);
      const golds = orgs.flatMap((o) => o.documents.map((d) => d.gold));
      expect(golds.filter((g) => g.status === 'SCORED').length, language).toBe(5);
      expect(golds.filter((g) => g.status === 'PROVISIONAL_U3').length, language).toBe(1);
    }
  });

  it('holds only already-redacted text: every field is a fixed point of the landed redaction', () => {
    let markers = 0;
    for (const organisation of fixture.organisations) {
      for (const document of organisation.documents) {
        for (const text of [
          document.title,
          document.mainText,
          ...document.headings.map((h) => h.text),
        ]) {
          expect(redactContactData(text), text).toBe(text);
          markers += (text.match(/\[(PHONE|EMAIL)\]/g) ?? []).length;
        }
      }
    }
    expect(markers).toBeGreaterThanOrEqual(6);
  });

  it('labels every unit page with a name its own document supports', () => {
    for (const organisation of fixture.organisations) {
      for (const document of organisation.documents) {
        const { gold } = document;
        if (gold.verdict !== 'UNIT_PAGE') {
          expect(gold.unitName).toBeNull();
          continue;
        }
        const fields = [document.title, document.mainText, ...document.headings.map((h) => h.text)];
        expect(
          fields.some((field) => field.includes(gold.unitName!)),
          gold.unitName!,
        ).toBe(true);
      }
    }
  });
});

describe('assembly through the landed pure path', () => {
  const batches = assembleEvalBatches(fixture);

  it('produces one whole-organisation batch per fixture organisation', () => {
    expect(batches.map((b) => b.organisationKey)).toEqual(fixture.organisations.map((o) => o.key));
    for (const { batch } of batches) {
      expect(batch.context.rootKey).toBeNull();
      expect(batch.context.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION_V2);
      expect(batch.context.echeRowKey.startsWith('SYNTHETIC-EVAL|')).toBe(true);
    }
  });

  it('carries v2 signals from each document language pack on every scored unit page', () => {
    const prefixes = { ja: ['A_JA_', 'B_JA_'], es: ['A_ES_', 'B_ES_'], nl: ['A_NL_', 'B_NL_'] };
    for (const { batch, language, goldByDocIndex } of batches) {
      for (const document of batch.documents) {
        const gold = goldByDocIndex.get(document.docIndex)!;
        expect(document.declaredLang).toBe(language);
        if (gold.status !== 'SCORED' || gold.verdict !== 'UNIT_PAGE') continue;
        const own = document.signals.filter(
          (s) => s.kind === 'positive' && prefixes[language].some((p) => s.id.startsWith(p)),
        );
        expect(own.length, document.url).toBeGreaterThan(0);
      }
    }
  });

  it('v1 reads nothing in the Japanese titles and headings of the unit pages; v2 does (G5)', () => {
    const ja = fixture.organisations.find((o) => o.key === 'JA-HEI')!;
    const textFields = (signals: readonly { field: string }[]) =>
      signals.filter((s) => s.field === 'title' || s.field === 'heading');
    for (const document of ja.documents.filter((d) => d.gold.verdict === 'UNIT_PAGE')) {
      const input = {
        url: new URL(document.path, ja.rootUrl).toString(),
        title: document.title,
        headings: document.headings,
      };
      const v1 = scoreFetchedPageCandidate(input);
      const v2 = scoreFetchedPageCandidateV2(input);
      expect(
        v1.tracks.every((t) => textFields(t.matchedSignals).length === 0),
        document.title,
      ).toBe(true);
      expect(
        v2.tracks.some((t) => textFields(t.matchedSignals).length > 0),
        document.title,
      ).toBe(true);
    }
  });

  it("carries this lineage's v3 extraction label and v2 signal stamp (REL harvest H4)", () => {
    expect(EVAL_EXTRACTION_RULE_VERSION).toBe('orgunit-extraction-v4');
    expect(EVAL_EXTRACTION_RULE_VERSION).toBe(PAGE_EVIDENCE_EXTRACTION_RULE_VERSION);
    expect(EVAL_EXTRACTION_RULE_VERSION).toBe(COLLECTED_EXTRACTION_RULE_VERSION);
    for (const { batch } of batches) {
      for (const document of batch.documents) {
        expect(document.extractionRuleVersion).toBe(EVAL_EXTRACTION_RULE_VERSION);
        const v2 = scoreFetchedPageCandidateV2({
          url: document.url,
          title: document.title,
          headings: document.headings,
        });
        expect(v2.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION_V2);
        // Every signal the model sees is one the landed v2 engine produced for this page.
        const produced = new Set(
          v2.tracks.flatMap((t) =>
            [...t.matchedSignals, ...t.negativeSignals, ...t.vetoes].map(
              (s) => `${t.track} ${s.id} ${s.field} ${s.kind}`,
            ),
          ),
        );
        for (const s of document.signals) {
          expect(produced.has(`${s.track} ${s.id} ${s.field} ${s.kind}`), s.id).toBe(true);
        }
      }
    }
  });

  it('builds exactly the landed request shape', () => {
    const request = buildEvalRequest(batches[0]!.batch, MODEL);
    expect(request.systemPrompt).toBe(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    expect(request.outputJsonSchema).toBe(ORGUNIT_CLASSIFIER_OUTPUT_JSON_SCHEMA);
    expect(JSON.parse(request.serializedBatch)).toEqual(
      JSON.parse(
        JSON.stringify({
          context: batches[0]!.batch.context,
          documents: batches[0]!.batch.documents,
        }),
      ),
    );
    expect(request.modelId).toBe(MODEL);
  });
});

describe('runEvalSlice, scripted (offline)', () => {
  it('validates every answer and counts full agreement, with provisional items kept apart', async () => {
    const provider = scriptedGold();
    const report = await runEvalSlice({ provider, modelId: MODEL });
    expect(report.mode).toBe('SCRIPTED_OFFLINE');
    expect(report.calls).toBe(6);
    expect(provider.callCount).toBe(6);
    expect(report.signalRuleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION_V2);
    for (const language of ['ja', 'es', 'nl'] as const) {
      expect(report.byLanguage[language], language).toEqual({
        documents: 6,
        scored: 5,
        provisional: 1,
        validated: 6,
        rejected: 0,
        unanswered: 0,
        verdictAgree: 5,
        verdictDisagree: 0,
        typeAgree: 5,
        typeDisagree: 0,
        needsReview: 0,
      });
    }
    expect(Object.keys(report)).not.toContain('passed');
  });

  it('counts a disagreeing verdict and a rejected (unverifiable) answer separately', async () => {
    const provider = scriptedGold((document, answer) => {
      if (document.title === 'Talencentrum') {
        Object.assign(
          answer,
          answerFor(document, {
            ...goldByUrl.get(document.url)!,
            verdict: 'NOT_A_UNIT',
            pageKind: 'GENERIC_INSTITUTIONAL_PAGE',
            unitType: null,
            unitName: null,
          }),
        );
      }
      if (document.title === '言語教育センター') {
        answer['evidence_spans'] = [{ source: 'TITLE', quote: '存在しない引用' }];
      }
    });
    const report = await runEvalSlice({ provider, modelId: MODEL });
    expect(report.byLanguage.nl.verdictDisagree).toBe(1);
    expect(report.byLanguage.nl.verdictAgree).toBe(4);
    expect(report.byLanguage.ja.rejected).toBe(1);
    expect(report.byLanguage.ja.validated).toBe(5);
    expect(report.byLanguage.ja.unanswered).toBe(0);
  });

  it('records a provider failure as unanswered documents, not as disagreement', async () => {
    const failure: ClassifierProviderResult = {
      outcome: 'PROVIDER_TRANSIENT',
      rawOutput: null,
      responseModelId: null,
      inputTokens: null,
      outputTokens: null,
      outcomeDetail: 'scripted transient failure',
      outcomeReasonCode: null,
    };
    const provider = new ScriptedTestProvider([
      failure,
      ...Array.from({ length: 5 }, () => goldResponder()),
    ]);
    const report = await runEvalSlice({ provider, modelId: MODEL });
    expect(report.providerFailures).toBe(1);
    expect(report.byLanguage.ja.unanswered).toBe(5);
    expect(report.byLanguage.ja.verdictDisagree).toBe(0);
  });

  it('refuses a model id outside the allowlist', async () => {
    await expect(
      runEvalSlice({ provider: scriptedGold(), modelId: 'not-an-allowlisted-model' }),
    ).rejects.toBeInstanceOf(MultilingualEvalRefusal);
  });
});

describe('runEvalSlice, the grant boundary', () => {
  it('refuses a non-scripted provider without a grant, before any call', async () => {
    const provider = new LocalFakeProvider(goldResponder());
    await expect(runEvalSlice({ provider, modelId: MODEL })).rejects.toThrow(/GRANT_REQUIRED/);
    expect(provider.calls).toBe(0);
  });

  it.each([
    ['fixtureSha256', 'b'.repeat(64)],
    ['promptVersion', 'orgunit-classifier-prompt-v7.1'],
    ['outputSchemaVersion', 'orgunit-classifier-output-schema-v1'],
    ['modelId', ORGUNIT_CLASSIFIER_ALLOWED_MODELS[0]!],
    ['scope', 'HOLDOUT'],
    ['grantedBy', 'agent'],
    ['grantRecordSha256', 'not-a-digest'],
  ] as const)('refuses a grant whose %s does not match this run', async (field, value) => {
    const provider = new LocalFakeProvider(goldResponder());
    const grant = { ...matchingGrant(), [field]: value };
    await expect(runEvalSlice({ provider, modelId: MODEL, grant })).rejects.toThrow(
      /GRANT_MISMATCH/,
    );
    expect(provider.calls).toBe(0);
  });

  it('runs a non-scripted provider only under a grant that matches every field', async () => {
    const provider = new LocalFakeProvider(goldResponder());
    const report = await runEvalSlice({ provider, modelId: MODEL, grant: matchingGrant() });
    expect(report.mode).toBe('GRANTED');
    expect(provider.calls).toBe(6);
  });
});

describe('the harness has no live path', () => {
  const source = readFileSync(
    resolve(ROOT, 'src/test/harness/multilingualEvalV1/harness.ts'),
    'utf8',
  );
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);

  it('imports no provider runtime, SDK, socket, database or environment', () => {
    for (const specifier of imports) {
      if (specifier.includes('classify/provider/')) {
        expect(specifier).toMatch(/classify\/provider\/allowedModels\.js$/);
      }
      expect(specifier).not.toMatch(/claude-agent-sdk|^pg$|node:(http|https|net|tls|dns)|\/db\//);
      expect(specifier).not.toMatch(/orgunits\/(web\/(gateway|robots)|orchestrator)/);
    }
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it('constructs no provider of its own', () => {
    expect(source).not.toMatch(/new\s+\w*Provider\s*\(/);
  });
});
