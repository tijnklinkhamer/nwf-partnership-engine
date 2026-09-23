# Phase 2B-2D — A3 R24: DEV_TRAIN reachable initial-cap membership and mechanical SD9 readiness (V1)

Public-safe audit. It contains aggregate counts only. No selection index,
organisation, reserve position, run, row or candidate id, document digest,
salted rank digest, rank / source / survivor position, membership document
identity, edge, score, URL, host, root, title, text or label appears anywhere
in this file. There is no per-slot breakdown, no per-slot SD9 result and no
per-slot cap status.

## 1. The two questions R24 answers

R24 answers two related questions and keeps them strictly apart.

1. **Reachable membership.** The Generation-1 owner clarification binds
   required membership to the reachable selected capped membership. What exact
   initial capped membership does that make reachable for SET_P and SET_R in
   each R23-minted slot?
2. **Mechanical SD9.** Take the canonical short-text SD9 envelope over each
   sample's canonical survivor counts. What mechanical SD9 status follows for
   each sample in each slot?

R24 does **not** change A2 acquisition authority. It creates no replacement
reason and does not touch a replacement ledger. It does not resolve short
text, apply SD4 / K4, run the complete Generation-1 corpus-freeze preflight,
extend a rank, label, classify, build a final split corpus or manifest, or
freeze A5.

## 2. Lineage

| item                                                     | commit                                     |
| -------------------------------------------------------- | ------------------------------------------ |
| Governance snapshot                                      | `907d726268ad07fe94fec93f4c6f3ff5ce5f93f9` |
| R19 canonical tip                                        | `6369b28408dd99b0edca86c7fb0e5376bdccf68a` |
| R20 canonical tip                                        | `4cd917817437bd7c04f29938694e7ba8c1078019` |
| R21 canonical tip                                        | `f2d54f02c810903608678125930929d47fd8aa36` |
| R22 canonical tip                                        | `d3c2cd7cc6a72d488b94c5cdcfbd5809f6580b4c` |
| R23 canonical tip (R24 base)                             | `45df08e7133f859e57086f2cc2a44d6b5ed584d6` |
| R23 historical scope pin                                 | `d3cb425ac0cf7400e67f72e238e3a28cda4d2bb5` |
| R24 implementation                                       | `2663935493baa1ff15e77491f5cdf73a34304919` |
| Active A2 (`feat/phase2b-2d-a2-batch-02`), observed only | `117e1ea9367b0bc5608e4873f3460db79fa0dc31` |

Active A2 was observed for reporting only. It has moved since R23 completed
at `c82f488…`, and it now stands at `117e1ea…`. That is a post-P18 second
replacement live-result record. It was **never merged or consumed**. No
uncommitted A2 worktree bytes were read, and nothing in R24 depends on it.

## 3. R23 historical scope pin

R23's changed-surface assertion diffed `R22_TERMINAL` against the **working
tree**. Commit `d3cb425` applies the convention R19 to R22 already use. The
assertion now ranges over `R22_TERMINAL..R23_TERMINAL`, with
`R23_TERMINAL = 45df08e…`.

Nothing else changed. The permitted-path list is the same, and `a3readiness/`
is **not** on R23's allow-list. No capability or disclosure assertion was
touched. The R24 isolation test proves three things:

- the pin commit touched exactly that one file;
- nothing edited that file afterwards;
- it is the only pre-existing file R24 changed.

## 4. Frozen input surfaces

These files are byte-identical to R23 and pinned by SHA-256 in
`orgunitCorpus2DA3ReachableMembershipSd9Isolation.test.ts`:

- all 16 `a3prep/` files, including `corpusFreezePreflight.ts`, `sd9.ts`,
  `setPSd7.ts`, `setRSd7Readiness.ts` and `contracts.ts`;
- all 7 `a3governance/`, 7 `a3evidence/`, 6 `a3documents/`, 6 `a3graphs/` and
  6 `a3samples/` files;
- the R19, R20, R21, R22 and R23 censuses, and the R21, R22 and R23 audits;
- the five canonical SD7 modules.

## 5. Namespace and import boundary

`src/test/harness/phase2b2d/a3readiness/` is an eighth sibling namespace:

| file            | role                                                               |
| --------------- | ------------------------------------------------------------------ |
| `types.ts`      | the membership union, the SD9 wrapper, the unbound and minted shapes |
| `refusal.ts`    | fail-closed refusal codes                                          |
| `membership.ts` | Level A: the PURE, unbound, one-slot interpretation helper         |
| `devTrain.ts`   | Level B: the only minter, from an actual R23 mint                  |
| `census.ts`     | the public, aggregate-only census over a minted readiness batch    |
| `r23Drift.ts`   | the pure post-mint R23 aggregate drift cross-check                 |

