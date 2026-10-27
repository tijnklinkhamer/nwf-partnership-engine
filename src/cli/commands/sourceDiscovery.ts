/**
 * `nwf-pe orgunits discover-sources ...` and `nwf-pe orgunits nominations ...`
 * - REL L2 / U1 independent source discovery.
 *
 *   discover-sources   prints ONE geography's queries of ONE known brief. It is
 *                      a DRY RUN: no provider, no network, no database. With
 *                      --execute it REFUSES - live search is not authorised and
 *                      no SourceDiscoveryAuthorisation can be built from here.
 *   discover-sources --execute --grant-id <uuid>
 *                      WW E-SD (ADR 0027/0028): ONE live run under ONE stored
 *                      OWNER-path grant, on the source-discovery capability.
 *                      The scope (plan, geography, model, budgets) comes from
 *                      the grant row alone; without a valid grant it refuses
 *                      with the grant's stable GRANT_* code and opens no run.
 *   nominations list   one bounded, keyset-paginated page (readonly role).
 *   nominations show   ONE nomination, its registrable domain's identity and
 *                      a bounded page of that identity's link-out sightings
 *                      (readonly role; REL P2, migration 0020).
 *   nominations promote
 *                      ONE nomination -> ONE discovery subject through the
 *                      EXISTING B2.2 writer (dry run on the readonly role by
 *                      default; --execute on the writer capability).
 *
 * NARROW BY CONSTRUCTION, like `discovery-subjects`: each subcommand parses its
 * own strict option set; there is no batch, no "every geography", no generic
 * SQL and no credential option. This file imports neither the Claude Max
 * adapter nor its authorisation: a granted run is reached only through
 * `grantedRun.js`, which derives the authorisation from the stored grant.
 * Nothing here fetches a URL, starts research or contacts anyone.
 */
import { parseArgs } from 'node:util';
import type pg from 'pg';

import { createPool } from '../../db/client.js';
import { env } from '../../config/env.js';
import {
  productionLiveSearchDeps,
  type LiveSearchDeps,
} from '../../orgunits/sourceDiscovery/agentQuery.js';
import {
  BriefRefusal,
  briefByKey,
  briefDigest,
  queriesFor,
} from '../../orgunits/sourceDiscovery/brief.js';
import {
  GrantedRunInternalError,
  GrantedRunRefusal,
  runGrantedSourceDiscovery,
} from '../../orgunits/sourceDiscovery/grantedRun.js';
import { SUBJECT_KINDS, type SubjectKind } from '../../orgunits/sourceDiscovery/identityBridge.js';
import {
  PromotionRefusal,
  assertCanonicalNomination,
  promoteNomination,
  promotionRequest,
} from '../../orgunits/sourceDiscovery/promote.js';
import {
  NOMINATION_LIST_DEFAULT_LIMIT,
  NOMINATION_LIST_MAX_LIMIT,
  SIGHTING_LIST_MAX_LIMIT,
  listNominationSightings,
  listNominations,
  loadNomination,
  loadNominationIdentity,
} from '../../orgunits/sourceDiscovery/store.js';
import { UUID_SHAPE } from '../../orgunits/sourceDiscovery/types.js';

export const SOURCE_DISCOVERY_CONTRACT = 'nwf-pe.source-discovery.v1';

/** The opaque path key a CLI-started granted run records (never a person). */
export const SOURCE_DISCOVERY_CLI_ACTOR_KEY = 'source-discovery-cli';

export const SOURCE_DISCOVERY_USAGE = `nwf-pe orgunits - independent source discovery (REL L2)

  orgunits discover-sources    --brief <brief-key> --geography <CC> [--json]
                               DRY RUN: prints the brief's queries for ONE geography.
                               --execute is REFUSED: live search is not authorised.
  orgunits discover-sources    --execute --grant-id <uuid> [--json]
                               ONE live WebSearch-only run under ONE stored OWNER-path
                               grant (ADR 0027/0028). Plan, geography, model and budgets
                               come from the grant row; an invalid grant refuses GRANT_*.
  orgunits nominations list    [--run-id <uuid>] [--limit <1-${NOMINATION_LIST_MAX_LIMIT}>]
                               [--after <uuid>] [--json]
  orgunits nominations show    --nomination-id <uuid> [--limit <1-${SIGHTING_LIST_MAX_LIMIT}>] [--json]
                               ONE nomination, the identity of its registrable domain
                               (first nomination, counts) and that identity's link-out
                               sightings (page evidence, run, redacted anchor text).
  orgunits nominations promote --nomination-id <uuid> --subject-id <uuid> --kind <KIND>
                               [--name-language <tag>] [--execute] [--json]
                               Registers ONE discovery subject whose NAME claim cites the
                               nomination (PUBLIC_URL, observed at its retrieval time).
                               DRY RUN unless --execute. Nothing promotes automatically.
                               Only the FIRST nomination of a registrable domain is
                               promotable. Promotion fetches nothing: research of the new
                               subject needs a review and its own OWNER admission.
`;

