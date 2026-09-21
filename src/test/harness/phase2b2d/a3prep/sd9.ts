import { MIN_PAGES_PER_ORGANISATION } from './contracts.js';
import type { A3Sd9Status } from './types.js';

export function evaluateSd9FromExactPostSd7Count(distinctExtractablePages: number): A3Sd9Status {
  if (!Number.isInteger(distinctExtractablePages) || distinctExtractablePages < 0) {
    throw new RangeError('distinctExtractablePages must be a non-negative integer');
  }
  return distinctExtractablePages >= MIN_PAGES_PER_ORGANISATION
    ? 'ACQUISITION_SUCCESSFUL'
    : 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
}

export function evaluateSd9FromBounds(minPages: number, maxPages: number): A3Sd9Status {
  if (
    !Number.isInteger(minPages) ||
    !Number.isInteger(maxPages) ||
    minPages < 0 ||
    maxPages < minPages
  ) {
    throw new RangeError('invalid post-SD7 page-count bounds');
  }
  if (minPages >= MIN_PAGES_PER_ORGANISATION) return 'ACQUISITION_SUCCESSFUL';
  if (maxPages < MIN_PAGES_PER_ORGANISATION) {
    return 'ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET';
  }
  return 'ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL';
}