A test restricts imports to these:

- R23 mint predicates, provenance helpers, types and census type;
- R22 types, the R19 snapshot type and R20's split constant;
- canonical `deriveSetPFreezeSlotReadiness` and
  `deriveSd9BoundsUnderShortTextPolicy`;
- SET_R readiness structure and frozen contract constants.

Static tests assert the following:

- no database, environment, filesystem, socket, provider, classifier, label or
  sealed-root capability;
- no `deriveSetRFreezeSlotReadiness`, `determineSetRDocumentCap`,
  `evaluateSd9FromExactPostSd7Count` or
  `evaluateSd9FromAdmissiblePostSd7Bounds`;
- no `checkSetPShortTextCorpusFreezeGate`, `checkSetRShortTextCorpusFreezeGate`
  or `checkCurrentA3CorpusFreezePreflight`;
- no SD4 / K4 or extension-cursor function;
- no rank, survivor walk, `.slice(`, sort (except drift field names) or hash;
- no minting backdoor and no new authority digest.

## 6. The owner-bound reachable-membership policy

R24 binds `SHORT_TEXT_REQUIRED_MEMBERSHIP_SCOPE_POLICY` by reference. It
refuses (`R24_OWNER_POLICY_BINDING_MISMATCH`) unless the policy carries every
one of these tokens:

| field                         | token                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------ |
| decision                      | `SHORT_TEXT_REQUIRED_SAMPLE_MEMBERSHIP_LIMITED_TO_REACHABLE_CAPPED_MEMBERSHIP_V1` |
| generation                    | `METHODOLOGY_V2_GEN1`                                                          |
| required membership scope     | `REACHABLE_SELECTED_CAPPED_MEMBERSHIP`                                         |
| zero-extension-headroom scope | `ZERO_EXTENSION_HEADROOM_SELECTED_CAP_IS_COMPLETE_REACHABLE_SAMPLE_MEMBERSHIP` |
| unreachable-tail freeze effect | `DOES_NOT_REFUSE_FREEZE_BY_ITSELF`                                            |

R24 proves no extension theorem of its own and runs no extension.

## 7. R23 mint and provenance

The binder accepts only an actual `A3DevTrainSampleSurvivorBatchV1` for which
`isA3DevTrainSampleSurvivorBatch` holds. It then checks the following:

- `graphBatchForSampleSurvivorBatch` resolves to one R22 batch;
- `governanceSnapshotForSampleSurvivorBatch(batch)` is the batch's own
  snapshot object;
- every item is an R23-minted slot preparation whose R22 graph is that batch's
  graph at the same position, and which `slotSamplePreparationForSlotGraph`
  maps back to the same item.

Every slot is derived unbound first, and only then is anything minted. Private
`WeakSet`s brand each minted slot and batch. `WeakMap`s record the one-to-one
mapping in both directions: R23 slot to R24 slot, and R23 batch to R24 batch.

The real run refused each of these with
`R24_SAMPLE_PREPARATION_AUTHORITY_NOT_MINTED_BY_R23`:

- a spread clone of the R23 batch;
- a JSON-deserialised batch;
- a literal carrying the real items;
- a batch with cloned slots;
- the R22 graph batch passed directly;
- the R21 document batch passed directly;
- an unbound R23 slot preparation.

A second bind of the same R23 batch was refused with
`R24_SAMPLE_PREPARATION_ALREADY_BOUND`. The minted batch traces to the fresh
R23 batch and to the same snapshot object. It holds 5 minted slot states for
5 R23 items, with 0 provenance failures.

## 8. Fresh chain and drift checks

The chain ran once, in-process:

R19 snapshot → canonical R20 binding → R21 assembly → R22 graphs → R23 sample
preparation → R24.

Only canonical R20 touched `nwf_pe`. It connected as `nwf_readonly` in a
read-only, repeatable-read transaction. R24 issued no SQL.

Each upstream stage was compared with its committed census. Its exact
required values were also checked.

| stage | required and observed                                                                                                                                                                                                           | drift |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| R20   | 5 runs, 203 fetches, 160 pages, 156 per-slot documents, 320 candidates; extraction v2 ×160; signal rules v1 ×320; tracks 160 / 160; integrity counts all zero                                                                   | none  |
| R21   | 5 slots, 160 source rows, 156 documents, 3 exact groups, 4 rows removed, 3 multi-source documents; 160 v2, 0 unsupported, 0 mixed version, 0 divergence; 156 R10 preparations, 160 source rows and 320 candidate observations covered | none  |
| R22   | 5 graphs, 156 documents, 155 measurable, 1 unresolved short text, 2338 pairs, 41 edges, 19 documents in at least one edge                                                                                                          | none  |
| R23   | SET_P and SET_R each 156 / 155 / 142 / 13 / 1, with 5 exact and 0 blocked caps; SET_P 40 exact-cap documents; SET_R 20, with 4 full-rank exact, 1 blocked, and 1 blocked while its initial cap is exact; divergence 137 / 5 / 5 / 8 | none  |

