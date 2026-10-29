/**
 * THE ONE INPUT READ, AND EVERY WAY IT CAN REFUSE.
 *
 * A1b's entire input is the committed FRAME_V2_GEN1 artifact. This module
 * opens that one path, verifies BOTH of its hashes and its byte length,
 * reverifies its counts, and returns only the eligible entries. It opens no
 * database, no socket, no official source artifact and no historical
 * evaluation fixture.
 *
 * EVERY FAILURE IS A STOP, NEVER A REPAIR
 *
 *   The owner instruction lists six refusals and adds "do not redraw from a
 *   repaired/inferred input". So a frame whose hash moved is not re-hashed, a
 *   count that disagrees is not recounted from the entries, a duplicate key is
 *   not de-duplicated and a missing authority is not filled in. Each one
 *   throws `DrawInputStop` and the draw does not happen.
 *
 * WHY BOTH HASHES ARE CHECKED
 *
 *   `frameHash` covers the frame's CONTENT and survives reformatting;
 *   `artifactFileSha256` covers the committed FILE BYTES and does not. A
 *   reformat that left the content identical would move the second and not the
 *   first, and a hand edit to one entry would move both. Checking only one
 *   would leave the other class of change undetected, so both are checked and
 *   they are never conflated.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPECTED_ELIGIBLE_ORGANISATIONS,
  FRAME_ARTIFACT_BYTES,
  FRAME_ARTIFACT_FILE_SHA256,
  FRAME_ARTIFACT_PATH,
  FRAME_HASH,
  GENERATION_ID,
  type DrawRootAuthority,
  type RootAuthorityType,
} from './drawContract.js';

export class DrawInputStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawInputStop';
  }
}

/** One eligible organisation, exactly as the frame published it. */
export interface EligibleOrganisation {
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly rootAuthorityCount: number;
  readonly rootAuthorities: readonly DrawRootAuthority[];
}

export interface FrozenFrame {
  readonly artifactPath: string;
  readonly frameHash: string;
  readonly artifactFileSha256: string;
  readonly artifactBytes: number;
  readonly examinedOrganisationCount: number;
  readonly eligible: readonly EligibleOrganisation[];
}

/** The shape this module requires of the artifact, checked rather than assumed. */
interface RawFrameEntry {
  readonly echeRowKey?: unknown;
  readonly organisationId?: unknown;
  readonly included?: unknown;
  readonly rootAuthorityCount?: unknown;
  readonly rootAuthorities?: unknown;
}

const AUTHORITY_TYPES: readonly RootAuthorityType[] = ['WEBSITE_CLAIM', 'ROOT_PROMOTION'];

/**
 * Parses one `TYPE:id` authority token WITHOUT altering either half.
 *
 * The identifier is taken as the exact remainder of the string after the first
 * `:`, so an id that itself contained a colon would survive intact. Nothing is
 * trimmed, re-cased or reformatted: the draw must carry the frame's bytes, and
 * a parser that tidied them would make that untrue in the one place a reader
 * would never look.
 */
function parseAuthority(token: unknown, context: string): DrawRootAuthority {
  if (typeof token !== 'string') {
    throw new DrawInputStop(`STOP: ${context} has a non-string root authority.`);
  }
  const separator = token.indexOf(':');
  if (separator < 0) {
    throw new DrawInputStop(`STOP: ${context} has an unparseable root authority "${token}".`);
  }
  const type = token.slice(0, separator);
  const id = token.slice(separator + 1);
  if (!AUTHORITY_TYPES.includes(type as RootAuthorityType)) {
    throw new DrawInputStop(`STOP: ${context} has an unknown root authority type "${type}".`);
  }
  if (id.length === 0) {
    throw new DrawInputStop(`STOP: ${context} has a root authority with an empty identifier.`);
  }
  return { type: type as RootAuthorityType, id };
}

/**
 * The FILE-level identity gate: both hashes and the byte length.
 *
 * Separate from `projectEligibleEntries` so each gate is reachable on its own
 * in a test. A reader that could only be exercised through the one real
 * 3.5 MB artifact would have its refusal paths asserted by nothing, and those
 * refusal paths are the part that matters.
 */
export function verifyFrameIdentity(bytes: string): {
  readonly artifactFileSha256: string;
  readonly artifactBytes: number;
} {
  const artifactFileSha256 = createHash('sha256').update(bytes, 'utf8').digest('hex');
  if (artifactFileSha256 !== FRAME_ARTIFACT_FILE_SHA256) {
    throw new DrawInputStop(
      `STOP: frame artifactFileSha256 is ${artifactFileSha256}, expected ` +
        `${FRAME_ARTIFACT_FILE_SHA256}. A1b draws from the exact frozen A1 frame or not at all.`,
    );
  }

  const artifactBytes = Buffer.byteLength(bytes, 'utf8');
  if (artifactBytes !== FRAME_ARTIFACT_BYTES) {
    throw new DrawInputStop(
      `STOP: frame is ${artifactBytes} bytes, expected ${FRAME_ARTIFACT_BYTES}.`,
    );
  }

  return { artifactFileSha256, artifactBytes };
}

/**
 * The CONTENT gate and the projection: generation identity, frameHash, the
 * declared eligible count, and every per-entry requirement.
 *
 * Returns only entries where `included === true`, in the frame's own order.
 */
