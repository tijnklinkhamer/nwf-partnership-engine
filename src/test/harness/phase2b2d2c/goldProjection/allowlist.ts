/**
 * PHASE 2B-2D2C-F4A — THE 49-ITEM DEVELOPMENT ALLOWLIST.
 *
 * The allowlist is built EXCLUSIVELY from the already-approved canonical
 * DEVELOPMENT corpus, through the same `loadDevCorpus` the runner and the
 * scorer use. That loader hash-verifies the committed corpus against the F0B
 * freeze BEFORE parsing, refuses any path the freeze lists never-read, and
 * throws on a row that is not `DEVELOPMENT`. So the allowlist cannot be
 * widened by editing a fixture, and no member of it was ever learned from the
 * mixed adjudication file.
 *
 * ORDER IS PART OF THE CONTRACT. These ids come out in canonical corpus line
 * order, and the projector emits in allowlist order, so the output can never
 * inherit the mixed file's own ordering — which would leak where DEVELOPMENT
 * rows sit among the HOLDOUT ones.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FREEZE_PATH } from '../constants.js';
import { loadDevCorpus } from '../corpus.js';
import { loadFreezeFromBytes } from '../freeze.js';

export interface DevAllowlist {
  /** The 49 DEVELOPMENT gold ids, in canonical corpus line order. */
  readonly goldIds: readonly string[];
  readonly corpusPath: string;
  readonly corpusRawSha256: string;
  readonly corpusContentSha256: string;
  readonly freezeRawSha256: string;
  readonly freezeVersion: string;
  /** The mixed file the freeze lists never-read, NAMED but not opened here. */
  readonly mixedSourcePath: string;
}

export function loadDevAllowlist(repoRoot: string): DevAllowlist {
  const freeze = loadFreezeFromBytes(readFileSync(join(repoRoot, FREEZE_PATH)));
  const corpus = loadDevCorpus(freeze.freeze, {
    read: (relative) => readFileSync(join(repoRoot, relative)),
  });
  const mixed = freeze.freeze.corpus.holdoutFilesNeverRead.filter((path) =>
    path.endsWith('-adjudication-v1.jsonl'),
  );
  if (mixed.length !== 1) {
    throw new Error(
      `expected exactly one adjudication file among the freeze's never-read list; found ${mixed.length}.`,
    );
  }
  return {
    goldIds: corpus.rows.map((row) => row.goldId),
    corpusPath: corpus.corpusPath,
    corpusRawSha256: corpus.corpusRawSha256,
    corpusContentSha256: corpus.contentSha256,
    freezeRawSha256: freeze.rawSha256,
    freezeVersion: freeze.freeze.version,
    mixedSourcePath: mixed[0] as string,
  };
}
