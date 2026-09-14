/**
 * PHASE 2B-2D2C-F4A — THE SEALED PROJECTOR, ON SYNTHETIC DATA ONLY.
 *
 * Every fixture here is hand-written. The real mixed adjudication file is
 * NEVER opened by this suite: the only real file it touches is the committed
 * canonical DEVELOPMENT corpus, through the allowlist loader.
 *
 * The synthetic rows are deliberately shaped like the real thing — keys in
 * canonical (sorted) order, so `ambiguity` and `corpusVersion` sit BEFORE
 * `goldId` and the router really has to skip a semantic value to reach the
 * routing key.
 *
 * The MUTATION TESTS are the point of the file. Each one fails if the
 * projector is weakened in a specific, named way:
 *
 *   parse-before-route   a non-DEV row whose tail is not valid JSON. A
 *                        projector that called `JSON.parse(line)` before
 *                        deciding membership would throw on it; one that
 *                        routes token-wise never looks at the tail.
 *   leaking a label      a non-DEV row's every semantic value is a unique
 *                        sentinel; none may appear in the emitted bytes.
 *   logging a discard    `console` and `process.stdout` are captured for the
 *                        whole projection and must record nothing.
 *   duplicate / missing  both fail closed rather than emitting 48 or 50.
 *   corpus ordering      the source is shuffled; the output is not.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { loadDevAllowlist } from '../harness/phase2b2d2c/goldProjection/allowlist.js';
import {
  ProjectionError,
  projectDevelopmentLabels,
  renderDevLabelFixture,
} from '../harness/phase2b2d2c/goldProjection/project.js';
import {
  FIXTURE_MANIFEST_PATH,
  FIXTURE_PATH,
  REQUIRED_AUTHORISATION,
  SUPPLEMENT_PATH,
  runProjection,
} from '../harness/phase2b2d2c/goldProjection/projectCli.js';
import {
  GoldIdRoutingError,
  routeGoldId,
} from '../harness/phase2b2d2c/goldProjection/routeGoldId.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** A unique marker per non-DEV field, so a leak is unambiguous in the output. */
const HOLDOUT_SENTINEL = 'SYNTHETIC-NON-DEV-VALUE-MUST-NOT-LEAK';

interface RowOptions {
  readonly goldId: string;
  readonly verdict?: 'UNIT_PAGE' | 'NOT_A_UNIT' | 'NEEDS_REVIEW';
  readonly sentinel?: string;
}

/** A schema-valid adjudication row with canonically sorted keys. */
function row(options: RowOptions): string {
  const sentinel = options.sentinel ?? 'dev-value';
  const verdict = options.verdict ?? 'NOT_A_UNIT';
  const isUnit = verdict === 'UNIT_PAGE';
  const isNonUnit = verdict === 'NOT_A_UNIT';
  const axis = isUnit ? '"YES"' : 'null';
  return JSON.stringify({
    ambiguity: `${sentinel}-ambiguity`,
    corpusVersion: 'orgunit-classifier-sonnet-acceptance-v1',
    difficulty: 'MODERATE',
    goldId: options.goldId,
    goldStatus: 'GOLD_CONFIRMED',
    organisationName: `${sentinel}-organisation`,
    proposed: {
      hard_negative: false,
      page_kind: isNonUnit ? 'NEWS_OR_EVENT_PAGE' : null,
      provides_language_learning_or_support: JSON.parse(axis) as unknown,
      serves_incoming_international_students: JSON.parse(axis) as unknown,
      serves_outgoing_mobility_students: JSON.parse(axis) as unknown,
      unit_name_expectation: { kind: 'ANY', name: null },
      unit_type: isUnit ? 'INTERNATIONAL_MOBILITY_OFFICE' : null,
      verdict,
    },
    provenance: 'OWNER',
    rationale: `${sentinel}-rationale`,
    title: `${sentinel}-title`,
    url: `https://example.invalid/${sentinel}`,
  });
}

