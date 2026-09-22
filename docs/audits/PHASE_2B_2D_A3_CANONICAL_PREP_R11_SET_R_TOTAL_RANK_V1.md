# Phase 2B-2D — A3 canonical preparation R11: pure SET_R total rank over R10 resolved document scores (V1)

**Status:** implemented offline as pure test-harness code. It ranks synthetic
input only. It applies no cap, composes with no SD7 survivor walk, and freezes
nothing. No real data was read.

| fact                         | value                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| exact parent                 | `308e89f50b8bed9398688a87bd4ba2416503422d` (R10 terminal commit)                             |
| R10 reducer code commit      | `629033697725801e75f897152127967b4a85d10e`                                                   |
| branch                       | `feat/phase2b-2d-a3-canonical-prep-r11`                                                      |
| A2 tip observed at preflight | `b0a8ddf0ae31c265367f7a7a3bba8e4d85a0b554`. Unchanged, and not merged                        |
| K1 record SHA-256            | `2437ef4b0bcabc816432c338e02da3b6eaa80fedb561b805232ad906fbbc94be` (re-verified on disk)     |
| K2 record SHA-256            | `5fb280c9aae264e59ca80383922d324c1118aa9192e7d9f5fe6e79ca09b75668` (re-verified on disk)     |
| new module                   | `src/test/harness/phase2b2d/a3prep/setR.ts`                                                  |

## 1. Authority preflight

After `git fetch origin`, `origin/feat/phase2b-2d-a2-batch-02` is still at
`b0a8ddf` and `origin/feat/phase2b-2d-a3-canonical-prep-r10` is still at
`308e89f`. There are no commits in between, so no frozen authority could have
drifted. The contracts at the parent bind:

- `SET_R_PRIMARY_ORDER = RESOLVED_FROZEN_TRACK_A_B_SIGNAL_SCORE_DESCENDING`
- `SET_R_TIE_BREAK_ORDER = SALTED_SHA256_LOWER_HEX_ASCENDING`
- `SET_R_TIE_BREAK_KEY_PREFIX = "SET_R_V2_R2:"`
- K1 `MAX_TRACK_SCORE`, K2 `MAX_K1_PAGE_SCORE_ACROSS_SOURCE_ROWS`, joint
  `SET_R_DOCUMENT_SCORE_MAX_PERSISTED_SIGNAL_EVIDENCE_V1`, representative
  `NO_PAGE_EVIDENCE_REPRESENTATIVE_IS_CANONICAL_FOR_SET_R`
- The only unresolved owner decision is K4.

R10 still exports `A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND`,
`A3SetRDocumentScorePreparation`, `canonicaliseNumeric84Decimal` and
`compareNumeric84Decimal`, and it is still the only reducer.

## 2. API

```ts
interface A3SetRRankInput {
  readonly document: A3DistinctDocument;
  readonly scorePreparation: A3SetRDocumentScorePreparation;
}
type A3SetRRankedDocument = A3RankedDocument & { readonly sample: 'SET_R' };
function rankSetRFull(entries: readonly A3SetRRankInput[]): readonly A3SetRRankedDocument[];
class A3SetRRankRefusal extends Error { code; location }   // + code/location types
```

Imports: `contracts.ts` (K1/K2 bindings and the tie-break prefix), `rank.ts`
(the six canonical R2 primitives), `setRScore.ts` (the kind, the preparation
type, `A3SetRScoreRefusal` and the two decimal helpers), and a type-only import
of `types.ts`. There is no direct `node:crypto`.

## 3. Document/preparation binding

One input entry is one exact document plus the R10 preparation produced for
that exact group. A bare list of scores keyed by SHA would be unsafe: the same
`documentSha256` can occur in two organisations with different R10 scores,
because persisted candidate scoring also reads URL-path evidence.

For every entry, before any ranking:

1. `scorePreparation.kind === A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND`
2. `document.documentSha256`, `scorePreparation.documentSha256` and
   `scorePreparation.resolvedScore.documentSha256` are identical
3. `scorePreparation.sourcePageEvidenceIds` equals
   `document.sourcePageEvidenceIds` in length and at every position. Positional
   equality is correct because R10 copies the document's own order.
4. `scorePreparation.sourceRowScores` has the same length, and
   `sourceRowScores[i].pageEvidenceId === document.sourcePageEvidenceIds[i]`
