/**
 * Track B, B2.5-S0 - the content-bound subject snapshot-scope manifest.
 *
 * TWO KINDS OF FIXTURE, KEPT APART.
 *   PRODUCER-GENERATED: synthetic B2.1 graphs whose findings come from the
 *     real B2.1 validator (`validateIdentityGraph`) and whose records are the
 *     exact B2.1 shapes, mapped into a manifest input by `produced()` the way
 *     a future loader would map them. Nothing in them is hand-edited.
 *   INJECTED (ADVERSARIAL): a produced input or manifest, then deliberately
 *     edited by `injected()` / `forge()` - a dropped record, a relabelled
 *     declaration, a falsified global, a recomputed forgery.
 * Every value is invented; no database, no network, no clock, no key.
 *
 * The MUTATION block rewrites `manifest.ts` source with one weakening at a
 * time, imports the mutant from a temporary directory, and shows the same
 * oracle that holds for the real module FAILS for the mutant - so the
 * fail-closed checks are load-bearing, not decorative.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateIdentityGraph } from '../../orgunits/identity/validate.js';
import type { IdentityGraphInput } from '../../orgunits/identity/vocabulary.js';
import { SUBJECT_EVIDENCE_CONTRACT } from '../../orgunits/subjectHandoff/contract.js';
import {
  PERMISSION_CAPABILITIES,
  PERMISSIONS,
  SCOPE_CATEGORIES,
  SNAPSHOT_SCOPE_CONTRACT,
  STATES,
  type CategoryDeclaration,
  type ScopeCategory,
} from '../../orgunits/subjectSnapshot/contract.js';
import * as RealManifest from '../../orgunits/subjectSnapshot/manifest.js';
import {
  buildSnapshotScopeManifest,
  compareSnapshotScopeWithReference,
  findingsDigestOf,
  manifestDigestOfBody,
  membershipDigestOf,
  recordContentDigestOf,
  reproduceSnapshotScopeManifest,
  verifySnapshotScopeManifest,
  type SnapshotScopeInput,
  type SnapshotScopeManifest,
  type SnapshotScopeManifestBody,
  type SnapshotScopeReference,
} from '../../orgunits/subjectSnapshot/manifest.js';
import {
  ECHE_ALPHA,
  graph,
  identifierClaim,
  nameClaim,
  relation,
  review,
  subject,
  uid,
} from '../helpers/discoveryIdentityFixtures.js';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
type ManifestModule = typeof RealManifest;

/** The I0 compatibility contract name (Operator I0-R2 / H1), restated: not importable here. */
const I0_COMPAT_CONTRACT = 'nwf-identity.discovery-subject-evidence-compat/1-provisional';
const PIC = '999000001';
const LATER = '2026-10-11T10:00:00.000Z';

// ------------------------------------------------------------------ producer-generated fixtures

/** The full synthetic "source": focal 1, parent 2, holder 3, incoming source 4. */
function sourceGraph(parts: Partial<IdentityGraphInput> = {}): IdentityGraphInput {
  return graph({
    subjects: [subject(1), subject(2, 'OTHER_ORGANISATIONAL_UNIT'), subject(3), subject(4)],
    identityClaims: [
      nameClaim(10, 1, 'Synthetic Language Centre'),
      identifierClaim(11, 1, 'EU_PIC', PIC),
      nameClaim(12, 2, 'Synthetic Parent Faculty'),
      nameClaim(13, 3, 'Synthetic Holder Association'),
      identifierClaim(14, 3, 'EU_PIC', PIC),
      // Subject 4 has no name claim: the validator reports that about a NEIGHBOUR.
    ],
    relationshipClaims: [
      relation(20, 1, 'PART_OF', { subject: 2 }),
      relation(21, 4, 'AFFILIATED_WITH', { subject: 1 }),
      relation(22, 1, 'HOSTED_BY', { eche: ECHE_ALPHA }),
    ],
    reviews: [
      review(30, { subject: 1 }, 'CONFIRMED'),
      review(31, { subject: 1 }, 'CONFIRMED', { supersedes: 30, at: LATER }),
    ],
    ...parts,
  });
}

const ATTESTATION_REF = {
  id: uid(40),
  reviewId: uid(31),
  keyId: 'test-owner-b25',
  payloadSha256: createHash('sha256').update('synthetic-attestation', 'utf8').digest('hex'),
};

const ALL_REPRESENTED = Object.fromEntries(
  SCOPE_CATEGORIES.map((c) => [c, c === 'PROTECTION_STATUS' ? 'UNKNOWN' : 'REPRESENTED']),
) as { [K in ScopeCategory]: CategoryDeclaration };

interface ProduceOptions {
  readonly directions?: readonly ('OUTGOING' | 'INCOMING')[];
  readonly categories?: Partial<{ [K in ScopeCategory]: CategoryDeclaration }>;
  readonly holders?: SnapshotScopeInput['scope']['sharedIdentifierHolders'];
  readonly attestationReferences?: readonly (typeof ATTESTATION_REF)[];
}

/**
 * PRODUCER: maps one B2.1 graph to a manifest input exactly as a future loader
 * would - every record as loaded, every finding the real validator reports
 * over that graph, the ECHE keys it queried and those it says exist.
 */
function produced(g: IdentityGraphInput, options: ProduceOptions = {}): SnapshotScopeInput {
  const validation = validateIdentityGraph(g);
  const targets = g.relationshipClaims
    .map((r) => r.targetEcheRowKey)
    .filter((k): k is string => k !== null);
  const queried = [...new Set([...targets, ...g.knownEcheRowKeys])].sort();
  return {
    contract: SNAPSHOT_SCOPE_CONTRACT,
    focalSubjectId: uid(1),
    inputOrigin: 'SYNTHETIC_IN_MEMORY',
    records: {
      subjects: g.subjects,
      identityClaims: g.identityClaims,
      relationshipClaims: g.relationshipClaims,
      reviews: g.reviews,
      attestationReferences: options.attestationReferences ?? [ATTESTATION_REF],
    },
    findings: validation.findings,
    validation: {
      ruleVersion: validation.ruleVersion,
      execution: 'CALLER_ASSERTED_RAN',
      asOf: g.asOf,
      echeRowKeyState: { queriedKeys: queried, presentKeys: [...g.knownEcheRowKeys].sort() },
    },
    scope: {
      relationshipDirectionsExamined: options.directions ?? ['OUTGOING', 'INCOMING'],
      categories: { ...ALL_REPRESENTED, ...options.categories },
      sharedIdentifierHolders: options.holders ?? {
        enumeration: 'EXHAUSTIVE_AS_DECLARED',
        bound: 20,
        holderSubjectIds: [uid(3)],
      },
    },
    protectionCheck: 'NOT_CONSULTED',
  };
}

/** What today's B2.2 loader would see: outgoing relationships only, so subject 4 never loads. */
function outgoingOnlyGraph(): IdentityGraphInput {
  const g = sourceGraph();
  return {
    ...g,
    subjects: g.subjects.filter((s) => s.id !== uid(4)),
    relationshipClaims: g.relationshipClaims.filter((r) => r.id !== uid(21)),
  };
}

/** An INDEPENDENT reference set over a graph: digests, findings and review heads from the graph itself. */
function referenceOf(
  g: IdentityGraphInput,
  attestations = [ATTESTATION_REF],
): SnapshotScopeReference {
  const p = produced(g, { attestationReferences: attestations });
  const eche = p.validation.echeRowKeyState!;
  const superseded = new Set(g.reviews.map((r) => r.supersedesReviewId));
  const targetKey = (r: (typeof g.reviews)[number]) =>
    r.reviewedSubjectId !== null
      ? `subject:${r.reviewedSubjectId}`
      : r.reviewedIdentityClaimId !== null
        ? `identity_claim:${r.reviewedIdentityClaimId}`
        : `relationship_claim:${r.reviewedRelationshipClaimId}`;
  return {
    records: [
      ...g.subjects.map((r) => ({ recordType: 'SUBJECT' as const, r })),
      ...g.identityClaims.map((r) => ({ recordType: 'IDENTITY_CLAIM' as const, r })),
      ...g.relationshipClaims.map((r) => ({ recordType: 'RELATIONSHIP_CLAIM' as const, r })),
      ...g.reviews.map((r) => ({ recordType: 'REVIEW' as const, r })),
      ...attestations.map((r) => ({ recordType: 'REVIEW_ATTESTATION_REFERENCE' as const, r })),
    ]
      .map(({ recordType, r }): SnapshotScopeReference['records'][number] => ({
        recordType,
        recordId: r.id,
        contentDigest: recordContentDigestOf(recordType, { ...r }),
      }))
      .concat([
        {
          recordType: 'SOURCE_GLOBAL',
          recordId: 'ECHE_ROW_KEY_EXISTENCE',
          contentDigest: recordContentDigestOf('SOURCE_GLOBAL', {
            key: 'ECHE_ROW_KEY_EXISTENCE',
            queriedKeys: [...eche.queriedKeys],
            presentKeys: [...eche.presentKeys],
          }),
        },
        {
          recordType: 'SOURCE_GLOBAL',
          recordId: 'VALIDATION_AS_OF',
          contentDigest: recordContentDigestOf('SOURCE_GLOBAL', {
            key: 'VALIDATION_AS_OF',
            asOf: g.asOf,
          }),
        },
      ]),
    findings: validateIdentityGraph(g).findings,
    reviewHeads: g.reviews
      .filter((r) => !superseded.has(r.id))
      .map((r) => ({ targetKey: targetKey(r), headReviewId: r.id })),
  };
}