export function projectEligibleEntries(parsed: unknown): readonly EligibleOrganisation[] {
  const artifact = parsed as Record<string, unknown>;

  if (artifact.generationId !== GENERATION_ID) {
    throw new DrawInputStop(
      `STOP: frame generationId is ${String(artifact.generationId)}, expected ${GENERATION_ID}.`,
    );
  }
  if (artifact.frameHash !== FRAME_HASH) {
    throw new DrawInputStop(
      `STOP: frame frameHash is ${String(artifact.frameHash)}, expected ${FRAME_HASH}.`,
    );
  }

  const counts = artifact.counts as Record<string, unknown> | undefined;
  if (counts === undefined) {
    throw new DrawInputStop('STOP: frame carries no counts block.');
  }
  if (counts.eligibleOrganisationCount !== EXPECTED_ELIGIBLE_ORGANISATIONS) {
    throw new DrawInputStop(
      `STOP: frame declares ${String(counts.eligibleOrganisationCount)} eligible organisations, ` +
        `expected ${EXPECTED_ELIGIBLE_ORGANISATIONS}.`,
    );
  }

  const entries = artifact.entries;
  if (!Array.isArray(entries)) {
    throw new DrawInputStop('STOP: frame carries no entries array.');
  }

  const eligible: EligibleOrganisation[] = [];
  const seenEcheRowKeys = new Set<string>();
  const seenOrganisationIds = new Set<string>();

  for (const raw of entries as readonly RawFrameEntry[]) {
    const { echeRowKey, organisationId, included } = raw;
    if (typeof echeRowKey !== 'string' || echeRowKey.length === 0) {
      throw new DrawInputStop('STOP: a frame entry has no usable echeRowKey.');
    }
    if (typeof organisationId !== 'string' || organisationId.length === 0) {
      throw new DrawInputStop(`STOP: frame entry ${echeRowKey} has no usable organisationId.`);
    }
    if (typeof included !== 'boolean') {
      throw new DrawInputStop(`STOP: frame entry ${echeRowKey} has no boolean included flag.`);
    }

    // A duplicate anywhere in the EXAMINED population is a stop, not just a
    // duplicate among the eligible: SD2 ranks a source-row identity, and a
    // frame that could name one twice is not the frame A1 froze.
    if (seenEcheRowKeys.has(echeRowKey)) {
      throw new DrawInputStop(`STOP: duplicate echeRowKey ${echeRowKey} in the frame.`);
    }
    seenEcheRowKeys.add(echeRowKey);

    if (!included) continue;

    if (seenOrganisationIds.has(organisationId)) {
      throw new DrawInputStop(
        `STOP: duplicate organisationId ${organisationId} among eligible frame entries.`,
      );
    }
    seenOrganisationIds.add(organisationId);

    const { rootAuthorityCount, rootAuthorities } = raw;
    if (typeof rootAuthorityCount !== 'number' || !Number.isInteger(rootAuthorityCount)) {
      throw new DrawInputStop(`STOP: eligible entry ${echeRowKey} has no integer authority count.`);
    }
    if (!Array.isArray(rootAuthorities)) {
      throw new DrawInputStop(`STOP: eligible entry ${echeRowKey} has no rootAuthorities array.`);
    }
    if (rootAuthorities.length !== rootAuthorityCount) {
      throw new DrawInputStop(
        `STOP: eligible entry ${echeRowKey} declares ${rootAuthorityCount} authorities but ` +
          `carries ${rootAuthorities.length}.`,
      );
    }
    if (rootAuthorityCount < 1) {
      throw new DrawInputStop(
        `STOP: eligible entry ${echeRowKey} has no root authority, so it is not eligible and ` +
          `the frame contradicts itself.`,
      );
    }

    eligible.push({
      echeRowKey,
      organisationId,
      rootAuthorityCount,
      rootAuthorities: rootAuthorities.map((token, index) =>
        parseAuthority(token, `eligible entry ${echeRowKey} authority ${index}`),
      ),
    });
  }

  if (eligible.length !== EXPECTED_ELIGIBLE_ORGANISATIONS) {
    throw new DrawInputStop(
      `STOP: ${eligible.length} eligible entries read, expected ${EXPECTED_ELIGIBLE_ORGANISATIONS}.`,
    );
  }

  return eligible;
}

/**
 * Reads, verifies and projects the frozen frame: the whole input step.
 *
 * Verification runs BEFORE any entry is projected, so a frame that fails any
 * check is never partially consumed.
 */
export function readFrozenFrame(repoRoot: string): FrozenFrame {
  const bytes = readFileSync(join(repoRoot, FRAME_ARTIFACT_PATH), 'utf8');
  const { artifactFileSha256, artifactBytes } = verifyFrameIdentity(bytes);
  const parsed = JSON.parse(bytes) as Record<string, unknown>;
  const eligible = projectEligibleEntries(parsed);

  return {
    artifactPath: FRAME_ARTIFACT_PATH,
    frameHash: FRAME_HASH,
    artifactFileSha256,
    artifactBytes,
    examinedOrganisationCount: (parsed.entries as unknown[]).length,
    eligible,
  };
}
