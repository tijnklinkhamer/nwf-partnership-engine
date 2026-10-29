# PHASE 2B-2D A3 R50 — R4 DEV_TRAIN A4 HANDOFF MATERIALISATION (V1)

**Task:** `A3_R50_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION_V1`
**Owner authority consumed:** `AUTHORISE_A3_R50_RESUME_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISATION`
(recorded in the immutable R49 owner approval; no new owner choice was made)
**Terminal:** `A3_R4_DEV_TRAIN_A4_HANDOFF_MATERIALISED_AWAIT_OWNER_HUMAN_LABELLING_AUTHORISATION`
**Census record:** `PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_CENSUS_V1` under `docs/evaluation/`
(public, aggregate-only, `thisFileAuthorises: []`)

## 1. The one question

> Which exact DEV_TRAIN documents will a human later judge against the frozen
> Methodology V2 human labelling rubric, under which stable pre-label
> identities, and with exactly which captured evidence - with nothing about
> how they were sampled?

Answer, from one bounded real process:

| finding | value |
| --- | ---: |
| DEV_TRAIN organisations (slots) | **20** |
| canonical documents in the replay | **611** |
| SET_P selected cap entries (exact caps) | **160** (20 exact / 0 blocked) |
| SET_R selected cap entries (exact caps) | **80** (20 exact / 0 blocked) |
| SET_P ∪ SET_R review items | **222** |
| P / R overlap items | **18** |
| SET_P-only / SET_R-only items | **142 / 62** |
| union + overlap = P + R | **222 + 18 = 240** |
| unique goldIds / collisions | **222 / 0** |
| selected multi-source exact documents | **2** |
| source presentations retained | **224** |
| review package records / template records | **222 / 222** |
| `R50_PRE_LABEL_REVIEW_PACKAGE_HASH` | `9664388949f5d8686fe32af2fb4fb8f933787faf6daf11349d5b8a402db4066e` |
| labels / gold / model labels / adjudications | **0 / 0 / 0 / 0** |

Union and overlap were unknown until the run; neither was predetermined or
tuned. No per-organisation value is published.

## 2. Start gate and R49 scope pin

`origin/feat/phase2b-2d-a3-r49-human-labelling-rubric-v1` was exactly
`e07c11906f8c29da74be12c61afe287fcef3787f`, with the single-parent chain
`4e311930ecd5e5cb792ac16e34c127dc2e333142` (R48 scope pin) ->
`99a1a78e295fcbed6b1ff8a1ec76d437c2654b1a` (rubric governance contract) ->
`c945c8e90942b4ec0fa4d35f96731bd10d33c0ce` (frozen rubric bytes) ->
`e07c11906f8c29da74be12c61afe287fcef3787f` (owner approval) above R48. The R49
worktree was clean; no local or origin R50 branch existed.
`feat/phase2b-2d-a3-r50-r4-dev-train-a4-handoff-materialisation` was cut from
that exact commit.

