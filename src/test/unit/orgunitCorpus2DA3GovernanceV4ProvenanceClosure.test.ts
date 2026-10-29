/**
 * PHASE 2B-2D A3 R32 — THE PROVENANCE CLOSURE AND THE PREFIX -> FULL BRIDGE.
 *
 * Proves, over the exact committed A2 objects:
 *
 *   - the closure's own aggregates reconcile with its entries: 110 current
 *     slots examined, 72 terminal episodes, 59 already full, 13 prefix-only,
 *     0 missing, 13 entries, 0 unresolved;
 *   - P39, the exemplar that blocked R32, now resolves READY with the closure's
 *     SAME-RUN convention-two digest as its run reference - not the
 *     convention-one completion of its prefix - while its disposition, split,
 *     occupant and bindings stay the historical c05bba9 adjudication's;
 *   - every §28 negative refuses: a one-nibble prefix change, a non-completing
 *     digest, a missing or relabelled other digest, a unique-match count other
 *     than one, a changed source SHA-256, selection index or draw digest, a
 *     changed historical disposition, a closure without its historical source
 *     and a historical source without its closure entry;
 *   - the mixed-convention bridge binds exactly the five listed slots to the
 *     reconciliation's own digests, and refuses any disagreement;
 *   - the canonical A3 convention IS R20's unchanged `runRefSha256Of` - proved
 *     on a synthetic UUID, never on a real run id.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { A3EvidenceRefusal } from '../harness/phase2b2d/a3evidence/refusal.js';
import {
  canonicaliseRunUuid,
  runRefSha256Of,
  selectAuthorisedRunId,
} from '../harness/phase2b2d/a3evidence/runMatch.js';
import { A3GovernanceRefusal } from '../harness/phase2b2d/a3governance/refusal.js';
import {
  loadCommittedGovernanceV4,
  type CommittedGovernanceV4,
} from '../harness/phase2b2d/a3governanceV4/commitLoaderV4.js';
import {
  A3_CANONICAL_RUN_REF_V1_DERIVATION,
  CONVENTION_ONE_DERIVATION,
  CONVENTION_TWO_DERIVATION,
  parseRunProvenanceClosure,
} from '../harness/phase2b2d/a3governanceV4/provenanceClosure.js';
import { A3GovernanceV4Refusal } from '../harness/phase2b2d/a3governanceV4/refusal.js';
import {
  COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES,
  V4_IDS,
} from '../harness/phase2b2d/a3governanceV4/registryV4.js';
import { resolveVerifiedGovernanceV4 } from '../harness/phase2b2d/a3governanceV4/resolveV4.js';
import {
  loadCommittedA2GovernanceV4,
  readyAuthoritiesOfV4,
} from '../harness/phase2b2d/a3governanceV4/snapshotV4.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CLOSURE = V4_IDS.PROVENANCE_CLOSURE;
const P39_SOURCE = V4_IDS.POST_P29_P30_NEXT_ADJUDICATION;
const P39_PREFIX = '489a43cbfab57ddd';
const P39_HISTORICAL_FULL = '489a43cbfab57dddda1f6ebb58477947047accef5d6259df9c8fc1491bbe97dd';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const checkpointAvailable = COMMITTED_A2_GOVERNANCE_REGISTRY_V4_ENTRIES.every((entry) =>
  commitExists(entry.commit),
);

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function codeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (
      error instanceof A3GovernanceV4Refusal ||
      error instanceof A3GovernanceRefusal ||
      error instanceof A3EvidenceRefusal
    ) {
      return error.code;
    }
    throw error;
  }
  throw new Error('expected a refusal');
}

function mutated(
  governance: CommittedGovernanceV4,
  id: string,
  mutate: (record: Json) => void,
): CommittedGovernanceV4 {
  const files = new Map(governance.files);
  const file = files.get(id)!;
  const parsed = structuredClone(file.parsed) as Json;
  mutate(parsed);
  files.set(id, Object.freeze({ ...file, parsed }));
  return Object.freeze({ ...governance, files });
}

function closureEntry(record: Json, selectionIndex: number): Json {
  return (record.closureEntries as Json[]).find(
    (entry) => entry.selectionIndex === selectionIndex,
  )!;
}

function historicalItem(record: Json, workItemId: string): Json {
  return (record.items as Json[]).find((item) => item.workItemId === workItemId)!;
}

// ---------------------------------------------------------------------------

describe('2D-A3 R32: the canonical A3 run reference is R20’s, unchanged', () => {
  // A synthetic UUID: never a real run id.
  const uuid = '0f0e0d0c-0b0a-4908-8706-050403020100';

  it('is sha256 of the canonical lower-case UUID, and NOT of "run:" + UUID', () => {
    expect(runRefSha256Of(uuid)).toBe(sha256(uuid));
    expect(runRefSha256Of(uuid)).not.toBe(sha256(`run:${uuid}`));
    expect(runRefSha256Of(uuid.toUpperCase())).toBe(sha256(canonicaliseRunUuid(uuid)));
  });

  it('lets R20’s exactly-one matcher find a run by the V4 convention, and never by the other', () => {
    const other = '0f0e0d0c-0b0a-4908-8706-050403020101';
    expect(selectAuthorisedRunId([other, uuid], sha256(uuid))).toBe(uuid);
    expect(codeOf(() => selectAuthorisedRunId([other, uuid], sha256(`run:${uuid}`)))).toBe(
      'AUTHORISED_RUN_NOT_FOUND',
    );
  });

  it('names A2’s convention two as the one V4 projects into R17', () => {
    expect(A3_CANONICAL_RUN_REF_V1_DERIVATION).toBe('sha256(canonical lowercase run UUID)');
    expect(CONVENTION_TWO_DERIVATION).toContain('with NO prefix');
    expect(CONVENTION_ONE_DERIVATION).toContain("'run:'");
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!checkpointAvailable)(
  '2D-A3 R32: the closure is complete, from its own bytes',
  () => {
    const governance = loadCommittedGovernanceV4(REPO_ROOT);
    const closure = parseRunProvenanceClosure(governance);

    it('reconciles its declared census with its own entries', () => {
      expect(closure.census).toEqual({
        currentSlotsExamined: 110,
        currentTerminalEpisodes: 72,
        neverStartedSlots: 38,
        alreadyFullCommittedProvenanceCount: 59,
        prefixOnlyProvenanceCount: 13,
        missingRunRefProvenanceCount: 0,
        closureEntriesEmitted: 13,
        unresolvedOrRefusedCount: 0,
      });
      expect(closure.entries).toHaveLength(13);
      expect(closure.entries.map((entry) => entry.selectionIndex)).toEqual([
        36, 37, 39, 41, 43, 46, 47, 48, 50, 52, 53, 55, 58,
      ]);
      expect(closure.mixedConventionSlots.map((slot) => slot.selectionIndex)).toEqual([
        40, 44, 49, 56, 57,
      ]);
    });

    it('declares the same canonical state the resolver derives', () => {
      expect(closure.canonicalState).toEqual({
        successfulCount: 69,
        failureSelectionIndices: [59, 66, 70],
        pendingSelectionIndices: [],
        neverStarted: { from: 72, to: 109, count: 38 },
        q1: [59, 66, 70],
      });
    });

    it('refuses a census that does not reconcile, or a record that claims authority', () => {
      const refuses = (mutate: (record: Json) => void): string =>
        codeOf(() => parseRunProvenanceClosure(mutated(governance, CLOSURE, mutate)));
      expect(refuses((record) => (record.census.prefixOnlyProvenanceCount = 12))).toBe(
        'V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE',
      );
      expect(refuses((record) => (record.census.unresolvedOrRefusedCount = 1))).toBe(
        'V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE',
      );
      expect(refuses((record) => (record.census.closedBySplit.DEV_TRAIN = 2))).toBe(
        'V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE',
      );
      expect(refuses((record) => (record.thisFileAuthorises = ['X']))).toBe(
        'V4_CLOSURE_RECORD_SHAPE_INVALID',
      );
      expect(
        refuses(
          (record) =>
            (record.a3Handoff.theClosureAloneMustNotMintTerminalAcquisitionAuthority = false),
        ),
      ).toBe('V4_CLOSURE_RECORD_SHAPE_INVALID');
      expect(
        refuses((record) => (closureEntry(record, 39).thisEntryDoesNotReAdjudicate = false)),
      ).toBe('V4_CLOSURE_ENTRY_SHAPE_INVALID');
      expect(
        refuses((record) => (record.canonicalStateUnchanged.ledgerHash = 'a'.repeat(64))),
      ).toBe('V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE');
    });
  },
);

// ---------------------------------------------------------------------------

describe.skipIf(!checkpointAvailable)('2D-A3 R32: P39 resolves through the closure', () => {
  const snapshot = loadCommittedA2GovernanceV4(REPO_ROOT);
  const governance = loadCommittedGovernanceV4(REPO_ROOT);
  const rawClosure = governance.files.get(CLOSURE)!.parsed as Json;
  const rawEntry = closureEntry(rawClosure, 39);
  const source = governance.files.get(P39_SOURCE)!;

  it('is the c05bba9 adjudication’s prefix-era fact, completed by the closure', () => {
    expect(source.entry.commit).toBe('c05bba9e48b7c5bc1d574b997cff68fefd62260a');
    const item = historicalItem(source.parsed as Json, 'P:39');
    expect(item).toMatchObject({ selectionIndex: 39, split: 'DEV_TRAIN', kind: 'PRIMARY' });
    expect(item.runRefSha256Prefix).toBe(P39_PREFIX);
    expect(item.adjudication.finalAcquisitionOutcome).toBe('ACQUISITION_SUCCESSFUL');
    expect('runRefSha256' in item).toBe(false);
    expect(rawEntry.historicalRunRefPrefix).toBe(P39_PREFIX);
    expect(rawEntry.runRefSha256).toBe(P39_HISTORICAL_FULL);
    expect(rawEntry.runRefSha256Derivation).toBe(CONVENTION_ONE_DERIVATION);
    expect(rawEntry.sameRunUnderTheOtherHistoricalConvention.derivation).toBe(
      CONVENTION_TWO_DERIVATION,
    );
  });

  it('is READY: DEV_TRAIN, PRIMARY, successful, with the SAME-RUN convention-two digest', () => {
    const ready = readyAuthoritiesOfV4(snapshot).find(
      (authority) => authority.selectionIndex === 39,
    )!;
    expect(ready).toMatchObject({
      selectionIndex: 39,
      split: 'DEV_TRAIN',
      occupantKind: 'PRIMARY',
      reserveRankPosition: null,
      disposition: 'ACQUISITION_SUCCESSFUL',
      acquisitionPolicyVersion: 'orgunit-fetch-policy-v6',
    });
    expect(ready.runRefSha256).toBe(rawEntry.sameRunUnderTheOtherHistoricalConvention.digest);
    expect(ready.runRefSha256).not.toBe(P39_HISTORICAL_FULL);
    expect(ready.runRefSha256.startsWith(P39_PREFIX)).toBe(false);
    expect(ready.adjudication).toEqual({
      path: source.entry.path,
      sha256: source.sha256,
      commit: 'c05bba9e48b7c5bc1d574b997cff68fefd62260a',
    });
    expect(ready.liveResult.commit).toBe('6f52db74bf8e9bc9bc51b4fcc55a6ebb5edf0e75');
    expect(ready.drawEntrySha256).toBe(rawEntry.drawEntrySha256);
    expect(
      snapshot.resolution.currentFactProvenance.find((fact) => fact.selectionIndex === 39),
    ).toEqual({
      selectionIndex: 39,
      kind: 'PROVENANCE_CLOSURE_BRIDGE',
      sourceRegistryId: P39_SOURCE,
    });
  });

  const refusesClosure = (mutate: (entry: Json, record: Json) => void): string =>
    codeOf(() =>
      resolveVerifiedGovernanceV4(
        mutated(governance, CLOSURE, (record) => mutate(closureEntry(record, 39), record)),
      ),
    );
  const refusesSource = (mutate: (record: Json) => void): string =>
    codeOf(() => resolveVerifiedGovernanceV4(mutated(governance, P39_SOURCE, mutate)));

  it('refuses a prefix that differs by one nibble, on either side', () => {
    expect(
      refusesSource(
        (record) => (historicalItem(record, 'P:39').runRefSha256Prefix = '489a43cbfab57dde'),
      ),
    ).toBe('V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE');
    expect(refusesClosure((entry) => (entry.historicalRunRefPrefix = '489a43cbfab57dde'))).toBe(
      'V4_CLOSURE_PREFIX_COMPLETION_INVALID',
    );
  });

  it('refuses a historical full digest that does not begin with the prefix', () => {
    expect(
      refusesClosure((entry) => (entry.runRefSha256 = `5${P39_HISTORICAL_FULL.slice(1)}`)),
    ).toBe('V4_CLOSURE_PREFIX_COMPLETION_INVALID');
    expect(
      refusesClosure((entry) => (entry.runRefSha256IsTheCompletionOfTheCommittedPrefix = false)),
    ).toBe('V4_CLOSURE_PREFIX_COMPLETION_INVALID');
  });

  it('refuses a missing or malformed other-convention digest', () => {
    expect(
      refusesClosure((entry) => delete entry.sameRunUnderTheOtherHistoricalConvention.digest),
    ).toBe('V4_CLOSURE_ENTRY_SHAPE_INVALID');
    expect(refusesClosure((entry) => delete entry.sameRunUnderTheOtherHistoricalConvention)).toBe(
      'V4_CLOSURE_ENTRY_SHAPE_INVALID',
    );
    expect(
      refusesClosure((entry) => (entry.sameRunUnderTheOtherHistoricalConvention.digest = 'ABC')),
    ).toBe('V4_CLOSURE_ENTRY_SHAPE_INVALID');
    expect(
      refusesClosure(
        (entry) => (entry.sameRunUnderTheOtherHistoricalConvention.digest = entry.runRefSha256),
      ),
    ).toBe('V4_CLOSURE_DERIVATION_LABEL_INVALID');
  });

  it('refuses a changed derivation label, on either digest', () => {
    expect(
      refusesClosure(
        (entry) =>
          (entry.sameRunUnderTheOtherHistoricalConvention.derivation =
            'sha256(UTF-8 bytes of the lowercase canonical run UUID)'),
      ),
    ).toBe('V4_CLOSURE_DERIVATION_LABEL_INVALID');
    expect(
      refusesClosure((entry) => (entry.runRefSha256Derivation = CONVENTION_TWO_DERIVATION)),
    ).toBe('V4_CLOSURE_DERIVATION_LABEL_INVALID');
    expect(
      refusesClosure(
        (entry) =>
          (entry.sameRunUnderTheOtherHistoricalConvention.thisIsNotANormalisation =
            'a different run, published for comparison'),
      ),
    ).toBe('V4_CLOSURE_DERIVATION_LABEL_INVALID');
  });

  it('refuses a unique-match proof other than exactly one, or one that chose', () => {
    for (const count of [0, 2]) {
      expect(
        refusesClosure(
          (entry) => (entry.uniqueMatchProof.matchesUnderTheDeclaredDerivation = count),
        ),
      ).toBe('V4_CLOSURE_UNIQUE_MATCH_UNPROVEN');
    }
    expect(
      refusesClosure(
        (entry) => (entry.uniqueMatchProof.noTimestampWasUsedToBreakACollision = false),
      ),
    ).toBe('V4_CLOSURE_UNIQUE_MATCH_UNPROVEN');
    expect(
      refusesClosure((entry) => (entry.uniqueMatchProof.noMostLikelyRunWasChosen = false)),
    ).toBe('V4_CLOSURE_UNIQUE_MATCH_UNPROVEN');
  });

  it('refuses a changed source adjudication SHA-256, commit or live-result binding', () => {
    expect(
      refusesClosure(
        (entry) => (entry.terminalDispositionAuthorityRemains.sha256 = 'a'.repeat(64)),
      ),
    ).toBe('V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE');
    expect(
      refusesClosure(
        (entry) =>
          (entry.terminalDispositionAuthorityRemains.commit =
            'bbe7ddcf91b8d68d45d1f822fc8ccde4534e9bf9'),
      ),
    ).toBe('V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE');
    expect(refusesClosure((entry) => (entry.liveResult.bytes += 1))).toBe(
      'V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE',
    );
  });

  it('refuses a changed selection index, never joining by index alone', () => {
    expect(
      refusesClosure((entry, record) => {
        entry.selectionIndex = 38;
        record.census.closedSelectionIndices = (record.closureEntries as Json[]).map(
          (candidate) => candidate.selectionIndex,
        );
      }),
    ).toBe('V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE');
    expect(refusesClosure((entry) => (entry.selectionIndex = 38))).toBe(
      'V4_CLOSURE_AGGREGATES_DO_NOT_RECONCILE',
    );
  });

  it('refuses a changed draw digest, occupant or policy', () => {
    expect(refusesClosure((entry) => (entry.drawEntrySha256 = 'c'.repeat(64)))).toBe(
      'V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE',
    );
    expect(
      refusesClosure((entry) => {
        entry.occupantKind = 'RESERVE_REPLACEMENT';
        entry.reserveRankPosition = 30;
      }),
    ).toBe('V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE');
    expect(
      refusesClosure((entry) => (entry.acquisitionPolicyVersion = 'orgunit-fetch-policy-v7')),
    ).toBe('V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE');
  });

  it('refuses a changed historical disposition: the closure carries none of its own', () => {
    expect(
      refusesSource((record) => {
        const adjudication = historicalItem(record, 'P:39').adjudication;
        adjudication.finalAcquisitionOutcome = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
        adjudication.createsReplacementObligation = true;
        adjudication.q3PrecedenceApplied = true;
      }),
    ).toBe('V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE');
    expect(
      refusesClosure(
        (entry) => (entry.terminalDisposition = 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET'),
      ),
    ).toBe('V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE');
  });

  it('refuses the closure entry when the historical source fact is absent', () => {
    expect(
      refusesSource((record) => {
        record.items = (record.items as Json[]).filter((item) => item.workItemId !== 'P:39');
        record.bound.windowPlan.workItemOrder = (
          record.bound.windowPlan.workItemOrder as string[]
        ).filter((id) => id !== 'P:39');
      }),
    ).toBe('V4_CLOSURE_ENTRY_WITHOUT_HISTORICAL_SOURCE');
  });

  it('refuses the prefix-only historical fact when its closure entry is absent', () => {
    expect(
      codeOf(() =>
        resolveVerifiedGovernanceV4(
          mutated(governance, CLOSURE, (record) => {
            record.closureEntries = (record.closureEntries as Json[]).filter(
              (entry) => entry.selectionIndex !== 39,
            );
            record.census.closureEntriesEmitted = 12;
            record.census.prefixOnlyProvenanceCount = 12;
            record.census.alreadyFullCommittedProvenanceCount = 60;
            record.census.closedSelectionIndices = (record.closureEntries as Json[]).map(
              (entry) => entry.selectionIndex,
            );
            delete record.census.closedBySplit.DEV_TRAIN;
          }),
        ),
      ),
    ).toBe('V4_CURRENT_PREFIX_ERA_FACT_WITHOUT_FULL_RUN_PROVENANCE');
  });

  it('refuses a prefix-era record that suddenly publishes a full run reference', () => {
    expect(
      refusesSource(
        (record) => (historicalItem(record, 'P:39').runRefSha256 = P39_HISTORICAL_FULL),
      ),
    ).toBe('V4_FAMILY_FULL_RUN_REFERENCE_IN_PREFIX_ERA_RECORD');
  });
});

// ---------------------------------------------------------------------------

describe.skipIf(!checkpointAvailable)('2D-A3 R32: the mixed-convention bridge', () => {
  const snapshot = loadCommittedA2GovernanceV4(REPO_ROOT);
  const governance = loadCommittedGovernanceV4(REPO_ROOT);
  const closure = parseRunProvenanceClosure(governance);

  it('binds exactly the five listed slots to the reconciliation’s own digests', () => {
    const reconciliation = snapshot.resolution.reconciliation;
    for (const slot of closure.mixedConventionSlots) {
      const ready = readyAuthoritiesOfV4(snapshot).find(
        (authority) => authority.selectionIndex === slot.selectionIndex,
      )!;
      expect(ready.runRefSha256).toBe(slot.conventionTwoDigest);
      expect(ready.runRefSha256.startsWith(slot.prefixInOwnAdjudication)).toBe(false);
      expect(
        reconciliation.runReferences.find((ref) => ref.selectionIndex === slot.selectionIndex)!
          .runRefSha256,
      ).toBe(slot.conventionTwoDigest);
      // The disposition authority stays the slot's own window adjudication.
      expect(ready.adjudication.path).not.toContain('RECONCILIATION');
    }
  });

  const refuses = (id: string, mutate: (record: Json) => void): string =>
    codeOf(() => resolveVerifiedGovernanceV4(mutated(governance, id, mutate)));
  const detail = (record: Json, selectionIndex: number): Json =>
    (
      record.twoHistoricalRunReferenceConventionsExist.fiveFurtherSlotsAlreadyCarryBothConventions
        .detail as Json[]
    ).find((entry) => entry.selectionIndex === selectionIndex)!;

  it('refuses a reconciliation digest that is not the listed same-run digest', () => {
    expect(
      refuses(V4_IDS.SD9_RECONCILIATION, (record) => {
        (record.reconciliationResult.changedSlotDetail as Json[]).find(
          (entry) => entry.selectionIndex === 44,
        )!.runRefSha256 = 'd'.repeat(64);
      }),
    ).toBe('V4_MIXED_CONVENTION_BRIDGE_INVALID');
  });

  it('refuses a listed prefix, digest or record name that does not bind', () => {
    expect(
      refuses(CLOSURE, (record) => (detail(record, 44).prefixInOwnAdjudication = '0'.repeat(16))),
    ).toBe('V4_MIXED_CONVENTION_BRIDGE_INVALID');
    expect(refuses(CLOSURE, (record) => (detail(record, 44).plainDigest = 'e'.repeat(64)))).toBe(
      'V4_MIXED_CONVENTION_BRIDGE_INVALID',
    );
    expect(
      refuses(CLOSURE, (record) => (detail(record, 44).fullCommittedElsewhere = ['OTHER.json'])),
    ).toBe('V4_MIXED_CONVENTION_BRIDGE_INVALID');
  });

  it('refuses a mixed-convention slot the closure no longer lists', () => {
    expect(
      refuses(CLOSURE, (record) => {
        const block =
          record.twoHistoricalRunReferenceConventionsExist
            .fiveFurtherSlotsAlreadyCarryBothConventions;
        block.detail = (block.detail as Json[]).filter((entry) => entry.selectionIndex !== 44);
        block.selectionIndices = (block.selectionIndices as number[]).filter(
          (index) => index !== 44,
        );
      }),
    ).toBe('V4_CURRENT_PREFIX_ERA_FACT_WITHOUT_FULL_RUN_PROVENANCE');
  });
});
