/**
 * WW E-W - THE CAMPAIGN OUTBOX (`nwf-pe.acquisition-outbox.v1`, ADR 0030 s6).
 *
 * The RESEARCHED and ASSESSABLE stages write files an Operator imports. JSON
 * only, owner-only permissions (directories 0700, files 0600), under ONE
 * absolute directory the operator chose, never a symlink, never outside it:
 *
 *   <outbox>/<campaignId>/outbox.json
 *       {"format":"nwf-pe.acquisition-outbox.v1","campaignId":...}
 *   <outbox>/<campaignId>/subjects/<subjectId>/qualification-input-export.v2.json
 *       the existing `nwf-pe.qualification-input-export.v2` document, verbatim
 *   <outbox>/<campaignId>/subjects/<subjectId>/subject-facts-export.v1.json
 *       the existing `nwf-pe.subject-facts-export.v1` document, verbatim
 *   <outbox>/<campaignId>/manifest.jsonl
 *       one line per ASSESSABLE subject (an OWNER-signed identity review was
 *       appended before it was released), rebuilt from the database rows on
 *       every write, so a retry never duplicates a line
 *
 * No page text is written beyond what the v2 export itself carries (its
 * redacted proposal quotes); no response body, no contact, no score. Every
 * write is an exclusively created, randomly named temporary file, fsync'd,
 * renamed, and its directory fsync'd before the database row (WW H-ACQ
 * P2-14); every directory must be this user's own and is kept at 0700; the
 * manifest is rebuilt under a per-campaign lock, and only for a subject whose
 * identity review head is an attested CONFIRMED review (P2-4). The database row
 * (`acquisition_outbox_entries`) records each file's SHA-256 and is the
 * idempotency key: a retried attempt does not rewrite a recorded entry.
 *
 * RESEARCHED -> IDENTITY_REVIEW, where the worker parks the item as
 * AWAITING_HUMAN / OWNER_IDENTITY_REVIEW by itself. ASSESSABLE -> end.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { isAbsolute, join, normalize } from 'node:path';

import type {
  StageHandler,
  StageHandlerContext,
  StageOutcome,
  WorkItemView,
} from '../acquisition/index.js';
import { exportQualificationInputV2, exportSubjectFacts } from './exportPort.js';
import type { WiringDeps } from './context.js';
import { OUTBOX_FORMAT, loadOutboxEntries, recordOutboxEntry } from './records.js';

export const OUTBOX_EXPORT_V2_FILE = 'qualification-input-export.v2.json';
export const OUTBOX_SUBJECT_FACTS_FILE = 'subject-facts-export.v1.json';
export const OUTBOX_MANIFEST_FILE = 'manifest.jsonl';
export const OUTBOX_DESCRIPTOR_FILE = 'outbox.json';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class OutboxRefusal extends Error {
  constructor(readonly reason: string) {
    super(`OUTBOX_REFUSED: ${reason}`);
    this.name = 'OutboxRefusal';
  }
}

/** The uid every outbox directory must belong to: this process's own (null where unknown). */
function ownUid(): number | null {
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

/**
 * WW H-ACQ (P2-14): a directory of the outbox must be a real directory owned
 * by THIS process's user; its mode is (re-)applied to 0700, so a directory an
 * earlier umask or a hand edit widened is narrowed before anything is written
 * into it.
 */
function claimDirectory(path: string, reason: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new OutboxRefusal(reason);
  const uid = ownUid();
  if (uid !== null && stat.uid !== uid) throw new OutboxRefusal('outbox_not_owned');
  if ((stat.mode & 0o777) !== 0o700) chmodSync(path, 0o700);
}

/**
 * Refuses a relative, non-canonical, missing, non-directory or symlinked
 * outbox root, and (WW H-ACQ P2-14) one owned by another user; re-applies
 * mode 0700 to it.
 */
export function assertOutboxRoot(root: string | null): string {
  if (root === null || !isAbsolute(root) || normalize(root) !== root) {
    throw new OutboxRefusal('outbox_not_absolute_canonical');
  }
  let stat;
  try {
    stat = lstatSync(root);
  } catch {
    throw new OutboxRefusal('outbox_missing');
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new OutboxRefusal('outbox_not_directory');
  claimDirectory(root, 'outbox_not_directory');
  return root;
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  claimDirectory(path, 'outbox_path_unsafe');
}

/**
 * Flushes a directory's entries (a rename is durable only once its directory
 * is). Node's fsync is libuv's, which on macOS issues F_FULLFSYNC (falling
 * back to F_BARRIERFSYNC, then fsync) - the drive cache is flushed too.
 */
function fsyncDirectory(dir: string): void {
  const fd = openSync(dir, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Writes `bytes` to `path` atomically, mode 0600 (WW H-ACQ P2-14): a
 * temporary file with a RANDOM name created exclusively (O_EXCL, O_NOFOLLOW:
 * never an existing file or link), every byte written, the file fsync'd,
 * renamed into place, and its directory fsync'd - all before the caller
 * records the digest in the database. A failure removes the temporary file.
 */
function writeAtomic(path: string, bytes: Buffer): void {
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  const fd = openSync(
    tmp,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    try {
      let offset = 0;
      while (offset < bytes.length) {
        const n = writeSync(fd, bytes, offset, bytes.length - offset);
        if (n <= 0) throw new OutboxRefusal('outbox_short_write');
        offset += n;
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // already renamed or never created
    }
    throw error;
  }
  fsyncDirectory(dirname(path));
}

const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function campaignDir(root: string, campaignId: string): string {
  if (!UUID.test(campaignId)) throw new OutboxRefusal('campaign_id_invalid');
  const dir = join(root, campaignId);
  ensureDir(dir);
  const descriptor = join(dir, OUTBOX_DESCRIPTOR_FILE);
  writeAtomic(descriptor, json({ format: OUTBOX_FORMAT, campaignId }));
  return dir;
}

function subjectDir(root: string, campaignId: string, subjectId: string): string {
  if (!UUID.test(subjectId)) throw new OutboxRefusal('subject_id_invalid');
  const subjects = join(campaignDir(root, campaignId), 'subjects');
  ensureDir(subjects);
  const dir = join(subjects, subjectId);
  ensureDir(dir);
  return dir;
}

/**
 * The exports evaluate "as of" a WHOLE second of the database clock, so a
 * record written within the current second is not yet in them. Wait (on the
 * worker's clock, at most a little over one second) until every record this
 * campaign wrote for the subject - the subject, its claims, its research
 * runs' completions - and the stage's own work item is strictly in the past
 * whole second. For the ASSESSABLE pair that item is created by the OWNER's
 * release, which `review sign` performs only AFTER the review and any country
 * statement were committed, so the pair sees both.
 */
async function settleWholeSecond(
  deps: WiringDeps,
  item: WorkItemView,
  ctx: StageHandlerContext,
): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    const { rows } = await deps.pools.readonly.query<{ wait_ms: number }>(
      `SELECT GREATEST(0, ceil(1000 * (extract(epoch FROM date_trunc('second', latest))
                                       + 1 - extract(epoch FROM clock_timestamp()))))::int AS wait_ms
         FROM (SELECT GREATEST(
                 (SELECT max(created_at) FROM discovery_subjects WHERE id = $1),
                 (SELECT max(created_at) FROM discovery_subject_identity_claims WHERE subject_id = $1),
                 (SELECT created_at FROM acquisition_work_items WHERE id = $2),
                 (SELECT max(c.finished_at)
                    FROM subject_research_admissions a
                    JOIN orgunit_research_runs r ON r.root_scope = 'subject_admission:' || a.id::text
                    JOIN orgunit_research_run_completions c ON c.run_id = r.id
                   WHERE a.subject_id = $1)) AS latest) t`,
      [item.subjectId, item.id],
    );
    const waitMs = rows[0]?.wait_ms ?? 0;
    if (waitMs <= 0) return;
    await ctx.clock.sleep(waitMs + 5);
  }
}

async function writeResearchExport(
  deps: WiringDeps,
  item: WorkItemView,
  ctx: StageHandlerContext,
): Promise<void> {
  const root = assertOutboxRoot(deps.outboxDir);
  const existing = (
    await loadOutboxEntries(deps.pools.readonly, item.campaignId, 'RESEARCH_EXPORT')
  ).find((e) => e.workItemId === item.id);
  if (existing !== undefined) return;
  const pair = await writeExportPair(deps, root, item, ctx);
  await recordOutboxEntry(deps.pools.worker, item, { kind: 'RESEARCH_EXPORT', ...pair });
}

/** Derives the subject's export pair as of a settled whole second and writes both files. */
async function writeExportPair(
  deps: WiringDeps,
  root: string,
  item: WorkItemView,
  ctx: StageHandlerContext,
): Promise<{ readonly exportV2Sha256: string; readonly subjectFactsSha256: string }> {
  await settleWholeSecond(deps, item, ctx);
  const exportV2 = json(
    await exportQualificationInputV2(deps.pools.readonly, {
      subjectId: item.subjectId,
      evaluatedAt: null,
    }),
  );
  const facts = json(await exportSubjectFacts(deps.pools.readonly, [item.subjectId]));
  const dir = subjectDir(root, item.campaignId, item.subjectId);
  writeAtomic(join(dir, OUTBOX_EXPORT_V2_FILE), exportV2);
  writeAtomic(join(dir, OUTBOX_SUBJECT_FACTS_FILE), facts);
  return { exportV2Sha256: sha256(exportV2), subjectFactsSha256: sha256(facts) };
}

/** One manifest line of `nwf-pe.acquisition-outbox.v1`. */
export interface OutboxManifestLine {
  readonly format: typeof OUTBOX_FORMAT;
  readonly entry: 'ASSESSABLE';
  readonly campaignId: string;
  readonly subjectId: string;
  readonly workItemId: string;
  readonly identityReview: 'OWNER_SIGNED_REVIEW_APPENDED';
  readonly files: {
    readonly qualificationInputExportV2: { readonly path: string; readonly sha256: string };
    readonly subjectFactsExportV1: { readonly path: string; readonly sha256: string };
  };
  readonly recordedAt: string;
}

/** WW H-ACQ (P2-4): is the subject's identity review head an attested CONFIRMED review? */
async function identityConfirmed(deps: WiringDeps, subjectId: string): Promise<boolean> {
  const { rows } = await deps.pools.readonly.query<{ ok: boolean }>(
    'SELECT acquisition_subject_identity_confirmed($1) AS ok',
    [subjectId],
  );
  return rows[0]?.ok === true;
}

/**
 * Runs `fn` holding a SESSION advisory lock on this campaign's manifest
 * (WW H-ACQ P2-14), so two workers never rebuild the manifest from different
 * row sets and the last writer always writes the latest rows. Released on
 * return, or by the server when the session ends.
 */
async function withManifestLock<T>(
  deps: WiringDeps,
  campaignId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await deps.pools.worker.connect();
  const key = `nwf-acq-outbox-manifest:${campaignId}`;
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key]);
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]);
    }
  } finally {
    client.release();
  }
}