5. The K1 and K2 hashes equal `K1_OWNER_DECISION.decisionRecordSha256` and
   `K2_OWNER_DECISION.decisionRecordSha256`. No hash literal is copied.
6. `resolvedScoreDecimal` is a string and
   `canonicaliseNumeric84Decimal(x) === x`. A spelling that is valid but not
   canonical (`1.2`, `01.2000`, `+1.2000`, `-0.0000`) is refused as
   `RESOLVED_SCORE_NOT_CANONICAL_NUMERIC_8_4`. A value outside numeric(8,4)
   gets the same code, because R10's own refusal is caught and re-coded. It is
   never canonicalised on the caller's behalf.

This is provenance binding, not recomputation. R11 never reads a track score,
a per-row score or a candidate observation, and never computes a MAX. The
isolation test prohibits those patterns.

### Score-transplant proof

Slot A holds document X with sources `A1, A2`, which R10 scores at `8.0000`.
Slot B holds the same X with source `B1`, scored at `2.0000`. Pairing A's
document with B's preparation is refused
(`SCORE_PREPARATION_SOURCE_PROVENANCE_MISMATCH`). So are three variants: a
same-length transplant (refused at provenance position 1), a reordered
provenance list, and matching ids whose `sourceRowScores` are swapped,
truncated or foreign (`SCORE_PREPARATION_SOURCE_ROW_PROVENANCE_MISMATCH`).
Each genuine pairing is accepted.

## 4. Order

- **Primary:** `compareNumeric84Decimal(b.score, a.score)`, which is exact
  numeric descending. For example, `10.0000` ranks above `9.9999`, `8.0000`
  above `7.9999`, `0.0000` above `-0.0001`, and `-1.0000` above `-2.0000`.
  R11 has no decimal parser, no `Number`, no `BigInt` and no string ordering
  of scores.
- **Secondary:** `comparePlainLexicographic(a.salted, b.salted)` ascending.
  The key is `prefixedDocumentRankHash(SET_R_TIE_BREAK_KEY_PREFIX,
  documentSha256)`, so the hashed bytes are exactly
  `"SET_R_V2_R2:" + documentSha256` with no inserted separator. A known-vector
  test recomputes the digest independently with `node:crypto`, and checks that
  it differs from the `::` spelling.
- **No tertiary key.** `assertUniqueRankDigests` runs before the sort, so no
  two valid entries can compare equal, and a stable sort cannot turn caller
  order into a hidden third key. A mocked digest collision is refused with
  `A3RankStop`. Every one of the 120 permutations of a five-document pool
  with mixed scores and ties produces byte-identical output.
- The tie-break is used only when scores are numerically equal. In the
  dominance test, the document with the higher score but the later digest
  still ranks first.

## 5. Rank integrity

These checks reuse R2's helpers unchanged, and their `A3RankStop` is not
rebranded:

- `assertSingleSlotAndSplit`: a mix of slots or splits is refused
- `assertLowerHexDocumentSha256s`: an identity that is not exactly 64
  lower-case hex characters is refused, never trimmed or lower-cased
- `assertUniqueDocumentSha256s`: a repeated document SHA within one rank is
  refused
- `assertUniqueRankDigests`: two documents sharing a salted digest are refused

An empty input returns a frozen empty rank, the same as R2 `rankSetPFull`. No
frozen authority requires a non-empty SET_R rank at this stage.

## 6. Output

The output is a full, uncapped rank. Every input document appears once, and
`rankPosition` runs `0..n-1`. A test ranks 13 documents, which is more than
three times `SET_R_MAX_PAGES_PER_ORGANISATION`, and gets all 13 back.

Each entry has exactly these keys: `sample` (`"SET_R"`), `selectionIndex`,
`split`, `documentSha256`, `saltedRankSha256` and `rankPosition`. That is R1's
`A3RankedDocument`. The entry carries no resolved score, source page ids,
provenance rows, track scores or decision hashes. R10 owns the score evidence
and R11 only uses it to order documents, so the generic rank shape does not
grow into a scoring or manifest object.

The returned array and every entry are frozen. No input is mutated, and
caller-owned objects are not deep-frozen.

## 7. R10 → R11 end to end

In the integration test, every preparation comes from a real call to
`prepareSetRDocumentScore` on invented evidence:

