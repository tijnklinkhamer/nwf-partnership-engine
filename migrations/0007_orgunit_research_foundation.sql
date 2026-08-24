-- 0007_orgunit_research_foundation.sql
-- Phase 2B-1a: the TRUST FOUNDATION for bounded first-party web acquisition.
--
-- WHAT THIS MIGRATION IS
--
--   Schema, a role, and the constraints that make the Phase 2B trust contract a
--   DATABASE guarantee rather than a code convention. It creates the shapes
--   that a later slice will write rows into.
--
-- WHAT THIS MIGRATION IS NOT
--
--   It is not a crawler and it does not enable one. After this migration the
--   repository still has ZERO institution-website network call sites: the only
--   three files permitted to call fetch() are the three official-source
--   resolvers, and src/test/firewall/phase1d.firewall.test.ts pins that list
--   exactly. Nothing here loosens it. The acquisition gateway
--   (src/orgunits/web/gateway.ts) belongs to slice 2B-1b, and the semantic
--   classifier belongs to Phase 2B-2, which is not authorised.
--
--   It is also not entity resolution, not contact discovery, not scoring of
--   organisations, not compliance and not outreach. See ADR 0004.
--
-- THE GOVERNING PRINCIPLE
--
--   SOFTWARE DECIDES WHERE THE MODEL MAY LOOK.
--   THE MODEL INTERPRETS ONLY THE SMALL REMAINDER.
--   SOFTWARE DECIDES WHAT HAPPENS NEXT.
--
--   Every table below is on the software side of that line. Not one of them
--   stores an interpretation, a relevance verdict, or a partnership decision.
--
-- THE APPEND-ONLY CONTRACT, AND WHY IT SHAPES THE TABLE LIST
--
--   nwf_research receives SELECT and INSERT and NOTHING ELSE. No UPDATE, no
--   DELETE, no TRUNCATE, no TEMPORARY. That is not decoration: it is the reason
--   several tables here look different from the obvious design.
--
--   A run cannot be INSERTed as 'running' and later UPDATEd to 'succeeded',
--   because the role that executes runs cannot UPDATE anything. So a run's
--   configuration and a run's TERMINAL RESULT are two immutable rows in two
--   tables, and the run's status is DERIVED from whether the second exists.
--   The same reasoning removes every mutable lifecycle column in this file: a
--   promotion is revoked by APPENDING a revocation, never by editing an
--   approval, and a ranked candidate is superseded by a newer run or rule
--   version, never by rewriting the old row.
--
--   This mirrors what migrations 0003 and 0005 already do for source evidence,
--   and for the same reason: evidence that can be edited is not evidence.

-- ---------------------------------------------------------------------------
-- A. orgunit_research_runs - one immutable execution identity.
-- ---------------------------------------------------------------------------
--
-- Configuration only. There is deliberately NO status column and NO
-- finished_at column here; see orgunit_research_run_completions.

CREATE TABLE orgunit_research_runs (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at           timestamptz NOT NULL,
    network_vantage      text        NOT NULL,
    fetch_policy_version text        NOT NULL,
    rule_version         text        NOT NULL,
    dry_run              boolean     NOT NULL DEFAULT false,
    created_at           timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT orgunit_research_runs_vantage_chk
        CHECK (network_vantage <> '' AND length(network_vantage) <= 64),
    CONSTRAINT orgunit_research_runs_fetch_policy_version_chk
        CHECK (fetch_policy_version <> '' AND length(fetch_policy_version) <= 64),
    CONSTRAINT orgunit_research_runs_rule_version_chk
        CHECK (rule_version <> '' AND length(rule_version) <= 64)
);

COMMENT ON TABLE orgunit_research_runs IS
    'One Phase 2B research execution, recorded IMMUTABLY at its start. This '
    'table holds configuration and nothing else: a run''s outcome is a separate '
    'row in orgunit_research_run_completions, because nwf_research holds no '
    'UPDATE grant and therefore cannot close out a mutable run record the way '
    'ingest_runs is closed out. A run is its own identity - re-running the same '
    'configuration deliberately produces a NEW run, because re-observation over '
    'time is the point.';