/**
 * WW acceptance fix: the manifest names the export pair RE-DERIVED after the
 * OWNER-signed review, never the RESEARCHED stage's pre-review pair. The
 * review is where the OWNER may state the subject's country from its own page
 * (`review sign --country`); a pre-review export would hand the Operator
 * `country.value: null` (NO_STATED_COUNTRY, not rankable) for every subject.
 * The files are rewritten in place (the Operator accepts exactly one path per
 * subject and checks the manifest's SHA-256); the RESEARCH_EXPORT row keeps
 * the digest of what was written then. On a retry after the row exists the
 * pair is not derived again: the files already match the recorded digests.
 */
async function writeManifest(
  deps: WiringDeps,
  item: WorkItemView,
  ctx: StageHandlerContext,
): Promise<boolean> {
  const root = assertOutboxRoot(deps.outboxDir);
  // P2-4: an ASSESSABLE line only for an OWNER-attested CONFIRMED identity.
  if (!(await identityConfirmed(deps, item.subjectId))) return false;
  const recorded = (
    await loadOutboxEntries(deps.pools.readonly, item.campaignId, 'ASSESSABLE_MANIFEST')
  ).some((e) => e.workItemId === item.id);
  if (!recorded) {
    const exports = await loadOutboxEntries(
      deps.pools.readonly,
      item.campaignId,
      'RESEARCH_EXPORT',
    );
    if (!exports.some((e) => e.subjectId === item.subjectId)) {
      throw new OutboxRefusal('research_export_missing');
    }
    const pair = await writeExportPair(deps, root, item, ctx);
    await recordOutboxEntry(deps.pools.worker, item, { kind: 'ASSESSABLE_MANIFEST', ...pair });
  }
  await withManifestLock(deps, item.campaignId, () => rebuildManifest(deps, root, item));
  return true;
}

