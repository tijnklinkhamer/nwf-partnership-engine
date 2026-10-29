/**
 * WW E-W - THE SIX WORKER STAGE HANDLERS (ADR 0030 s3).
 *
 *   DISCOVERED       -> NOMINATED        discover.ts  (granted search run / link-out capture)
 *   NOMINATED        -> DEDUPLICATED     dedupe.ts    (canonical domain, scope, duplicates)
 *   DEDUPLICATED     -> RESEARCH_PENDING promote.ts   (provisional subject proposal)
 *   RESEARCH_PENDING -> RESEARCHED       research.ts  (CAMPAIGN admission + subject research)
 *   RESEARCHED       -> IDENTITY_REVIEW  outbox.ts    (export pair into the outbox)
 *   ASSESSABLE       -> end              outbox.ts    (manifest line)
 *
 * IDENTITY_REVIEW has NO handler and never will: the worker parks it as
 * AWAITING_HUMAN / OWNER_IDENTITY_REVIEW, and only the OWNER-signed batched
 * review (`review.ts`) on the owner path releases a subject to ASSESSABLE.
 */
import type { StageHandler } from '../acquisition/index.js';
import type { WiringDeps } from './context.js';
import { nominatedHandler } from './dedupe.js';

/** R2: the pre-adoption scope check of a v3 campaign's continuation (dedupe.ts). */
export { continuationScopeCheck } from './dedupe.js';
import { discoveredHandler } from './discover.js';
import { assessableHandler, researchedHandler } from './outbox.js';
import { deduplicatedHandler } from './promote.js';
import { researchPendingHandler } from './research.js';

/** The stages this wiring handles: every worker stage, never the human gate. */
export const WIRED_STAGES = Object.freeze([
  'DISCOVERED',
  'NOMINATED',
  'DEDUPLICATED',
  'RESEARCH_PENDING',
  'RESEARCHED',
  'ASSESSABLE',
] as const);

export function createStageHandlers(deps: WiringDeps): readonly StageHandler[] {
  return Object.freeze([
    discoveredHandler(deps),
    nominatedHandler(deps),
    deduplicatedHandler(deps),
    researchPendingHandler(deps),
    researchedHandler(deps),
    assessableHandler(deps),
  ]);
}
