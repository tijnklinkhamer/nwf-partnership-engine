/**
 * PHASE 2B-2D2C-F0X — PRINTS THE PARTIAL-REPLICATE ANALYSIS CLARIFICATION.
 *
 * The committed record is this output, formatted by the repository's own
 * Prettier. Its raw SHA-256 is pinned in `replicationContract.ts`, and the
 * scorer refuses to run if the committed record and the constants it
 * enforces ever differ.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/scoring/replicationClarificationGenerate.ts
 *
 * Writes only to stdout. No network, no database, no gold.
 */
import { buildPartialReplicateClarification } from './replicationContract.js';

process.stdout.write(`${JSON.stringify(buildPartialReplicateClarification(), null, 2)}\n`);
