# Phase 2B-2D2B — Remote-truth recovery record (2026-09-11/12)

**Why this document exists.** The development laptop that held the Phase
2B-2D2B working tree became permanently unavailable. Every branch, worktree,
reflog entry, unpushed commit, scratch directory, local database and generated
artifact that lived only on that machine is gone. GitHub is now the sole
executable source of truth for this repository, and the 2D2B track is being
reconstructed from it.

This record exists so that a later reader can tell, for every statement about
2D2B, **which evidence class it belongs to** — and in particular can never
mistake a preserved owner report for something this session verified.

Three evidence classes are used throughout, and nothing is left unlabelled:

| class                              | meaning                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GITHUB_VERIFIED_NOW`              | Observed directly, in this session, against the fetched remote or the committed bytes of the recovery clone. |
| `OWNER_PRESERVED_HISTORICAL_REPORT` | Reported by the owner from preserved notes about the lost work. **Not reverified here.** Retained as history. |
| `NOT_RECOVERABLE_OR_NOT_REVERIFIED` | Known to be gone, or reachable only through an artifact that no longer exists. Never to be reconstructed.     |

---

## 1. `GITHUB_VERIFIED_NOW` — the baseline this recovery starts from

| fact                          | value                                                                      |
| ----------------------------- | -------------------------------------------------------------------------- |
| repository (`origin`)         | `https://github.com/tijnklinkhamer/nwf-partnership-engine.git`             |
| default branch                | `main`                                                                     |
| `origin/main` after `git fetch --prune` | `7adf895fa20e9b25758e0748d1a02e26c387d19b`                       |
| commit title                  | `Merge branch 'feat/phase2b-2d1-gold-corpus-protocol'`                     |
| remote branches present       | exactly one: `refs/heads/main`                                             |
| remote branch matching `phase2b` / `2d2b` | none                                                           |
| local checkout state          | clean, `main` == `origin/main`                                             |
| recovery branch               | `feat/phase2b-2d2b-1-evidence-canonicalisation-recovery`, created from `7adf895f` |

The clone's `origin` was confirmed to be the **Partnership Engine** repository
and not the separate NWF application repository, whose isolation this
repository's standing rules require.

`docs/evaluation/results/` does not exist on remote `main` — confirmed by
directory listing of the fetched tree.

### Configuration state on remote `main`, read from the committed bytes

Each of these was read directly out of the recovery checkout at `7adf895f`,
and each confirms that **none of the lost 2D2B corrections is present**:

- `@anthropic-ai/claude-agent-sdk` pinned at `0.3.251`.
- `ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION` = `orgunit-classifier-assembly-v1`.
- Both extraction callers — `src/orgunits/web/pageEvidence.ts` and
  `src/orgunits/orchestrator/pageCollection.ts` — declare
  `EXTRACTION_RULE_VERSION = 'orgunit-extraction-v1'`. These are the only two
  production declarations of that constant anywhere in the tree.
- `src/orgunits/web/extract.ts` carries a **13-name** entity map
  (`amp lt gt quot apos nbsp mdash ndash hellip rsquo lsquo rdquo ldquo`),
  including the non-HTML-4.01 `apos` exception.
- `unitNameVerifies` (`src/orgunits/classify/evidenceVerification.ts`) folds
  whitespace and diacritics and is **case-sensitive**.
- `ORGUNIT_CLASSIFIER_PROMPT_VERSION` = `orgunit-classifier-prompt-v1`.
- The production Agent SDK runner has no deadline / abort / close liveness
  boundary.
- The provider has no 600-second total-budget gate.
- The frozen acceptance manifest records `itemCount` 72 with
  `perSplit` = 49 DEVELOPMENT / 23 HOLDOUT, and `corpusSha256`
  `42f041ee5704408788ff301811983c123c200f4c1d6f4fa89696d6b4abaea44b`.

### The formerly-local commits are absent

After `git fetch --prune origin`, every one of the following was tested with
`git cat-file -e <sha>^{commit}` and reported **ABSENT**:

```
3076d49
e5f4c88d22b9da31cc60dbc8e5074ecef3fb7867
6cd7a16653f265bd212352e047d00ee6199f599a
96280563937a5be32e2ef63e7bae1efe8ac80e0d
deca8d9b24eec29f46c8290a21d00c03bee36e1d
b2c90e93850b3cb172d5e9c4589498155a9014f4
```

**These SHAs are historical references only.** They are not ancestors of the
recovery branch, not cherry-pick sources, and not evidence that any code
exists remotely. No attempt was made — and none may be made — to manufacture,
graft, or impersonate them. The recovery branch's sole ancestor is
`7adf895f`.

---

## 2. `OWNER_PRESERVED_HISTORICAL_REPORT` — retained, **not** reverified here