const OUTPUT = { json: { type: 'boolean' } } as const;

const OPTIONS = {
  'discover-sources': {
    brief: { type: 'string' },
    geography: { type: 'string' },
    execute: { type: 'boolean' },
    'grant-id': { type: 'string' },
    ...OUTPUT,
  },
  'nominations list': {
    'run-id': { type: 'string' },
    limit: { type: 'string' },
    after: { type: 'string' },
    ...OUTPUT,
  },
  'nominations show': {
    'nomination-id': { type: 'string' },
    limit: { type: 'string' },
    ...OUTPUT,
  },
  'nominations promote': {
    'nomination-id': { type: 'string' },
    'subject-id': { type: 'string' },
    kind: { type: 'string' },
    'name-language': { type: 'string' },
    execute: { type: 'boolean' },
    ...OUTPUT,
  },
} as const;

type CommandKey = keyof typeof OPTIONS;

export interface SourceDiscoveryCliDeps {
  readonly readonlyPool?: () => pg.Pool;
  readonly writerPool?: () => pg.Pool;
  /** WW E-SD: the source-discovery capability pool and live-search dependencies (tests inject fakes). */
  readonly sourceDiscoveryPool?: () => pg.Pool;
  readonly liveSearchDeps?: () => LiveSearchDeps;
  readonly out?: (text: string) => void;
  readonly err?: (text: string) => void;
}

class UsageError extends Error {}

type Values = Record<string, string | boolean | undefined>;

function str(values: Values, name: string): string | undefined {
  const v = values[name];
  return typeof v === 'string' ? v : undefined;
}

function required(values: Values, name: string): string {
  const v = str(values, name);
  if (v === undefined || v.length === 0) throw new UsageError(`--${name} is required.`);
  return v;
}

function uuid(values: Values, name: string): string {
  const v = required(values, name);
  if (!UUID_SHAPE.test(v)) throw new UsageError(`--${name} must be a lower-case UUID.`);
  return v;
}

function envelope(command: string, outcome: string, body: Record<string, unknown>): string {
  return `${JSON.stringify({ contract: SOURCE_DISCOVERY_CONTRACT, command, outcome, ...body }, null, 2)}\n`;
}