function writeSource(lines: readonly string[]): { path: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'f4a-projector-'));
  const path = join(directory, 'mixed.jsonl');
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
  return { path, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

const DEV = ['g1111111111111111', 'g2222222222222222', 'g3333333333333333'];
const NON_DEV = ['gaaaaaaaaaaaaaaaa', 'gbbbbbbbbbbbbbbbb'];

describe('routeGoldId reads the routing key without deserializing the record', () => {
  it('finds a top-level goldId that sits after other keys', () => {
    expect(routeGoldId(Buffer.from(row({ goldId: DEV[0] as string })))).toBe(DEV[0]);
  });

  it('returns null for an object with no top-level goldId', () => {
    expect(routeGoldId(Buffer.from('{"a":1,"b":{"goldId":"g0000000000000000"}}'))).toBeNull();
  });

  it('never mistakes a nested or quoted goldId for the routing key', () => {
    const nested = '{"rationale":"the text \\"goldId\\": \\"gffffffffffffffff\\" appears here"}';
    expect(routeGoldId(Buffer.from(nested))).toBeNull();
  });

  it('skips a string value containing braces, brackets and escaped quotes', () => {
    const tricky = `{"ambiguity":"a {nested} [thing] with \\" and \\\\ inside","goldId":"${DEV[1] as string}"}`;
    expect(routeGoldId(Buffer.from(tricky))).toBe(DEV[1]);
  });

  it('refuses a goldId that is not a well-formed gold id', () => {
    expect(() => routeGoldId(Buffer.from('{"goldId":"not-a-gold-id"}'))).toThrow(
      GoldIdRoutingError,
    );
  });

  it('reports a byte offset and never a fragment of the line', () => {
    const secret = 'SECRET-CONTENT-THAT-MUST-NOT-APPEAR';
    try {
      routeGoldId(Buffer.from(`{"rationale":"${secret}",}`));
      expect.unreachable('expected a routing error');
    } catch (error) {
      expect(error).toBeInstanceOf(GoldIdRoutingError);
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).toMatch(/byte offset \d+/);
    }
  });
});