## 9. Freeze-slot readiness

**SET_P.** R23 did not carry SET_P readiness. R24 derived it once per slot
with canonical `deriveSetPFreezeSlotReadiness`, and checked it against the
R23 SET_P preparation:

- initial cap exact iff the canonical cap status is exact;
- full rank exact iff there is no unresolved short text;
- counts equal to the SD7 counts;
- a structurally valid prefix and boundary.

**SET_R.** R24 used R23's stored readiness object by reference and never
re-derived it. `structuralIssueOfSetRFreezeSlotReadiness` returned null, and
the object agreed with the cap status and the SD7 counts. The real run found
0 identity failures.

| sample | initial cap exact | initial cap blocked | full rank exact | full rank short-text blocked | full rank blocked while cap exact |
| ------ | ----------------: | ------------------: | --------------: | ---------------------------: | --------------------------------: |
| SET_P  |                 5 |                   0 |               4 |                            1 |                                 1 |
| SET_R  |                 5 |                   0 |               4 |                            1 |                                 1 |

The SET_P full-rank split was **derived**, not assumed. It came out 4 / 1, as
anticipated.

## 10. Reachable membership

| sample | exact reachable slots | blocked reachable slots | reachable documents across exact slots | canonical cap |
| ------ | --------------------: | ----------------------: | -------------------------------------: | ------------: |
| SET_P  |                     5 |                       0 |                                     40 |             8 |
| SET_R  |                     5 |                       0 |                                     20 |             4 |

An EXACT membership **is** the canonical cap's own `documents` array. It is
held by reference, never copied, re-ranked or sliced. Its size equals that
array's length and is at most the cap. The real run found 0 by-reference
failures and 0 count failures.

A BLOCKED membership is a type with **no** `documents` field, optional or
otherwise. It carries only the canonical open issue and the policy binding.
No real slot is blocked. Synthetic tests prove that a blocked cap yields a
blocked membership with no list, and that R24 does not refuse it.

**Reachability is not full-rank exactness.** In one slot per sample the
initial cap is exact while the full rank is short-text blocked. Each sample's
one unresolved short-text occurrence lies after its exact cap. It stays
unresolved full-order evidence. It is not in the reachable membership (0 real
occurrences inside a membership), and it does not change that membership.

**Correction to the real-run instrumentation.** The run script also counted
unresolved entries whose open issue differed from a string literal. It
reported 2. The script compared against the constant's **name**
(`SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP_UNRESOLVED`), not its **value**
(`SD7_SHORT_TEXT_SAMPLE_MEMBERSHIP`). The 2 are exactly the two real
unresolved occurrences, one per sample, and they were measured against the
wrong string.

This does not mean the tail was resolved. R23's minting postcondition refuses
any unresolved entry whose `openIssue` is not the canonical constant, and the
R23 batch minted. R24 neither reads nor writes that field. The synthetic test
checks the canonical constant directly.

## 11. Mechanical SD9

**Input semantics.** R24 has one SD9 route. Per sample, it calls
`deriveSd9BoundsUnderShortTextPolicy` with these inputs:

- `measurableSurvivorMin` = `sd7Preparation.counts.measurableSurvivorCount`;
- `measurableSurvivorMax` = `sd7Preparation.counts.measurableSurvivorCount`;
- `shortTextUnresolvedCount` = `sd7Preparation.counts.shortTextUnresolvedCount`.

The canonical envelope is therefore
`[survivors, survivors + unresolved short text]`, classified by canonical
`evaluateSd9FromAdmissiblePostSd7Bounds` inside the helper.

The minimum equals the maximum survivor count because R23 fixes the
measurable survivor set. Under the owner's short-text policy, a present
treatment evicts or reclassifies no measurable survivor. So the only
uncertainty is whether each unresolved short-text document contributes. R24
does not choose a point inside the envelope.

**A cap size is never an SD9 input.** Cap sizes 8 and 4 are selected samples,
not the admissible post-SD7 page count. The static test pins the call's
arguments to `sd7Preparation.counts` and forbids any
`.documentCap.documents.length` or `.setRDocumentCap.documents.length`.

R24 never calls `evaluateSd9FromExactPostSd7Count`, even with zero unresolved
short text.