| document | rows [trackA, trackB]              | resolved score |
| -------- | ---------------------------------- | -------------- |
| single   | [5, −1]                            | 5.0000         |
| multi    | [1, 4.5], [−2, 0]                  | 4.5000         |
| trackB   | [−3, 4.5]                          | 4.5000         |
| negative | [−1, −0.5], [−7, −9]               | −0.5000        |

The rank is `single`, then `multi` and `trackB` in salted-digest order, then
`negative`.

## 8. Hard boundaries

R11 does not do any of the following:

- apply a cap: `SET_R_MAX_PAGES_PER_ORGANISATION` is neither imported nor
  named, and nothing is sliced
- run SD7 or survivor composition
- handle short text
- evaluate SD9 or check freeze readiness
- decide K4
- touch the database, adapters or real data
- name a representative or a winner
- accept or mention a root-local rank

The cap belongs after the sample-specific SD7 survivor walk, which is R12 and
later.

## 9. Changes to existing files

- `types.ts`: **comments only.** Two stale comments said no reducer constructs
  `A3ExternallyResolvedSetRScore`; they now say K1 and K2 are resolved, that
  R10 constructs the shape, and that R11 consumes it. The TypeScript token
  stream with comments stripped is byte-identical to the parent's.
- `orgunitCorpus2DA3CanonicalContractsIsolation.test.ts`: the namespace
  allowlist is widened by exactly `setR.ts`, and `setR.ts` is removed from the
  later-slice list. `organisationCaps.ts` and `syntheticFixtures.ts` stay
  asserted absent.
- `orgunitCorpus2DA3CanonicalSetRScoreIsolation.test.ts`: the absence check
  now asserts `setR.ts` present, by exact name. The other two stay absent.
- `orgunitCorpus2DA3CanonicalK1K2Binding.test.ts`: the absence check is
  narrowed the same way. The "no SET_R reducer/comparator/rank export" guard
  exempts `setR.ts` by exact name only, and a new assertion pins that file to
  exactly one exported function, `rankSetRFull`.

No runtime change was made to `contracts.ts`, `rank.ts`, `setRScore.ts`,
`setP.ts`, `setPSd7.ts`, `sd7.ts`, `sd9.ts`, `splitScope.ts`,
`manifestTypes.ts` or `corpusFreezePreflight.ts`. There are no production
changes and no migrations.

## 10. K-state

K1, K2 and K3 are resolved. K4 is unresolved. There is no K5.

## 11. Validation

| check                                     | result                                                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| canonical A3 suites incl. K1/K2, K3, short-text, R9 preflight (27 files) | 971 / 971 passed                                                                                                                                                             |
| new R11 behaviour test                    | 48 / 48                                                                                                                                                                                                   |
| new R11 isolation test                    | 22 / 22                                                                                                                                                                                                   |
| firewall                                  | 16 files, 399 / 399                                                                                                                                                                                       |
| migrations check, typecheck, lint, format | pass (inside `npm run validate`)                                                                                                                                                                          |
| `npm test` (full)                         | 185 files passed, 1 failed, 30 skipped; 4925 tests passed, 690 skipped (integration suites skip without database env)                                                                                     |
| the one failure                           | `orgunitCorpus2DA2ContinuationWindow.test.ts`, the known inherited A2 defect: "assignment 0 (slot 3 -> position 0) is not the planner's (slot 3 -> position 4)". It reproduces identically on the parent `308e89f` and is not patched |
| build                                     | pass                                                                                                                                                                                                      |
| `git diff --check`                        | clean                                                                                                                                                                                                     |

## 12. Non-side-effects

All of the following are zero:

- institution network requests
- database reads or writes
- sealed data access
- reserve consumption and replacements
- A2 execution and real A3
- real score loading, real SET_R reduction and real SET_R ranking
- the SET_R cap and SET_R survivor composition
- real SET_P, corpus freeze and manifests
- labels and gold
- provider or classifier calls
- production changes and migrations

## 13. Next slice

`R12 — BIND SET_R TOTAL RANK TO R7 GREEDY SD7 SURVIVOR ADAPTER`. R12 may
compose this full SET_R rank with R7. Before any capped SET_R view is added,
it must separately review short-text cap-4 exactness and full-rank extension
readiness.
