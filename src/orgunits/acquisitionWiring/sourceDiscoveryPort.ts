/**
 * WW E-W - THE ONE WIRING FILE THAT REACHES `sourceDiscovery/` (ADR 0030).
 *
 * Re-exports only, so the source-discovery importer set grows by exactly one
 * reviewed path (`relL2SourceDiscovery.firewall.test.ts`): the granted run
 * and its production dependencies through the namespace's own wiring index
 * (ADR 0028 s5), the PURE nomination gates, the nomination reader, the pure
 * citation digest and the B2.1 name rule. Nothing here fetches, ranks or
 * values a nomination.
 */
export {
  GrantedRunInternalError,
  GrantedRunRefusal,
  admissibleNominationsOfRun,
  productionLiveSearchDeps,
  runGrantedSourceDiscovery,
  type GrantedRunDeps,
} from '../sourceDiscovery/index.js';
export { isAdmissibleName } from '../sourceDiscovery/identityBridge.js';
export { prepareNomination } from '../sourceDiscovery/nomination.js';
export { nominationCitationDigest } from '../sourceDiscovery/promote.js';
export { loadNomination, type NominationRow } from '../sourceDiscovery/store.js';
