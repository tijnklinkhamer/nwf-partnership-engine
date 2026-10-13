# Classifier evidence-quote database boundary (V1)

Status: IMPLEMENTED AND TESTED on branch `fix/classifier-evidence-quote-db-boundary-v1`, based on
pin `25916c2`. **Not promoted.** OWNER authority: P2-X2 §A–B (2026-10-13).

## Defect

Operational pilot P2-X1 (call `edebf379-fb38-487c-a75f-a8989c672a87`, F PARIS270, attempt 1)
aborted at INSERT with `orgunit_page_classifications_evidence_spans_quote_chk`. Migration 0009's
CHECK is `@."quote" like_regex "^.{1,200}$"`. In PostgreSQL SQL/JSON `like_regex`, `.` does not
match a newline unless the `s` flag is given, so a quote containing U+000A is refused. Span
verification (`evidenceVerification.ts`) compares whitespace-collapsed text, so a quote copied
across a line break of the excerpt verified, and the validator then accepted it. Persistence is
per-document (`persist.ts`), so the first failing insert aborted the run before its completion:
the call row stayed with `NO_COMPLETION_RECORDED`. That row is untouched.

Measured on PostgreSQL 16.15 (local server): rejected if the quote contains U+000A (alone,
leading, trailing, inside CR LF), is empty, or has more than 200 code points. Accepted: U+000D,
U+000B, U+000C, U+0009, U+0085, U+2028, U+2029, and up to 200 code points of astral or combining
characters. Only the quote CHECK uses a regex. The other text CHECKs (`rationale`, `unit_name`)
use `length()` in code points, which the validator already enforces exactly.

## Change

- `validate.ts`: `lengthViolations` also refuses a quote containing
  `EVIDENCE_QUOTE_FORBIDDEN_LINE_TERMINATOR` (U+000A), as a `LENGTH` rejection of that document
  only. It maps to `SCHEMA_INVALID` and keeps `EVIDENCE_SPAN_UNVERIFIED` precedence. Span
  verification is unchanged, and no quote is stripped, rewritten or substituted.
- `repair.ts`: the repair path re-validates through the same validator, so a repair answer cannot
  reach the CHECK. A document whose only defect is the line feed has no reason code in the
  versioned repair notice. It is listed under `excluded` as `NO_REPAIR_NOTICE_FIELD` and never
  re-presented. `REPAIR_REQUEST_VERSION` is unchanged.
- Unchanged: prompt, provider, model, schema (zod), acquisition, ranking, handoff, assembly, every
  migration and CHECK, every persisted row.

## Versioning

No governance artifact versions layer-2 validation. The call identity is
`{assemblyInputSha256, promptVersion, outputSchemaVersion}` plus model and attempt. Assembly,
prompt and output schema are unchanged, so no version constant moves, and an attempt 2 of the
P2-X1 input keeps `input_sha256` `0d8e89f8…69fdd`. Persisted rows do not record the Engine
commit, so which validator decided a call is traceable only through the Operator's Engine pin and
the run records. Frozen 2D2C studies load the validator from their own pinned variant roots and
are unaffected.

## Evidence

- `src/test/integration/orgunitClassifyEvidenceQuoteDbBoundary.test.ts` runs on `nwf_pe_test`
  with the real `nwf_classifier` role and scripted provider output only. It covers: the validator
  bound equals the live CHECK (read from `pg_constraint`, evaluated by the server) on 18 boundary
  cases; a single-line quote is persisted; a line-feed quote rejects only its document while 2
  siblings and their subject rows persist and the completion is PARTIAL/SCHEMA_INVALID; mixed with
  an evidence failure the completion is PARTIAL/EVIDENCE_SPAN_UNVERIFIED; with repair enabled,
  line-feed-only rejections are never re-presented; a repair answer with a line feed is rejected
  (repair call FAILED/SCHEMA_INVALID) and never inserted; every persisted quote satisfies the live
  CHECK. With the source fix reverted, 5 of these 6 fail, reproducing the P2-X1 CHECK violation.
- `src/test/unit/orgunitClassifyEvidenceQuoteLineFeed.test.ts`: the pure validator and repair
  planner cases.

## Not done (separate decision)

The runtime still leaves a call open if a per-document insert fails for any other reason. A
bounded alternative, recording a `FAILED`/`OTHER` completion when a classification insert throws
after the call row exists, is append-only-compatible: it adds one completion row and rewrites
nothing. It is proposed separately and not implemented here.