The first R50 commit (`0a254965888d2d2e2245fc9b7ecf446fd32e3663`, one file)
pinned R49's lineage and changed-surface assertions to
`R48_TERMINAL..R49_TERMINAL` and the tree at `R49_TERMINAL`: the changed
surface, "no handoff / package / template / harness / label existed", "rubric
bytes preceded the approval" and "no A4 execution" stay asserted for R49's own
slice. One assertion was added (no R50 namespace or artifact in R49's tree);
nothing was removed or weakened, and R49 does not retroactively accept R50.

## 3. The R48 blocker and its R49 resolution

R48 (`ebe4e6fbd3e2504bbe5fac6963c23ab7bdcb665f`,
`A3_R4_DEV_TRAIN_A4_HANDOFF_BLOCKED_AWAIT_OWNER_RUBRIC_CLARIFICATION`) stopped
correctly: no approved artifact identified the "frozen rubric" reviewers must
label from, and `hard_negative` had no operational definition (its census,
`ad028c8ff5245e80e674cc502ccd4b7e0a1986cadd41000746ef306b474bb24c`, records
the audit). R49 supplied and froze those semantics. R50 resumes exactly the
handoff R48 stopped before materialising; the R48 record is not edited or
"upgraded" and remains a correct historical blocker.

## 4. Exact rubric and approval binding

`rubric.ts` reads both files from the git object at the R49 terminal (and the
real run checked the working-tree bytes are identical):

| record | SHA-256 | bytes |
| --- | --- | ---: |
| frozen human labelling rubric | `e3af57d8d2503e4fc87ce707427762aabfed420bb670a262b9302a7ea78e1d69` | 22125 |
| separate R49 owner approval (recomputed locally) | `17f2683d378b32000467eb670374f56bfa3c8b7b3dfa0acb8a12ee60d0468ac4` | 4895 |

It requires `status = FROZEN_BY_OWNER`, `rubricVersion =
METHODOLOGY_V2_HUMAN_LABELLING_RUBRIC_V1`, the exact verdict and unit_type
value sets, the exact label-validity matrix and `thisFileAuthorises: []`; and
the approval's exact authority shape - `rubricApproved`, `rubricFrozen`,
`r50HandoffResumeAuthorised` true; `r50Executed`, `humanLabelsAuthorised`,
`humanLabelsExecuted`, `modelLabelsAuthorised`, DEV_CONFIRM, FINAL_HOLDOUT
and A5 authority false. One changed byte, a foreign approval, a withdrawn R50
authority or an approval that also authorises labels refuses. The rubric is
referenced by path and hash; it is never copied into the package or
reinterpreted.

## 5. Fresh R47 reproduction

The public R47 census is not authority, so one process re-minted the chain
through R47's own unchanged landed path: R46 approval -> Governance V1..V5 ->
R20 -> R21 -> R26 -> R27 -> R33 -> R34 -> R39 -> R40 -> the eight-checkpoint
gate -> the private replay view -> twenty R4 graphs -> twenty samples ->
twenty readiness derivations. `reproduction.ts` then:

- checks every object by its own R47 brand and provenance link (readiness ->
  sample -> graph -> view, and every view slot traced to a proved document
  batch);
- derives a fresh census with R47's own `deriveR47PublicGlobalReplayCensus`
  and compares it with the pinned committed census
  (`4d3c3e21164da4d9741fb310d68a0a6eb42229bcfec47549c3edf3024e5bdf6a`, 10984
  bytes) using R47's own `historicalCensusDriftPathsR4`: **24** compared
  top-level fields, **0** differing semantic paths, only
  `implementationCommit` excluded (R47's own convention);
- requires 20 DEV_TRAIN preparations, every cap exact, 611 documents, 0
  unresolved, A2 20 / 0, and 160 / 80 selected entries - from the census AND
  from the minted objects.

Only then is a private R50 proof minted, bound by identity to that sample
batch and view; one proof per sample batch. A census, a literal, a spread or
a historical R36 / R42 batch cannot become this authority (tests). No R47 byte
changed; R3 historical entry points were called **0** times.

## 6. Database and access boundary

Counted by the real-run harness's pool wrapper (the R47 convention):

| layer | role / database | connections | snapshot transactions | SQL statements | evidence loads |
| --- | --- | ---: | ---: | ---: | ---: |
| R20 | `nwf_readonly` / `nwf_pe` | 1 | 1 | 33 | 5 |
| R26 | `nwf_readonly` / `nwf_pe` | 1 | 1 | 9 | 1 |
| R33 | `nwf_readonly` / `nwf_pe` | 1 | 1 | 45 | 7 |
| R39 | `nwf_readonly` / `nwf_pe` | 1 | 1 | 45 | 7 |

R39's own landed observation independently reproduced its invariant (1
connection, 1 repeatable-read transaction, 45 SQL statements, 7 evidence
loads). No total combined SQL count is claimed. All four pools were ended
before the replay view was bound; **0** SQL was issued after the last pool
closed, and every graph, sample, readiness and handoff step ran with no pool
open. No new SQL layer, no changed query, writes **0**, network **0**,
provider calls **0**, DEV_CONFIRM / FINAL_HOLDOUT evidence reads **0**, sealed
roots **0**.

Before the committed run, one read-only dry rehearsal of the same process
(same path, same counts, no write) was run to check the in-memory build; it
produced the identical package hash.

## 7. Genuine sample authority and the selected entries

The selected authority is exactly `preparation.setP.documentCap.documents` and
`preparation.setR.documentCap.documents` of the genuine R47 sample batch
(`isA3R4DevTrainSampleBatch = true`, split DEV_TRAIN, 20 items,
`r4SamplePreparationsForBatch = 20`, every cap status exact). Nothing was
re-ranked, and no cap was inferred from the census.

Each selected entry is joined to exactly one canonical `A3DocumentSourceEntry`
of the SAME replay slot by (selectionIndex, documentSha256), with the same
split - no fuzzy, title, URL or cross-slot join.

## 8. goldId and current-occupant identity

Each item's stable pre-label identity is the existing primitive, unchanged:

    goldId = deriveGoldId(currentOccupant.source.echeRowKey, document.documentSha256)

from `src/orgunits/classify/evaluation/select.ts`. The organisation input is
the current Governance V5 READY occupant obtained through
`v5ReadyAuthorityForR4ReplaySlot` (same selection slot, DEV_TRAIN,
`ACQUISITION_SUCCESSFUL`) - never a replaced occupant and never page data. The
document input is the canonical A3 document digest, itself the original exact
fetch-response SHA-256 - never a presentation, package, `hashDocument(...)`,
main-text hash or page id. The real run counted **240** primitive calls (one
per selected entry), **222** unique ids, **0** collisions; a collision would
have STOPPED with
`A3_R4_DEV_TRAIN_A4_HANDOFF_REFUSED_GOLDID_COLLISION_AWAIT_OWNER_REVIEW`
rather than lengthening the id. `goldIdDoesNotMeanGoldYet = true`: there are
zero gold labels and no gold corpus.

## 9. Union and overlap

Membership is deduplicated by goldId. Actual: P = 160, R = 80, union = 222,
overlap = 18, with 222 + 18 = 240 and 0 <= 18 <= 80. `inSetP` / `inSetR` are
stored only in the internal index.

## 10. Complete exact-document provenance

For every union item, each id of the document's frozen
`sourcePageEvidenceIds`, in stored order, resolves to exactly one durable
page-evidence row of the same slot's genuine evidence, reached through that
layer's landed mapping (R21 -> R20 `durableEvidenceForDocumentSourceAssembly`,
R27 -> R26 `evidenceDeltaForDeltaSlotAssembly`, R34 -> R33 `...V4`, R40 -> R39
`...V5`). Each row's response digest equals the document digest, each row
joins its own fetch, the evidence was loaded for the same organisation as the
current occupant, and no other row of the slot carries that digest (missing,
extra, duplicate, wrong-digest, cross-slot and wrong-organisation cases all
refuse). All presentations of one exact document carry byte-identical main
text, re-proved before materialising and again against the replay slot's own
private text capability (**222** checks). The item therefore carries ONE
equality-justified main text; it is not a chosen representative.

