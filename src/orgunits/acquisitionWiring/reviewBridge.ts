/**
 * WW E-W - THE ONE WIRING FILE THAT NAMES THE B2.3 OWNER REVIEW PATH (ADR 0030 s5).
 *
 * The batched identity review signs the EXISTING ADR 0023 owner-attested
 * review - one CONFIRMED decision about ONE subject, bound to that subject's
 * state digest and review head - for each subject the OWNER listed, and
 * appends it through the EXISTING reviewer path:
 *
 *   prepareReview (READ ONLY snapshot, this database's environment, evidence
 *   binding) -> signReviewIntent (the B2.3 offline signer's own primitive;
 *   the private key is decrypted ONLY by `decryptSigningKey` in
 *   subjectReview/signer.ts) -> VerifiedReviewEnvelope.verify (signature
 *   first, under the PINNED review trust set) -> appendAttestedReview (the
 *   reviewer capability, which re-verifies under the trust set it executes
 *   under).
 *
 * Nothing here is a second signer and nothing auto-approves: one decision
 * per subject, each subject named explicitly by the OWNER. The review trust
 * set is EMPTY in production, so every envelope is refused KEY_UNKNOWN.
 *
 * Opens no socket.
 */
import type { KeyObject } from 'node:crypto';
import type pg from 'pg';

import { deriveSubjectReadModel } from '../subjectRegistry/readModel.js';
import { TrustedReviewerContext } from '../subjectRegistry/reviewAuthority.js';
import { databaseNow, loadSubjectGraph } from '../subjectRegistry/store.js';
import { appendAttestedReview, prepareReview } from '../subjectRegistry/writer.js';
import {
  decryptSigningKey,
  readEncryptedSigningKeyFile,
  readPassphraseFromTerminal,
  signReviewIntent,
} from '../subjectReview/signer.js';
import { ReviewTrustSet } from '../subjectReview/trust.js';
import { VerifiedReviewEnvelope } from '../subjectReview/verify.js';

/** The pinned OWNER review trust set, under a name the wiring may pass around. */
export type OwnerReviewTrust = ReviewTrustSet;

/** A decrypted OWNER signing key, held in memory for ONE batch. */
export interface OwnerSigningKey {
  readonly keyId: string;
  readonly privateKey: KeyObject;
}

/**
 * Reads an ENCRYPTED PKCS#8 key under the B2.3 custody rules and decrypts it
 * with ONE passphrase (terminal, echo off, unless a test injects one).
 */
export async function loadOwnerSigningKey(
  path: string,
  keyId: string,
  passphrase?: () => Promise<Buffer>,
): Promise<OwnerSigningKey> {
  const pem = readEncryptedSigningKeyFile(path);
  const secret = await (
    passphrase ??
    (() =>
      readPassphraseFromTerminal(process.stdin, process.stderr, `Passphrase for key ${keyId}: `))
  )();
  return { keyId, privateKey: decryptSigningKey(pem, secret) };
}

/** The operational review trust set (EMPTY in this build). */
export function operationalReviewTrust(): OwnerReviewTrust {
  return ReviewTrustSet.operational();
}

/** What the OWNER is shown and signs against: the subject's review head and state digest. */
export interface SubjectReviewState {
  readonly head: string | null;
  readonly stateDigest: string;
}

/** Reads one subject's review head and state digest in ONE read-only snapshot; null when unknown. */
export async function readSubjectReviewState(
  readonly: pg.Pool,
  subjectId: string,
  trust: OwnerReviewTrust,
): Promise<SubjectReviewState | null> {
  const client = await readonly.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const graph = await loadSubjectGraph(client, subjectId, { asOf: await databaseNow(client) });
    if (graph === null) return null;
    const model = deriveSubjectReadModel(graph, trust);
    return { head: model.identityStatus.identityReviewHeadId, stateDigest: model.stateDigest };
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

/** The subject changed since the OWNER read it (WW H-ACQ P2-4): nothing was signed. */
export class SubjectStateChanged extends Error {
  readonly code = 'STATE_DIGEST_MISMATCH';
  constructor(readonly subjectId: string) {
    super(`STATE_DIGEST_MISMATCH: subject ${subjectId} is not in the state the OWNER confirmed`);
    this.name = 'SubjectStateChanged';
  }
}

/**
 * Signs and appends ONE OWNER CONFIRMED review of `subjectId`, ONLY if the
 * subject still reads at `expectedStateDigest` - the digest the OWNER was
 * shown by `review list` and named with `--expect` (WW H-ACQ P2-4). The
 * writer then re-checks head and digest under its own lock. Throws the
 * registry's or the protocol's own refusal on any failure; nothing is
 * written then.
 */
export async function signAndAppendSubjectReview(
  pools: { readonly readonly: pg.Pool; readonly reviewer: pg.Pool },
  subjectId: string,
  expectedStateDigest: string,
  key: OwnerSigningKey,
  trust: OwnerReviewTrust,
  nowMs: number,
): Promise<void> {
  const state = await readSubjectReviewState(pools.readonly, subjectId, trust);
  if (state === null) throw new Error(`subject ${subjectId} not found`);
  if (state.stateDigest !== expectedStateDigest) throw new SubjectStateChanged(subjectId);
  const head = state.head;
  const digest = state.stateDigest;
  const prepared = await prepareReview(
    pools.readonly,
    {
      target: { kind: 'SUBJECT', id: subjectId },
      outcome: 'CONFIRMED',
      expectedHeadReviewId: head,
      expectedStateDigest: digest,
      reason: null,
    },
    trust,
  );
  const signed = signReviewIntent(prepared.request.intent, {
    keyId: key.keyId,
    privateKey: key.privateKey,
    nowMs,
  });
  const verified = VerifiedReviewEnvelope.verify(Buffer.from(signed.envelope, 'utf8'), trust);
  await appendAttestedReview(
    pools.reviewer,
    TrustedReviewerContext.fromVerifiedEnvelope(verified),
    trust,
  );
}