describe('the projector selects only allowlisted records', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('projects exactly the allowlist from an interleaved source', () => {
    const source = writeSource([
      row({ goldId: NON_DEV[0] as string, sentinel: HOLDOUT_SENTINEL }),
      row({ goldId: DEV[0] as string }),
      row({ goldId: NON_DEV[1] as string, sentinel: HOLDOUT_SENTINEL }),
      row({ goldId: DEV[1] as string, verdict: 'UNIT_PAGE' }),
      row({ goldId: DEV[2] as string }),
    ]);
    cleanup = source.cleanup;
    const result = projectDevelopmentLabels(source.path, DEV);
    expect(result.selected.map((record) => record.goldId)).toEqual(DEV);
    expect(result.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('MUTATION — a non-DEV label that leaked into the output would be detected', () => {
    const source = writeSource([
      row({ goldId: NON_DEV[0] as string, sentinel: HOLDOUT_SENTINEL }),
      ...DEV.map((goldId) => row({ goldId })),
      row({ goldId: NON_DEV[1] as string, sentinel: HOLDOUT_SENTINEL }),
    ]);
    cleanup = source.cleanup;
    const fixture = renderDevLabelFixture(projectDevelopmentLabels(source.path, DEV)).toString(
      'utf8',
    );
    expect(fixture).not.toContain(HOLDOUT_SENTINEL);
    for (const goldId of NON_DEV) expect(fixture).not.toContain(goldId);
    expect(fixture.trim().split('\n')).toHaveLength(DEV.length);
  });

  it('MUTATION — parsing a row before deciding membership would be detected', () => {
    // Valid JSON up to and including goldId, then deliberate garbage. A
    // token-level router stops at goldId and never sees the tail;
    // `JSON.parse(line)` would throw on it.
    const undeserializable = `{"goldId":"${NON_DEV[0] as string}","proposed":<<<NOT-JSON>>>}`;
    const source = writeSource([undeserializable, ...DEV.map((goldId) => row({ goldId }))]);
    cleanup = source.cleanup;
    expect(() => JSON.parse(undeserializable)).toThrow();
    const result = projectDevelopmentLabels(source.path, DEV);
    expect(result.selected.map((record) => record.goldId)).toEqual(DEV);
  });

  it('MUTATION — logging a discarded id would be detected', () => {
    const source = writeSource([
      row({ goldId: NON_DEV[0] as string, sentinel: HOLDOUT_SENTINEL }),
      ...DEV.map((goldId) => row({ goldId })),
    ]);
    cleanup = source.cleanup;
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true),
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true),
    ];
    try {
      projectDevelopmentLabels(source.path, DEV);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('MUTATION — a duplicate selected id fails closed', () => {
    const source = writeSource([
      ...DEV.map((goldId) => row({ goldId })),
      row({ goldId: DEV[1] as string }),
    ]);
    cleanup = source.cleanup;
    expect(() => projectDevelopmentLabels(source.path, DEV)).toThrow(ProjectionError);
    expect(() => projectDevelopmentLabels(source.path, DEV)).toThrow(/appears more than once/);
  });

  it('MUTATION — a missing selected id fails closed and names only DEV ids', () => {
    const source = writeSource([
      row({ goldId: DEV[0] as string }),
      row({ goldId: NON_DEV[0] as string, sentinel: HOLDOUT_SENTINEL }),
      row({ goldId: DEV[2] as string }),
    ]);
    cleanup = source.cleanup;
    try {
      projectDevelopmentLabels(source.path, DEV);
      expect.unreachable('expected a projection error');
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectionError);
      expect((error as Error).message).toContain(DEV[1] as string);
      expect((error as Error).message).not.toContain(NON_DEV[0] as string);
      expect((error as Error).message).not.toContain(HOLDOUT_SENTINEL);
    }
  });

  it('MUTATION — corpus ordering is enforced, not inherited from the source', () => {
    const shuffled = [DEV[2], DEV[0], DEV[1]] as string[];
    const source = writeSource([
      row({ goldId: NON_DEV[0] as string, sentinel: HOLDOUT_SENTINEL }),
      ...shuffled.map((goldId) => row({ goldId })),
    ]);
    cleanup = source.cleanup;
    const result = projectDevelopmentLabels(source.path, DEV);
    expect(result.selected.map((record) => record.goldId)).toEqual(DEV);
    expect(result.selected.map((record) => record.goldId)).not.toEqual(shuffled);
  });

  it('rejects a selected row that does not match the adjudication schema', () => {
    const malformed = JSON.stringify({ goldId: DEV[0], unexpected: true });
    const source = writeSource([
      malformed,
      row({ goldId: DEV[1] as string }),
      row({ goldId: DEV[2] as string }),
    ]);
    cleanup = source.cleanup;
    expect(() => projectDevelopmentLabels(source.path, DEV)).toThrow(
      /does not match the adjudication schema/,
    );
  });

  it('preserves a selected record byte for byte', () => {
    const line = row({ goldId: DEV[0] as string });
    const source = writeSource([
      line,
      row({ goldId: DEV[1] as string }),
      row({ goldId: DEV[2] as string }),
    ]);
    cleanup = source.cleanup;
    const result = projectDevelopmentLabels(source.path, DEV);
    expect(result.selected[0]?.rawLine.toString('utf8')).toBe(line);
  });

  it('hashes the WHOLE source, including the rows it discards', () => {
    const withNonDev = writeSource([
      row({ goldId: NON_DEV[0] as string, sentinel: HOLDOUT_SENTINEL }),
      ...DEV.map((goldId) => row({ goldId })),
    ]);
    const devOnly = writeSource(DEV.map((goldId) => row({ goldId })));
    try {
      const a = projectDevelopmentLabels(withNonDev.path, DEV);
      const b = projectDevelopmentLabels(devOnly.path, DEV);
      expect(a.sourceSha256).not.toBe(b.sourceSha256);
      expect(renderDevLabelFixture(a)).toEqual(renderDevLabelFixture(b));
    } finally {
      withNonDev.cleanup();
      devOnly.cleanup();
    }
  });

  it('handles a source larger than one read chunk', () => {
    const padding = 'x'.repeat(4096);
    const lines: string[] = [];
    for (let index = 0; index < 40; index += 1) {
      lines.push(row({ goldId: NON_DEV[0] as string, sentinel: `${HOLDOUT_SENTINEL}${padding}` }));
    }
    lines.splice(17, 0, row({ goldId: DEV[0] as string }));
    lines.push(row({ goldId: DEV[1] as string }), row({ goldId: DEV[2] as string }));
    const source = writeSource(lines);
    cleanup = source.cleanup;
    const result = projectDevelopmentLabels(source.path, DEV);
    expect(result.selected.map((record) => record.goldId)).toEqual(DEV);
    expect(renderDevLabelFixture(result).toString('utf8')).not.toContain(HOLDOUT_SENTINEL);
  });
});

describe('the DEVELOPMENT allowlist comes only from the approved canonical corpus', () => {
  const allowlist = loadDevAllowlist(REPO_ROOT);

  it('holds exactly the 49 frozen DEVELOPMENT ids, without a duplicate', () => {
    expect(allowlist.goldIds).toHaveLength(49);
    expect(new Set(allowlist.goldIds).size).toBe(49);
    for (const goldId of allowlist.goldIds) expect(goldId).toMatch(/^g[0-9a-f]{16}$/);
  });

  it('is bound to the F0B freeze and the canonical DEVELOPMENT corpus', () => {
    expect(allowlist.freezeRawSha256).toBe(
      'c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157',
    );
    expect(allowlist.corpusPath).toContain('canonical-v2.jsonl');
  });

  it('names the mixed source without this module opening it', () => {
    expect(allowlist.mixedSourcePath).toBe(
      'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl',
    );
  });
});

/**
 * THE FULL RUNNER, END TO END, AGAINST A SYNTHETIC SOURCE.
 *
 * `runProjection` takes a repository root and reads the mixed file at the
 * path the freeze names inside it — it has no override, so a caller cannot
 * point it somewhere convenient. This builds a SHADOW ROOT instead: the real
 * freeze, the real canonical DEVELOPMENT corpus and the real prepared
 * supplement, plus a SYNTHETIC adjudication file at the exact path the freeze
 * names. The real mixed file is never opened, and the real repository is
 * never written to.
 */
describe('the projection runner, end to end, on a synthetic source', () => {
  const allowlist = loadDevAllowlist(REPO_ROOT);
  const shadow = mkdtempSync(join(tmpdir(), 'f4a-shadow-root-'));

  const copy = (relative: string): void => {
    const destination = join(shadow, relative);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(REPO_ROOT, relative), destination);
  };

  copy('docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json');
  copy('docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json');
  copy(allowlist.corpusPath);
  copy(allowlist.corpusPath.replace('-v2.jsonl', '-v2.manifest.jsonl'));

  const syntheticSource = [
    row({ goldId: NON_DEV[0] as string, sentinel: HOLDOUT_SENTINEL }),
    ...allowlist.goldIds.slice(0, 20).map((goldId) => row({ goldId })),
    row({ goldId: NON_DEV[1] as string, sentinel: HOLDOUT_SENTINEL }),
    // Deliberately out of corpus order, to prove the runner re-orders.
    ...[...allowlist.goldIds.slice(20)].reverse().map((goldId) => row({ goldId })),
  ];
  mkdirSync(dirname(join(shadow, allowlist.mixedSourcePath)), { recursive: true });
  writeFileSync(join(shadow, allowlist.mixedSourcePath), `${syntheticSource.join('\n')}\n`, 'utf8');

  afterAll(() => rmSync(shadow, { recursive: true, force: true }));

  it('refuses every authorisation that is not the owner’s exact statement', () => {
    for (const wrong of ['go', 'approved', 'continue', 'I authorise the projection']) {
      expect(() => runProjection(shadow, wrong)).toThrow(/does not match the required text/);
    }
    expect(existsSync(join(shadow, FIXTURE_PATH))).toBe(false);
  });

  it('emits 49 DEVELOPMENT records, a manifest and a completed supplement', () => {
    const outcome = runProjection(shadow, REQUIRED_AUTHORISATION);
    expect(outcome.recordCount).toBe(49);
    expect(outcome.sourceSha256).toMatch(/^[0-9a-f]{64}$/);

    const fixture = readFileSync(join(shadow, FIXTURE_PATH), 'utf8');
    const lines = fixture.trim().split('\n');
    expect(lines).toHaveLength(49);
    const emittedIds = lines.map((line) => (JSON.parse(line) as { goldId: string }).goldId);
    expect(emittedIds).toEqual(allowlist.goldIds);
    expect(fixture).not.toContain(HOLDOUT_SENTINEL);
    for (const goldId of NON_DEV) expect(fixture).not.toContain(goldId);

    const manifest = JSON.parse(readFileSync(join(shadow, FIXTURE_MANIFEST_PATH), 'utf8')) as {
      recordCount: number;
      goldIds: string[];
      sourceRecordCountMeasured: boolean;
      sourceWholeFileSha256: string;
    };
    expect(manifest.recordCount).toBe(49);
    expect(manifest.goldIds).toEqual(allowlist.goldIds);
    expect(manifest.sourceRecordCountMeasured).toBe(false);
    expect(manifest.sourceWholeFileSha256).toBe(outcome.sourceSha256);

    const supplement = JSON.parse(readFileSync(join(shadow, SUPPLEMENT_PATH), 'utf8')) as {
      status: string;
      labelFixture: { recordCount: number; rawSha256: string; manifestRawSha256: string };
      provenance: { sourceWholeFileSha256: string; ownerAuthorisationStatement: string };
    };
    expect(supplement.status).toBe('ACTIVE_SCORING_ONLY');
    expect(supplement.labelFixture.recordCount).toBe(49);
    expect(supplement.labelFixture.rawSha256).toBe(outcome.fixtureSha256);
    expect(supplement.labelFixture.manifestRawSha256).toBe(outcome.fixtureManifestSha256);
    expect(supplement.provenance.ownerAuthorisationStatement).toBe(REQUIRED_AUTHORISATION);
  });

  it('leaves no non-DEVELOPMENT trace anywhere it wrote', () => {
    for (const relative of [FIXTURE_PATH, FIXTURE_MANIFEST_PATH, SUPPLEMENT_PATH]) {
      const text = readFileSync(join(shadow, relative), 'utf8');
      expect(text).not.toContain(HOLDOUT_SENTINEL);
      for (const goldId of NON_DEV) expect(text).not.toContain(goldId);
    }
  });

  it('never wrote into the real repository', () => {
    expect(existsSync(join(REPO_ROOT, FIXTURE_PATH))).toBe(false);
    expect(existsSync(join(REPO_ROOT, FIXTURE_MANIFEST_PATH))).toBe(false);
    const supplement = JSON.parse(readFileSync(join(REPO_ROOT, SUPPLEMENT_PATH), 'utf8')) as {
      status: string;
    };
    expect(supplement.status).toBe('PREPARED_AWAITING_AUTHORISED_PROJECTION');
  });
});
