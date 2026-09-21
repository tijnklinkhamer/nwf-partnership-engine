import {
  ORGANISATION_GATE_SHARE_CAP_DENOMINATOR,
  ORGANISATION_GATE_SHARE_CAP_NUMERATOR,
  SET_P_MAX_PAGES_PER_ORGANISATION,
  SET_R_MAX_PAGES_PER_ORGANISATION,
} from './contracts.js';

export type A3Sample = 'SET_P' | 'SET_R';

export function perOrganisationSampleCap(sample: A3Sample): number {
  return sample === 'SET_P'
    ? SET_P_MAX_PAGES_PER_ORGANISATION
    : SET_R_MAX_PAGES_PER_ORGANISATION;
}

export function gateShareIntegerCap(realisedDenominator: number): number {
  if (!Number.isInteger(realisedDenominator) || realisedDenominator < 0) {
    throw new RangeError('realisedDenominator must be a non-negative integer');
  }
  return Math.floor(
    (realisedDenominator * ORGANISATION_GATE_SHARE_CAP_NUMERATOR) /
      ORGANISATION_GATE_SHARE_CAP_DENOMINATOR,
  );
}

export interface OrganisationShareViolation {
  readonly organisationKey: string;
  readonly contribution: number;
  readonly allowed: number;
}

export function organisationShareViolations(
  realisedDenominator: number,
  contributions: Readonly<Record<string, number>>,
): readonly OrganisationShareViolation[] {
  const allowed = gateShareIntegerCap(realisedDenominator);
  return Object.entries(contributions)
    .filter(([, contribution]) => contribution > allowed)
    .map(([organisationKey, contribution]) => ({ organisationKey, contribution, allowed }))
    .sort((a, b) => a.organisationKey.localeCompare(b.organisationKey));
}