| sample | survivor lower-bound total | unresolved short text | upper-bound total | successful | unsuccessful | pending |
| ------ | -------------------------: | --------------------: | ----------------: | ---------: | -----------: | ------: |
| SET_P  |                        142 |                     1 |               143 |          5 |            0 |       0 |
| SET_R  |                        142 |                     1 |               143 |          5 |            0 |       0 |

The threshold is `MIN_PAGES_PER_ORGANISATION = 4`. Across samples, 5 slots
are mechanically successful in both, and 0 slots disagree. The real run found
0 envelope-provenance failures.

The envelope helper is used uniformly for all four cases, which synthetic
tests cover:

| survivors | unresolved | envelope | status                                        |
| --------- | ---------- | -------- | --------------------------------------------- |
| 4         | 0          | [4, 4]   | `ACQUISITION_SUCCESSFUL`                      |
| 3         | 0          | [3, 3]   | `ACQUISITION_UNSUCCESSFUL_MIN_PAGES_NOT_MET`  |
| 3         | 1          | [3, 4]   | `ACQUISITION_STATUS_PENDING_SD7_OWNER_DETAIL` |
| 4         | 1          | [4, 5]   | `ACQUISITION_SUCCESSFUL`                      |

A further synthetic slot is SET_P successful and SET_R unsuccessful. R24
preserves both statuses and does not refuse.

## 12. SD9 authority boundary

Every R24 SD9 result carries
`A3_MECHANICAL_SD9_OF_CANONICAL_SURVIVOR_ENVELOPE_ONLY_NOT_A2_ACQUISITION_STATUS`.
The ten real sample/slot classifications are all `ACQUISITION_SUCCESSFUL`, but
they are **A3 mechanical readiness classifications only**. They do not
supersede R19's committed A2 adjudication facts, R17 READY authority or the
replacement-ledger history. They adjudicate no run, create no reserve
obligation or replacement reason, and consume no reserve. No A2 state
changed.

## 13. What R24 did not do

R24 did none of the following:

- **Extension.** It called no extension cursor and selected no tail document.
  Zero Generation-1 extension headroom is the owner's binding, not an R24
  derivation.
- **Complete-corpus preflight.** It did not call
  `checkSetPShortTextCorpusFreezeGate`, `checkSetRShortTextCorpusFreezeGate`
  or `checkCurrentA3CorpusFreezePreflight`. Those gates need the complete
  Generation-1 collections: 110 slots with 20 / 45 / 45 split coverage. Only
  5 of the 20 DEV_TRAIN organisations in this governance snapshot are READY,
  and R24 does not pretend the other 105 slots are zeros.
- **SD4 / K4.** It used no fixed point, contribution vector or planned SD4.
- **Final corpus.** It built no complete DEV_TRAIN or Generation-1 SET_P /
  SET_R. It materialised only per-slot reachable initial-cap membership, and
  only in memory.
- **Labels or classifier.** It read no label and called no classifier or
  provider.

## 14. Public census

| path                                                                                         | SHA-256                                                            | bytes |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----: |
| `docs/evaluation/PHASE_2B_2D_A3_R24_DEV_TRAIN_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS_V1.json` | `23e2b7ba8b315869df41e8a753f66f2a14aa5025767dda8ed32d49a38f782023` |  5015 |

The census has record kind
`PUBLIC_AGGREGATE_ONLY_REACHABLE_MEMBERSHIP_SD9_READINESS_CENSUS` and
`thisFileAuthorises: []`. It is derived from the minted batch and holds
aggregates only. It declares every identity class absent, including per-slot
SD9 results and per-slot cap status. It carries no membership, readiness or
batch digest, because authority is in-process provenance from R23.

The isolation test's disclosure block scans it for identity-, position-,
score-, membership- and per-slot-bearing keys. It also scans for bare 64-hex
digests, UUIDs, URLs, hosts, emails and fractional values.

## 15. Non-side-effects

Each of the following is zero:

- R24 SQL statements;
- database writes;
- new A2 authority, A2 acquisition mutations and reserve mutations;
- DEV_CONFIRM and FINAL_HOLDOUT reads;
- institution network requests and sealed-root access;
- short-text resolution, cap reranking or slicing, and extension;
- complete-corpus preflight and SD4 / K4;
- labels, and classifier or provider calls;
- final SET_P, final SET_R, manifests, corpus freezes and migrations.

## 16. Next decision

`A2→A3 GOVERNANCE CHECKPOINT V2 / DEV_TRAIN AUTHORITY EXPANSION — ONLY IF NEW CANONICAL A2 ADJUDICATION JUSTIFIES IT`.

R24 does not create Registry V2. It does not follow the moving A2 branch.