Headings were stored as `{ level, text }` objects in every captured
presentation (the extractor's form); the one deterministic display form keeps
them in order, accepts a bare string as `{ level: null, text }`, and refuses
anything else. Nothing was cleaned, re-fetched or rewritten by a model.

## 11. Multi-source presentations

**2** selected union items are multi-source exact documents. Each is one
goldId, one review record, every source presentation retained in provenance
order, one equality-justified main text, and no representative, canonical
index or winner. (The global R47 population has 5 multi-source documents;
only selected union items are counted here.)

Aggregate presentation facts: 224 presentations, 0 with truncated main text;
5 items have empty extracted main text (their title, headings and URL remain
the captured evidence; R50 does not judge whether that is sufficient - the
rubric's NEEDS_REVIEW rule governs that later, for a human).

## 12. The blinded review package

`docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_PACKAGE_V1.jsonl`,
`reviewerVisible: true`, one line per goldId, `goldId ASC`. Each record is
exactly `{ goldId, rubricVersion, rubricSha256, mainText, sourcePresentations }`
and each presentation exactly `{ requestedUrl, title, declaredLang, headings,
mainTextTruncated, extractionMethod, extractionRuleVersion }`. Every record
binds the rubric version and SHA-256.

The blinding firewall inspects STRUCTURED METADATA - every key at every level
and the string values R50 creates - and refuses any key revealing sample
membership, rank, score, candidate, signal, track, gate, threshold, survivor,
exclusion, near-duplicate, selection slot, stratum, reserve, generation, A2,
disposition, document digest, ECHE row key, organisation id, page id,
historical gold, prediction, model, classifier or label; and any record that
quotes its own internal identity values. It does not censor natural page
text: a real page may say "score" or "generation". No candidate score,
signal, track, rank or model output was copied into any presentation, and no
historical gold, adjudication, proposed label or acceptance fixture was read.

The internal index
`docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_A4_HANDOFF_INDEX_V1.json`
(`reviewerVisible: false`, `neverHandToAReviewer: true`) carries the
projection / provenance facts - goldId, selection slot, stratum, ECHE row key,
document digest, every source page id, `inSetP`, `inSetR` - and the rubric,
R47 and package bindings. It holds no label value. No HTML packet was written;
the JSONL package is canonical.

## 13. The blank response template

`docs/evaluation/corpus/PHASE_2B_2D_A3_R50_DEV_TRAIN_R4_SINGLE_REVIEW_RESPONSE_TEMPLATE_V1.jsonl`:
one row per package goldId in the same order, `{ goldId, rubricVersion,
rubricSha256, reviewerActorKey, verdict, unit_type, hard_negative, reviewNote }`
with all five human-response values `null`. A null is UNANSWERED: no default
verdict, unit type or flag exists, and a template row is not a valid completed
response. `responseSchema.ts` is a pure SHAPE validator for a later completed
response - the R49 matrix (UNIT_PAGE: one of four types, false; NOT_A_UNIT:
null, true or false; NEEDS_REVIEW: null, false), the exact rubric binding and
the opaque actor-key form `^[a-z0-9][a-z0-9_-]{2,63}$`. It returns problems,
never a corrected or defaulted answer, and no completed response was ingested.
R50 selected no reviewer and wrote no name or address.

## 14. The package hash and its immutability

`R50_PRE_LABEL_REVIEW_PACKAGE_HASH = sha256OfCanonical({ packageSchema,
rubricVersion, rubricSha256, recordCount, records })` over the ordered
reviewer-visible records - the repository's existing canonical hashing
primitive, not the file bytes:
`9664388949f5d8686fe32af2fb4fb8f933787faf6daf11349d5b8a402db4066e`
(222 records). It is NOT an A5 splitContentHash, a gold-manifest hash or a
corpus-freeze hash. The written files were re-read and the hash recomputed;
the isolation test recomputes it from the committed package.

A4 must label exactly these goldIds against exactly this package hash and
rubric hash. A later slice may not silently regenerate a different package; a
correction requires explicit owner review.

## 15. All-or-nothing materialisation

Every identity join, goldId, sample projection, provenance join, main-text
equality, rubric binding, blinding check, template row and the package hash
were complete in memory before any file was written. The writer refuses if
any target exists, writes temporaries, renames all three, removes every file
on any failure, and verifies the read-back. A failure on the last item writes
nothing (tested).

## 16. Labels, enrichment and sealed boundaries

Labels created **0**; gold records **0**; model labels **0**; adjudications
**0**; human labelling executed: **no**; human labelling authorised: **no**.
`devTrainRealisedSetREnrichment = NOT_YET_MEASURABLE_PRE_LABEL`: there are no
human labels, and no estimate from scores or signals was made. DEV_CONFIRM
and FINAL_HOLDOUT remain sealed; A5 has not started. `a4HandoffPrepared =
true`: R50 is the last machine-only preparation before A4 DEV_TRAIN human
review.

## 17. Disclosure

The census and this audit carry aggregate counts and bound hashes only: no
goldId, ECHE row key, organisation id, selection index, document digest, page
id, URL, host, title, heading, text, P / R membership, per-organisation count,
score, rank or candidate datum. The internal index and the review package are
the intentional DEV_TRAIN handoff artifacts and obey their own visibility
schemas.

## 18. Commits

| commit | content |
| --- | --- |
| `0a254965888d2d2e2245fc9b7ecf446fd32e3663` | freeze R49 rubric scope |
| `5cc345b541712ecd7dabad77d34f8c823f53b9f0` | `a4handoffR4/` namespace |
| `eb99739d31e71950659547b8f3167cf0f704b371` | behaviour and isolation tests (the real run's implementation commit) |
| `e7287a87bdd55be70e16f75799ab5db32b1278a5` | scope the no-representative check to structured keys (test only) |
| docs commit | the index, package, template, census and this audit |

## 19. Next owner question

> The exact R4 DEV_TRAIN SET_P∪SET_R review population is now materialised,
> hash-bound and blinded against the frozen Methodology V2 human rubric, with
> a blank single-review response template and zero labels. Do you authorise
> A4 DEV_TRAIN HUMAN SINGLE REVIEW against exactly this package and rubric,
> with no model assistance and with DEV_CONFIRM and FINAL_HOLDOUT remaining
> sealed?

R50 does not start human review.