async function withPoolOf<T>(make: () => pg.Pool, fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = make();
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

/** Runs one invocation. `argv` starts at `discover-sources` or `nominations`. */
export async function runSourceDiscoveryCli(
  argv: readonly string[],
  deps: SourceDiscoveryCliDeps = {},
): Promise<number> {
  const out = deps.out ?? ((t: string) => void process.stdout.write(t));
  const err = deps.err ?? ((t: string) => void process.stderr.write(t));
  const readonlyPool = deps.readonlyPool ?? (() => createPool('readonly'));
  const writerPool =
    deps.writerPool ??
    (() => {
      if (env().DATABASE_URL_DISCOVERY_SUBJECT_WRITER === undefined) {
        throw new UsageError(
          'DATABASE_URL_DISCOVERY_SUBJECT_WRITER is not set: promote --execute needs a ' +
            'deployment-provisioned login holding nwf_discovery_subject_writer.',
        );
      }
      return createPool('discovery_subject_writer');
    });

  const [first, second, ...tail] = argv;
  const key = (first === 'nominations' ? `nominations ${second ?? ''}` : first) as CommandKey;
  const rest = first === 'nominations' ? tail : [second, ...tail].filter((a) => a !== undefined);
  if (!Object.hasOwn(OPTIONS, key) || rest.includes('--help') || rest.includes('-h')) {
    out(SOURCE_DISCOVERY_USAGE);
    return Object.hasOwn(OPTIONS, key) ? 0 : 1;
  }

  let values: Values;
  try {
    values = parseArgs({
      args: [...rest],
      options: OPTIONS[key],
      strict: true,
      allowPositionals: false,
    }).values as Values;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (rest.includes('--json')) out(envelope(key, 'REFUSED', { code: 'INPUT_INVALID', detail }));
    err(`REFUSED INPUT_INVALID: ${detail}\n`);
    return 1;
  }
  const json = values['json'] === true;
  const refuse = (code: string, detail: string) => {
    if (json) out(envelope(key, 'REFUSED', { code, detail }));
    err(`REFUSED ${code}: ${detail}\n`);
    return 1;
  };

  const sourceDiscoveryPool =
    deps.sourceDiscoveryPool ??
    (() => {
      if (env().DATABASE_URL_SOURCE_DISCOVERY === undefined) {
        throw new UsageError(
          'DATABASE_URL_SOURCE_DISCOVERY is not set: a granted run needs a ' +
            'deployment-provisioned login holding nwf_source_discovery.',
        );
      }
      return createPool('source_discovery');
    });

  try {
    switch (key) {
      case 'discover-sources': {
        const grantId = str(values, 'grant-id');
        if (grantId !== undefined) {
          if (values['execute'] !== true) throw new UsageError('--grant-id requires --execute.');
          if (str(values, 'brief') !== undefined || str(values, 'geography') !== undefined) {
            throw new UsageError(
              'with --grant-id the plan and geography come from the stored grant alone; ' +
                'omit --brief and --geography.',
            );
          }
          const live = (deps.liveSearchDeps ?? productionLiveSearchDeps)();
          const run = await withPoolOf(sourceDiscoveryPool, (pool) =>
            runGrantedSourceDiscovery(
              pool,
              { grantId, actorKey: SOURCE_DISCOVERY_CLI_ACTOR_KEY },
              { ...live, clock: { now: () => new Date() } },
            ),
          );
          if (json) {
            out(envelope(key, run.outcome, { data: run }));
          } else {
            out(
              `${run.outcome}${run.reason === null ? '' : ` ${run.reason}`} run ${run.runId} ` +
                `(grant ${run.grantId} slot ${run.runSeq}, ${run.geography}, ${run.modelId})\n`,
            );
            for (const c of run.calls) {
              out(`  ${c.callSeq}\t${c.queryId}\t${c.outcome}\t${c.resultCount ?? '-'}\n`);
            }
            out(
              `${run.inserted} nomination(s) inserted, ${run.duplicates} duplicate(s), ` +
                `${run.refused} refused, ${run.alreadyKnown} already known. Nothing was fetched.\n`,
            );
          }
          return run.outcome === 'COMPLETED' ? 0 : 1;
        }
        const brief = briefByKey(required(values, 'brief'));
        const geography = required(values, 'geography');
        const section = queriesFor(brief, geography);
        if (values['execute'] === true) {
          return refuse(
            'LIVE_SEARCH_NOT_AUTHORISED',
            'discover-sources --execute requires a sealed source-discovery authorisation, which has no ' +
              'production constructor: live search is not authorised in this build.',
          );
        }
        const data = {
          briefKey: brief.briefKey,
          planDigest: briefDigest(brief),
          geography,
          languages: section.languages,
          queries: section.queries,
        };
        if (json) {
          out(envelope(key, 'DRY_RUN', { data }));
        } else {
          out(`brief ${data.briefKey} (plan ${data.planDigest})\n`);
          out(`geography ${geography}, languages ${section.languages.join(', ')}\n`);
          for (const q of section.queries) out(`  ${q.queryId}\t${q.targetKind}\t${q.text}\n`);
          out(`${section.queries.length} queries. DRY RUN: nothing was searched or stored.\n`);
        }
        return 0;
      }
      case 'nominations list': {
        const runId = str(values, 'run-id');
        const after = str(values, 'after');
        if (runId !== undefined && !UUID_SHAPE.test(runId)) {
          throw new UsageError('--run-id must be a lower-case UUID.');
        }
        if (after !== undefined && !UUID_SHAPE.test(after)) {
          throw new UsageError('--after must be a lower-case UUID.');
        }
        const rawLimit = str(values, 'limit');
        const limit = rawLimit === undefined ? NOMINATION_LIST_DEFAULT_LIMIT : Number(rawLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > NOMINATION_LIST_MAX_LIMIT) {
          throw new UsageError(`--limit must be an integer 1-${NOMINATION_LIST_MAX_LIMIT}.`);
        }
        const rows = await withPoolOf(readonlyPool, (pool) =>
          listNominations(pool, { runId: runId ?? null, after: after ?? null, limit }),
        );
        if (json) {
          out(envelope(key, 'READ', { data: { nominations: rows } }));
        } else {
          for (const r of rows) {
            const flags = [r.echeOverlap ? 'ECHE_OVERLAP' : null, r.heiSignal ? 'HEI_SIGNAL' : null]
              .filter((f) => f !== null)
              .join(',');
            out(`${r.id}\t${r.discoveryMethod}\t${r.url}\t${flags}\t${r.title ?? ''}\n`);
          }
          out(`${rows.length} nomination(s).\n`);
        }
        return 0;
      }
      case 'nominations show': {
        const nominationId = uuid(values, 'nomination-id');
        const rawLimit = str(values, 'limit');
        const limit = rawLimit === undefined ? SIGHTING_LIST_MAX_LIMIT : Number(rawLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > SIGHTING_LIST_MAX_LIMIT) {
          throw new UsageError(`--limit must be an integer 1-${SIGHTING_LIST_MAX_LIMIT}.`);
        }
        const shown = await withPoolOf(readonlyPool, async (pool) => {
          const nomination = await loadNomination(pool, nominationId);
          if (nomination === null) return null;
          const identity = await loadNominationIdentity(pool, nomination.registrableDomain);
          const sightings =
            identity === null ? [] : await listNominationSightings(pool, identity.id, limit);
          return { nomination, identity, sightings };
        });
        if (shown === null) {
          throw new PromotionRefusal('NOMINATION_NOT_FOUND', `no nomination ${nominationId}.`);
        }
        const promotable =
          shown.identity === null || shown.identity.firstNominationId === nominationId;
        if (json) {
          out(envelope(key, 'READ', { data: { ...shown, promotable } }));
        } else {
          const n = shown.nomination;
          out(`${n.id}\t${n.discoveryMethod}\t${n.url}\t${n.title ?? ''}\n`);
          if (shown.identity !== null) {
            const i = shown.identity;
            out(
              `identity ${i.id} ${i.registrableDomain}: first nomination ${i.firstNominationId}, ` +
                `${i.nominationCount} nomination(s), ${i.sightingCount} sighting(s)\n`,
            );
          }
          for (const s of shown.sightings) {
            out(
              `  ${s.observedAt}\trun ${s.researchRunId}\tpage ${s.sourcePageEvidenceId}\t` +
                `${s.url}\t${s.anchorText ?? ''}\n`,
            );
          }
          out(
            `${promotable ? 'PROMOTABLE' : 'NOT PROMOTABLE (not the first nomination)'}. ` +
              'Nothing was fetched.\n',
          );
        }
        return 0;
      }
      case 'nominations promote': {
        const nominationId = uuid(values, 'nomination-id');
        const subjectId = uuid(values, 'subject-id');
        const kind = required(values, 'kind');
        if (!(SUBJECT_KINDS as readonly string[]).includes(kind)) {
          throw new UsageError(`--kind must be one of ${SUBJECT_KINDS.join(', ')}.`);
        }
        const loaded = await withPoolOf(readonlyPool, async (pool) => {
          const found = await loadNomination(pool, nominationId);
          return found === null
            ? null
            : {
                nomination: found,
                identity: await loadNominationIdentity(pool, found.registrableDomain),
              };
        });
        if (loaded === null) {
          throw new PromotionRefusal('NOMINATION_NOT_FOUND', `no nomination ${nominationId}.`);
        }
        const { nomination } = loaded;
        assertCanonicalNomination(nomination, loaded.identity);
        const request = promotionRequest({
          nomination,
          subjectId,
          kind: kind as SubjectKind,
          nameLanguage: str(values, 'name-language') ?? null,
        });
        const execute = values['execute'] === true;
        const result = await withPoolOf(execute ? writerPool : readonlyPool, (pool) =>
          promoteNomination(pool, request, execute),
        );
        if (json) {
          out(envelope(key, result.mode, { data: { nominationId, result } }));
        } else {
          out(
            `${result.mode} promote nomination ${nominationId} -> subject ${result.subjectId} ` +
              `(${kind}), name claim ${result.recordIds['nameClaim'] ?? ''}\n`,
          );
        }
        return 0;
      }
    }
  } catch (error) {
    if (error instanceof UsageError) return refuse('INPUT_INVALID', error.message);
    if (error instanceof BriefRefusal) return refuse(error.code, error.message);
    if (error instanceof PromotionRefusal) return refuse(error.code, error.message);
    if (error instanceof GrantedRunRefusal) return refuse(error.code, error.message);
    if (error instanceof GrantedRunInternalError) {
      return refuse(
        'INTERNAL_ERROR',
        `${error.message} (completion recorded: ${error.result.outcome})`,
      );
    }
    return refuse('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
  }
  return 1;
}
