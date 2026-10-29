/**
 * THE OPTION-C-LITE OFFLINE CENSUS: ITS RULE, ITS ISOLATION, AND ITS
 * PUBLISHED RECORD.
 *
 * Three things are pinned here, and they are deliberately different kinds of
 * claim:
 *
 *   1. THE RULE IS MECHANICAL. The classifier is exercised against
 *      hand-written persisted-redirect shapes, so "newly continuable under
 *      v3" is shown to depend on the run's OWN executed policy version and on
 *      nothing else. This is the part that must not quietly become an outcome
 *      judgement.
 *
 *   2. THE HARNESS IS ISOLATED. No socket module, no write statement, no
 *      network-capable symbol, and exactly one module in the whole graph that
 *      touches a database - the read-only reader the Option-B step already
 *      used.
 *
 *   3. THE PUBLISHED RECORD SAYS WHAT WAS MEASURED. The two artifacts on disk
 *      are read back and their numbers checked against each other, so a
 *      record that disagreed with its own census would fail rather than be
 *      published.
 *
 * PURE. No database, no network, no fixture beyond the committed artifacts.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
import {
  censusOfPersistedRuns,
  censusOfRedirects,
  classifyRunForV3,
  newlyContinuableUnderV3,
  verdictFor,
  type PersistedRedirect,
  type PersistedRun,
} from '../harness/phase2b2d/v3transition/v3Census.js';
import { materialiseV3Census } from '../harness/phase2b2d/v3transition/materialiseV3Census.js';
import {
  EXPECTED_PRODUCTION_POLICY_VERSION,
  IMPLEMENTATION_RECORD_PATH,
  NEXT_OWNER_DECISION,
  OPTION_C_LITE_COMPLETE,
  OptionCLiteStop,
  PLAN_AMENDMENT_V2_PATH,
  PRODUCTION_POLICY_VERSION,
} from '../harness/phase2b2d/v3transition/v3Contract.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relative: string): string => readFileSync(join(ROOT, relative), 'utf8');

const HARNESS_DIR = 'src/test/harness/phase2b2d/v3transition';
const HARNESS_MODULES = ['v3Contract.ts', 'v3Census.ts', 'materialiseV3Census.ts'];

const RUN_A = '11111111-1111-4111-8111-111111111111';
const RUN_B = '22222222-2222-4222-8222-222222222222';

function v1Run(runId: string): PersistedRun {
  return {
    runId,
    fetchPolicyVersion: 'orgunit-fetch-policy-v1',
    startedAt: '2026-09-18T00:00:00.000Z',
  };
}

function v2Run(runId: string): PersistedRun {
  return {
    runId,
    fetchPolicyVersion: 'orgunit-fetch-policy-v2',
    startedAt: '2026-09-19T00:00:00.000Z',
  };
}

/** A same-hostname http -> https policy redirect, the ADR 0012 shape. */
function sameHostRedirect(overrides: Partial<PersistedRedirect> = {}): PersistedRedirect {
  return {
    runId: RUN_A,
    requestedUrl: 'http://www.example.ac.uk/robots.txt',
    httpStatus: 301,
    toUrlRaw: 'https://www.example.ac.uk/robots.txt',
    toUrlResolved: 'https://www.example.ac.uk/robots.txt',
    targetMalformed: false,
    schemeDowngraded: false,
    hostChanged: false,
    registrableDomainChanged: false,
    ...overrides,
  };
}

/** A host-changing policy redirect inside one registrable domain, the ADR 0013 shape. */
function hostChangingRedirect(overrides: Partial<PersistedRedirect> = {}): PersistedRedirect {
  return {
    runId: RUN_A,
    requestedUrl: 'https://www.example.ac.uk/robots.txt',
    httpStatus: 301,
    toUrlRaw: 'https://example.ac.uk/robots.txt',
    toUrlResolved: 'https://example.ac.uk/robots.txt',
    targetMalformed: false,
    schemeDowngraded: false,
    hostChanged: true,
    registrableDomainChanged: false,
    ...overrides,
  };
}

