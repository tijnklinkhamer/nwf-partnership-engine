/**
 * WW E-W - THE DEDUPLICATED STAGE (ADR 0030 s3.3): a deduplicated nomination
 * becomes a PROVISIONAL discovery-subject proposal of THIS campaign.
 *
 * The subject is proposed through the existing B2.2 writer path
 * (`registryBridge.ts`) and then bound to the campaign
 * (`acquisition_campaign_subjects`). Nothing here confirms identity: the
 * subject is `UNCERTAIN`, unreviewed, and the binding records provenance
 * only. A nomination without an admissible title is REFUSED NOT_ADMISSIBLE.
 *
 * Idempotent: the subject id is derived from (campaign, nomination); a
 * retried attempt re-finds the subject, its website claim and its binding.
 *
 * Opens no socket.
 */
import type { StageHandler, StageOutcome } from '../acquisition/index.js';
import { loadNomination } from './sourceDiscoveryPort.js';
import { campaignSubjectIdOf, type WiringDeps } from './context.js';
import { bindCampaignSubject } from './records.js';
import { proposeCampaignSubject } from './registryBridge.js';

export function deduplicatedHandler(deps: WiringDeps): StageHandler {
  return {
    stage: 'DEDUPLICATED',
    async handle(item): Promise<StageOutcome> {
      if (item.subjectKind !== 'NOMINATION') return { kind: 'REFUSED', reason: 'POLICY_REFUSED' };
      const nomination = await loadNomination(deps.pools.readonly, item.subjectId);
      if (nomination === null) return { kind: 'REFUSED', reason: 'SUBJECT_NOT_FOUND' };
      if (nomination.registrableDomain !== item.registrableDomain) {
        return { kind: 'REFUSED', reason: 'POLICY_REFUSED' };
      }
      const subjectId = campaignSubjectIdOf(item.campaignId, nomination.id);
      const proposed = await proposeCampaignSubject(deps.pools, nomination, subjectId);
      if (!proposed.ok) return { kind: 'REFUSED', reason: 'NOT_ADMISSIBLE' };
      await bindCampaignSubject(deps.pools.worker, item, {
        nominationId: nomination.id,
        subjectId,
        url: nomination.url,
      });
      return {
        kind: 'ADVANCED',
        next: 'RESEARCH_PENDING',
        children: [
          {
            subjectKind: 'DISCOVERY_SUBJECT',
            subjectId,
            registrableDomain: nomination.registrableDomain,
          },
        ],
      };
    },
  };
}
