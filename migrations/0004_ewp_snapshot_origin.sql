-- 0004_ewp_snapshot_origin.sql
-- Phase 1B correction: preserve WHERE AN ARTIFACT WAS PUBLISHED, separately
-- from HOW THIS RUN READ ITS BYTES.
--
-- THE DEFECT THIS FIXES
--
--   0003 records exactly one provenance fact per snapshot: `source_input_kind`
--   plus `source_location`, i.e. the READ MECHANISM. That is truthful, and it
--   is deliberately truthful - an `operator_file` run must never be dressed up
--   as a direct fetch from an official URL.
--
--   But it is not sufficient. The reproducible way to ingest a measured
--   artifact is to download it once, hash it, and then ingest THOSE EXACT BYTES
--   with --file. Under 0003 that run persists only a local path, so the fact
--   that the bytes came from the official EWP Registry survives nowhere in the
--   database. An auditor querying ewp_snapshots sees
--   "operator_file / data/ewp-catalogue-v1.xml" and cannot tell an official
--   artifact from a hand-edited local file. The publication origin existed only
--   in an ADR, which is prose, not evidence.
--
-- THE CORRECTION, AND ITS LIMITS
--
--   Two nullable columns, recorded ONLY when the origin is actually known:
--   automatically for a run that did the fetch itself, and otherwise only from
--   an explicit operator assertion (`ewp ingest --file X --origin-url ...`).
--   There is no inference anywhere. A local file with no asserted origin keeps
--   NULL, which reads as "not recorded" and never as "official".
--
--   NOTHING IS BACK-FILLED. The snapshot ingested before this migration keeps
--   NULL in both columns. Its bytes are known to have come from the official
--   catalogue, but writing that in now would be an UPDATE of source evidence on
--   a table this repository declares append-only, and the ingest role has no
--   UPDATE grant precisely so that cannot happen. A retrospective assertion is
--   not the same kind of fact as a recorded one, and the schema does not
--   pretend otherwise. Re-ingesting that artifact WITH an origin is also a
--   no-op by design: artifact_sha256 is unique, so the snapshot is recognised
--   and nothing is inserted. That is the correct trade - an unrecoverable gap
--   in one historical row is better than a mutable evidence table.

ALTER TABLE ewp_snapshots ADD COLUMN origin_url          text;
ALTER TABLE ewp_snapshots ADD COLUMN origin_retrieved_at timestamptz;

-- An origin, when present, is an official EWP Registry URL. The host allow-list
-- is the same one src/ingest/ewp/source.ts enforces; stating it here too means
-- the database rejects a false origin even if application code is bypassed.
ALTER TABLE ewp_snapshots ADD CONSTRAINT ewp_snapshots_origin_url_chk
    CHECK (origin_url IS NULL
           OR origin_url ~ '^https://registry\.erasmuswithoutpaper\.eu/[^ ]*\.xml$');

-- A retrieval time with no URL describes nothing.
ALTER TABLE ewp_snapshots ADD CONSTRAINT ewp_snapshots_origin_pair_chk
    CHECK (origin_retrieved_at IS NULL OR origin_url IS NOT NULL);

-- A run that fetched the bytes itself ALWAYS knows its own origin, so for those
-- kinds the columns are mandatory. Only 'operator_file' may leave them NULL.
-- The pre-existing snapshot is 'operator_file', so this validates cleanly.
ALTER TABLE ewp_snapshots ADD CONSTRAINT ewp_snapshots_fetched_has_origin_chk
    CHECK (source_input_kind = 'operator_file' OR origin_url IS NOT NULL);

COMMENT ON COLUMN ewp_snapshots.origin_url IS
    'WHERE THE ARTIFACT WAS PUBLISHED, as distinct from where this run read it. '
    'Set automatically when the run fetched the bytes itself. For an '
    '''operator_file'' run it is NULL unless an operator explicitly asserted it '
    'with --origin-url, because the bytes on disk carry no evidence of their '
    'own origin and inferring one would fabricate provenance. NULL means NOT '
    'RECORDED - never "not official" and never "unofficial".';

COMMENT ON COLUMN ewp_snapshots.origin_retrieved_at IS
    'When the artifact was retrieved FROM origin_url. For a run that fetched '
    'the bytes itself this equals fetched_at. For an operator_file run carrying '
    'an asserted origin it is the earlier download time, supplied with '
    '--origin-retrieved-at, and is therefore normally BEFORE fetched_at. NULL '
    'whenever origin_url is NULL.';

-- fetched_at was ambiguous: for an operator_file run it is the moment the LOCAL
-- FILE WAS READ, which can be long after the bytes were downloaded. Naming that
-- "fetched" invited exactly the misreading this migration exists to prevent.
COMMENT ON COLUMN ewp_snapshots.fetched_at IS
    'When THIS RUN READ THE BYTES: the HTTP fetch for ''official_endpoint'' and '
    '''operator_url'', and the LOCAL FILE READ for ''operator_file''. It is NOT '
    'necessarily when the artifact was retrieved from the Registry - for an '
    'operator_file run that is origin_retrieved_at, when recorded. Compare '
    'against created_at, which is when the evidence rows were inserted.';
