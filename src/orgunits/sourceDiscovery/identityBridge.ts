/**
 * REL L2 / U1 - THE ONE FILE OF THIS NAMESPACE THAT READS THE B2.1 IDENTITY
 * MODULE, and only its PURE admissibility rules and vocabulary.
 *
 * Funnelled through one file so the B2.1 importer set grows by exactly one
 * reviewed path (`relL2SourceDiscovery.firewall.test.ts`). Re-exports only;
 * declares nothing of its own.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */
export {
  isAdmissibleName,
  isAdmissiblePublicUrl,
  SOCIAL_PLATFORM_HOSTS,
} from '../identity/admissibility.js';
export { SUBJECT_KINDS, type SubjectKind } from '../identity/vocabulary.js';