async function rebuildManifest(deps: WiringDeps, root: string, item: WorkItemView): Promise<void> {
  const entries = await loadOutboxEntries(
    deps.pools.readonly,
    item.campaignId,
    'ASSESSABLE_MANIFEST',
  );
  const lines = entries.map((e): OutboxManifestLine => ({
    format: OUTBOX_FORMAT,
    entry: 'ASSESSABLE',
    campaignId: item.campaignId,
    subjectId: e.subjectId,
    workItemId: e.workItemId,
    identityReview: 'OWNER_SIGNED_REVIEW_APPENDED',
    files: {
      qualificationInputExportV2: {
        path: `subjects/${e.subjectId}/${OUTBOX_EXPORT_V2_FILE}`,
        sha256: e.exportV2Sha256,
      },
      subjectFactsExportV1: {
        path: `subjects/${e.subjectId}/${OUTBOX_SUBJECT_FACTS_FILE}`,
        sha256: e.subjectFactsSha256,
      },
    },
    recordedAt: e.recordedAt,
  }));
  writeAtomic(
    join(campaignDir(root, item.campaignId), OUTBOX_MANIFEST_FILE),
    Buffer.from(lines.map((l) => `${JSON.stringify(l)}\n`).join(''), 'utf8'),
  );
}

export function researchedHandler(deps: WiringDeps): StageHandler {
  return {
    stage: 'RESEARCHED',
    async handle(item, ctx): Promise<StageOutcome> {
      await writeResearchExport(deps, item, ctx);
      return { kind: 'ADVANCED', next: 'IDENTITY_REVIEW' };
    },
  };
}

export function assessableHandler(deps: WiringDeps): StageHandler {
  return {
    stage: 'ASSESSABLE',
    async handle(item, ctx): Promise<StageOutcome> {
      if (!(await writeManifest(deps, item, ctx))) {
        return { kind: 'REFUSED', reason: 'POLICY_REFUSED' };
      }
      return { kind: 'ADVANCED', next: null };
    },
  };
}
