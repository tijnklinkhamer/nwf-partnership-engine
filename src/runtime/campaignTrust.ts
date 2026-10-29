/**
 * WW E-M - WHETHER ANY OWNER CAMPAIGN KEY IS PINNED IN THIS BUILD.
 *
 * The one place the Mac runtime reads the acquisition namespace, and only
 * through its public exports: it asks the PINNED operational trust set
 * (reviewed source, ADR 0029 s3) how many keys it holds and whether one is
 * ACTIVE. It never builds, extends or chooses a trust set, and it reads no
 * key file, no Keychain and no environment variable for one.
 */
import {
  CampaignTrustSet,
  OPERATIONAL_OWNER_CAMPAIGN_KEYS,
} from '../orgunits/acquisition/index.js';

export interface PinnedCampaignKeys {
  readonly pinned: number;
  readonly hasActiveKey: boolean;
}

export function pinnedCampaignKeys(): PinnedCampaignKeys {
  return {
    pinned: OPERATIONAL_OWNER_CAMPAIGN_KEYS.length,
    hasActiveKey: CampaignTrustSet.operational().hasActiveKey(),
  };
}