COMMENT ON COLUMN orgunit_research_runs.network_vantage IS
    'A LABEL for where this run''s requests egressed from, for example '
    '''local-dev''. It exists because a fetch result is a function of the '
    'vantage point as well as of the site: a host that answers from one network '
    'may time out from another, and two runs that disagree must be '
    'distinguishable. It is NOT a country claim about the organisation and NOT '
    'a jurisdiction assertion of any kind.';

COMMENT ON COLUMN orgunit_research_runs.fetch_policy_version IS
    'Which version of the bounded acquisition policy - timeouts, byte caps, '
    'concurrency, subdomain deny list, redirect handling - governed this run. '
    'Stored so an observation always says what rules produced it, and carried '
    'onto every fetch observation so a policy change yields NEW evidence rather '
    'than a rewrite of old evidence.';

COMMENT ON COLUMN orgunit_research_runs.rule_version IS
    'Which version of the DETERMINISTIC ranking rules governed this run. '
    'Deliberately separate from fetch_policy_version: acquisition and ranking '
    'change independently, and collapsing them would make it impossible to say '
    'whether a differing result came from fetching differently or from scoring '
    'differently.';

-- ---------------------------------------------------------------------------
-- B. orgunit_research_run_completions - the immutable terminal event.
-- ---------------------------------------------------------------------------
--
-- A run's current state is DERIVED, never stored twice:
--
--   no completion row  -> the run has not reached a terminal state (either it
--                         is still executing, or it died without recording one)
--   one completion row -> that row IS the terminal state
--
-- The absence of a row is deliberately ambiguous between "running" and "died
-- silently", and that ambiguity is honest: a process killed mid-run cannot
-- write anything, so a schema that claimed to distinguish those two cases
-- would be claiming knowledge it does not have.

CREATE TABLE orgunit_research_run_completions (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id         uuid        NOT NULL REFERENCES orgunit_research_runs (id),
    terminal_state text        NOT NULL,
    finished_at    timestamptz NOT NULL,
    error_kind     text,
    error_summary  text,
    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT orgunit_research_run_completions_state_chk
        CHECK (terminal_state IN ('COMPLETED', 'FAILED', 'ABORTED')),
    -- A completed run has no failure to describe. This is what stops a
    -- successful run from quietly carrying an error tail.
    CONSTRAINT orgunit_research_run_completions_completed_is_clean_chk
        CHECK (terminal_state <> 'COMPLETED'
               OR (error_kind IS NULL AND error_summary IS NULL)),
    CONSTRAINT orgunit_research_run_completions_error_kind_chk
        CHECK (error_kind IS NULL OR length(error_kind) <= 64),
    -- Bounded on purpose: an error summary is a short operator-facing label,
    -- not a place to accumulate page content or a stack of fetched bytes.
    CONSTRAINT orgunit_research_run_completions_error_summary_chk
        CHECK (error_summary IS NULL OR length(error_summary) <= 2000)
);

-- AT MOST ONE terminal row per run. This is the constraint that makes "derive
-- the status" well defined: without it, two contradictory completions could
-- coexist and the derivation would have to pick a winner.
CREATE UNIQUE INDEX orgunit_research_run_completions_run_uidx
    ON orgunit_research_run_completions (run_id);

COMMENT ON TABLE orgunit_research_run_completions IS
    'The APPEND-ONLY terminal event of a research run. One row at most per run, '
    'inserted once and never edited. Together with orgunit_research_runs this '
    'replaces the usual mutable run record: status and finished_at are '
    'observations that arrive later, so they are stored as a later row rather '
    'than as an UPDATE the executing role is not permitted to perform.';

-- ---------------------------------------------------------------------------
-- C. orgunit_fetch_observations - one outbound request, one row.
-- ---------------------------------------------------------------------------
--
-- NO ROW IS WRITTEN HERE BY THIS SLICE. Nothing in this repository fetches an
-- institution website yet, and this migration does not change that. The table
-- exists so that the trust boundaries a fetch must satisfy are settled and
-- reviewed BEFORE the code that fetches is written.
--
-- NO RESPONSE BODY IS EVER STORED. There is no raw_html, no response_body and
-- no page_html column here or anywhere in this migration, and there must never
-- be one. What is kept is the SHA-256 of the bytes, their length, and the
-- metadata needed to reason about the request. Extracted, capped, cleaned text
-- lives in orgunit_page_evidence and nowhere else.
--
-- The root-provenance columns are declared here but the foreign key to
-- orgunit_root_promotion_events is added further down: promotion events
-- reference redirect observations, which reference this table, so the three
-- tables form a cycle that CREATE TABLE alone cannot express.

CREATE TABLE orgunit_fetch_observations (
    id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                       uuid        NOT NULL REFERENCES orgunit_research_runs (id),

    -- ROOT PROVENANCE. Exactly one of these is set; see the CHECK below.
    root_website_claim_id        uuid        REFERENCES website_claims (id),
    root_promotion_event_id      uuid,

    -- IDENTITY BOUNDARY. eche_row_key is the anchor, exactly as in
    -- website_claims; organisation_id is a nullable convenience link.
    eche_row_key                 text        NOT NULL,
    organisation_id              uuid        REFERENCES organisations (id),

    requested_url                text        NOT NULL,
    requested_host               text        NOT NULL,
    requested_registrable_domain text        NOT NULL,

    discovery_method             text        NOT NULL,
    discovery_parent_url         text,

    http_status                  integer,
    content_type                 text,
    charset                      text,
    charset_source               text,
    charset_confidence           text,
    response_sha256              text,
    byte_count                   bigint,
    truncated                    boolean     NOT NULL DEFAULT false,

    robots_decision              text        NOT NULL,
    robots_rule                  text,

    -- SSRF evidence. The resolved ADDRESS is deliberately not stored; what
    -- matters for review is whether the connection went somewhere public.
    resolved_ip_family           text,
    resolved_ip_is_public        boolean,

    error_kind                   text,

    fetch_policy_version         text        NOT NULL,
    observed_at                  timestamptz NOT NULL,
    created_at                   timestamptz NOT NULL DEFAULT now(),

    -- EXACTLY ONE ROOT AUTHORITY. A fetch is either authorised by an official
    -- website CLAIM, or by an explicit operator PROMOTION of an observed
    -- cross-domain redirect target. There is no third way to acquire a root,
    -- and in particular there is no "canonical website" anywhere to inherit one
    -- from.
    CONSTRAINT orgunit_fetch_observations_root_xor_chk
        CHECK ((root_website_claim_id IS NOT NULL)::int
               + (root_promotion_event_id IS NOT NULL)::int = 1),

    CONSTRAINT orgunit_fetch_observations_eche_row_key_chk
        CHECK (eche_row_key <> ''),
    CONSTRAINT orgunit_fetch_observations_url_chk
        CHECK (requested_url ~ '^https?://'),
    CONSTRAINT orgunit_fetch_observations_host_chk
        CHECK (requested_host <> '' AND requested_registrable_domain <> ''),

    CONSTRAINT orgunit_fetch_observations_discovery_method_chk
        CHECK (discovery_method IN
            ('ROOT', 'LINK', 'SITEMAP', 'ROBOTS', 'WELL_KNOWN_PATH')),
    -- A root was not discovered from anything: it IS the entry point.
    CONSTRAINT orgunit_fetch_observations_root_has_no_parent_chk
        CHECK (discovery_method <> 'ROOT' OR discovery_parent_url IS NULL),
    -- A followed link always knows what page it was on.
    CONSTRAINT orgunit_fetch_observations_link_has_parent_chk
        CHECK (discovery_method <> 'LINK' OR discovery_parent_url IS NOT NULL),

    CONSTRAINT orgunit_fetch_observations_status_chk
        CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
    -- EVERY observation ends in one or the other, and MAY end in both: a
    -- response can arrive with status 200 and then time out mid-body. Modelling
    -- them as mutually exclusive would force that case to lie.
    CONSTRAINT orgunit_fetch_observations_outcome_chk
        CHECK (http_status IS NOT NULL OR error_kind IS NOT NULL),
    CONSTRAINT orgunit_fetch_observations_error_kind_chk
        CHECK (error_kind IS NULL OR error_kind IN
            ('DNS_FAILURE', 'CONNECT_TIMEOUT', 'READ_TIMEOUT', 'TLS_FAILURE',
             'CONNECTION_REFUSED', 'CONNECTION_RESET', 'BLOCKED_BY_POLICY',
             'MALFORMED_URL', 'RESPONSE_TOO_LARGE', 'UNSUPPORTED_CONTENT_TYPE',
             'TOO_MANY_REDIRECTS', 'OTHER')),

    CONSTRAINT orgunit_fetch_observations_sha256_chk
        CHECK (response_sha256 IS NULL OR response_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT orgunit_fetch_observations_byte_count_chk
        CHECK (byte_count IS NULL OR byte_count >= 0),
    -- A hash without a length, or a length without a hash, describes bytes
    -- nobody can check.
    CONSTRAINT orgunit_fetch_observations_body_pair_chk
        CHECK ((response_sha256 IS NULL) = (byte_count IS NULL)),
    -- Truncation is a statement about bytes that were read.
    CONSTRAINT orgunit_fetch_observations_truncated_needs_body_chk
        CHECK (truncated IS NOT TRUE OR response_sha256 IS NOT NULL),

    CONSTRAINT orgunit_fetch_observations_charset_source_chk
        CHECK (charset_source IS NULL OR charset_source IN
            ('HTTP_HEADER', 'BOM', 'META_PRESCAN', 'META_LATE',
             'UTF8_VALIDITY_PROBE', 'FALLBACK')),
    CONSTRAINT orgunit_fetch_observations_charset_confidence_chk
        CHECK (charset_confidence IS NULL OR charset_confidence IN
            ('DECLARED', 'PROBED', 'ASSUMED')),
    -- A charset always says where it came from and how sure that is.
    CONSTRAINT orgunit_fetch_observations_charset_triple_chk
        CHECK ((charset IS NULL) = (charset_source IS NULL)
               AND (charset IS NULL) = (charset_confidence IS NULL)),

    CONSTRAINT orgunit_fetch_observations_robots_decision_chk
        CHECK (robots_decision IN
            ('ALLOWED', 'DISALLOWED', 'NO_ROBOTS_FILE', 'ROBOTS_UNREADABLE',
             'NOT_APPLICABLE')),
    CONSTRAINT orgunit_fetch_observations_robots_rule_chk
        CHECK (robots_rule IS NULL OR length(robots_rule) <= 512),

    CONSTRAINT orgunit_fetch_observations_ip_family_chk
        CHECK (resolved_ip_family IS NULL OR resolved_ip_family IN ('IPV4', 'IPV6')),
    CONSTRAINT orgunit_fetch_observations_ip_pair_chk
        CHECK ((resolved_ip_family IS NULL) = (resolved_ip_is_public IS NULL)),

    CONSTRAINT orgunit_fetch_observations_fetch_policy_version_chk
        CHECK (fetch_policy_version <> '' AND length(fetch_policy_version) <= 64)
);

-- IDEMPOTENCY, at the grain of "this run asked this root for this URL under
-- this policy". NULLS NOT DISTINCT is load-bearing: exactly one of the two root
-- columns is always NULL, and under the default NULL semantics every row would
-- be trivially distinct and the index would guarantee nothing.
--
-- Deliberately NOT unique across runs. Re-observing the same URL in a later run
-- is the entire point of a research run, and collapsing that would destroy the
-- ability to see a site change.
CREATE UNIQUE INDEX orgunit_fetch_observations_dedupe_uidx
    ON orgunit_fetch_observations (run_id, root_website_claim_id,
                                   root_promotion_event_id, requested_url,
                                   fetch_policy_version)
    NULLS NOT DISTINCT;

CREATE INDEX orgunit_fetch_observations_run_idx ON orgunit_fetch_observations (run_id);
CREATE INDEX orgunit_fetch_observations_eche_row_key_idx
    ON orgunit_fetch_observations (eche_row_key);
CREATE INDEX orgunit_fetch_observations_host_idx
    ON orgunit_fetch_observations (requested_host);
CREATE INDEX orgunit_fetch_observations_organisation_idx
    ON orgunit_fetch_observations (organisation_id) WHERE organisation_id IS NOT NULL;

COMMENT ON TABLE orgunit_fetch_observations IS
    'ONE OUTBOUND REQUEST, recorded immutably. It states what was requested and '
    'what came back - never what the response MEANT. NO RESPONSE BODY IS '
    'STORED: the bytes are represented by response_sha256 and byte_count only, '
    'and there is no raw_html, response_body or page_html column in this schema '
    'by deliberate design. Every row names the root authority that permitted '
    'the request, and the CHECK on those two columns means a request with no '
    'root authority cannot be recorded at all.';

COMMENT ON COLUMN orgunit_fetch_observations.root_website_claim_id IS
    'ROOT TYPE 1: this fetch descends from an OFFICIAL SOURCE CLAIM about a '
    'website (Phase 1D evidence). Pointing at the CLAIM rather than at an '
    'organisation is what keeps the trust chain honest: two official sources '
    'disagree about 10 French institutions, both claims remain stored, and a '
    'run that followed one of them says exactly which one. Nothing here elects '
    'a winner, and no preferred or canonical website exists to elect.';

COMMENT ON COLUMN orgunit_fetch_observations.root_promotion_event_id IS
    'ROOT TYPE 2: this fetch descends from a cross-domain redirect target that '
    'an OPERATOR EXPLICITLY PROMOTED to a research root. A redirect target is '
    'never a root by observation alone - see orgunit_root_promotion_events.';

COMMENT ON COLUMN orgunit_fetch_observations.eche_row_key IS
    'THE ANCHOR: normalised(erasmus_code) || ''|'' || pic, identifying one ECHE '
    'SOURCE ROW - not a real-world institution. Identical in meaning to '
    'website_claims.eche_row_key, deliberately, so research evidence joins to '
    'source evidence without either one strengthening the other''s identity '
    'claim.';

COMMENT ON COLUMN orgunit_fetch_observations.organisation_id IS
    'CONVENIENCE ONLY, and deliberately NULLABLE - the same decision '
    'website_claims made and for the same reason. Web evidence about a page '
    'must never be read as proof that two provisional organisation records are '
    'one entity, and a NOT NULL foreign key here would quietly imply exactly '
    'that. Join on eche_row_key when you want completeness.';

COMMENT ON COLUMN orgunit_fetch_observations.response_sha256 IS
    'SHA-256 of the response bytes actually read, capped by the fetch policy. '
    'THIS IS THE ONLY REPRESENTATION OF THE BODY THAT EVER REACHES THE '
    'DATABASE. NULL when no bytes were read (a network failure, or a response '
    'refused before its body).';

COMMENT ON COLUMN orgunit_fetch_observations.charset_source IS
    'WHERE the decoding charset came from, as a bounded taxonomy. META_LATE is '
    'not hypothetical: a real university declares its charset at byte 1050, '
    'past the HTML5 1024-byte prescan window, and its bytes are not valid UTF-8 '
    '- so UTF8_VALIDITY_PROBE exists as an honest non-guessing tiebreak and '
    'FALLBACK is recorded as such rather than silently presented as declared.';

COMMENT ON COLUMN orgunit_fetch_observations.robots_decision IS
    'What the site''s own robots file said about this URL. NOT_APPLICABLE is '
    'for the request that retrieves that file, which is not subject to its own '
    'rules. This column records a DECISION MADE BEFORE THE REQUEST; a row whose '
    'decision is DISALLOWED must carry error_kind = ''BLOCKED_BY_POLICY'' and '
    'no body, because a disallowed URL is not fetched.';

COMMENT ON COLUMN orgunit_fetch_observations.resolved_ip_is_public IS
    'Whether the address the connection actually went to is publicly routable. '
    'The address itself is not stored - what a reviewer needs is the assertion '
    'that a first-party fetch did not reach a loopback, link-local or private '
    'range. NULL means NOT RECORDED, never "public".';

COMMENT ON COLUMN orgunit_fetch_observations.discovery_method IS
    'How this URL entered the frontier. Discovery is recorded HERE, on the '
    'request, and deliberately not repeated on page evidence or on candidates: '
    'a URL is discovered once and then fetched, so duplicating it downstream '
    'would create two columns that can disagree about one fact. Downstream '
    'tables reach it through their foreign key.';

-- ---------------------------------------------------------------------------
-- D. orgunit_redirect_observations - one observed 3xx edge, as FACTS.
-- ---------------------------------------------------------------------------
--
-- WHY THIS IS NOT ONE ENUM COLUMN
--
--   The tempting design is a single verdict such as CROSS_DOMAIN. It is wrong,
--   because one hop can be several things at once: the host can change while
--   the registrable domain does not, and the scheme can be downgraded at the
--   same time. A lossy label would decide, at write time and invisibly, which
--   of those facts mattered. So the facts are stored separately and any label a
--   report wants is DERIVED from them.
--
--   Each fact is NULLABLE, and that is not laziness. When the Location header
--   cannot be resolved to a URL at all, "did the host change?" has no answer,
--   and NULL is the only honest one. Unknown stays unknown.

CREATE TABLE orgunit_redirect_observations (
    id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    fetch_observation_id       uuid        NOT NULL
                                           REFERENCES orgunit_fetch_observations (id),
    http_status                integer     NOT NULL,
    to_url_raw                 text        NOT NULL,
    to_url_resolved            text,
    target_malformed           boolean     NOT NULL,
    scheme_downgraded          boolean,
    host_changed               boolean,
    registrable_domain_changed boolean,
    observed_at                timestamptz NOT NULL,
    created_at                 timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT orgunit_redirect_observations_status_chk
        CHECK (http_status BETWEEN 300 AND 399),
    CONSTRAINT orgunit_redirect_observations_raw_chk
        CHECK (to_url_raw <> ''),
    -- A malformed target is exactly one that could not be resolved.
    CONSTRAINT orgunit_redirect_observations_malformed_chk
        CHECK (target_malformed = (to_url_resolved IS NULL)),
    -- The comparison facts exist if and only if there was something to compare.
    CONSTRAINT orgunit_redirect_observations_facts_chk
        CHECK ((to_url_resolved IS NULL)
               = (scheme_downgraded IS NULL
                  AND host_changed IS NULL
                  AND registrable_domain_changed IS NULL)),
    CONSTRAINT orgunit_redirect_observations_facts_complete_chk
        CHECK (to_url_resolved IS NULL
               OR (scheme_downgraded IS NOT NULL
                   AND host_changed IS NOT NULL
                   AND registrable_domain_changed IS NOT NULL)),
    -- A changed registrable domain is necessarily a changed host. The converse
    -- is false, which is precisely why both columns exist.
    CONSTRAINT orgunit_redirect_observations_domain_implies_host_chk
        CHECK (registrable_domain_changed IS NOT TRUE OR host_changed)
);

-- ONE EDGE PER REQUEST. A single request yields a single response with a single
-- Location header; a chain is a chain of separate fetch observations, each with
-- its own edge, so a chain remains fully reconstructable and no hop is implicit.
CREATE UNIQUE INDEX orgunit_redirect_observations_fetch_uidx
    ON orgunit_redirect_observations (fetch_observation_id);

COMMENT ON TABLE orgunit_redirect_observations IS
    'ONE OBSERVED 3xx EDGE, stored as independent FACTS rather than as one '
    'lossy verdict. A cross-registrable-domain hop is RECORDED AND STOPPED: it '
    'never becomes a crawl root by observation. Measured justification: of '
    'three organisations where two official sources disagree about the website, '
    'two redirect onto the register''s value and the third serves both domains '
    'live with no redirect between them - so a hop is a strong review signal '
    'and never an automatic winner.';

COMMENT ON COLUMN orgunit_redirect_observations.to_url_raw IS
    'The redirect target header EXACTLY as received, before resolution against '
    'the request URL. Kept verbatim because a malformed or relative target is '
    'itself a finding, and repairing it in place would erase it.';

COMMENT ON COLUMN orgunit_redirect_observations.host_changed IS
    'Whether the hop leaves the requested HOST. Deliberately separate from '
    'registrable_domain_changed: a hop from www.example.ac.uk to '
    'international.example.ac.uk changes the host and not the domain, and the '
    'two carry completely different trust consequences. NULL when the target '
    'could not be resolved, because then the question has no answer.';

-- ---------------------------------------------------------------------------
-- G. orgunit_root_promotion_events - the explicit operator decision.
-- ---------------------------------------------------------------------------
--
-- THE INVARIANT THIS TABLE EXISTS TO ENFORCE:
--
--   A CROSS-DOMAIN REDIRECT TARGET CANNOT BECOME A RESEARCH ROOT WITHOUT AN
--   EXPLICIT STORED OPERATOR DECISION.
--
--   Not by inference, not by the target matching some other stored value, and
--   not by the redirect being observed twice. The only path from "a site
--   redirected somewhere else" to "we may fetch there" runs through a row in
--   this table, and orgunit_fetch_observations enforces that with its root XOR:
--   a fetch whose root is a promotion must name the promotion event.
--
-- WHY EVENTS RATHER THAN AN APPROVAL FLAG
--
--   An approval that can be withdrawn is a lifecycle, and a lifecycle stored as
--   a mutable flag needs UPDATE - which nwf_research does not have and must not
--   get. So a withdrawal is a NEW ROW with decision = 'REVOKE', the approval it
--   withdraws is left intact, and the CURRENT state is derived as the latest
--   applicable event. The history of who decided what, when, and why survives
--   in full, which is the only version of this that is auditable.
--
--   Every promotion names the REDIRECT OBSERVATION that motivated it. A
--   promotion with no observed evidence behind it cannot be recorded.

CREATE TABLE orgunit_root_promotion_events (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    redirect_observation_id uuid        NOT NULL
                                        REFERENCES orgunit_redirect_observations (id),
    target_url              text        NOT NULL,
    decision                text        NOT NULL,
    decided_by              text        NOT NULL,
    decided_at              timestamptz NOT NULL,
    reason                  text,
    created_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT orgunit_root_promotion_events_decision_chk
        CHECK (decision IN ('APPROVE', 'REVOKE')),
    CONSTRAINT orgunit_root_promotion_events_target_url_chk
        CHECK (target_url ~ '^https?://'),
    -- An OPERATOR LABEL, not a contact record. The pattern check is the point:
    -- this repository stores no addressable identifier for any person, and an
    -- audit field is exactly where one would first appear by accident.
    CONSTRAINT orgunit_root_promotion_events_decided_by_chk
        CHECK (decided_by <> '' AND length(decided_by) <= 64
               AND decided_by !~ '@'),
    CONSTRAINT orgunit_root_promotion_events_reason_chk
        CHECK (reason IS NULL OR length(reason) <= 1000)
);

-- IDEMPOTENCY WITHOUT LOSING HISTORY.
--
-- Re-submitting the IDENTICAL decision - same observation, same verdict, same
-- operator, same instant - is a duplicate and is collapsed. Anything else is a
-- genuinely different decision and is preserved: a REVOKE differs by verdict, a
-- later re-APPROVE differs by instant, another operator differs by label.
--
-- Deliberately NOT unique on target_url. Two different redirect observations
-- can name the same target, and each deserves its own reviewed decision;
-- deduping on the URL would let one approval silently authorise a root someone
-- never looked at.
CREATE UNIQUE INDEX orgunit_root_promotion_events_dedupe_uidx
    ON orgunit_root_promotion_events (redirect_observation_id, decision,
                                      decided_by, decided_at);

CREATE INDEX orgunit_root_promotion_events_observation_idx
    ON orgunit_root_promotion_events (redirect_observation_id, decided_at DESC);

COMMENT ON TABLE orgunit_root_promotion_events IS
    'APPEND-ONLY OPERATOR DECISIONS about promoting an observed cross-domain '
    'redirect target to a research root. A redirect target is NEVER a root by '
    'observation: the only way one becomes fetchable is a row here, and '
    'orgunit_fetch_observations enforces that through its root XOR constraint. '
    'A promotion is withdrawn by APPENDING a REVOKE, never by editing the '
    'APPROVE, so the current state is derived from the latest applicable event '
    'and the decision history is never lost. Promotion changes NOTHING about '
    'website_claims: no claim is edited, no winner is elected, and no preferred '
    'or canonical website column comes into existence.';

COMMENT ON COLUMN orgunit_root_promotion_events.decided_by IS
    'A SHORT OPERATOR LABEL identifying who made this call, for audit. It is '
    'NOT contact data and must never become any: the CHECK constraint refuses a '
    'value containing an at-sign precisely so this field cannot quietly turn '
    'into the first stored mailbox in a repository that has none.';

COMMENT ON COLUMN orgunit_root_promotion_events.target_url IS
    'The EXACT target being considered, recorded on the decision itself rather '
    'than only reached through the redirect observation. An operator approves a '
    'specific URL, and the thing they approved must be readable without '
    'depending on a join staying correct.';

-- The cycle-closing foreign key. orgunit_fetch_observations is created first
-- because redirect observations point at it and promotion events point at
-- those; only now does the target of this reference exist.
ALTER TABLE orgunit_fetch_observations
    ADD CONSTRAINT orgunit_fetch_observations_root_promotion_fk
    FOREIGN KEY (root_promotion_event_id)
    REFERENCES orgunit_root_promotion_events (id);

-- ---------------------------------------------------------------------------
-- E. orgunit_page_evidence - one successfully parsed page.
-- ---------------------------------------------------------------------------
--
-- WHAT MAY LIVE HERE: title, declared language, headings, and CAPPED extracted
-- text that a later slice will have cleaned and redacted.
--
-- WHAT MAY NEVER LIVE HERE: raw markup, a raw response body, or any column that
-- amounts to one under a different name. Storing the markup would recreate,
-- inside this database, exactly the unbounded copy of other people's websites
-- that "bounded first-party acquisition" exists to avoid - and it would put
-- unredacted contact blocks into a repository that stores no contacts.
--
-- main_text is text this repository DERIVED, not text it received.

CREATE TABLE orgunit_page_evidence (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    fetch_observation_id uuid        NOT NULL
                                     REFERENCES orgunit_fetch_observations (id),
    title                text,
    declared_lang        text,
    headings             jsonb       NOT NULL,
    main_text            text        NOT NULL,
    main_text_chars      integer     NOT NULL,
    main_text_truncated  boolean     NOT NULL DEFAULT false,
    extraction_method    text        NOT NULL,
    rule_version         text        NOT NULL,
    observed_at          timestamptz NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT orgunit_page_evidence_headings_chk
        CHECK (jsonb_typeof(headings) = 'array'),
    -- THE HARD CAP. It is a CHECK rather than a convention because the whole
    -- raw-body prohibition rests on it: without a ceiling, main_text is a
    -- response body wearing a different name.
    CONSTRAINT orgunit_page_evidence_main_text_cap_chk
        CHECK (length(main_text) <= 200000),
    CONSTRAINT orgunit_page_evidence_main_text_chars_chk
        CHECK (main_text_chars = length(main_text)),
    CONSTRAINT orgunit_page_evidence_title_chk
        CHECK (title IS NULL OR length(title) <= 1000),
    -- A BCP-47-shaped token as the document DECLARED it, or nothing.
    CONSTRAINT orgunit_page_evidence_declared_lang_chk
        CHECK (declared_lang IS NULL
               OR (length(declared_lang) <= 35 AND declared_lang ~ '^[A-Za-z0-9-]+$')),
    CONSTRAINT orgunit_page_evidence_extraction_method_chk
        CHECK (extraction_method IN
            ('MAIN_ELEMENT', 'BOILERPLATE_DIFFERENCED',
             'MAIN_ELEMENT_AND_DIFFERENCED', 'FULL_BODY')),
    CONSTRAINT orgunit_page_evidence_rule_version_chk
        CHECK (rule_version <> '' AND length(rule_version) <= 64)
);

-- ONE EXTRACTION PER FETCH PER RULE VERSION. A rule change produces a NEW row
-- beside the old one, never a rewrite, so what each version made of the same
-- bytes stays recoverable.
CREATE UNIQUE INDEX orgunit_page_evidence_dedupe_uidx
    ON orgunit_page_evidence (fetch_observation_id, rule_version);

COMMENT ON TABLE orgunit_page_evidence IS
    'ONE SUCCESSFULLY PARSED PAGE, reduced to bounded derived text. NO RAW '
    'MARKUP AND NO RESPONSE BODY IS STORED HERE OR ANYWHERE IN THIS SCHEMA - '
    'the bytes are represented only by '
    'orgunit_fetch_observations.response_sha256, and main_text is capped by a '
    'CHECK constraint so it cannot become a body under another name. This table '
    'describes a DOCUMENT. It says nothing about whether the page is relevant '
    'to anything.';

COMMENT ON COLUMN orgunit_page_evidence.main_text IS
    'BOUNDED, EXTRACTED, CLEANED text derived from the page - never the markup, '
    'and never the response body. Hard-capped at 200,000 characters by a CHECK '
    'constraint. A later slice performs the extraction and its redaction; the '
    'cap exists from the first migration so no implementation can quietly opt '
    'out of it.';

COMMENT ON COLUMN orgunit_page_evidence.extraction_method IS
    'Which bounded extraction produced main_text. MAIN_ELEMENT_AND_DIFFERENCED '
    'exists because the two techniques MEASURABLY COMPOSE - median retained '
    'fraction of naive page text was 0.570 for the main element alone, 0.509 '
    'for cross-page boilerplate differencing alone, and 0.436 for both - and '
    'because neither dominates on every site, so the method actually used is '
    'recorded per page rather than assumed.';

COMMENT ON COLUMN orgunit_page_evidence.declared_lang IS
    'The language the DOCUMENT declared, as published. It is a property of the '
    'page and NOTHING ELSE. It is not a target language, not a learner '
    'language, not a partner-country signal and not an input to any such '
    'inference: those are separate future dimensions and this repository does '
    'not conflate them. NULL when the document declared nothing - never guessed '
    'from the text, the domain or the country.';

-- ---------------------------------------------------------------------------
-- F. orgunit_page_candidates - a deterministic RANK, not a relevance fact.
-- ---------------------------------------------------------------------------
--
-- WHAT A ROW HERE MEANS, EXACTLY:
--
--   "Under rule version R, on track T, this page ranked at position N among the
--    pages reached from this root."
--
-- WHAT IT DOES NOT MEAN:
--
--   "This page is an international office." "This organisation is relevant."
--   "This unit is confirmed." A deterministic lexical rule CANNOT make those
--   statements, and the measured reason is concrete: "MSc International
--   Marketing", "MBA International Business Law" and "International Office" all
--   carry the same token in the path. Separating a UNIT from a DEGREE PROGRAMME
--   is the precision ceiling of any lexical rule, and it is the entire
--   justification for Phase 2B-2 being a separate, separately approved phase.
--
-- THERE IS NO MUTABLE STATUS COLUMN, AND THAT IS DELIBERATE.
--
--   No status, no relevant, no confirmed, no verified, no preferred, no
--   classification status. A newer run or rule version supersedes an older
--   candidate ANALYTICALLY - by being newer - and the older row is never
--   edited. When Phase 2B-2 is approved it will APPEND classifier rows that
--   reference these candidates; it will not reach back and stamp them.
--
-- FRONTIER SCORE AND CANDIDATE SCORE ARE DIFFERENT THINGS.
--
--   A frontier score ranks a URL BEFORE it is fetched, and URL-tree
--   inheritance may legitimately raise it. A candidate score ranks a PAGE
--   AFTER it has been read. Letting inheritance flow into candidate_score would
--   turn "this URL was worth trying" into "this page is a find", which is a
--   different claim entirely. No frontier_score column exists in this
--   migration - the frontier is transient working state, not evidence - and the
--   separation must survive whatever slice makes it durable.

CREATE TABLE orgunit_page_candidates (
    id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    page_evidence_id        uuid         NOT NULL REFERENCES orgunit_page_evidence (id),
    run_id                  uuid         NOT NULL REFERENCES orgunit_research_runs (id),

    eche_row_key            text         NOT NULL,
    organisation_id         uuid         REFERENCES organisations (id),

    root_website_claim_id   uuid         REFERENCES website_claims (id),
    root_promotion_event_id uuid         REFERENCES orgunit_root_promotion_events (id),

    track                   text         NOT NULL,
    type_hint               text,
    candidate_score         numeric(8,4) NOT NULL,
    signals                 jsonb        NOT NULL,
    url_tree_parent         text,
    rank_within_root        integer      NOT NULL,
    rule_version            text         NOT NULL,
    created_at              timestamptz  NOT NULL DEFAULT now(),

    -- The same root XOR the fetch observations carry. A ranked candidate must
    -- be traceable to the exact root authority that permitted reaching it.
    CONSTRAINT orgunit_page_candidates_root_xor_chk
        CHECK ((root_website_claim_id IS NOT NULL)::int
               + (root_promotion_event_id IS NOT NULL)::int = 1),

    CONSTRAINT orgunit_page_candidates_eche_row_key_chk
        CHECK (eche_row_key <> ''),
    -- Which deterministic ranking family produced this row. Country-blind by
    -- construction: these name kinds of organisational unit, never a country,
    -- a language or a market.
    CONSTRAINT orgunit_page_candidates_track_chk
        CHECK (track IN
            ('INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE', 'STUDENT_ASSOCIATION')),
    -- A NON-BINDING hint, and DEGREE_PROGRAMME is in the list on purpose: the
    -- deterministic layer routinely cannot tell one from a unit, and a taxonomy
    -- that pretended otherwise would be the lie this table exists to avoid.
    CONSTRAINT orgunit_page_candidates_type_hint_chk
        CHECK (type_hint IS NULL OR type_hint IN
            ('INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE', 'STUDENT_ASSOCIATION',
             'DEGREE_PROGRAMME', 'UNCLEAR')),
    CONSTRAINT orgunit_page_candidates_score_chk
        CHECK (candidate_score >= 0),
    CONSTRAINT orgunit_page_candidates_signals_chk
        CHECK (jsonb_typeof(signals) = 'array'),
    CONSTRAINT orgunit_page_candidates_rank_chk
        CHECK (rank_within_root >= 1),
    CONSTRAINT orgunit_page_candidates_rule_version_chk
        CHECK (rule_version <> '' AND length(rule_version) <= 64)
);

-- ONE RESULT PER PAGE PER RULE VERSION PER TRACK. A rule change appends; it
-- never rewrites.
CREATE UNIQUE INDEX orgunit_page_candidates_dedupe_uidx
    ON orgunit_page_candidates (page_evidence_id, rule_version, track);

-- A RANK IS A POSITION, so it must be unique within the thing it ranks.
-- Without this, "rank 1" could be claimed twice and the ordering would be
-- decorative. NULLS NOT DISTINCT again, for the XOR root columns.
CREATE UNIQUE INDEX orgunit_page_candidates_rank_uidx
    ON orgunit_page_candidates (run_id, root_website_claim_id,
                                root_promotion_event_id, track, rule_version,
                                rank_within_root)
    NULLS NOT DISTINCT;

CREATE INDEX orgunit_page_candidates_eche_row_key_idx
    ON orgunit_page_candidates (eche_row_key);
CREATE INDEX orgunit_page_candidates_run_idx ON orgunit_page_candidates (run_id);
CREATE INDEX orgunit_page_candidates_organisation_idx
    ON orgunit_page_candidates (organisation_id) WHERE organisation_id IS NOT NULL;

COMMENT ON TABLE orgunit_page_candidates IS
    'A DETERMINISTIC RANK over page evidence: "under this rule version, on this '
    'track, this page ranked here among the pages reached from this root". IT '
    'IS NOT A RELEVANCE FACT. There is no status column, and no relevant, '
    'confirmed, verified, preferred or classification column, in this table - '
    'and there must never be one: those are conclusions, and the deterministic '
    'layer is not entitled to them. Phase 2B-2 will APPEND classifier rows '
    'referencing these candidates rather than stamping them.';

COMMENT ON COLUMN orgunit_page_candidates.candidate_score IS
    'The deterministic score of a page that has been READ. Deliberately NOT a '
    'frontier score: a frontier score ranks a URL before it is fetched and may '
    'inherit from its URL tree, and letting that inheritance reach this column '
    'would silently convert "worth trying" into "worth reporting". No '
    'frontier score column exists in this schema, and if one is ever added it '
    'belongs on the frontier, not here.';

COMMENT ON COLUMN orgunit_page_candidates.type_hint IS
    'A NON-BINDING deterministic hint at what the page might be. It is NOT a '
    'classification and carries no verdict. DEGREE_PROGRAMME and UNCLEAR are '
    'first-class values because the honest output of a lexical rule is often '
    'exactly one of those - "MSc International Marketing" and "International '
    'Office" are lexically indistinguishable - and forcing a unit type would '
    'manufacture confidence the evidence does not support.';

COMMENT ON COLUMN orgunit_page_candidates.signals IS
    'JSON ARRAY of the DETERMINISTIC signals that fired, as evidence of why '
    'this page ranked where it did. A structured evidence collection is the one '
    'thing JSONB is right for here; every piece of state the schema must '
    'constrain - track, hint, score, rank, versions - is a typed column with a '
    'CHECK instead.';

COMMENT ON COLUMN orgunit_page_candidates.url_tree_parent IS
    'The nearest ancestor URL in the path tree, kept so URL-tree structure is '
    'inspectable. Recording an ancestor is NOT an assertion that descendants '
    'inherit its standing: inheritance may inform a future frontier score, and '
    'must never be read as making a descendant a candidate.';

-- ---------------------------------------------------------------------------
-- nwf_research: the Phase 2B execution role.
-- ---------------------------------------------------------------------------
--
-- WHY A SEPARATE ROLE AT ALL
--
--   Because the trust boundary is the point of this slice. Research reads
--   OFFICIAL SOURCE EVIDENCE and writes RESEARCH EVIDENCE, and it must be
--   structurally incapable of doing anything to the first. Reusing nwf_ingest
--   would have handed web research an UPDATE grant on organisations and on
--   ingest_runs - which is exactly the capability that must not exist here.
--
--   The privilege list below is deliberately shorter than nwf_ingest's:
--
--     website_claims, organisations : SELECT              (research roots)
--     orgunit_*                     : SELECT, INSERT      (its own evidence)
--     everything else               : nothing
--
--   No UPDATE anywhere. No DELETE anywhere. No TRUNCATE anywhere. No TEMPORARY
--   on the database - migration 0006 removed the inherited PUBLIC grant, and
--   this migration never issues a new one.
--
--   Password is a deterministic LOCAL-DEVELOPMENT-ONLY value, matching the
--   convention 0002 established. It is not a secret and is not reused anywhere.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nwf_research') THEN
        CREATE ROLE nwf_research LOGIN PASSWORD 'local_dev_only';
    END IF;
END
$$;

-- Start from nothing, exactly as 0002 does. Never grant schema-wide ALL.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nwf_research;

-- CONNECT is granted on whichever database this migration is applied to, for
-- the same reason 0002 resolves the name at run time: the same chain is applied
-- to the working database and to the separate integration-test database, and a
-- literal name would grant on the wrong one.
DO $$
DECLARE
    db text := current_database();
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO nwf_research', db);
END
$$;

GRANT USAGE ON SCHEMA public TO nwf_research;

-- READ side: exactly what is needed to obtain research roots and to attach the
-- nullable convenience link. website_claims supplies the official website
-- claims a run may descend from; organisations supplies the id for a known
-- eche_row_key. Nothing else is readable, and nothing at all is writable.
GRANT SELECT ON website_claims TO nwf_research;
GRANT SELECT ON organisations  TO nwf_research;

-- WRITE side: append-only, on its own tables only.
GRANT SELECT, INSERT ON orgunit_research_runs             TO nwf_research;
GRANT SELECT, INSERT ON orgunit_research_run_completions  TO nwf_research;
GRANT SELECT, INSERT ON orgunit_fetch_observations        TO nwf_research;
GRANT SELECT, INSERT ON orgunit_redirect_observations     TO nwf_research;
GRANT SELECT, INSERT ON orgunit_root_promotion_events     TO nwf_research;
GRANT SELECT, INSERT ON orgunit_page_evidence             TO nwf_research;
GRANT SELECT, INSERT ON orgunit_page_candidates           TO nwf_research;

-- The audit role can inspect Phase 2B evidence, exactly as it can inspect every
-- other evidence table in this schema (0002, 0003, 0005). It remains unable to
-- write anything.
GRANT SELECT ON orgunit_research_runs, orgunit_research_run_completions,
                orgunit_fetch_observations, orgunit_redirect_observations,
                orgunit_root_promotion_events, orgunit_page_evidence,
                orgunit_page_candidates
    TO nwf_readonly;

-- Defensive: make the append-only intent explicit for any future role too.
REVOKE UPDATE, DELETE ON orgunit_research_runs            FROM PUBLIC;
REVOKE UPDATE, DELETE ON orgunit_research_run_completions FROM PUBLIC;
REVOKE UPDATE, DELETE ON orgunit_fetch_observations       FROM PUBLIC;
REVOKE UPDATE, DELETE ON orgunit_redirect_observations    FROM PUBLIC;
REVOKE UPDATE, DELETE ON orgunit_root_promotion_events    FROM PUBLIC;
REVOKE UPDATE, DELETE ON orgunit_page_evidence            FROM PUBLIC;
REVOKE UPDATE, DELETE ON orgunit_page_candidates          FROM PUBLIC;