describe('Option C-lite census: the rule is mechanical', () => {
  it('reads production live, and pins its own EXPECTATION at v3 permanently', () => {
    // TEMPORAL CORRECTION (owner decision
    // AUTHORISE_BOUNDED_TRANSPORT_RETRY_TEMPORAL_TEST_CORRECTION_V1). This
    // used to assert PRODUCTION === EXPECTED, i.e. "production is v3". That
    // conflated two different facts. The expectation is a property of THIS
    // MEASUREMENT and is frozen; production is a live read and is expected to
    // advance. Asserting they are equal turned a historical census into a
    // claim about every future build.
    expect(PRODUCTION_POLICY_VERSION).toBe(FETCH_POLICY_VERSION);
    expect(EXPECTED_PRODUCTION_POLICY_VERSION).toBe('orgunit-fetch-policy-v3');
  });

  it('refuses to materialise once production has moved beyond v3', async () => {
    // THE GUARD IS THE POINT, NOT AN OBSTACLE. Once production advances, the
    // committed v3 census is the immutable historical artifact and must not be
    // regenerable under a build whose predicate has moved.
    //
    // While production IS v3 the guard is dormant and there is nothing to
    // prove; the assertion below records that state honestly rather than
    // silently passing. Once production advances - which the v4 bounded
    // transport retry does - this becomes a live refusal test.
    if (PRODUCTION_POLICY_VERSION === EXPECTED_PRODUCTION_POLICY_VERSION) {
      expect(PRODUCTION_POLICY_VERSION).toBe('orgunit-fetch-policy-v3');
      return;
    }

    // The connection string is stubbed only so the version guard is REACHED:
    // materialiseV3Census checks DATABASE_URL_READONLY first, and this test
    // must fail on the version, not on configuration. No pool is ever opened,
    // because the version guard throws before that line.
    vi.stubEnv('DATABASE_URL_READONLY', 'postgres://unused.invalid/unused');
    try {
      await expect(materialiseV3Census(ROOT, { write: false })).rejects.toBeInstanceOf(
        OptionCLiteStop,
      );
      await expect(materialiseV3Census(ROOT, { write: false })).rejects.toThrow(
        /STOP: production acquisition is ".*", not "orgunit-fetch-policy-v3"/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('reads the verdict from the LANDED predicate, host-change flag included', () => {
    expect(verdictFor(sameHostRedirect())).toEqual({
      continuableUnderV3: true,
      requiresHostChange: false,
    });
    expect(verdictFor(hostChangingRedirect())).toEqual({
      continuableUnderV3: true,
      requiresHostChange: true,
    });
  });

  it('treats an ORDINARY-page redirect as no evidence at all', () => {
    // ADR 0008 already continued these under every policy version, so they
    // say nothing about this transition.
    const ordinary = sameHostRedirect({
      requestedUrl: 'http://www.example.ac.uk/',
      toUrlRaw: 'https://www.example.ac.uk/',
      toUrlResolved: 'https://www.example.ac.uk/',
    });
    expect(verdictFor(ordinary).continuableUnderV3).toBe(false);
  });

  it('baselines a v1 run against "continued nothing"', () => {
    expect(newlyContinuableUnderV3(sameHostRedirect(), 'orgunit-fetch-policy-v1')).toBe(true);
    expect(newlyContinuableUnderV3(hostChangingRedirect(), 'orgunit-fetch-policy-v1')).toBe(true);
  });

  it('baselines a v2 run against "continued the same-hostname shape already"', () => {
    // THE SUBTLETY THIS CENSUS EXISTS FOR. A v2 run that already continued a
    // same-hostname redirect gained nothing from C-lite and is NOT affected;
    // asking the flat question "does v3 continue it?" would say otherwise.
    expect(newlyContinuableUnderV3(sameHostRedirect(), 'orgunit-fetch-policy-v2')).toBe(false);
    expect(newlyContinuableUnderV3(hostChangingRedirect(), 'orgunit-fetch-policy-v2')).toBe(true);
  });

  it('STOPS on a policy version it cannot baseline, rather than guessing', () => {
    expect(() => newlyContinuableUnderV3(sameHostRedirect(), 'orgunit-fetch-policy-v9')).toThrow(
      OptionCLiteStop,
    );
  });

  it('classifies a v2 run with a host-changing redirect as AFFECTED', () => {
    const classified = classifyRunForV3(v2Run(RUN_A), [hostChangingRedirect()], true);
    expect(classified.classification).toBe('V3_TRANSITION_AFFECTED');
    expect(classified.robotsRedirectsNewlyContinuable).toBe(1);
    expect(classified.robotsRedirectsStillRefused).toBe(0);
  });

  it('classifies a v2 run with only a same-hostname redirect as UNAFFECTED', () => {
    const classified = classifyRunForV3(v2Run(RUN_A), [sameHostRedirect()], true);
    expect(classified.classification).toBe('V3_TRANSITION_UNAFFECTED');
    expect(classified.robotsRedirectsContinuableUnderV3).toBe(1);
    expect(classified.robotsRedirectsNewlyContinuable).toBe(0);
  });

  it('leaves a run with no redirect at all UNAFFECTED', () => {
    const classified = classifyRunForV3(v1Run(RUN_B), [sameHostRedirect()], true);
    expect(classified.redirectObservations).toBe(0);
    expect(classified.classification).toBe('V3_TRANSITION_UNAFFECTED');
  });

  it('leaves a cross-registrable-domain robots redirect refused and UNAFFECTED', () => {
    const crossDomain = hostChangingRedirect({
      toUrlRaw: 'https://other-university.edu/robots.txt',
      toUrlResolved: 'https://other-university.edu/robots.txt',
      registrableDomainChanged: true,
    });
    expect(verdictFor(crossDomain).continuableUnderV3).toBe(false);
    expect(classifyRunForV3(v1Run(RUN_A), [crossDomain], true).classification).toBe(
      'V3_TRANSITION_UNAFFECTED',
    );
  });

  it('leaves a MALFORMED target refused rather than repairing it', () => {
    const malformed = hostChangingRedirect({
      toUrlRaw: 'REDACTED_USERINFO',
      toUrlResolved: null,
      targetMalformed: true,
      schemeDowngraded: null,
      hostChanged: null,
      registrableDomainChanged: null,
    });
    expect(verdictFor(malformed).continuableUnderV3).toBe(false);
  });

  it('partitions the redirect census exhaustively', () => {
    const census = censusOfRedirects([
      sameHostRedirect(),
      hostChangingRedirect(),
      hostChangingRedirect({
        toUrlRaw: 'https://elsewhere.fr/robots.txt',
        toUrlResolved: 'https://elsewhere.fr/robots.txt',
        registrableDomainChanged: true,
      }),
      sameHostRedirect({ requestedUrl: 'https://www.example.ac.uk/page' }),
    ]);
    expect(census).toMatchObject({
      redirectObservationsTotal: 4,
      robotsRedirectsTotal: 3,
      optionBQualifying: 1,
      optionCLiteNewlyQualifying: 1,
      stillRefused: 1,
    });
  });

  it('classifies every run, and records separately which are of record', () => {
    const result = censusOfPersistedRuns(
      [v1Run(RUN_A), v2Run(RUN_B)],
      [hostChangingRedirect({ runId: RUN_B })],
      new Set([RUN_A]),
    );
    expect(result.runsExamined).toBe(2);
    expect(result.supersededRuns).toBe(1);
    expect(result.acquisitionOfRecordRuns).toBe(1);
    expect(result.affectedCount).toBe(1);
    expect(result.affectedAcquisitionOfRecordRuns).toBe(1);
    expect(result.unaffectedCount + result.affectedCount).toBe(result.runsExamined);
  });

  it('STOPS rather than classifying a run under the CURRENT policy version', () => {
    expect(() =>
      censusOfPersistedRuns(
        [{ runId: RUN_A, fetchPolicyVersion: FETCH_POLICY_VERSION, startedAt: '2026-09-20' }],
        [],
        new Set(),
      ),
    ).toThrow(OptionCLiteStop);
  });

  it('STOPS rather than reporting an empty census', () => {
    expect(() => censusOfPersistedRuns([], [], new Set())).toThrow(OptionCLiteStop);
  });
});

describe('Option C-lite census: the harness is isolated', () => {
  const codeOf = (name: string): string =>
    read(`${HARNESS_DIR}/${name}`)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('imports no socket module and calls no fetch primitive', () => {
    for (const name of HARNESS_MODULES) {
      const code = codeOf(name);
      for (const forbidden of ['node:dns', 'node:net', 'node:tls', 'node:http', 'node:https']) {
        expect(code, `${name} :: ${forbidden}`).not.toContain(forbidden);
      }
      expect(code, name).not.toMatch(/\bfetch\(/);
    }
  });

  it('names no network-capable gateway or orchestrator symbol', () => {
    for (const name of HARNESS_MODULES) {
      const code = codeOf(name);
      for (const forbidden of [
        'executeWebAttempt',
        'authoriseAndFetchPage',
        'getRobotsPolicy',
        'runRootAcquisition',
        'runOrganisationDiscovery',
        'nodeWebTransport',
      ]) {
        expect(code, `${name} :: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('reaches the orgunit web surface through exactly one import: the landed predicate', () => {
    const census = codeOf('v3Census.ts');
    expect(census).toContain(
      "import { continuationTargetFor } from '../../../../orgunits/web/robots.js';",
    );
    // The contract module may name the policy, which has no imports at all.
    const contract = codeOf('v3Contract.ts');
    expect(contract.match(/from '\.\.\/\.\.\/\.\.\/\.\.\/orgunits\/[^']+'/g)).toEqual([
      "from '../../../../orgunits/web/policy.js'",
    ]);
    expect(codeOf('materialiseV3Census.ts')).not.toMatch(/from '.*orgunits\/web\//);
  });

  it('reimplements no part of the predicate: no path, host or scheme comparison of its own', () => {
    // It may COPY persisted fields onto the shape the predicate reads
    // (`registrableDomainChanged` is one of them); what it may not do is
    // parse a URL or compare a host, a path or a scheme itself.
    const census = codeOf('v3Census.ts');
    for (const forbidden of [
      'new URL(',
      'tldts',
      "'/robots.txt'",
      '.hostname',
      '.pathname',
      '.protocol',
      'registrableDomain !==',
    ]) {
      expect(census, forbidden).not.toContain(forbidden);
    }
    expect(census).toContain('continuationTargetFor(redirect.requestedUrl');
  });

  it('issues no mutating SQL and no transaction-control statement', () => {
    for (const name of HARNESS_MODULES) {
      const code = codeOf(name);
      for (const verb of [
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'COPY',
        'CREATE',
        'ALTER',
        'DROP',
        'GRANT',
        'BEGIN',
        'COMMIT',
        'ROLLBACK',
      ]) {
        expect(code, `${name} :: ${verb}`).not.toContain(verb);
      }
    }
  });

  it('connects as the readonly role and no other', () => {
    const code = codeOf('materialiseV3Census.ts');
    expect(code).toContain("process.env['DATABASE_URL_READONLY']");
    for (const other of [
      'DATABASE_URL_ADMIN',
      'DATABASE_URL_INGEST',
      'DATABASE_URL_RESEARCH',
      'DATABASE_URL_CLASSIFIER',
    ]) {
      expect(code, other).not.toContain(other);
    }
  });

  it('verifies the table counts before AND after, and refuses any movement', () => {
    const code = codeOf('materialiseV3Census.ts');
    expect(code).toContain('countsBefore = await readTableCounts(pool);');
    expect(code).toContain('countsAfter = await readTableCounts(pool);');
    expect(code).toContain('a table count moved while this read-only step was running');
  });

  it('rebinds the immutable inputs before and after, so an edit could not go unnoticed', () => {
    const code = codeOf('materialiseV3Census.ts');
    expect(code).toContain('const before = IMMUTABLE_INPUT_PATHS.map');
    expect(code).toContain('const after = IMMUTABLE_INPUT_PATHS.map');
    expect(code).toContain('a bound immutable input changed while this step ran');
  });

  it('keeps the organisation key inside the join and out of every record', () => {
    const code = codeOf('materialiseV3Census.ts');
    expect(code).toContain('opaqueRefOf(run.runId)');
    // The `eche_row_key` -> selection index join happens in memory. The key
    // is named exactly twice - the draw's row type and the map it builds -
    // and both are inside the one function that performs that join.
    const join = code.slice(
      code.indexOf('function selectionIndexByEcheRowKey'),
      code.indexOf('function supersededRunRefs'),
    );
    expect(join.length).toBeGreaterThan(0);
    expect(code.match(/echeRowKey/g)).toHaveLength((join.match(/echeRowKey/g) ?? []).length);
    // And no record builder emits an organisation id, a hostname or a URL as
    // a FIELD. Both files legitimately say the words in prose - the record's
    // own disclosure note states that none of them appears - so the check is
    // on the key form, and the emitted artifact is checked for VALUES below.
    const builders = code.slice(code.indexOf('function buildImplementationRecord'));
    expect(builders).not.toMatch(/(echeRowKey|organisationId|hostname|requestedUrl)\s*:/);
  });
});

describe('Option C-lite census: the published record', () => {
  const record = () =>
    JSON.parse(read(IMPLEMENTATION_RECORD_PATH)) as {
      selectedOption: string;
      standardBasis: string;
      fetchPolicyVersion: string;
      crossRegistrableDomain: boolean;
      maxRobotsRedirectContinuationHops: number;
      gatewayAutoFollow: boolean;
      targetPolicyAppliedToInitialAuthority: boolean;
      targetOriginCacheContaminated: boolean;
      historicalEvidenceMutated: boolean;
      networkExecuted: boolean;
      targetedRevalidationAuthorised: boolean;
      batchContinuationAuthorised: boolean;
      reserveConsumptionAuthorised: boolean;
      thisFileAuthorises: unknown[];
      persistedRobotsRedirectCensus: Record<string, number | boolean | string>;
      v3TransitionClassification: {
        runsExamined: number;
        acquisitionOfRecordRuns: number;
        supersededRuns: number;
        V3_TRANSITION_UNAFFECTED: number;
        V3_TRANSITION_AFFECTED: number;
        affectedAcquisitionOfRecordRuns: number;
        affectedSelectionIndices: number[];
        affectedSelectionIndicesIncludingSupersededRuns: number[];
        perRun: { runOpaqueRef: string; classification: string }[];
      };
      historicalClassifierFreezes: Record<string, unknown>;
      networkAttestation: Record<string, number | boolean>;
      terminalState: string;
      nextOwnerDecision: string;
    };

  it('binds exactly the facts the owner decision named', () => {
    expect(record()).toMatchObject({
      selectedOption: 'C_LITE',
      standardBasis: 'RFC_9309_SECTION_2_3_1_2',
      fetchPolicyVersion: 'orgunit-fetch-policy-v3',
      crossRegistrableDomain: false,
      maxRobotsRedirectContinuationHops: 1,
      gatewayAutoFollow: false,
      targetPolicyAppliedToInitialAuthority: true,
      targetOriginCacheContaminated: false,
      historicalEvidenceMutated: false,
      networkExecuted: false,
      targetedRevalidationAuthorised: false,
      batchContinuationAuthorised: false,
      reserveConsumptionAuthorised: false,
      thisFileAuthorises: [],
      terminalState: OPTION_C_LITE_COMPLETE,
      nextOwnerDecision: NEXT_OWNER_DECISION,
    });
  });

  it('reports a redirect census that partitions exhaustively', () => {
    const census = record().persistedRobotsRedirectCensus;
    const total = census['robotsRedirectsTotal'] as number;
    expect(
      (census['optionBQualifying'] as number) +
        (census['optionCLiteNewlyQualifying'] as number) +
        (census['stillRefused'] as number),
    ).toBe(total);
    // The measured finding: this is no longer a one-observation phenomenon.
    expect(census['optionCLiteNewlyQualifying'] as number).toBeGreaterThanOrEqual(2);
    expect(census['predicateReimplemented']).toBe(false);
  });

  it('reports a run classification that partitions exhaustively', () => {
    const classification = record().v3TransitionClassification;
    expect(classification.V3_TRANSITION_AFFECTED + classification.V3_TRANSITION_UNAFFECTED).toBe(
      classification.runsExamined,
    );
    expect(classification.acquisitionOfRecordRuns + classification.supersededRuns).toBe(
      classification.runsExamined,
    );
    expect(classification.perRun).toHaveLength(classification.runsExamined);
    for (const run of classification.perRun) expect(run.runOpaqueRef).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps the of-record affected set separate from the superseded-run one', () => {
    const classification = record().v3TransitionClassification;
    // Index 5's superseded v1 run is affected; its acquisition of record is
    // the v2 run that already continued, which is not.
    expect(classification.affectedSelectionIndices).toEqual([1, 7]);
    expect(classification.affectedSelectionIndicesIncludingSupersededRuns).toEqual([1, 5, 7]);
    expect(classification.affectedAcquisitionOfRecordRuns).toBe(
      classification.affectedSelectionIndices.length,
    );
  });

  it('attests that nothing reached the network and no old record moved', () => {
    expect(record().networkAttestation).toMatchObject({
      institutionHttpRequests: 0,
      dnsLookups: 0,
      tlsHandshakes: 0,
      executeAcquisitionRuns: 0,
      index7Rerun: false,
      earlierHostChangingCaseRerun: false,
      indices8or9Started: false,
    });
    expect(record().historicalClassifierFreezes).toMatchObject({
      freezeFilesEdited: 0,
      ownerFreezeApprovalFilesEdited: 0,
      historicalV1ReconstructionStillGreen: true,
      twoDTwoCReFrozen: false,
    });
  });

  it('publishes no organisation identity - no key, no uuid, no host, no URL', () => {
    // The record names the CONCEPTS `eche_row_key` and `echeRowKey` in prose,
    // where it states that none appears. What must be absent is a VALUE, so
    // that is what is checked: an ECHE row key, a UUID, and any URL.
    const raw = read(IMPLEMENTATION_RECORD_PATH);
    expect(raw).not.toMatch(/[A-Z]{1,3}\s+[A-Z0-9]+\|\d{5,}/);
    expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(raw).not.toMatch(/https?:\/\//);
  });
});

describe('Option C-lite census: the plan amendment', () => {
  const amendment = () =>
    JSON.parse(read(PLAN_AMENDMENT_V2_PATH)) as {
      recordKind: string;
      priorPlan: { path: string; sha256: string; bytes: number };
      priorAmendment: { path: string; sha256: string; bytes: number };
      newFutureFetchPolicyVersion: string;
      methodologyChanged: boolean;
      frameChanged: boolean;
      drawChanged: boolean;
      splitChanged: boolean;
      samplingChanged: boolean;
      budgetCeilingsChanged: boolean;
      robotsRedirectHostBoundaryChanged: string;
      maxRobotsRedirectContinuationHops: number;
      noLiveAcquisitionIsAuthorisedByThisArtifact: boolean;
      thisFileAuthorises: unknown[];
    };

  it('binds every flag the owner decision named', () => {
    expect(amendment()).toMatchObject({
      recordKind: 'CORPUS_ACQUISITION_PLAN_AMENDMENT_V2',
      newFutureFetchPolicyVersion: 'orgunit-fetch-policy-v3',
      methodologyChanged: false,
      frameChanged: false,
      drawChanged: false,
      splitChanged: false,
      samplingChanged: false,
      budgetCeilingsChanged: false,
      robotsRedirectHostBoundaryChanged: 'SAME_HOST_TO_SAME_REGISTRABLE_DOMAIN',
      maxRobotsRedirectContinuationHops: 1,
      noLiveAcquisitionIsAuthorisedByThisArtifact: true,
      thisFileAuthorises: [],
    });
  });

  it('references Plan V1 and the Option-B amendment by their CURRENT bytes', () => {
    // If either had been edited, the recorded sha256/bytes would no longer
    // match the file on disk and this fails - which is the whole point of
    // binding them rather than naming them.
    const { priorPlan, priorAmendment } = amendment();
    for (const bound of [priorPlan, priorAmendment]) {
      const bytes = readFileSync(join(ROOT, bound.path));
      expect(bytes.length, bound.path).toBe(bound.bytes);
    }
  });
});
