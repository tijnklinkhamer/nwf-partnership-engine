/**
 * WW E-W - THE ONE WIRING FILE THAT REACHES THE READ-ONLY EXPORTS (ADR 0030 s6).
 *
 * Re-exports only: the v2 qualification-input export (WW E-X) and the
 * subject-facts export (REL final join A2), both read on the readonly role in
 * one read-only snapshot. The outbox writes their documents verbatim.
 */
export { exportQualificationInputV2 } from '../qualificationInputV2/load.js';
export { exportSubjectFacts } from '../subjectFacts/load.js';