Everything in this section comes from the owner's preserved reports about the
lost work. It is recorded because it is the only surviving account of what the
original 2D2B pass measured. **Except where §3 says otherwise, none of it was
reverified in this session**, and none of it may be quoted as a measurement
this repository can currently reproduce.

- The original DEV run covered **49 DEVELOPMENT items**.
- **Five INSA Rouen `classify()` calls never settled** — the liveness defect
  2D2B-2 exists to close:
  `g1b50947deb11a6d5`, `g536c8b148048fcbc`, `g99a9fe00e4856de2`,
  `g39e7132da4064000`, `g9978fec48fa77fbb`.
- **Six outputs were rejected by the validator**:
  `ga435ea22d4b11cf4`, `gdb5b7246327094ef`, `g0ec0d43dad311a77`,
  `g877a05e6f5bba835`, `gcce4e2a5f608de5d`, `gf65026e32d9da8db`.
- Reported mechanisms behind those six rejections:
  1. HTML entities surviving extraction;
  2. case-sensitive `unit_name` verification;
  3. one probable **cross-document unit-name expansion**, which **must
     continue to fail** — a name assembled from a sibling document is exactly
     the hallucination the evidence contract exists to catch.
- Reported database measurement: **153 of 716** evidence rows carried
  undecoded entities, covering **32 distinct entity names**.
- **Zero mojibake was observed**; the earlier "Ã" hypothesis found no support.
- The acquisition defect was **confined to entity decoding during
  extraction** — nothing else about acquisition was implicated.
- **HOLDOUT remained pristine**: 23 items, zero inference, zero semantic
  inspection.
- `ge789b0f0aedc398c` remained an **unresolved gold-consistency question**. No
  label change was approved, and none is made here.
- The intended recovery order remains:
  1. evidence canonicalisation (this slice, 2D2B-1);
  2. hard liveness (2D2B-2);
  3. prompt v2;
  4. configuration freeze;
  5. 2D2C — running **prompt v1 on canonical inputs** before prompt v2.
- The future rerun harness **must preserve raw provider output for
  validator-rejected items**. It did not, which is why §3's first entry is
  permanent.

### Historical artifact hashes — owner-provided identifiers only

These name files that no longer exist. They are recorded so a future reader
can recognise the bytes if they ever resurface. **The files must not be
recreated, and these values must not be presented as verified.**

| artifact                   | owner-provided SHA-256                                             |
| -------------------------- | ------------------------------------------------------------------ |
| DEV results                | `a1843241dc638c1ea7db7f3404c5b44495663e63e5e2d32dba19fa49fd9dfc6a` |
| DEV summary                | `afadd91385a1aeae5dd1c5532ff58068d802614dba4c153fde8fe5bc57e9cc5d` |
| preserved runner artifact  | `bfa26d55f7be4879e3980aa1a8140b7e33fe7fac84cd239d60d7d1b8f701917a` |

---

## 3. `NOT_RECOVERABLE_OR_NOT_REVERIFIED`

- **No raw provider output existed for the six rejected items even before the
  crash.** The runner did not preserve it. That evidence was never lost — it
  was never captured. No amount of repository recovery can produce it, and
  nothing in this slice pretends otherwise.
- **No artifact may be reconstructed from a filename or a SHA-256.** A hash
  identifies bytes; it does not contain them. Writing a file and asserting it
  matches a remembered digest would be fabrication, not recovery.
- The lost DEV results and DEV summary files are gone. They are **not**
  recreated by this slice, and `docs/evaluation/results/` is **not** created.
- The five never-settling INSA Rouen calls, the 153/716 entity measurement and
  the 32 distinct entity names were measured against a database and a run that
  no longer exist here. They are retained in §2 as history and are **not**
  reverified.

### What "recovering the implementation" therefore means

The original 2D2B-1 implementation cannot be recovered byte-for-byte, because
its bytes are gone. What is recovered is its **approved behaviour**,
reimplemented independently against **committed inputs** that still exist —
the frozen acceptance corpus and its manifest — and validated against the
owner-preserved hash oracles where those oracles bear on behaviour.

This document therefore claims reproduction of behaviour, never recovery of
code.

---

## 4. Working discipline for this recovery

- `main` is **untouched**. It was not committed to, amended, rebased, merged
  into, or pushed.
- All new work lives on `feat/phase2b-2d2b-1-evidence-canonicalisation-recovery`,
  in a sibling worktree, and is **pushed to GitHub** so that the reconstructed
  work never again depends on one laptop.
- No pull request is created and no merge is performed by this session.
- This recovery record is committed **before** any implementation, so that the
  reasoning for starting from `7adf895f` is itself durable even if the
  implementation is later revised.

---

## 5. Scope of the slice this record precedes

Only **2D2B-1 — evidence canonicalisation** is implemented. Explicitly **not**
in this slice: 2D2B-2 hard liveness, prompt v2, the configuration freeze,
2D2C, and any live classifier or provider call of any kind.
