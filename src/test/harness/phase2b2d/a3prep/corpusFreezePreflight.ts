import {
  A3_PREP_OWNER_DECISIONS,
  REQUIRED_SPLIT_ORGANISATION_COUNTS,
  REQUIRED_TOTAL_ORGANISATIONS,
} from './contracts.js';
import {
  publicManifestCarriesForbiddenGatedDetail,
  type A3PublicManifest,
} from './manifestTypes.js';
import type { A3OrganisationInput, A3Sd9Status, A3Split } from './types.js';

export type A3PreflightStatus = 'READY' | 'NOT_READY';

export interface A3OrganisationPreflightInput
  extends Pick<
    A3OrganisationInput,
    | 'selectionIndex'
    | 'organisationKey'
    | 'split'
    | 'acquisitionOfRecordState'
    | 'reserveTransitionState'
  > {
  readonly sd9Status: A3Sd9Status;
}

export interface A3FreezePreflightInput {
  readonly organisations: readonly A3OrganisationPreflightInput[];
  readonly manifests: readonly A3PublicManifest[];
  readonly setPDeterminismVerified: boolean;
  readonly setRDeterminismVerified: boolean;
  readonly capsVerified: boolean;
  readonly hashInputsComplete: boolean;
  readonly sd7SampleRankSemanticsApproved: boolean;
  readonly setRScoreReductionApproved: boolean;
  readonly organisationShareTruncationApproved: boolean;
}

export interface A3FreezePreflightResult {
  readonly status: A3PreflightStatus;
  readonly reasons: readonly string[];
}

function countBySplit(
  organisations: readonly A3OrganisationPreflightInput[],
): Readonly<Record<A3Split, number>> {
  return organisations.reduce<Record<A3Split, number>>(
    (counts, organisation) => {
      counts[organisation.split] += 1;
      return counts;
    },
    { DEV_TRAIN: 0, DEV_CONFIRM: 0, FINAL_HOLDOUT: 0 },
  );
}

/**
 * Mechanical readiness only. READY does NOT authorise or create a corpus freeze.
 */
export function checkCorpusFreezePreflight(
  input: A3FreezePreflightInput,
): A3FreezePreflightResult {
  const reasons: string[] = [];

  if (input.organisations.length !== REQUIRED_TOTAL_ORGANISATIONS) {
    reasons.push(
      `expected ${REQUIRED_TOTAL_ORGANISATIONS} organisations, received ${input.organisations.length}`,
    );
  }

  const splitCounts = countBySplit(input.organisations);
  for (const split of Object.keys(REQUIRED_SPLIT_ORGANISATION_COUNTS) as A3Split[]) {
    const expected = REQUIRED_SPLIT_ORGANISATION_COUNTS[split];
    if (splitCounts[split] !== expected) {
      reasons.push(`${split} organisation count ${splitCounts[split]} != ${expected}`);
    }
  }

  const selectionIndices = new Set<number>();
  for (const organisation of input.organisations) {
    if (selectionIndices.has(organisation.selectionIndex)) {
      reasons.push(`duplicate selection index ${organisation.selectionIndex}`);
    }
    selectionIndices.add(organisation.selectionIndex);
    if (organisation.acquisitionOfRecordState !== 'ADJUDICATED') {
      reasons.push(`${organisation.organisationKey}: acquisition-of-record pending`);
    }
    if (organisation.reserveTransitionState === 'PENDING') {
      reasons.push(`${organisation.organisationKey}: reserve transition pending`);
    }
    if (organisation.sd9Status !== 'ACQUISITION_SUCCESSFUL') {
      reasons.push(`${organisation.organisationKey}: SD9 is ${organisation.sd9Status}`);
    }
  }

  const expectedManifestSplits: readonly A3Split[] = [
    'DEV_TRAIN',
    'DEV_CONFIRM',
    'FINAL_HOLDOUT',
  ];
  const seenManifestSplits = new Set<A3Split>();
  for (const manifest of input.manifests) {
    if (seenManifestSplits.has(manifest.split)) {
      reasons.push(`duplicate public manifest for ${manifest.split}`);
    }
    seenManifestSplits.add(manifest.split);
    if (publicManifestCarriesForbiddenGatedDetail(manifest)) {
      reasons.push(`${manifest.split}: public manifest carries forbidden sealed detail`);
    }
  }
  for (const split of expectedManifestSplits) {
    if (!seenManifestSplits.has(split)) reasons.push(`missing public manifest for ${split}`);
  }
  if (input.manifests.length !== expectedManifestSplits.length) {
    reasons.push(
      `expected ${expectedManifestSplits.length} public manifests, received ${input.manifests.length}`,
    );
  }

  if (!input.setPDeterminismVerified) reasons.push('SET_P determinism not verified');
  if (!input.setRDeterminismVerified) reasons.push('SET_R determinism not verified');
  if (!input.capsVerified) reasons.push('organisation/sample caps not verified');
  if (!input.hashInputsComplete) reasons.push('hash inputs incomplete');

  if (!input.sd7SampleRankSemanticsApproved) {
    reasons.push(A3_PREP_OWNER_DECISIONS.SD7_SD9_SAMPLE_RANK);
  }
  if (!input.setRScoreReductionApproved) {
    reasons.push(A3_PREP_OWNER_DECISIONS.SET_R_TRACK_REDUCTION);
  }
  if (!input.organisationShareTruncationApproved) {
    reasons.push(A3_PREP_OWNER_DECISIONS.ORGANISATION_SHARE_TRUNCATION);
  }

  return { status: reasons.length === 0 ? 'READY' : 'NOT_READY', reasons };
}