// ------------------------------------------------------------------ injected adversarial helpers

/** INJECTED: a deep, mutable copy of a produced input for one adversarial edit. */
function injected(input: SnapshotScopeInput, edit: (x: Mutable<SnapshotScopeInput>) => void) {
  const copy = structuredClone(input) as Mutable<SnapshotScopeInput>;
  edit(copy);
  return copy as SnapshotScopeInput;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

function built(input: unknown, M: ManifestModule = RealManifest): SnapshotScopeManifest {
  const result = M.buildSnapshotScopeManifest(input);
  if (result.outcome !== 'BUILT') throw new Error(`refused: ${result.code} ${result.detail}`);
  return result.manifest;
}

function refusal(input: unknown, M: ManifestModule = RealManifest): string {
  const result = M.buildSnapshotScopeManifest(input);
  return result.outcome === 'REFUSED' ? result.code : 'BUILT';
}

const entryOf = (m: SnapshotScopeManifest, recordType: string, recordId: string) =>
  m.membership.entries.find((e) => e.recordType === recordType && e.recordId === recordId);

const BASE = deepFreeze(produced(sourceGraph()));

/** Rotates a list, so every order is exercised without randomness. */
const rotate = <T>(xs: readonly T[], n: number): T[] =>
  xs.length === 0 ? [] : [...xs.slice(n % xs.length), ...xs.slice(0, n % xs.length)];

// ------------------------------------------------------------------ tests

describe('B2.5-S0 manifest: a separate, provisional contract over producer-generated input', () => {
  it('names its own provisional contract, distinct from the B2.4 and I0 contracts', () => {
    expect(SNAPSHOT_SCOPE_CONTRACT).toBe(
      'nwf-pe.discovery-subject-snapshot-scope-manifest.s0-provisional',
    );
    expect(SNAPSHOT_SCOPE_CONTRACT).not.toBe(SUBJECT_EVIDENCE_CONTRACT);
    expect(SNAPSHOT_SCOPE_CONTRACT).not.toBe(I0_COMPAT_CONTRACT);
    expect(SNAPSHOT_SCOPE_CONTRACT).not.toContain('discovery-subject-evidence');
    const m = built(BASE);
    expect(m.contract).toBe(SNAPSHOT_SCOPE_CONTRACT);
    expect(m.contractStatus).toBe('B_LOCAL_PROVISIONAL_NOT_A_CROSS_TRACK_CONTRACT');
  });

  it('builds from the producer fixture, with real validator findings and every record bound', () => {
    const m = built(BASE);
    const g = sourceGraph();
    expect(m.membership.entries).toHaveLength(
      g.subjects.length +
        g.identityClaims.length +
        g.relationshipClaims.length +
        g.reviews.length +
        1 /* attestation reference */ +
        2 /* source globals */,
    );
    expect(m.validation.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(['SUBJECT_WITHOUT_NAME_CLAIM', 'SHARED_EXTERNAL_IDENTIFIER']),
    );
    expect(m.states).toEqual({
      shapeValidity: 'SHAPE_VALID',
      contentDigestConsistency: 'CONSISTENT',
      declaredScopeCoverage: 'GAPS_DECLARED',
      unresolvedSourceOmissions: 'NONE_DETECTED_IN_SUPPLIED_INPUT',
      sourceSnapshotVerification: 'NOT_VERIFIED',
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
    });
    // Protection is in the declared scope and is never consulted: a gap, always.
    expect(m.scope.declaredGaps).toEqual(['PROTECTION_STATUS']);
    expect(verifySnapshotScopeManifest(m).contentDigestConsistency).toBe('CONSISTENT');
    expect(reproduceSnapshotScopeManifest(BASE, m)).toBe('REPRODUCED');
    expect(compareSnapshotScopeWithReference(m, referenceOf(sourceGraph())).coverage).toBe(
      'CONSISTENT_WITH_SUPPLIED_REFERENCE',
    );
  });

  it('is side-effect-free: frozen input, repeated builds, byte-identical output', () => {
    const a = buildSnapshotScopeManifest(BASE);
    const b = buildSnapshotScopeManifest(BASE);
    expect(a.outcome).toBe('BUILT');
    expect(a).toEqual(b);
  });

  it('has no state member stronger than S0 can reach, and no overall "complete" state', () => {
    expect(STATES.sourceCompleteness).toEqual(['NOT_PROVEN']);
    expect(STATES.sourceFreshness).toEqual(['NOT_PROVEN']);
    expect(STATES.sourceSnapshotVerification).toEqual(['NOT_VERIFIED']);
    expect(STATES.exportAuthentication).toEqual(['UNAUTHENTICATED']);
    const text = JSON.stringify(built(BASE));
    expect(text).not.toMatch(
      /"COMPLETE"|"complete"|"isComplete"|"CLEAR"|"VERIFIED"|"AUTHENTICATED"/,
    );
  });
});

describe('B2.5-S0 (1-2) determinism and content binding', () => {
  it('(1) reordering every input collection changes nothing', () => {
    const canonical = buildSnapshotScopeManifest(BASE);
    for (let n = 1; n < 7; n += 1) {
      const shuffled = injected(BASE, (x) => {
        x.records.subjects = rotate(x.records.subjects, n);
        x.records.identityClaims = rotate(x.records.identityClaims, n).reverse();
        x.records.relationshipClaims = rotate(x.records.relationshipClaims, n);
        x.records.reviews = rotate(x.records.reviews, n).reverse();
        x.findings = rotate(x.findings, n).reverse();
        x.validation.echeRowKeyState!.queriedKeys = rotate(
          x.validation.echeRowKeyState!.queriedKeys,
          n,
        );
        x.validation.echeRowKeyState!.presentKeys = rotate(
          x.validation.echeRowKeyState!.presentKeys,
          n,
        ).reverse();
        x.scope.relationshipDirectionsExamined = rotate(x.scope.relationshipDirectionsExamined, n);
      });
      expect(buildSnapshotScopeManifest(shuffled), `rotation ${n}`).toEqual(canonical);
    }
  });

  it('(2) changing ANY committed field of ANY record changes its record digest and the manifest digest', () => {
    const base = built(BASE);
    const collections = [
      ['subjects', 'SUBJECT'],
      ['identityClaims', 'IDENTITY_CLAIM'],
      ['relationshipClaims', 'RELATIONSHIP_CLAIM'],
      ['reviews', 'REVIEW'],
      ['attestationReferences', 'REVIEW_ATTESTATION_REFERENCE'],
    ] as const;
    let fieldsChanged = 0;
    for (const [collection, recordType] of collections) {
      const records = BASE.records[collection] as readonly Record<string, string | null>[];
      records.forEach((record, index) => {
        for (const [field, value] of Object.entries(record)) {
          if (field === 'id') continue;
          let next: string | null;
          if (value === null) {
            // A null review target stays null (exactly one target), every other null gets a value.
            if (/^reviewed/.test(field) || field === 'targetSubjectId') continue;
            next = field === 'supersedesReviewId' ? uid(999) : 'changed-value';
          } else if (/^[0-9a-f]{8}-/.test(value)) next = uid(998);
          else if (/^[0-9a-f]{64}$/.test(value)) next = 'f'.repeat(64);
          else next = `${value}-changed`;
          const changed = injected(BASE, (x) => {
            const list = x.records[collection] as Record<string, string | null>[];
            list[index] = { ...list[index]!, [field]: next };
            // Weaker declarations, so a changed reference is an omission rather than a refusal.
            for (const c of [
              'REFERENCED_RECORDS',
              'REVIEW_RECORDS',
              'REVIEW_ATTESTATION_REFERENCES',
              'SHARED_IDENTIFIER_HOLDERS',
              'SOURCE_GLOBALS',
            ] as const) {
              x.scope.categories[c] = 'INCOMPLETE';
            }
            x.scope.sharedIdentifierHolders = {
              enumeration: 'UNKNOWN',
              bound: 20,
              holderSubjectIds: [],
            };
          });
          const m = built(changed);
          const id = record['id']!;
          expect(entryOf(m, recordType, id)!.contentDigest, `${recordType}.${field}`).not.toBe(
            entryOf(base, recordType, id)!.contentDigest,
          );
          expect(m.manifestDigest, `${recordType}.${field}`).not.toBe(base.manifestDigest);
          fieldsChanged += 1;
        }
      });
    }
    expect(fieldsChanged).toBeGreaterThan(60);
  });

  it('(2) changing a finding field or a source global changes the findings or global digest and the manifest', () => {
    const base = built(BASE);
    const finding = injected(BASE, (x) => {
      const f = x.findings[0] as Record<string, unknown>;
      f['field'] = 'changedField';
    });
    const mf = built(finding);
    expect(mf.validation.findingsDigest).not.toBe(base.validation.findingsDigest);
    expect(mf.manifestDigest).not.toBe(base.manifestDigest);
    const asOf = injected(BASE, (x) => {
      x.validation.asOf = '2026-10-15T12:00:01.000Z';
    });
    const ma = built(asOf);
    expect(entryOf(ma, 'SOURCE_GLOBAL', 'VALIDATION_AS_OF')!.contentDigest).not.toBe(
      entryOf(base, 'SOURCE_GLOBAL', 'VALIDATION_AS_OF')!.contentDigest,
    );
    expect(ma.manifestDigest).not.toBe(base.manifestDigest);
  });

  it('(2) changing the scope declaration or protection position changes the manifest digest', () => {
    const base = built(BASE);
    const weaker = built(
      injected(BASE, (x) => {
        x.scope.categories.FOCAL_IDENTITY_CLAIMS = 'INCOMPLETE';
      }),
    );
    expect(weaker.manifestDigest).not.toBe(base.manifestDigest);
    expect(weaker.membership.membershipDigest).toBe(base.membership.membershipDigest);
  });
});

describe('B2.5-S0 (3-5) omissions and identities', () => {
  it('(3) removing a record the INDEPENDENT reference holds fails coverage verification', () => {
    const removed = injected(BASE, (x) => {
      x.records.identityClaims = x.records.identityClaims.filter(
        (c) => (c as { id: string }).id !== uid(10),
      );
    });
    const m = built(removed);
    const result = compareSnapshotScopeWithReference(m, referenceOf(sourceGraph()));
    expect(result.coverage).toBe('DISCREPANCIES_FOUND');
    expect(result.discrepancies).toContainEqual({
      code: 'RECORD_MISSING_FROM_MANIFEST',
      ref: `IDENTITY_CLAIM:${uid(10)}`,
    });
    expect(result.sourceCompleteness).toBe('NOT_PROVEN');
  });

  it('(4) removing an unreferenced record WITHOUT a reference is not, and cannot be, detected', () => {
    const removed = injected(BASE, (x) => {
      x.records.identityClaims = x.records.identityClaims.filter(
        (c) => (c as { id: string }).id !== uid(12),
      );
    });
    const m = built(removed);
    // Nothing inside the supplied set points at the removed claim, so nothing can notice.
    expect(m.states.unresolvedSourceOmissions).toBe('NONE_DETECTED_IN_SUPPLIED_INPUT');
    expect(verifySnapshotScopeManifest(m).contentDigestConsistency).toBe('CONSISTENT');
    // ...and that is exactly why completeness stays unproven, never "complete".
    expect(m.states.sourceCompleteness).toBe('NOT_PROVEN');
    expect(m.limitations.membership).toBe('SUPPLIED_SET_ONLY_NOT_EVERY_RELEVANT_DATABASE_RECORD');
  });

  it('(4) removing a REFERENCED record is an explicit omission, and refused under a REPRESENTED claim', () => {
    const drop = (x: Mutable<SnapshotScopeInput>) => {
      x.records.subjects = x.records.subjects.filter((s) => (s as { id: string }).id !== uid(2));
    };
    expect(refusal(injected(BASE, drop))).toBe('SCOPE_DECLARATION_INCONSISTENT');
    const m = built(
      injected(BASE, (x) => {
        drop(x);
        x.scope.categories.REFERENCED_RECORDS = 'INCOMPLETE';
      }),
    );
    expect(m.omissions).toContainEqual({
      code: 'RELATIONSHIP_TARGET_SUBJECT_NOT_SUPPLIED',
      ref: uid(20),
    });
    expect(m.states.unresolvedSourceOmissions).toBe('PRESENT');
  });

  it('(5) duplicate record identities are refused, identical or conflicting, within or across types', () => {
    const subjects = BASE.records.subjects;
    expect(
      refusal(
        injected(BASE, (x) => {
          x.records.subjects = [...subjects, subjects[0]!] as never;
        }),
      ),
    ).toBe('DUPLICATE_RECORD_IDENTITY');
    expect(
      refusal(
        injected(BASE, (x) => {
          x.records.subjects = [
            ...subjects,
            { ...(subjects[0] as object), registrationNote: 'a second version' },
          ] as never;
        }),
      ),
    ).toBe('CONFLICTING_RECORD_ENTRY');
    expect(
      refusal(
        injected(BASE, (x) => {
          const claim = x.records.identityClaims[0] as Record<string, unknown>;
          x.records.attestationReferences = [{ ...ATTESTATION_REF, id: claim['id'] as string }];
        }),
      ),
    ).toBe('CONFLICTING_RECORD_ENTRY');
    expect(
      refusal(
        injected(BASE, (x) => {
          x.scope.sharedIdentifierHolders.holderSubjectIds = [uid(3), uid(3)];
        }),
      ),
    ).toBe('SCOPE_DECLARATION_INCONSISTENT');
  });

  it('refuses malformed and unknown shapes rather than repairing them', () => {
    expect(refusal(injected(BASE, (x) => void (x.contract = 'nwf-pe.other')))).toBe(
      'CONTRACT_UNKNOWN',
    );
    expect(
      refusal(
        injected(BASE, (x) => {
          (x.records.subjects[0] as Record<string, unknown>)['extra'] = null;
        }),
      ),
    ).toBe('RECORD_SHAPE_UNSUPPORTED');
    expect(
      refusal(
        injected(BASE, (x) => {
          (x.findings[0] as Record<string, unknown>)['origin'] = 'X';
        }),
      ),
    ).toBe('FINDING_SHAPE_UNSUPPORTED');
    expect(
      refusal(
        injected(BASE, (x) => {
          x.validation.echeRowKeyState!.presentKeys = ['NOT QUERIED|1'];
        }),
      ),
    ).toBe('SOURCE_GLOBAL_SHAPE_UNSUPPORTED');
    expect(
      refusal(
        injected(BASE, (x) => {
          x.records.subjects = x.records.subjects.filter(
            (s) => (s as { id: string }).id !== uid(1),
          );
        }),
      ),
    ).toBe('FOCAL_SUBJECT_MISSING');
  });
});

describe('B2.5-S0 (6-8) relationship directions, parentage and bounded enumerations', () => {
  it('(6) outgoing-only coverage cannot be relabelled as bidirectional', () => {
    const outgoingOnly = produced(outgoingOnlyGraph(), {
      directions: ['OUTGOING'],
      categories: { INCOMING_RELATIONSHIP_CLAIMS: 'UNKNOWN' },
    });
    const m = built(outgoingOnly);
    expect(m.scope.relationshipDirectionCoverage).toBe('OUTGOING_ONLY');
    expect(m.scope.declaredGaps).toContain('INCOMING_RELATIONSHIP_CLAIMS');
    expect(m.validation.unavailableInputs).toContain('INCOMING_RELATIONSHIP_CLAIMS');
    // Relabelled: INCOMING declared REPRESENTED, but the direction was never examined.
    expect(
      refusal(
        injected(outgoingOnly, (x) => {
          x.scope.categories.INCOMING_RELATIONSHIP_CLAIMS = 'REPRESENTED';
        }),
      ),
    ).toBe('SCOPE_DECLARATION_INCONSISTENT');
    // An incidentally supplied incoming record does not upgrade an unexamined direction either.
    const incidental = built(
      injected(outgoingOnly, (x) => {
        x.records.subjects = [...x.records.subjects, subject(4)];
        x.records.relationshipClaims = [
          ...x.records.relationshipClaims,
          relation(21, 4, 'AFFILIATED_WITH', { subject: 1 }),
        ];
      }),
    );
    expect(incidental.scope.relationshipDirectionCoverage).toBe('OUTGOING_ONLY');
    expect(entryOf(incidental, 'RELATIONSHIP_CLAIM', uid(21))!.roles).toEqual([
      'INCOMING_RELATIONSHIP',
    ]);
    // And BOTH examined is still a declaration about the supplied set, never source completeness.
    const both = built(BASE);
    expect(both.scope.relationshipDirectionCoverage).toBe('BOTH_DIRECTIONS_EXAMINED_AS_DECLARED');
    expect(both.states.sourceCompleteness).toBe('NOT_PROVEN');
  });

  it('(7) empty relationship collections keep parentage UNKNOWN and never infer independence', () => {
    const lone = produced(
      graph({ subjects: [subject(1)], identityClaims: [nameClaim(10, 1, 'Synthetic Lone Club')] }),
      {
        attestationReferences: [],
        holders: { enumeration: 'EXHAUSTIVE_AS_DECLARED', bound: 20, holderSubjectIds: [] },
      },
    );
    const m = built(lone);
    expect(m.scope.parentage).toEqual({
      transitive: 'UNKNOWN',
      direct: 'NO_PART_OF_CLAIM_SUPPLIED_UNKNOWN',
      independentOf: 'NEVER_INFERRED_FROM_ABSENCE',
      legalIndependence: 'UNKNOWN',
    });
    expect(JSON.stringify(m)).not.toMatch(/INDEPENDENT_OF"|NO_PARENT"|"ROOT"|SELF_STANDING"/);
    expect(m.limitations.absentRelationship).toBe('NOT_EVIDENCE_OF_NO_PARENT_OR_INDEPENDENCE');
    // A supplied PART_OF claim is supplied, not verified - and transitive parentage stays unknown.
    expect(built(BASE).scope.parentage.direct).toBe('PART_OF_CLAIM_SUPPLIED_UNVERIFIED');
    expect(built(BASE).scope.parentage.transitive).toBe('UNKNOWN');
  });

  it('(8) a shared-identifier enumeration that reached its bound cannot be exhaustive', () => {
    // The B2.2 store reads holders with LIMIT 20 and no +1: twenty rows cannot tell "all" from "more".
    const holders = Array.from({ length: 20 }, (_, i) => 100 + i);
    const g = sourceGraph({
      subjects: [...sourceGraph().subjects, ...holders.map((n) => subject(n))],
      identityClaims: [
        ...sourceGraph().identityClaims,
        ...holders.map((n) => identifierClaim(n + 100, n, 'EU_PIC', PIC)),
      ],
    });
    const atBound = produced(g, {
      holders: {
        enumeration: 'EXHAUSTIVE_AS_DECLARED',
        bound: 20,
        holderSubjectIds: holders
          .slice(0, 19)
          .map(uid)
          .concat([uid(3)]),
      },
      categories: { SHARED_IDENTIFIER_HOLDERS: 'INCOMPLETE' },
    });
    expect(refusal(atBound)).toBe('ENUMERATION_NOT_EXHAUSTIVE');
    // Declared truncated: accepted, but an explicit omission and never REPRESENTED.
    const truncated = injected(atBound, (x) => {
      x.scope.sharedIdentifierHolders.enumeration = 'TRUNCATED';
      x.records.subjects = x.records.subjects.filter((s) => (s as { id: string }).id !== uid(119));
      x.records.identityClaims = x.records.identityClaims.filter(
        (c) => (c as { subjectId: string }).subjectId !== uid(119),
      );
      x.findings = [];
      x.scope.categories.NEIGHBOUR_RECORD_FINDINGS = 'INCOMPLETE';
      x.scope.categories.RECORD_SCOPED_FINDINGS = 'INCOMPLETE';
      x.scope.categories.INPUT_SCOPED_FINDINGS = 'INCOMPLETE';
    });
    const m = built(truncated);
    expect(m.omissions).toContainEqual({
      code: 'SHARED_IDENTIFIER_HOLDER_ENUMERATION_TRUNCATED',
      ref: uid(1),
    });
    expect(m.scope.declaredGaps).toContain('SHARED_IDENTIFIER_HOLDERS');
    expect(
      refusal(
        injected(truncated, (x) => {
          x.scope.categories.SHARED_IDENTIFIER_HOLDERS = 'REPRESENTED';
        }),
      ),
    ).toBe('SCOPE_DECLARATION_INCONSISTENT');
    // A supplied holder left out of an "exhaustive" list is a contradiction, not a sample.
    expect(
      refusal(
        injected(BASE, (x) => {
          x.scope.sharedIdentifierHolders.holderSubjectIds = [];
        }),
      ),
    ).toBe('SCOPE_DECLARATION_INCONSISTENT');
  });
});

describe('B2.5-S0 (9-10) validation coverage', () => {
  /** PRODUCER: the real validator reports ECHE_ROW_KEY_INVALID about the input as a whole. */
  const badKeys = () => sourceGraph({ knownEcheRowKeys: [ECHE_ALPHA, 'not an eche key'] });

  it('the producer fixture really carries an input-scoped INVALID finding', () => {
    const m = built(produced(badKeys()));
    expect(m.validation.findings).toContainEqual(
      expect.objectContaining({
        severity: 'INVALID',
        code: 'ECHE_ROW_KEY_INVALID',
        recordId: 'input',
        scope: 'INPUT',
        partition: 'INPUT',
      }),
    );
  });

  it('(9) an input-scoped INVALID finding cannot disappear while coverage stays consistent', () => {
    const dropped = injected(produced(badKeys()), (x) => {
      x.findings = x.findings.filter((f) => (f as { recordId: string }).recordId !== 'input');
    });
    const m = built(dropped);
    // The manifest makes no claim of its own that validation was complete...
    expect(m.validation.executionVerification).toBe('NOT_VERIFIED');
    expect(m.limitations.emptyFindings).toBe(
      'NOT_PROOF_THAT_VALIDATORS_RAN_OVER_COMPLETE_SOURCE_DATA',
    );
    // ...the findings digest moved, and the independent reference catches the drop.
    expect(m.validation.findingsDigest).not.toBe(
      built(produced(badKeys())).validation.findingsDigest,
    );
    const result = compareSnapshotScopeWithReference(m, referenceOf(badKeys()));
    expect(result.coverage).toBe('DISCREPANCIES_FOUND');
    expect(result.discrepancies.map((d) => d.code)).toContain('FINDING_MISSING_FROM_MANIFEST');
    // And input-scoped coverage cannot be claimed without the inputs those findings depend on.
    expect(
      refusal(
        injected(dropped, (x) => {
          x.validation.echeRowKeyState = null;
          x.scope.categories.SOURCE_GLOBALS = 'INCOMPLETE';
          x.scope.categories.VALIDATION_INPUTS = 'INCOMPLETE';
        }),
      ),
    ).toBe('SCOPE_DECLARATION_INCONSISTENT');
  });

  it('(9) an empty findings list is never proof that the validator ran', () => {
    const notRun = injected(BASE, (x) => {
      x.findings = [];
      x.validation.execution = 'UNKNOWN';
      for (const c of [
        'RECORD_SCOPED_FINDINGS',
        'INPUT_SCOPED_FINDINGS',
        'NEIGHBOUR_RECORD_FINDINGS',
      ] as const) {
        x.scope.categories[c] = 'UNKNOWN';
      }
    });
    const m = built(notRun);
    expect(m.validation.findings).toEqual([]);
    expect(m.validation.findingCoverage).toEqual({
      recordScoped: 'UNKNOWN',
      inputScoped: 'UNKNOWN',
      neighbourRecords: 'UNKNOWN',
    });
    // Claiming coverage with no stated validator run is refused.
    expect(
      refusal(
        injected(notRun, (x) => {
          x.scope.categories.RECORD_SCOPED_FINDINGS = 'REPRESENTED';
        }),
      ),
    ).toBe('SCOPE_DECLARATION_INCONSISTENT');
    // Findings that claim to come from a validator that did not run are refused.
    expect(
      refusal(
        injected(BASE, (x) => {
          x.validation.execution = 'NOT_RUN';
          x.scope.categories.RECORD_SCOPED_FINDINGS = 'UNKNOWN';
          x.scope.categories.INPUT_SCOPED_FINDINGS = 'UNKNOWN';
          x.scope.categories.NEIGHBOUR_RECORD_FINDINGS = 'UNKNOWN';
        }),
      ),
    ).toBe('SCOPE_DECLARATION_INCONSISTENT');
  });

  it('(10) neighbour findings stay partitioned as NEIGHBOUR and cannot be ignored when evaluated', () => {
    const m = built(BASE);
    const neighbour = m.validation.findings.find((f) => f.code === 'SUBJECT_WITHOUT_NAME_CLAIM');
    expect(neighbour).toMatchObject({ recordId: uid(4), partition: 'NEIGHBOUR_RECORD' });
    // A producer that keeps only focal findings (B2.2's read-model inScope filter) while
    // declaring neighbour findings evaluated is caught by the independent reference.
    const focalOnly = injected(BASE, (x) => {
      x.findings = x.findings.filter((f) => {
        const { recordId, subjectId } = f as { recordId: string; subjectId: string | null };
        return recordId === 'input' || subjectId === uid(1) || recordId === uid(1);
      });
    });
    const narrowed = built(focalOnly);
    expect(narrowed.validation.findingCoverage.neighbourRecords).toBe('REPRESENTED');
    const result = compareSnapshotScopeWithReference(narrowed, referenceOf(sourceGraph()));
    expect(result.discrepancies).toContainEqual(
      expect.objectContaining({ code: 'FINDING_MISSING_FROM_MANIFEST' }),
    );
    // A finding about a record outside the supplied set is an explicit omission, never dropped.
    const stray = built(
      injected(BASE, (x) => {
        x.findings = [
          ...x.findings,
          {
            severity: 'UNRESOLVED',
            code: 'SUBJECT_WITHOUT_NAME_CLAIM',
            recordId: uid(77),
            subjectId: uid(77),
            field: null,
          },
        ];
        x.scope.categories.REFERENCED_RECORDS = 'INCOMPLETE';
      }),
    );
    expect(stray.validation.findings).toContainEqual(
      expect.objectContaining({ recordId: uid(77), partition: 'UNSUPPLIED_RECORD' }),
    );
    expect(stray.omissions).toContainEqual({ code: 'FINDING_RECORD_NOT_SUPPLIED', ref: uid(77) });
  });
});

describe('B2.5-S0 (11-12) review coverage', () => {
  it('(11) an internally consistent supplied chain is not proof of the latest review', () => {
    const m = built(BASE);
    const chain = m.reviews.chains.find((c) => c.targetKey === `subject:${uid(1)}`)!;
    expect(chain).toMatchObject({
      internal: 'INTERNALLY_CONSISTENT',
      headReviewId: uid(31),
      sourceTail: 'UNKNOWN',
    });
    expect(m.reviews.latestReview).toBe('NOT_PROVEN');
    // The source holds a LATER review (32 supersedes 31) that was never supplied.
    const later = sourceGraph({
      reviews: [
        ...sourceGraph().reviews,
        review(32, { subject: 1 }, 'DISPUTED', {
          supersedes: 31,
          at: '2026-10-12T10:00:00.000Z',
        }),
      ],
    });
    const result = compareSnapshotScopeWithReference(m, referenceOf(later));
    expect(result.discrepancies).toContainEqual({
      code: 'REVIEW_HEAD_DIFFERS',
      ref: `subject:${uid(1)}`,
    });
    expect(result.reviewTails).toContainEqual({
      targetKey: `subject:${uid(1)}`,
      sourceTail: 'DIFFERS_FROM_SUPPLIED_REFERENCE',
    });
    expect(result.referenceIndependence).toBe('CALLER_ASSERTED_NOT_PROVEN');
  });

  it('(12) an unknown review tail stays unknown; a broken chain is represented, never repaired', () => {
    const m = built(BASE);
    for (const chain of m.reviews.chains) expect(chain.sourceTail).toBe('UNKNOWN');
    // No reference for the chain: the comparison says so, it does not guess.
    const ref = { ...referenceOf(sourceGraph()), reviewHeads: [] };
    expect(compareSnapshotScopeWithReference(m, ref).reviewTails).toEqual([
      { targetKey: `subject:${uid(1)}`, sourceTail: 'NOT_IN_SUPPLIED_REFERENCE' },
    ]);
    // A forked chain (two reviews superseding 30) is INTERNALLY_INCONSISTENT with no head.
    const forked = built(
      injected(BASE, (x) => {
        x.records.reviews = [
          ...x.records.reviews,
          review(33, { subject: 1 }, 'DISPUTED', { supersedes: 30, at: LATER }),
        ];
        x.findings = [
          ...validateIdentityGraph(
            sourceGraph({
              reviews: [
                ...sourceGraph().reviews,
                review(33, { subject: 1 }, 'DISPUTED', { supersedes: 30, at: LATER }),
              ],
            }),
          ).findings,
        ];
      }),
    );
    const chain = forked.reviews.chains.find((c) => c.targetKey === `subject:${uid(1)}`)!;
    expect(chain.internal).toBe('INTERNALLY_INCONSISTENT');
    expect(chain.headReviewId).toBeNull();
    expect(chain.issues).toEqual(expect.arrayContaining(['CHAIN_FORKED', 'NO_SINGLE_HEAD']));
    // Attestation references are references only: no signature verified, no reviewer trusted.
    expect(m.reviews.attestationReferences).toEqual([
      {
        attestationId: uid(40),
        reviewId: uid(31),
        reviewSupplied: true,
        signatureVerification: 'NOT_PERFORMED',
        reviewerTrust: 'NONE_ESTABLISHED',
      },
    ]);
  });
});

// ------------------------------------------------------------------ R1: reference review heads

const FOCAL_TARGET = `subject:${uid(1)}`;

/** A source whose subject-1 chain forks: 31 and 33 both supersede 30, so it has no head. */
function forkedGraph(): IdentityGraphInput {
  return sourceGraph({
    reviews: [
      ...sourceGraph().reviews,
      review(33, { subject: 1 }, 'DISPUTED', { supersedes: 30, at: LATER }),
    ],
  });
}

/** A source with three linear chains on distinct targets: subject 1, claim 10, relationship 20. */
function threeChainGraph(): IdentityGraphInput {
  return sourceGraph({
    reviews: [
      ...sourceGraph().reviews,
      review(34, { identityClaim: 10 }, 'CONFIRMED'),
      review(35, { relationshipClaim: 20 }, 'CONFIRMED'),
    ],
  });
}

/** The independent reference over `g`, with its review heads replaced. */
const withHeads = (g: IdentityGraphInput, reviewHeads: unknown): SnapshotScopeReference => ({
  ...referenceOf(g),
  reviewHeads: reviewHeads as SnapshotScopeReference['reviewHeads'],
});

/** A comparison outcome, or the refusal it raised - `THREW` for anything unstructured. */
function compared(
  m: SnapshotScopeManifest,
  reference: SnapshotScopeReference,
  M: ManifestModule = RealManifest,
): string {
  try {
    const result = M.compareSnapshotScopeWithReference(m, reference);
    const tail = result.reviewTails.find((t) => t.targetKey === FOCAL_TARGET)?.sourceTail;
    return `${result.coverage}/${tail ?? 'NO_TAIL'}`;
  } catch (error) {
    // By name and code, not `instanceof`: a mutant module may own its own class.
    const e = error as { name?: string; code?: string };
    return e.name === 'SnapshotScopeRefusal' ? `REFUSED:${e.code}` : 'THREW';
  }
}

const MATCHES = 'CONSISTENT_WITH_SUPPLIED_REFERENCE/MATCHES_SUPPLIED_REFERENCE';
const DIFFERS = 'DISCREPANCIES_FOUND/DIFFERS_FROM_SUPPLIED_REFERENCE';

describe('B2.5-S0-R1 reference review heads are validated before they are compared', () => {
  const linear = () => built(BASE);
  const forked = () => built(produced(forkedGraph()));

  it('(R1-1) a target repeated with different heads is refused in either order', () => {
    const m = linear();
    for (const heads of [
      [uid(99), uid(31)],
      [uid(31), uid(99)],
    ]) {
      const ref = withHeads(
        sourceGraph(),
        heads.map((h) => ({ targetKey: FOCAL_TARGET, headReviewId: h })),
      );
      expect(compared(m, ref)).toBe('REFUSED:DUPLICATE_RECORD_IDENTITY');
    }
  });

  it('(R1-2) a target repeated with the SAME head is still refused', () => {
    const entry = { targetKey: FOCAL_TARGET, headReviewId: uid(31) };
    expect(compared(linear(), withHeads(sourceGraph(), [entry, { ...entry }]))).toBe(
      'REFUSED:DUPLICATE_RECORD_IDENTITY',
    );
  });

  it('(R1-3) a null or malformed head is refused and cannot make a forked chain match', () => {
    const m = forked();
    const chain = m.reviews.chains.find((c) => c.targetKey === FOCAL_TARGET)!;
    expect(chain).toMatchObject({ internal: 'INTERNALLY_INCONSISTENT', headReviewId: null });
    for (const headReviewId of [null, undefined, '', 31, uid(31).toUpperCase(), `{${uid(31)}}`]) {
      const ref = withHeads(forkedGraph(), [{ targetKey: FOCAL_TARGET, headReviewId }]);
      expect(compared(m, ref), String(headReviewId)).toBe('REFUSED:INPUT_SHAPE_UNSUPPORTED');
    }
  });

  it('(R1-4) a null, array or primitive entry is a structured refusal, never a TypeError', () => {
    for (const entry of [null, undefined, [FOCAL_TARGET, uid(31)], 'subject', 7]) {
      expect(compared(linear(), withHeads(sourceGraph(), [entry])), String(entry)).toBe(
        'REFUSED:INPUT_SHAPE_UNSUPPORTED',
      );
    }
  });

  it('(R1-5) a supplied non-list collection is a structured refusal', () => {
    const one = { targetKey: FOCAL_TARGET, headReviewId: uid(31) };
    for (const collection of [null, one, { 0: one, length: 1 }, 'subject', 1]) {
      expect(compared(linear(), withHeads(sourceGraph(), collection))).toBe(
        'REFUSED:INPUT_SHAPE_UNSUPPORTED',
      );
    }
  });

  it('(R1-6) a target key outside the B2.1 review-target form is refused', () => {
    for (const targetKey of [
      uid(1),
      `Subject:${uid(1)}`,
      `subject:${uid(0xabc).toUpperCase()}`,
      `subject: ${uid(1)}`,
      `subject:${uid(1)} `,
      `review:${uid(1)}`,
      `cand:${uid(1)}`,
      `subject:${uid(1)}:${uid(2)}`,
      `subject_identity_claim:${uid(1)}`,
      'subject:',
      null,
      1,
    ]) {
      const ref = withHeads(sourceGraph(), [{ targetKey, headReviewId: uid(31) }]);
      expect(compared(linear(), ref), String(targetKey)).toBe('REFUSED:INPUT_SHAPE_UNSUPPORTED');
    }
  });

  it('(R1-7) unknown or missing entry fields are refused', () => {
    for (const entry of [
      { targetKey: FOCAL_TARGET },
      { headReviewId: uid(31) },
      {},
      { targetKey: FOCAL_TARGET, headReviewId: uid(31), reviewOutcome: 'CONFIRMED' },
      { targetKey: FOCAL_TARGET, headReviewId: uid(31), latest: true },
      Object.assign(Object.create({ inherited: 1 }) as object, {
        targetKey: FOCAL_TARGET,
        headReviewId: uid(31),
      }),
    ]) {
      expect(compared(linear(), withHeads(sourceGraph(), [entry]))).toBe(
        'REFUSED:INPUT_SHAPE_UNSUPPORTED',
      );
    }
  });

  it('(R1-8) a well-formed matching reference still matches, and stays caller-asserted', () => {
    const m = linear();
    const result = compareSnapshotScopeWithReference(m, referenceOf(sourceGraph()));
    expect(compared(m, referenceOf(sourceGraph()))).toBe(MATCHES);
    expect(result.discrepancies).toEqual([]);
    expect(result.referenceIndependence).toBe('CALLER_ASSERTED_NOT_PROVEN');
  });

  it('(R1-9) a well-formed reference with a different head still reports the discrepancy', () => {
    const ref = withHeads(sourceGraph(), [{ targetKey: FOCAL_TARGET, headReviewId: uid(99) }]);
    const result = compareSnapshotScopeWithReference(linear(), ref);
    expect(compared(linear(), ref)).toBe(DIFFERS);
    expect(result.discrepancies).toEqual([{ code: 'REVIEW_HEAD_DIFFERS', ref: FOCAL_TARGET }]);
  });

  it('(R1-10) no well-formed head makes a forked chain match', () => {
    const m = forked();
    // Each forked tip, the shared root, and an unrelated id: every one differs from "no head".
    for (const head of [uid(30), uid(31), uid(33), uid(99)]) {
      const ref = withHeads(forkedGraph(), [{ targetKey: FOCAL_TARGET, headReviewId: head }]);
      expect(compared(m, ref), head).toBe(DIFFERS);
    }
    // A reference built honestly over the forked source names two heads for one target.
    expect(compared(m, referenceOf(forkedGraph()))).toBe('REFUSED:DUPLICATE_RECORD_IDENTITY');
    expect(m.reviews.chains.find((c) => c.targetKey === FOCAL_TARGET)!.internal).toBe(
      'INTERNALLY_INCONSISTENT',
    );
  });

  it('(R1-11) permuting reference heads over distinct targets changes nothing', () => {
    const g = threeChainGraph();
    const m = built(produced(g));
    expect(m.reviews.chains).toHaveLength(3);
    const heads = [
      { targetKey: FOCAL_TARGET, headReviewId: uid(31) },
      { targetKey: `identity_claim:${uid(10)}`, headReviewId: uid(34) },
      { targetKey: `relationship_claim:${uid(20)}`, headReviewId: uid(99) },
    ];
    const outcomes = new Set<string>();
    for (let n = 0; n < heads.length; n += 1) {
      for (const order of [rotate(heads, n), rotate(heads, n).reverse()]) {
        outcomes.add(JSON.stringify(compareSnapshotScopeWithReference(m, withHeads(g, order))));
      }
    }
    expect(outcomes.size).toBe(1);
    const result = compareSnapshotScopeWithReference(m, withHeads(g, heads));
    expect(result.discrepancies).toEqual([
      { code: 'REVIEW_HEAD_DIFFERS', ref: `relationship_claim:${uid(20)}` },
    ]);
  });

  it('(R1-12) an empty list stays untrusted; an omitted one is refused, not read as empty', () => {
    const m = linear();
    const result = compareSnapshotScopeWithReference(m, withHeads(sourceGraph(), []));
    expect(result.reviewTails).toEqual([
      { targetKey: FOCAL_TARGET, sourceTail: 'NOT_IN_SUPPLIED_REFERENCE' },
    ]);
    expect(m.reviews.latestReview).toBe('NOT_PROVEN');
    expect(m.reviews.chains.every((c) => c.sourceTail === 'UNKNOWN')).toBe(true);
    const { records, findings } = referenceOf(sourceGraph());
    expect(compared(m, { records, findings } as unknown as SnapshotScopeReference)).toBe(
      'REFUSED:INPUT_SHAPE_UNSUPPORTED',
    );
  });

  it('(R1-13) no comparison, however consistent, promotes any unproven state', () => {
    const unproven = {
      referenceIndependence: 'CALLER_ASSERTED_NOT_PROVEN',
      sourceSnapshotVerification: 'NOT_VERIFIED',
      sourceCompleteness: 'NOT_PROVEN',
      sourceFreshness: 'NOT_PROVEN',
      exportAuthentication: 'UNAUTHENTICATED',
    };
    const cases: [SnapshotScopeManifest, SnapshotScopeReference][] = [
      [linear(), referenceOf(sourceGraph())],
      [linear(), withHeads(sourceGraph(), [])],
      [linear(), withHeads(sourceGraph(), [{ targetKey: FOCAL_TARGET, headReviewId: uid(99) }])],
      [forked(), withHeads(forkedGraph(), [{ targetKey: FOCAL_TARGET, headReviewId: uid(31) }])],
    ];
    for (const [m, ref] of cases) {
      expect(compareSnapshotScopeWithReference(m, ref)).toMatchObject(unproven);
      expect(m.reviews.latestReview).toBe('NOT_PROVEN');
      expect(m.states).toMatchObject({
        sourceSnapshotVerification: 'NOT_VERIFIED',
        sourceCompleteness: 'NOT_PROVEN',
        sourceFreshness: 'NOT_PROVEN',
        exportAuthentication: 'UNAUTHENTICATED',
      });
    }
  });
});

describe('B2.5-S0 (13-16) globals, protection and forgeries', () => {
  it('(13) supplied validation globals are content-bound', () => {
    const base = built(BASE);
    const changed = built(
      injected(BASE, (x) => {
        x.validation.echeRowKeyState!.presentKeys = [];
      }),
    );
    expect(entryOf(changed, 'SOURCE_GLOBAL', 'ECHE_ROW_KEY_EXISTENCE')!.contentDigest).not.toBe(
      entryOf(base, 'SOURCE_GLOBAL', 'ECHE_ROW_KEY_EXISTENCE')!.contentDigest,
    );
    expect(changed.manifestDigest).not.toBe(base.manifestDigest);
    expect(base.validation.sourceGlobals.map((g) => g.retrieval)).toEqual([
      'SUPPLIED_NOT_PROVEN_COMPLETELY_RETRIEVED',
      'SUPPLIED_NOT_PROVEN_COMPLETELY_RETRIEVED',
    ]);
    // An ECHE target whose state was never queried is an omission, and refused under REPRESENTED.
    const unqueried = injected(BASE, (x) => {
      x.validation.echeRowKeyState = { queriedKeys: [], presentKeys: [] };
    });
    expect(refusal(unqueried)).toBe('SCOPE_DECLARATION_INCONSISTENT');
    const m = built(
      injected(unqueried, (x) => {
        x.scope.categories.SOURCE_GLOBALS = 'INCOMPLETE';
      }),
    );
    expect(m.omissions).toContainEqual({ code: 'ECHE_ROW_KEY_STATE_NOT_SUPPLIED', ref: uid(22) });
  });

  it('(14) a falsified source global is invisible without an independent reference, visible with one', () => {
    const falsified = injected(BASE, (x) => {
      x.validation.echeRowKeyState!.presentKeys = x.validation.echeRowKeyState!.queriedKeys.filter(
        (k) => k !== ECHE_ALPHA,
      );
    });
    const m = built(falsified);
    expect(verifySnapshotScopeManifest(m).contentDigestConsistency).toBe('CONSISTENT');
    expect(reproduceSnapshotScopeManifest(falsified, m)).toBe('REPRODUCED');
    expect(m.states.unresolvedSourceOmissions).toBe('NONE_DETECTED_IN_SUPPLIED_INPUT');
    const result = compareSnapshotScopeWithReference(m, referenceOf(sourceGraph()));
    expect(result.discrepancies).toContainEqual({
      code: 'SOURCE_GLOBAL_DIFFERS',
      ref: 'SOURCE_GLOBAL:ECHE_ROW_KEY_EXISTENCE',
    });
  });

  it('(15) protection stays NOT_CONSULTED / UNKNOWN; nothing else is accepted', () => {
    const m = built(BASE);
    expect(m.protection).toEqual({ check: 'NOT_CONSULTED', verdict: 'UNKNOWN' });
    expect(m.validation.unavailableInputs).toContain('PROTECTED_COHORT_REGISTRY');
    for (const status of ['CLEAR', 'CONSULTED', 'PROTECTED', 'NOT_PROTECTED', '']) {
      expect(refusal(injected(BASE, (x) => void (x.protectionCheck = status)))).toBe(
        'PROTECTION_STATUS_UNSUPPORTED',
      );
    }
    for (const declared of ['REPRESENTED', 'INCOMPLETE'] as const) {
      expect(
        refusal(
          injected(BASE, (x) => {
            x.scope.categories.PROTECTION_STATUS = declared;
          }),
        ),
      ).toBe('PROTECTION_STATUS_UNSUPPORTED');
    }
  });

  it('(16) a forged manifest with every digest recomputed is consistent - and still unauthenticated', () => {
    const original = built(BASE);
    const forged = structuredClone(original) as Mutable<SnapshotScopeManifest>;
    // Forge: hide the neighbour finding and claim no gap, then recompute every digest.
    forged.validation.findings = forged.validation.findings.filter(
      (f) => f.partition !== 'NEIGHBOUR_RECORD',
    );
    forged.validation.findingsDigest = findingsDigestOf(forged.validation.findings);
    forged.scope.declaredGaps = [];
    forged.states.declaredScopeCoverage = 'NO_GAP_DECLARED_OVER_SUPPLIED_INPUT';
    forged.membership.entries = forged.membership.entries.filter((e) => e.recordId !== uid(12));
    forged.membership.membershipDigest = membershipDigestOf(forged.membership.entries);
    const { manifestDigest: _drop, ...body } = forged;
    void _drop;
    forged.manifestDigest = manifestDigestOfBody(body as SnapshotScopeManifestBody);
    const verdict = verifySnapshotScopeManifest(forged);
    expect(verdict.contentDigestConsistency).toBe('CONSISTENT');
    expect(verdict.exportAuthentication).toBe('UNAUTHENTICATED');
    expect(verdict.sourceCompleteness).toBe('NOT_PROVEN');
    // Reproduction from the real input and the independent reference both expose it.
    expect(reproduceSnapshotScopeManifest(BASE, forged as SnapshotScopeManifest)).toBe(
      'NOT_REPRODUCED',
    );
    expect(
      compareSnapshotScopeWithReference(forged as SnapshotScopeManifest, referenceOf(sourceGraph()))
        .coverage,
    ).toBe('DISCREPANCIES_FOUND');
    // An edit WITHOUT recomputation is caught by the digests alone.
    const lazy = structuredClone(original) as Mutable<SnapshotScopeManifest>;
    lazy.protection.verdict = 'CLEAR' as never;
    expect(verifySnapshotScopeManifest(lazy).contentDigestConsistency).toBe('INCONSISTENT');
    // A forged "authenticated" state is refused even when the digest is recomputed.
    const upgraded = structuredClone(original) as Mutable<SnapshotScopeManifest>;
    upgraded.states.exportAuthentication = 'AUTHENTICATED' as never;
    const { manifestDigest: _d2, ...b2 } = upgraded;
    void _d2;
    upgraded.manifestDigest = manifestDigestOfBody(b2 as SnapshotScopeManifestBody);
    const v2 = verifySnapshotScopeManifest(upgraded);
    expect(v2.contentDigestConsistency).toBe('INCONSISTENT');
    expect(v2.inconsistencies).toContain('states.exportAuthentication');
    expect(v2.exportAuthentication).toBe('UNAUTHENTICATED');
  });
});

describe('B2.5-S0 (17-18) no identifier, no permission', () => {
  it('(17) issues no cand:/chn:/opp: identifier and refuses records that carry one', () => {
    expect(JSON.stringify(built(BASE))).not.toMatch(/"(cand|chn|opp):/i);
    expect(built(BASE).canonicalIssuer).toEqual({
      producerMayIssue: 'NONE',
      identifiersIssuedHere: 'NONE',
    });
    for (const prefix of ['cand', 'chn', 'opp', 'OPP']) {
      expect(
        refusal(
          injected(BASE, (x) => {
            (x.records.subjects[0] as Record<string, unknown>)['registrationNote'] =
              `${prefix}:00000000-0000-4000-8000-000000000001`;
          }),
        ),
        prefix,
      ).toBe('CANONICAL_IDENTIFIER_INADMISSIBLE');
    }
  });

  it('(18) grants nothing: every capability is NONE, frozen, with no field that reads as allowed', () => {
    expect(PERMISSION_CAPABILITIES).toEqual([
      'research',
      'canonicalIssuance',
      'canonicalLinking',
      'qualification',
      'publication',
      'outreach',
      'opportunityCreation',
      'distributionAction',
      'suppressionClearance',
    ]);
    expect(Object.isFrozen(PERMISSIONS)).toBe(true);
    const m = built(BASE);
    expect(Object.values(m.permissions)).toEqual(PERMISSION_CAPABILITIES.map(() => 'NONE'));
    expect(JSON.stringify(m)).not.toMatch(
      /"(GRANTED|ALLOWED|ELIGIBLE|APPROVED|QUALIFIED)"|granted":true|"contact|"email|"outreach":"(?!NONE)/,
    );
  });
});

describe('B2.5-S0 (19) the B2.4 / B2.4-R2 projection is untouched by this slice', () => {
  it('the B2.4 contract identity is unchanged and is never produced by the manifest', () => {
    expect(SUBJECT_EVIDENCE_CONTRACT).toBe('nwf-pe.discovery-subject-evidence.v1-provisional');
    expect(JSON.stringify(built(BASE))).not.toContain(SUBJECT_EVIDENCE_CONTRACT);
    expect(JSON.stringify(built(BASE))).not.toContain(I0_COMPAT_CONTRACT);
  });
});

// ------------------------------------------------------------------ mutation tests

const MANIFEST_SOURCE = resolve(__dirname, '../../orgunits/subjectSnapshot/manifest.ts');
const SIBLINGS = resolve(__dirname, '../../orgunits/subjectSnapshot');

/** Imports `manifest.ts` with exactly one textual weakening applied (which must match once). */
async function mutant(find: string, replace: string): Promise<ManifestModule> {
  const source = readFileSync(MANIFEST_SOURCE, 'utf8');
  expect(source.split(find).length - 1, `mutation anchor: ${find}`).toBe(1);
  const dir = mkdtempSync(join(tmpdir(), 'b25-s0-mutant-'));
  try {
    const file = join(dir, 'manifest.ts');
    writeFileSync(
      file,
      source
        .replace(find, replace)
        .replace("from './canonical.js'", `from '${SIBLINGS}/canonical.ts'`)
        .replace("from './contract.js'", `from '${SIBLINGS}/contract.ts'`),
    );
    return (await import(file)) as ManifestModule;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Each oracle holds for the real module; each mutation must make its oracle fail. */
const ORACLES: readonly {
  readonly name: string;
  readonly find: string;
  readonly replace: string;
  readonly holds: (M: ManifestModule) => boolean;
}[] = [
  {
    name: 'an enumeration that reached its bound is not exhaustive (8)',
    find: 'holders.ids.length >= holders.bound',
    replace: 'holders.ids.length > holders.bound',
    holds: (M) => {
      const input = injected(BASE, (x) => {
        x.scope.sharedIdentifierHolders = {
          enumeration: 'EXHAUSTIVE_AS_DECLARED',
          bound: 1,
          holderSubjectIds: [uid(3)],
        };
      });
      return refusal(input, M) === 'ENUMERATION_NOT_EXHAUSTIVE';
    },
  },
  {
    name: 'an unexamined direction cannot be declared REPRESENTED (6)',
    find: "represented('INCOMING_RELATIONSHIP_CLAIMS') && !c.directions.includes('INCOMING')",
    replace: "represented('INCOMING_RELATIONSHIP_CLAIMS') && false",
    holds: (M) =>
      refusal(
        injected(BASE, (x) => {
          x.scope.relationshipDirectionsExamined = ['OUTGOING'];
        }),
        M,
      ) === 'SCOPE_DECLARATION_INCONSISTENT',
  },
  {
    name: 'a neighbour finding is partitioned as NEIGHBOUR, never relabelled focal (10)',
    find: "ownerOf(f.recordId) === focal ? 'FOCAL_RECORD' : 'NEIGHBOUR_RECORD'",
    replace: "'FOCAL_RECORD'",
    holds: (M) =>
      built(BASE, M).validation.findings.some(
        (f) => f.recordId === uid(4) && f.partition === 'NEIGHBOUR_RECORD',
      ),
  },
  {
    name: 'a protection status other than NOT_CONSULTED is refused (15)',
    find: "if (input['protectionCheck'] !== PROTECTION_CHECK) {",
    replace: 'if (false) {',
    holds: (M) =>
      refusal(
        injected(BASE, (x) => void (x.protectionCheck = 'CLEAR')),
        M,
      ) === 'PROTECTION_STATUS_UNSUPPORTED',
  },
  {
    name: 'a duplicate record identity is refused (5)',
    find: 'if (seen !== undefined) {',
    replace: 'if (seen !== undefined && false) {',
    holds: (M) =>
      refusal(
        injected(BASE, (x) => {
          x.records.subjects = [...x.records.subjects, x.records.subjects[0]!];
        }),
        M,
      ) === 'DUPLICATE_RECORD_IDENTITY',
  },
  {
    name: 'a record digest commits to every field, not only the identity (2)',
    find: 'contentDigest: recordContentDigestOf(recordType, r as ManifestValue),',
    replace: "contentDigest: recordContentDigestOf(recordType, { id: r['id']! }),",
    holds: (M) => {
      const a = built(BASE, M);
      const b = built(
        injected(BASE, (x) => {
          (x.records.identityClaims[0] as Record<string, unknown>)['nameText'] = 'Renamed';
        }),
        M,
      );
      const id = (BASE.records.identityClaims[0] as { id: string }).id;
      return (
        entryOf(a, 'IDENTITY_CLAIM', id)!.contentDigest !==
        entryOf(b, 'IDENTITY_CLAIM', id)!.contentDigest
      );
    },
  },
  {
    name: 'the ECHE source global commits to the present keys (13)',
    find: 'presentKeys: c.eche.presentKeys,',
    replace: '',
    holds: (M) => {
      const a = built(BASE, M);
      const b = built(
        injected(BASE, (x) => {
          x.validation.echeRowKeyState!.presentKeys = [];
        }),
        M,
      );
      return a.manifestDigest !== b.manifestDigest;
    },
  },
  {
    name: 'a canonical-identifier-shaped value is refused (17)',
    find: 'if (CANONICAL_IDENTIFIER_SHAPE.test(value))',
    replace: 'if (false)',
    holds: (M) =>
      refusal(
        injected(BASE, (x) => {
          (x.records.subjects[0] as Record<string, unknown>)['registrationNote'] = 'opp:1';
        }),
        M,
      ) === 'CANONICAL_IDENTIFIER_INADMISSIBLE',
  },
  {
    name: 'input-scoped coverage needs the validation inputs it depends on (9)',
    find: "represented('INPUT_SCOPED_FINDINGS') && (c.asOf === null || c.eche === null)",
    replace: "represented('INPUT_SCOPED_FINDINGS') && false",
    holds: (M) =>
      refusal(
        injected(BASE, (x) => {
          x.validation.echeRowKeyState = null;
          x.scope.categories.SOURCE_GLOBALS = 'INCOMPLETE';
          x.scope.categories.VALIDATION_INPUTS = 'INCOMPLETE';
        }),
        M,
      ) === 'SCOPE_DECLARATION_INCONSISTENT',
  },
  {
    name: 'a dropped finding is detected against the reference (9, 10)',
    find: "if (!myFindings.has(line))\n      discrepancies.push({ code: 'FINDING_MISSING_FROM_MANIFEST'",
    replace: "if (false)\n      discrepancies.push({ code: 'FINDING_MISSING_FROM_MANIFEST'",
    holds: (M) => {
      const m = built(
        injected(BASE, (x) => {
          x.findings = [];
        }),
        M,
      );
      return M.compareSnapshotScopeWithReference(m, referenceOf(sourceGraph())).discrepancies.some(
        (d) => d.code === 'FINDING_MISSING_FROM_MANIFEST',
      );
    },
  },
  {
    name: 'verification never reports an authenticated export (16)',
    find: "  exportAuthentication: 'UNAUTHENTICATED',\n} as const);",
    replace: "  exportAuthentication: 'AUTHENTICATED',\n} as const);",
    holds: (M) =>
      M.verifySnapshotScopeManifest(built(BASE, M)).exportAuthentication === 'UNAUTHENTICATED',
  },
  ...(
    [
      ['R1-1: duplicate detection removed, last write wins', 'if (false) refuse('],
      ['R1-1: first write wins', 'if (heads.has(targetKey)) continue;\n    if (false) refuse('],
    ] as const
  ).map(([name, replace]) => ({
    name,
    find: 'if (heads.has(targetKey)) refuse(',
    replace,
    holds: (M: ManifestModule) =>
      [
        [uid(99), uid(31)],
        [uid(31), uid(99)],
      ].every(
        (order) =>
          compared(
            built(BASE, M),
            withHeads(
              sourceGraph(),
              order.map((h) => ({ targetKey: FOCAL_TARGET, headReviewId: h })),
            ),
            M,
          ) === 'REFUSED:DUPLICATE_RECORD_IDENTITY',
      ),
  })),
  {
    name: 'R1-2: an identical repeated target is still refused',
    find: 'if (heads.has(targetKey)) refuse(',
    replace: 'if (heads.has(targetKey) && heads.get(targetKey) !== headReviewId) refuse(',
    holds: (M) => {
      const entry = { targetKey: FOCAL_TARGET, headReviewId: uid(31) };
      return (
        compared(built(BASE, M), withHeads(sourceGraph(), [entry, { ...entry }]), M) ===
        'REFUSED:DUPLICATE_RECORD_IDENTITY'
      );
    },
  },
  {
    name: 'R1-3: a null head is refused, so it cannot match a forked chain',
    find: "if (typeof headReviewId !== 'string' || !UUID.test(headReviewId)) {",
    replace:
      "if (headReviewId !== null && (typeof headReviewId !== 'string' || !UUID.test(headReviewId))) {",
    holds: (M) =>
      compared(
        built(produced(forkedGraph()), M),
        withHeads(forkedGraph(), [{ targetKey: FOCAL_TARGET, headReviewId: null }]),
        M,
      ) === 'REFUSED:INPUT_SHAPE_UNSUPPORTED',
  },
  {
    name: 'R1-4/7: a malformed entry is a structured refusal',
    find: "const h = exactKeys(\n      raw,\n      REFERENCE_HEAD_KEYS,\n      'INPUT_SHAPE_UNSUPPORTED',\n      'reference.reviewHead',\n    );",
    replace: 'const h = raw as Record<string, unknown>;',
    holds: (M) =>
      [null, { targetKey: FOCAL_TARGET, headReviewId: uid(31), latest: true }].every(
        (entry) =>
          compared(built(BASE, M), withHeads(sourceGraph(), [entry]), M) ===
          'REFUSED:INPUT_SHAPE_UNSUPPORTED',
      ),
  },
  {
    name: 'R1-5: a non-list collection is a structured refusal',
    find: "if (!Array.isArray(value)) refuse('INPUT_SHAPE_UNSUPPORTED', 'reference.reviewHeads",
    replace: "if (false) refuse('INPUT_SHAPE_UNSUPPORTED', 'reference.reviewHeads",
    holds: (M) =>
      compared(
        built(BASE, M),
        withHeads(sourceGraph(), { targetKey: FOCAL_TARGET, headReviewId: uid(31) }),
        M,
      ) === 'REFUSED:INPUT_SHAPE_UNSUPPORTED',
  },
  {
    name: 'R1-6: a target key outside the B2.1 form is refused',
    find: '!REVIEW_TARGET_KEY.test(targetKey)',
    replace: 'false',
    holds: (M) =>
      compared(
        built(BASE, M),
        withHeads(sourceGraph(), [
          { targetKey: FOCAL_TARGET.toUpperCase(), headReviewId: uid(31) },
        ]),
        M,
      ) === 'REFUSED:INPUT_SHAPE_UNSUPPORTED',
  },
];

describe('B2.5-S0 mutation tests: each fail-closed check is load-bearing', () => {
  for (const oracle of ORACLES) {
    it(`detects a weakened check: ${oracle.name}`, async () => {
      expect(oracle.holds(RealManifest), 'the oracle holds for the real module').toBe(true);
      const M = await mutant(oracle.find, oracle.replace);
      // The mutant is a working module (it still builds the producer fixture), so a
      // failing oracle means the weakened check - not a broken import - changed behaviour.
      expect(M.buildSnapshotScopeManifest(BASE).outcome, 'the mutant still builds').toBe('BUILT');
      expect(M).not.toBe(RealManifest);
      expect(oracle.holds(M), 'the oracle must FAIL for the mutant').toBe(false);
    });
  }
});
