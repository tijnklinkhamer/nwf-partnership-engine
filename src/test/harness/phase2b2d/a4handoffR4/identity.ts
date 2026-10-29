/**
 * PHASE 2B-2D — A3 R50: STABLE PRE-LABEL ITEM IDENTITY.
 *
 * The identity of one review item is the EXISTING repository primitive,
 * unchanged and not reimplemented:
 *
 *   goldId = deriveGoldId(echeRowKey, responseSha256)
 *
 * with `echeRowKey` the CURRENT Governance V5 occupant's source identity and
 * `responseSha256` the canonical A3 `document.documentSha256` - itself the
 * original exact fetch-response SHA-256. Never a presentation hash, a package
 * hash, `hashDocument(...)`, a main-text hash or a page id.
 *
 * `goldId` is only the primitive's name. It does NOT mean a gold label exists.
 *
 * PURE.
 */
import { deriveGoldId } from '../../../../orgunits/classify/evaluation/select.js';
import { refuseR50 } from './refusal.js';
import { R50_GOLD_ID_PATTERN } from './types.js';

export const GOLD_ID_DOES_NOT_MEAN_GOLD_YET = true as const;

/** One stable pre-label identity, through the unchanged primitive. */
export function preLabelGoldId(echeRowKey: string, documentSha256: string): string {
  if (typeof echeRowKey !== 'string' || echeRowKey.length === 0) {
    refuseR50('R50_HANDOFF_INPUT_INVALID', 'an organisation identity is empty');
  }
  if (typeof documentSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(documentSha256)) {
    refuseR50('R50_HANDOFF_INPUT_INVALID', 'a document digest is not a SHA-256');
  }
  const goldId = deriveGoldId(echeRowKey, documentSha256);
  if (!R50_GOLD_ID_PATTERN.test(goldId)) {
    refuseR50('R50_GOLDID_FORMAT_INVALID', 'the identity primitive returned an unexpected form');
  }
  return goldId;
}
