/**
 * REL L2 / U1 - THE NOMINATION -> DISCOVERY-SUBJECT BRIDGE. AN OPERATOR ACT.
 *
 * Builds exactly the B2.2 `ProposeRequest` an operator would otherwise type by
 * hand, so the subject is written by the EXISTING writer path
 * (`subjectRegistry/writer.ts`, capability `nwf_discovery_subject_writer`)
 * and judged by the EXISTING B2.1 validator. Nothing here writes.
 *
 * THE NAME CLAIM CITES THE NOMINATION:
 *   - source type `PUBLIC_URL`, URL = the nominated URL;
 *   - `observedAt` = the nomination's `retrieved_at`, never "now";
 *   - `versionRef` = `nominationCitationDigest`, a SHA-256 over the
 *     nomination's id, URL and retrieval time, so the claim names WHICH
 *     nomination it came from in the only shape migration 0013 admits;
 *   - basis `SOURCE_STATED`: the name is the title the source published.
 *
 * Nothing auto-promotes: this is reached only from
 * `orgunits nominations promote`, one nomination and one operator-chosen
 * subject id and kind per invocation.
 *
 * REL P2 - ONE PROMOTABLE NOMINATION PER IDENTITY. A registrable domain
 * nominated by several runs is one identity (migration 0020) naming its
 * FIRST nomination; only that one is promotable. A later nomination of the
 * same domain is refused `NOMINATION_NOT_CANONICAL`, naming the canonical id,
 * so the same domain cannot be promoted from two different nominations.
 * Promotion still grants nothing to fetch: the subject it registers needs a
 * review and its own OWNER admission before any research.
 *
 * THE ONE FILE OF THIS NAMESPACE THAT NAMES THE REGISTRY, and it names
 * exactly the B2.2 propose request type and the propose pair of the writer -
 * never claim, relate, review, the store or the reviewer authority. The
 * request is built PURELY (`promotionRequest`); the only database access is
 * the writer's own (`promoteNomination`).
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';

import type { ProposeRequest } from '../subjectRegistry/requests.js';
import {
  RegistryRefusal,
  executePropose,
  planPropose,
  type RegistryResult,
} from '../subjectRegistry/writer.js';
import { isAdmissibleName, type SubjectKind } from './identityBridge.js';
import type { NominationIdentityRow, NominationRow } from './store.js';

export const NOMINATION_CITATION_VERSION = 'source-discovery-nomination-citation-v1';

export class PromotionRefusal extends Error {
  constructor(
    readonly code:
      | 'NOMINATION_NOT_FOUND'
      | 'NOMINATION_HAS_NO_TITLE'
      | 'NOMINATION_TITLE_INADMISSIBLE'
      | 'NOMINATION_NOT_CANONICAL'
      | `REGISTRY_${string}`,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'PromotionRefusal';
  }
}

/** The deterministic digest a promoted claim carries as its `versionRef`. */
export function nominationCitationDigest(
  n: Pick<NominationRow, 'id' | 'url' | 'retrievedAt'>,
): string {
  return createHash('sha256')
    .update(`${NOMINATION_CITATION_VERSION}|${n.id}|${n.url}|${n.retrievedAt}`, 'utf8')
    .digest('hex');
}

/**
 * Refuses a nomination that is not its identity's FIRST nomination. A
 * nomination with no identity row predates migration 0020 and is its own.
 */
export function assertCanonicalNomination(
  nomination: Pick<NominationRow, 'id' | 'registrableDomain'>,
  identity: Pick<NominationIdentityRow, 'registrableDomain' | 'firstNominationId'> | null,
): void {
  if (identity === null) return;
  if (
    identity.registrableDomain !== nomination.registrableDomain ||
    identity.firstNominationId !== nomination.id
  ) {
    throw new PromotionRefusal(
      'NOMINATION_NOT_CANONICAL',
      `nomination ${nomination.id} is not the first nomination of ${nomination.registrableDomain}; ` +
        `promote ${identity.firstNominationId} instead (the same domain is one identity).`,
    );
  }
}

export interface PromotionInput {
  readonly nomination: NominationRow;
  readonly subjectId: string;
  readonly kind: SubjectKind;
  readonly nameLanguage: string | null;
}

export function promotionRequest(input: PromotionInput): ProposeRequest {
  const { nomination } = input;
  if (nomination.title === null) {
    throw new PromotionRefusal(
      'NOMINATION_HAS_NO_TITLE',
      `nomination ${nomination.id} carries no title; a name is never invented.`,
    );
  }
  if (!isAdmissibleName(nomination.title)) {
    throw new PromotionRefusal(
      'NOMINATION_TITLE_INADMISSIBLE',
      `nomination ${nomination.id}'s title is not an admissible subject name.`,
    );
  }
  return {
    subjectId: input.subjectId,
    registeredKind: input.kind,
    registrationNote: 'Promoted by an operator from a source-discovery nomination.',
    name: nomination.title,
    nameLanguage: input.nameLanguage,
    provenance: {
      source: {
        sourceType: 'PUBLIC_URL',
        url: nomination.url,
        versionRef: nominationCitationDigest(nomination),
      },
      observedAt: nomination.retrievedAt,
      claimBasis: 'SOURCE_STATED',
    },
  };
}

/**
 * Runs the B2.2 propose for one promotion: a DRY RUN on `pool` (the readonly
 * role) unless `execute`, in which case `pool` must be the writer capability
 * and the writer re-judges everything in its own transaction. A registry
 * refusal surfaces as `REGISTRY_<code>`; nothing is written on any refusal.
 */
export async function promoteNomination(
  pool: pg.Pool,
  request: ProposeRequest,
  execute: boolean,
): Promise<RegistryResult> {
  try {
    return execute ? await executePropose(pool, request) : await planPropose(pool, request);
  } catch (error) {
    if (error instanceof RegistryRefusal) {
      throw new PromotionRefusal(`REGISTRY_${error.code}`, error.detail);
    }
    throw error;
  }
}
