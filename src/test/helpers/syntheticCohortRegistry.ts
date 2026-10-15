/**
 * TEST-ONLY, FULLY SYNTHETIC evaluation-cohort registry (Track B, B3.0).
 *
 * Builds the four cohort artifacts (draw, replacement ledger, R50 handoff
 * index, frame) as SYNTHETIC JSON in the committed artifacts' own structural
 * shape, pins each by the SHA-256 of those synthetic bytes, and hands both to
 * the PRODUCTION verifier `buildEvaluationCohortRegistry` - so every
 * structural, hash and cross-artifact check the real guard performs still
 * runs. It never reads, copies or derives anything from the committed cohort
 * artifacts: no protected organisation, key or split assignment appears in
 * any test that uses it.
 *
 * `admit()` adds an ELIGIBLE identity (a frame member in no protected list);
 * `protect()` adds a PROTECTED one, under the named synthetic membership. The
 * loader rebuilds from the CURRENT lists on every call, so a test can admit
 * an organisation it seeded after the loader was handed to the code under
 * test.
 */
import { createHash } from 'node:crypto';
import {
  buildEvaluationCohortRegistry,
  type CohortArtifactRole,
  type PinnedCohortArtifact,
  type RegistryLoadResult,
} from '../../orgunits/classify/evaluationCohortGuard.js';

export interface SyntheticIdentity {
  readonly organisationId: string;
  readonly echeRowKey: string;
}

export type SyntheticProtection = 'DRAW_SELECTION' | 'DRAW_RESERVE' | 'HISTORICAL' | 'R50';

/** A synthetic organisation that is always present, so the R50 index is never empty. */
export const SYNTHETIC_R50_ANCHOR: SyntheticIdentity = Object.freeze({
  organisationId: '00000000-0000-4000-8000-0000000b3050',
  echeRowKey: 'T B30 R50ANCHOR|300000050',
});

export type SyntheticTamper = (
  pins: PinnedCohortArtifact[],
  bytes: Map<CohortArtifactRole, Buffer | null>,
) => void;

export interface SyntheticCohort {
  admit(identity: SyntheticIdentity): void;
  protect(identity: SyntheticIdentity, as?: SyntheticProtection): void;
  /** A `loadCohortRegistry` dependency. */
  readonly load: () => RegistryLoadResult;
  /** The same artifacts, altered by `tamper` before verification. */
  loadTampered(tamper: SyntheticTamper): RegistryLoadResult;
}

export function syntheticCohort(): SyntheticCohort {
  const eligible: SyntheticIdentity[] = [];
  const protectedEntries: { identity: SyntheticIdentity; as: SyntheticProtection }[] = [];

  const artifacts = (): Record<CohortArtifactRole, unknown> => {
    const selection = protectedEntries
      .filter((p) => p.as === 'DRAW_SELECTION')
      .map((p, selectionIndex) => ({
        selectionIndex,
        echeRowKey: p.identity.echeRowKey,
        organisationId: p.identity.organisationId,
        split: 'DEV_TRAIN',
      }));
    const reserve = protectedEntries
      .filter((p) => p.as === 'DRAW_RESERVE')
      .map((p, reserveRankPosition) => ({
        reserveRankPosition,
        echeRowKey: p.identity.echeRowKey,
        organisationId: p.identity.organisationId,
      }));
    const r50 = [
      SYNTHETIC_R50_ANCHOR,
      ...protectedEntries.filter((p) => p.as === 'R50').map((p) => p.identity),
    ];
    const historical = new Set(
      protectedEntries.filter((p) => p.as === 'HISTORICAL').map((p) => p.identity.echeRowKey),
    );
    // One frame entry per key: an admitted identity later protected by the
    // same test is one frame member, exactly as in a real frame.
    const members = new Map<string, SyntheticIdentity>();
    for (const identity of [
      ...eligible,
      ...protectedEntries.map((p) => p.identity),
      SYNTHETIC_R50_ANCHOR,
    ]) {
      members.set(identity.echeRowKey, identity);
    }
    const frame = [...members.values()].map((identity) => ({
      echeRowKey: identity.echeRowKey,
      organisationId: identity.organisationId,
      excludedHistoricalDevelopment: historical.has(identity.echeRowKey),
    }));
    return {
      DRAW: {
        recordKind: 'DRAW_V2_GEN1',
        generationId: 'GEN_SYNTHETIC_B30',
        counts: {
          selectionCount: selection.length,
          reserveCount: reserve.length,
          splitCounts: { DEV_TRAIN: selection.length, DEV_CONFIRM: 0, FINAL_HOLDOUT: 0 },
        },
        selection,
        reserve,
      },
      REPLACEMENT_LEDGER: { generationId: 'GEN_SYNTHETIC_B30', entries: [] },
      R50_HANDOFF_INDEX: {
        split: 'DEV_TRAIN',
        items: r50.map((identity) => ({ echeRowKey: identity.echeRowKey })),
      },
      FRAME: {
        generationId: 'GEN_SYNTHETIC_B30',
        counts: { excludedHistoricalDevelopmentCount: historical.size },
        entries: frame,
      },
    };
  };

  const build = (tamper: SyntheticTamper = () => {}): RegistryLoadResult => {
    const pins: PinnedCohortArtifact[] = [];
    const bytes = new Map<CohortArtifactRole, Buffer | null>();
    for (const [role, value] of Object.entries(artifacts()) as [CohortArtifactRole, unknown][]) {
      const buffer = Buffer.from(JSON.stringify(value), 'utf8');
      pins.push({
        role,
        path: `synthetic/${role.toLowerCase()}.json`,
        sha256: createHash('sha256').update(buffer).digest('hex'),
      });
      bytes.set(role, buffer);
    }
    tamper(pins, bytes);
    return buildEvaluationCohortRegistry(pins, bytes);
  };

  return {
    admit(identity) {
      eligible.push(identity);
    },
    protect(identity, as = 'DRAW_SELECTION') {
      protectedEntries.push({ identity, as });
    },
    load: () => build(),
    loadTampered: (tamper) => build(tamper),
  };
}
