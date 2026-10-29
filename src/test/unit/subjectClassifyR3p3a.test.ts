/**
 * R3P3-A (ADR 0031) - the PURE parts of subject-rooted classification:
 *
 *   - the derived subject prompt is the frozen production prompt with
 *     EXACTLY the two context substitutions, reversible byte for byte, under
 *     its own version, and refuses when the production prompt drifts;
 *   - the evaluation-cohort rule: ALLOWED only with every proof fact, each
 *     refusal reachable, and the COMMITTED cohort registry verifiably
 *     ECHE-keyed (the "outside the frame by construction" premise, checked).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';
import {
  loadEvaluationCohortRegistry,
  type EvaluationCohortRegistry,
} from '../../orgunits/classify/evaluationCohortGuard.js';
import {
  evaluateSubjectCohortMembership,
  type SubjectCohortFacts,
} from '../../orgunits/subjectClassify/cohort.js';
import {
  ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION,
  SUBJECT_PROMPT_BASE_SHA256,
  SUBJECT_PROMPT_SUBSTITUTIONS,
  SubjectPromptDerivationError,
  deriveSubjectPrompt,
  subjectClassifierSystemPrompt,
} from '../../orgunits/subjectClassify/prompt.js';
import { syntheticCohort } from '../helpers/syntheticCohortRegistry.js';

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

describe('R3P3-A: the derived subject prompt', () => {
  it('pins the production prompt it was reviewed against, and versions itself separately', () => {
    expect(sha256(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT)).toBe(SUBJECT_PROMPT_BASE_SHA256);
    expect(ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION).toBe('orgunit-subject-classifier-prompt-v1');
    expect(ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION).not.toBe(ORGUNIT_CLASSIFIER_PROMPT_VERSION);
  });

  it('differs from the production prompt by exactly the two context substitutions', () => {
    const subject = subjectClassifierSystemPrompt();
    expect(SUBJECT_PROMPT_SUBSTITUTIONS).toHaveLength(2);
    let reversed = subject;
    for (const [from, to] of SUBJECT_PROMPT_SUBSTITUTIONS) {
      expect(subject.split(to)).toHaveLength(2);
      expect(subject).not.toContain(from);
      reversed = reversed.replace(to, () => from);
    }
    expect(reversed).toBe(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT);
    expect(subject).not.toMatch(
      /legal name and ECHE row key|ECHE-published country code|country code is background/,
    );
    expect(subject).toContain('No country is supplied.');
  });

  it('refuses a drifted production prompt and a substitution that does not apply', () => {
    expect(() =>
      deriveSubjectPrompt(`${ORGUNIT_CLASSIFIER_SYSTEM_PROMPT} `, SUBJECT_PROMPT_BASE_SHA256),
    ).toThrow(SubjectPromptDerivationError);
    const stripped = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.replace(
      SUBJECT_PROMPT_SUBSTITUTIONS[1]![0],
      '',
    );
    expect(() => deriveSubjectPrompt(stripped, sha256(stripped))).toThrow(
      /does not apply exactly once/,
    );
  });
});

describe('R3P3-A: the evaluation-cohort rule for subject-rooted research', () => {
  const synthetic = syntheticCohort().load();
  if (!synthetic.ok) throw new Error(synthetic.detail);
  const registry = synthetic.registry;
  const ADMISSION = '11111111-0000-4000-8000-000000000001';
  const SUBJECT = '22222222-0000-4000-8000-000000000002';
  const facts = (o: Partial<SubjectCohortFacts> = {}): SubjectCohortFacts => ({
    admissionId: ADMISSION,
    subjectId: SUBJECT,
    runRootScope: `subject_admission:${ADMISSION}`,
    runFetchEcheRowKeyCount: 0,
    runFetchOrganisationIdCount: 0,
    runRegistrableDomains: ['sprachcafe.example'],
    isolationDomains: ['example.ac.uk', 'univ-example.fr'],
    ...o,
  });

  it('allows only with every proof fact, and states the proof', () => {
    const verdict = evaluateSubjectCohortMembership(registry, facts());
    expect(verdict).toEqual({
      kind: 'ALLOWED_OUTSIDE_EVALUATION_FRAME',
      proof: {
        registryEcheKeyed: true,
        runEcheEvidence: 0,
        isolatedDomains: 1,
        registryArtifacts: { ...registry.artifactSha256 },
      },
    });
  });

  it.each([
    [{ runRootScope: 'ECHE' }, 'SUBJECT_COHORT_RUN_NOT_THIS_ADMISSION'],
    [{ runRootScope: `subject_admission:${SUBJECT}` }, 'SUBJECT_COHORT_RUN_NOT_THIS_ADMISSION'],
    [{ runFetchEcheRowKeyCount: 1 }, 'SUBJECT_COHORT_RUN_NAMES_ECHE_EVIDENCE'],
    [{ runFetchOrganisationIdCount: 1 }, 'SUBJECT_COHORT_RUN_NAMES_ECHE_EVIDENCE'],
    [{ runRegistrableDomains: [] }, 'SUBJECT_COHORT_RUN_HAS_NO_EVIDENCE'],
    [
      { runRegistrableDomains: ['sprachcafe.example', 'univ-example.fr'] },
      'SUBJECT_COHORT_DOMAIN_NOT_ISOLATED',
    ],
  ] as const)('refuses %j as %s', (override, kind) => {
    expect(evaluateSubjectCohortMembership(registry, facts(override)).kind).toBe(kind);
  });

  it('refuses a subject or admission id the registry binds as an organisation', () => {
    const anchorId = [...registry.echeRowKeysByOrganisationId.keys()][0]!;
    expect(evaluateSubjectCohortMembership(registry, facts({ subjectId: anchorId })).kind).toBe(
      'SUBJECT_COHORT_IDENTITY_KNOWN_TO_REGISTRY',
    );
  });

  it('refuses a registry that is not ECHE-keyed (the premise is checked, not assumed)', () => {
    const forged: EvaluationCohortRegistry = {
      ...registry,
      membershipsByEcheRowKey: new Map([
        ['subject_admission:x', new Set(['DRAW_SELECTION:FINAL_HOLDOUT' as const])],
      ]),
    };
    expect(evaluateSubjectCohortMembership(forged, facts()).kind).toBe(
      'SUBJECT_COHORT_REGISTRY_NOT_ECHE_KEYED',
    );
  });

  it('the COMMITTED cohort registry verifies and is entirely ECHE-keyed', () => {
    const committed = loadEvaluationCohortRegistry();
    if (!committed.ok) throw new Error(committed.detail);
    expect(committed.registry.frameOrganisationIdByEcheRowKey.size).toBe(6139);
    expect(evaluateSubjectCohortMembership(committed.registry, facts()).kind).toBe(
      'ALLOWED_OUTSIDE_EVALUATION_FRAME',
    );
  });
});
