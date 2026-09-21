import type { A3Split } from './types.js';

export interface A3PublicManifestCommon<S extends A3Split> {
  readonly schemaVersion: 'A3_PUBLIC_MANIFEST_PREP_V1';
  readonly split: S;
  readonly itemCount: number;
  readonly organisationCount: number;
  readonly splitContentHash: string;
  readonly realisedSetPSize: number;
  readonly realisedSetRSize: number;
}

/**
 * DEV_TRAIN identities/document hashes are public-safe under Plan V1.
 * A3 creates no gold labels, so this pre-A4 representation has no gold field.
 */
export interface A3DevTrainPublicManifest
  extends A3PublicManifestCommon<'DEV_TRAIN'> {
  readonly itemIds: readonly string[];
  readonly documentSha256s: readonly string[];
}

/**
 * Gated public manifests are structurally incapable of carrying item
 * identities, document hashes or gold labels.
 */
export type A3DevConfirmPublicManifest = A3PublicManifestCommon<'DEV_CONFIRM'>;
export type A3FinalHoldoutPublicManifest = A3PublicManifestCommon<'FINAL_HOLDOUT'>;

export type A3PublicManifest =
  | A3DevTrainPublicManifest
  | A3DevConfirmPublicManifest
  | A3FinalHoldoutPublicManifest;

export interface A3SealedDetailRecord<S extends A3Split = A3Split> {
  readonly split: S;
  readonly itemId: string;
  readonly organisationKey: string;
  readonly documentSha256: string;
}

export function publicManifestCarriesForbiddenGatedDetail(manifest: A3PublicManifest): boolean {
  if (manifest.split === 'DEV_TRAIN') return false;
  const value = manifest as unknown as Record<string, unknown>;
  return (
    'itemIds' in value ||
    'documentSha256s' in value ||
    'goldLabels' in value ||
    'items' in value ||
    'documents' in value
  );
}
