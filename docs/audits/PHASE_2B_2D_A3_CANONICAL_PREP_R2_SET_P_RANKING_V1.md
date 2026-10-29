# Phase 2B-2D — A3 canonical preparation, R2: SET_P ranking

Status: IMPLEMENTED on `feat/phase2b-2d-a3-canonical-prep-r2`. Preparation code
only. Nothing was executed against real data, and no real SET_P exists.

## Lineage

- R2 parent: `33c0babcb2a8ed21b2c0f67e2215c332287d8871`, the canonical R1 tip
  (`docs(2d): record canonical A3 R1 preparation`). R1 itself is `b99952b`, and
  R1 descends from the A2 base `e9093aa`.
- Current A2 tip observed: `origin/feat/phase2b-2d-a2-batch-02` =
  `3056635d31ccd7407b327f2ae0ba306f7de73955`.
- The A2 delta since `e9093aa` was inspected and NOT merged. It is two
  commits, `527690e` (pins the continuation-window test's genesis-ledger
  assertions to their own revision) and `3056635` (a post-v4 replacement and
  index-9 live window result JSON under `docs/evaluation/`). Neither touches
  Methodology V2 R3, its freeze approval, the Corpus Acquisition Plan or its
  approval, SD3, the SET_P prefix or cap, document identity, `sd7/` or
  `a3prep/`.
- No commit from either historical A3 branch was merged or cherry-picked.

## Frozen SET_P rule implemented

R3 SD3: the first 8 by `sha256("SET_P_V2_R2:" + documentSha256)`, lower-case
hex, plain lexicographic ascending, with no class filtering.

- R1's `SET_P_RANK_KEY_PREFIX` is `SET_P_V2_R2:`. **The colon is part of the
  prefix.** The key bytes are `keyPrefix + documentSha256`, with nothing
  inserted between them.
- The historical `-sol` `rank.ts` was read as reference. Its helper took a salt
  with no colon and built `${salt}:${documentSha256}`. Handing it R1's prefix
  would have hashed `SET_P_V2_R2::<sha>`. It was not copied. The new
  `prefixedDocumentRankHash` concatenates and refuses a prefix that does not end
  in exactly one colon.
- A known vector, computed independently with `shasum`, pins the bytes.
  `"SET_P_V2_R2:" + 0123…cdef` (64 hex) → `06e62ccb…1654b880`. The double-colon
  (`87ef8095…`) and missing-colon (`f2581790…`) variants are asserted to differ.

## Modules

- `a3prep/rank.ts`: pure primitives, with `node:crypto` as the only import:
  - `sha256Utf8Exact` hashes the exact UTF-8 bytes;
  - `prefixedDocumentRankHash` builds the rank key;
  - `comparePlainLexicographic` compares code units with no locale;
  - fail-closed guards for identities that are not 64 lower-case hex characters,
    duplicate identities, mixed slot or split, and salted-digest collisions;
  - `A3RankStop` is the local `STOP:` error, following the `DrawInputStop`
    convention.

  No error message carries a document SHA. Failures name input positions.
- `a3prep/setP.ts`:
  - `rankSetPFull(pool)` returns every input document once, in frozen order,
    in R1's `A3RankedDocument` shape pinned to `sample: 'SET_P'`. It carries
    slot, split, document SHA, salted digest and a 0-based `rankPosition`, and
    drops the source page-evidence ids.
  - `selectSetPOrganisationCap(fullRank)` is a view: `fullRank.slice(0, 8)`,
    or all entries when there are fewer. It refuses input that is not `SET_P`
    at positions 0..n-1.

## Full rank and the cap

The full rank is the primary output, because Plan §9 requires it for later
deterministic extension and provenance. Tests prove three things:

- positions 8 and above stay in `fullRank` and are missing only from the cap
  view;
- positions never move;
- ranking the pool again, or only the entries past the cap, reproduces the
  same order.

## Owner decisions

K1–K4 are unchanged and unresolved. `contracts.ts` and `types.ts` are
byte-identical to R1.

K3 boundary: `setP.ts` performs no SD7. It ranks a caller-supplied,
already-distinct pool for one slot. It does not claim to know which SD7
survivor procedure produced that pool, whether SET_R shares it, or whether SD9
is final. It is named and documented as ranking, not as materialising
Generation-1 SET_P. A repeated document identity is refused rather than
resolved, which leaves K2 open.

## Isolation

- The R1 isolation test was widened by exact name. The namespace is exactly
  `contracts.ts`, `types.ts`, `rank.ts` and `setP.ts`. `node:crypto` is the only
  bare import, and only through `rank.ts`. `setR.ts`, `organisationCaps.ts`,
  `sd7.ts`, `sd9.ts`, `splitScope.ts`, `manifestTypes.ts`,
  `corpusFreezePreflight.ts` and `syntheticFixtures.ts` stay asserted absent.
- The new R2 isolation test pins the import graph exactly:
  - `rank.ts` imports only `node:crypto`;
  - `setP.ts` imports only `contracts`, `rank` and `types`.

  It also asserts:
  - no IO, environment, clock, randomness, console, DB or provider;
  - no class, gold, classifier, track or score field;
  - no SD7, SD9 or SET_R work;
  - no content-shaped field;
  - no inserted separator.
- No file under `sd7/`, `src/orgunits/`, `migrations/` or `src/test/firewall/`
  changed.

## Not done

No real SET_P was materialised. There was no corpus input, database, network,
reserve or label access, and no provider or classifier was used.

## Next slice

This is a recommendation only, not implemented. The smallest safe slice that is
not blocked by K1–K4 is a **pure SD9 evaluator over caller-supplied
per-organisation distinct-document counts**. It would take a count, apply
`MIN_PAGES_PER_ORGANISATION` from `sd7Contract.ts`, and return
success/failure. It would not decide K3's pool question: it evaluates whatever
count the caller hands it, exactly as R2 ranks whatever pool it is handed.
Canonical SD7 graph-measurement export preparation is the alternative. It is
closer to K3, so it should follow an owner decision on K3.
