// PHASE 2B-2D2C-F1 test fixture: a SCRIPTED child for the real-process
// coordinator tests. It speaks the Tier-2 protocol like the real child
// entry, reads the manifest the coordinator wrote, and then follows ONE
// behaviour named by its first argument, writing artifacts through the
// REAL write-once artifact writer (via tsx) so the parent re-reads exactly
// what a real child would have left behind. No network, no database, no
// provider; nothing outside the attempt directory is written.
import { register } from 'tsx/esm/api';

const SHUTDOWN_REQUEST_MESSAGE = 'nwf-pe-tier2:shutdown-request';
const SHUTDOWN_ACK_MESSAGE = 'nwf-pe-tier2:shutdown-ack';

const behaviour = process.argv[2];
const manifestFlag = process.argv.indexOf('--manifest');
const manifestPath = process.argv[manifestFlag + 1];

register();
const { readFileSync } = await import('node:fs');
const { writeArtifactOnce } = await import('../../harness/phase2b2d2c/artifacts.js');
const { canonicalStringify } = await import('../../../orgunits/classify/canonical.js');
const { createHash } = await import('node:crypto');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')).record;
const dir = manifest.attemptDir;
const write = (kind, record) => writeArtifactOnce(dir, kind, record);

const preflightOk = () =>
  write('CHILD_PREFLIGHT', { ok: true, stopCondition: null, detail: 'fixture', checks: [], providerConstructed: false });

const rawOutput = { results: [] };
const rawSerialization = canonicalStringify(rawOutput);
const rawSha256 = createHash('sha256').update(rawSerialization, 'utf8').digest('hex');
const writeRaw = () =>
  write('RAW_OUTPUT_CHECKPOINT', {
    rawOutputCanonicalSerialization: rawSerialization,
    rawOutputSha256: rawSha256,
    rawOutputUtf8Bytes: Buffer.byteLength(rawSerialization, 'utf8'),
  });

const completeOk = (providerReportedModelId) => {
  preflightOk();
  writeRaw();
  write('VALIDATION_RESULT', { kind: 'SCHEMA_INVALID', detail: 'fixture: empty results', accepted: [], rejected: [] });
  write('PROVIDER_OUTCOME', {
    outcome: 'OK',
    providerReportedModelId,
    inputTokens: 1,
    outputTokens: 1,
    outcomeDetail: null,
    internalAdapterAttemptCountWhereObservable: 1,
    authStatusInvocationsObserved: 1,
    startedAtUtc: '2026-09-13T00:00:00.000Z',
    endedAtUtc: '2026-09-13T00:00:01.000Z',
    monotonicWallTimeMs: 1000,
    tier1DiagnosticsCaptured: 0,
  });
  write('CHILD_RESULT', {
    variantName: manifest.variantName,
    logicalBatchOrdinal: manifest.logicalBatchOrdinal,
    attemptNo: manifest.attemptNo,
    providerOutcome: 'OK',
    providerReportedModelId,
    rawCheckpointPersistedBeforeValidation: true,
    rawBeforeValidationSequence: { persistedSeq: 1, validationStartedSeq: 2 },
    childStopCondition: null,
    artifactHashes: {},
  });
};

let shuttingDown = false;
const cooperativeShutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (process.connected) process.send(SHUTDOWN_ACK_MESSAGE, () => process.exit(3));
  else process.exit(3);
};

switch (behaviour) {
  case 'completes-ok':
    completeOk(manifest.requestedModelId);
    break;
  case 'completes-wrong-model':
    completeOk(`${manifest.requestedModelId}-other`);
    break;
  case 'crashes-before-raw':
    preflightOk();
    process.exit(1);
    break;
  case 'crashes-after-raw':
    preflightOk();
    writeRaw();
    process.exit(1);
    break;
  case 'never-exits':
    // Wedged: SIGTERM ignored, no IPC listener — only the hard kill ends it.
    preflightOk();
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1 << 30);
    break;
  case 'exits-without-ack':
    preflightOk();
    process.on('message', (m) => {
      if (m === SHUTDOWN_REQUEST_MESSAGE) process.exit(0);
    });
    setInterval(() => {}, 1 << 30);
    break;
  case 'cooperative-hang':
    preflightOk();
    process.on('message', (m) => {
      if (m === SHUTDOWN_REQUEST_MESSAGE) cooperativeShutdown();
    });
    process.on('SIGTERM', cooperativeShutdown);
    setInterval(() => {}, 1 << 30);
    break;
  case 'dumps-environment':
    write('CHILD_PREFLIGHT', {
      ok: true,
      stopCondition: null,
      detail: 'fixture: environment dump',
      checks: [],
      providerConstructed: false,
      environmentNames: Object.keys(process.env).sort(),
      execArgv: process.execArgv,
    });
    break;
  default:
    process.stderr.write(`fixtureChild: unknown behaviour ${behaviour}\n`);
    process.exit(2);
}
if (process.connected && behaviour !== 'never-exits' && behaviour !== 'exits-without-ack' && behaviour !== 'cooperative-hang') {
  process.disconnect();
}
