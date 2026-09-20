-- 0012_transport_failure_subtype.sql
-- Adds one nullable, bounded refinement column to orgunit_fetch_observations:
-- error_subtype, which records WHICH TLS or DNS condition a transport failure
-- was, prospectively, for attempts made from here on.
--
-- Designed by docs/evaluation/PHASE_2B_2D_A2_TRANSPORT_FAILURE_OBSERVABILITY_DESIGN_V1.json
-- and docs/audits/PHASE_2B_2D_A2_TRANSPORT_FAILURE_OBSERVABILITY_DESIGN_V1.md.
-- Reasoned about in docs/adr/0014-transport-failure-observability.md.
--
-- WHY THIS EXISTS
--
--   The A2 acquisition-resilience reassessment found that this repository
--   cannot tell a retryable transport failure from a permanent one, because
--   error_kind is too coarse where it matters most. TLS_FAILURE covers both a
--   handshake timeout (plausibly transient) and an expired certificate (not
--   transient in any sense). DNS_FAILURE covers both EAI_AGAIN (the resolver
--   said "ask again") and ENOTFOUND (the name does not resolve). The gateway
--   SEES the distinction at the moment of failure and then throws it away:
--   errorDetail is in-memory only, by design, so the subtype of every
--   historical failure is permanently unrecoverable.
--
--   That is an OBSERVABILITY gap, and it is a prerequisite for any future
--   retry policy. This migration closes it for future attempts only.
--
-- EVIDENCE, NOT POLICY - THE LOAD-BEARING DISTINCTION
--
--   error_subtype records WHAT THE RUNTIME REPORTED. It is not a retry
--   verdict, and no retry verdict is stored anywhere in this schema. There is
--   no is_retryable column, no retry_class, no should_retry, no
--   retry_after_ms and no attempts_remaining, and there must never be one.
--
--   Storing a verdict would repeat the mistake rule 12 exists to prevent: a
--   conclusion frozen into an immutable claim, on an append-only table whose
--   writer (nwf_research) holds no UPDATE grant, so a later change of policy
--   could never correct the old rows. Retryability is DERIVED at read time
--   from this evidence, by a policy that does not exist yet and that requires
--   its own owner decision.
--
-- PROSPECTIVE ONLY - NO BACKFILL, AND NONE IS POSSIBLE
--
--   This migration contains ZERO UPDATE statements and zero DML of any kind.
--   The 204 fetch observations that existed when it was written keep
--   error_subtype = NULL permanently. Of those, exactly four carry a
--   transport error_kind: two TLS_FAILURE, one DNS_FAILURE, one READ_TIMEOUT.
--
--   Historical NULL means exactly SUBTYPE_NOT_CAPTURED_AT_EXECUTION_TIME. It
--   does not mean UNKNOWN_RETRYABILITY, it does not mean TRANSIENT, and it is
--   not evidence of anything about the host. Nothing may be inferred from
--   duration, HTTP status, IP family, a neighbouring attempt, the
--   institution's identity, a later successful acquisition, or the present
--   state of DNS or TLS anywhere. A transport observation is a statement
--   about one moment from one vantage; repairing it from today's network
--   would replace evidence with a reconstruction.
--
--   Backfill is not merely forbidden here - it is impossible. nwf_research
--   holds a = INSERT and r = SELECT on this table and nothing else, measured
--   on the live ACL, so no acquisition-side code path could rewrite a row
--   even if one tried.
--
-- WHY NULLABLE, AND WHY NO "WRITTEN AFTER THE MIGRATION" MARKER
--
--   The reassessment sketched a stronger rule: error_subtype NOT NULL for
--   every transport-kind row after this change, so a NULL could only mean
--   "written by an older build". That is not needed, and its database form
--   would be harmful.
--
--   It is not needed because the mapping function is TOTAL: every TLS and
--   every DNS path terminates in a member, with TLS_OTHER and DNS_OTHER
--   absorbing everything the taxonomy does not name. "Could not classify" is
--   not a reachable outcome, so it is not a meaning a NULL could carry. On a
--   transport-kind row, NULL can only mean the row predates this column.
--
--   Its database form would be harmful because a CHECK cannot express "after
--   the migration" without hard-coding a wall-clock boundary against
--   observed_at. That would make this migration BREAKING: any build not yet
--   carrying the subtype code would have its INSERTs rejected, turning an
--   observability gap into an acquisition outage and forcing code before
--   schema. Additive and nullable is what lets the CURRENT build keep
--   inserting successfully against the NEW schema, writing NULL.
--
--   Totality is therefore a CODE invariant, pinned by tests, not a schema
--   constraint.
--
-- THE CONSTRAINT, AND THE THREE-VALUED-LOGIC TRAP IN THE OBVIOUS FORM
--
--   The obvious spelling of "a subtype may only accompany the kind it
--   refines" uses plain equality:
--
--     CHECK (error_subtype IS NULL
--            OR (error_kind = 'TLS_FAILURE' AND error_subtype IN (...))
--            OR (error_kind = 'DNS_FAILURE' AND error_subtype IN (...)))
--
--   THAT FORM DOES NOT HOLD, and the gap is exactly the case it is meant to
--   forbid. A PostgreSQL CHECK passes when its expression is TRUE *or NULL*.
--   A row with error_kind = NULL and error_subtype = 'TLS_OTHER' evaluates
--   FALSE OR NULL OR NULL, which is NULL, which is ACCEPTED - a subtype
--   floating free of any kind, which is precisely the impossible combination.
--
--   IS NOT DISTINCT FROM returns TRUE or FALSE and never NULL, so every
--   disjunct is two-valued and the whole expression is two-valued. Verified
--   against the real PostgreSQL 16 this repository runs, as a read-only
--   SELECT over a VALUES list, before this file was written.
--
--   What the constraint enforces, in the database rather than in TypeScript:
--   the vocabulary is closed at exactly eight members; a subtype may only
--   accompany the error_kind it refines; and no subtype may accompany
--   error_kind IS NULL or any unrelated kind. What it deliberately does not
--   enforce is that a transport-kind row must CARRY a subtype - see above.
--
-- WHAT IS NOT ADDED
--
--   No error_detail column, and no free-text column of any kind. errorDetail
--   in the gateway today embeds the HOSTNAME and, for a certificate failure,
--   whatever OpenSSL chose to say about subject, SAN or issuer. A subtype is
--   one of eight fixed tokens: it leaks nothing, it does not change wording
--   when Node or OpenSSL is upgraded, and it is queryable as a fact rather
--   than as a LIKE pattern. Rule 17's posture on this table is unchanged.
--
--   No index. The table holds 204 rows and error_kind itself is unindexed; an
--   index here would be speculative capacity for a query nobody has written.
--
--   No GRANT and no REVOKE. pg_attribute.attacl is NULL for every column of
--   this table, so the table-level ACL alone governs, and PostgreSQL applies
--   a table-level privilege to columns added later. nwf_research keeps
--   SELECT + INSERT and gains nothing; no UPDATE authority is broadened.
--
--   No fetch-policy version bump. orgunit-fetch-policy-v3 governs WHICH
--   REQUESTS ARE ISSUED - the same URLs, in the same order, under the same
--   30s/45s timeouts, the same 5 MiB cap, the same headers, the same robots
--   continuation boundary. This change governs which COLUMNS ARE WRITTEN
--   about them. A future retry, which would issue a second request where v3
--   issues one, DOES require v4 and its own owner decision.

ALTER TABLE orgunit_fetch_observations
    ADD COLUMN error_subtype text;

ALTER TABLE orgunit_fetch_observations
    ADD CONSTRAINT orgunit_fetch_observations_error_subtype_chk
    CHECK (error_subtype IS NULL
           OR (error_kind IS NOT DISTINCT FROM 'TLS_FAILURE'
               AND error_subtype IN ('TLS_HANDSHAKE_TIMEOUT', 'TLS_CERT_INVALID',
                                     'TLS_PROTOCOL_INCOMPATIBLE', 'TLS_OTHER'))
           OR (error_kind IS NOT DISTINCT FROM 'DNS_FAILURE'
               AND error_subtype IN ('DNS_NAME_NOT_FOUND', 'DNS_TEMPORARY_FAILURE',
                                     'DNS_NO_ADDRESS_RETURNED', 'DNS_OTHER')));

COMMENT ON COLUMN orgunit_fetch_observations.error_subtype IS
    'WHICH TLS or DNS condition this transport failure was, as the runtime '
    'reported it, normalised onto a closed eight-member vocabulary. '
    'EVIDENCE, NEVER A RETRY VERDICT. Retryability is POLICY and is derived '
    'at read time; no retry decision is stored in this schema, and no '
    'is_retryable, retry_class or should_retry column may be added. '
    'NULL MEANS EXACTLY SUBTYPE_NOT_CAPTURED_AT_EXECUTION_TIME - the row was '
    'written before migration 0012, or the failure was not a TLS or DNS one. '
    'It does NOT mean UNKNOWN_RETRYABILITY, it does NOT mean TRANSIENT, and '
    'nothing about the host may be inferred from it; the 204 observations '
    'that predate this column keep NULL permanently and are never backfilled. '
    'DNS_NAME_NOT_FOUND means precisely "Node reported ENOTFOUND", which on '
    'Node 24 covers BOTH NXDOMAIN (EAI_NONAME) and name-exists-but-has-no-'
    'address-of-either-family (EAI_NODATA): the runtime destroys that '
    'distinction before this repository can observe it, so the column does '
    'not pretend to carry it. '
    'TLS_OTHER and DNS_OTHER mean "a condition this build''s taxonomy does '
    'not name" and MUST NEVER be read as transient or retryable; an unknown '
    'future error code lands there precisely so that it cannot be mistaken '
    'for a recognised, retry-compatible one. '
    'The broad error_kind remains the durable failure category; already-'
    'specific kinds (CONNECT_TIMEOUT, READ_TIMEOUT, CONNECTION_REFUSED, '
    'CONNECTION_RESET) carry NULL here rather than a second spelling of the '
    'same fact, and an HTTP response that arrived carries its status in '
    'http_status with both error columns NULL.';
