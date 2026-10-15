-- 0013_discovery_subject_identity.sql
-- Track B, B2.1: FIRST-CLASS DISCOVERY-SUBJECT IDENTITY - schema, provenance
-- and review boundaries only. Reasoned about in
-- docs/adr/0019-first-class-discovery-subject-identity.md.
--
-- WHY THIS EXISTS
--
--   Every organisation this repository can name today is an ECHE source row.
--   `organisations` is, by its own COMMENT, "a provisional organisation record
--   derived from an ECHE source row", anchored on eche_row_key (Erasmus code +
--   PIC). A faculty club, an ESN section, a buddy programme, a language
--   community or a university language centre has no ECHE row, no Erasmus code
--   and usually no PIC, so it cannot be stored there without inventing exactly
--   the identifiers rule 2 forbids. Forcing it in would also make every such
--   group a child of some institution, which is false for an independent
--   association and unknown for most of the rest.
--
--   So a discovery subject is a SEPARATE identity anchor. It does not extend,
--   alter or duplicate `organisations`, and nothing here writes to it.
--
-- WHAT A ROW MEANS, TABLE BY TABLE
--
--   discovery_subjects
--     "A trusted path registered THIS opaque identity as a candidate subject,
--      with THIS working kind label." Not: "this organisation exists", "this
--      is its kind", "it is independent", or "it may be researched".
--
--   discovery_subject_identity_claims
--     "THIS SOURCE, observed at THIS time, supports THIS name / kind / public
--      website / typed external identifier for the subject." A claim, never a
--      conclusion - the same discipline as website_claims (migration 0005).
--
--   discovery_subject_relationship_claims
--     "THIS SOURCE supports THIS directed relationship from the subject to
--      another subject or to an ECHE source row." Many per subject; there is
--      deliberately no parent_id anywhere.
--
--   discovery_subject_reviews
--     "THIS trusted path reviewed THIS subject or THIS claim and recorded THIS
--      outcome." Append-only, superseded rather than edited.
--
--   The reviewed state of anything is DERIVED from the head of its review
--   chain at read time. There is no status, verified, confirmed, eligible or
--   preferred column, for the reason migration 0005 gives: a stored verdict on
--   an append-only table cannot be corrected, and two sources may legitimately
--   disagree.
--
-- WHAT IS DELIBERATELY ABSENT
--
--   - No contact column of any kind, no person column, no free-form jsonb.
--     Every text column is length-capped and refuses mailbox- and
--     telephone-shaped text at the database (discovery_identity_text_admissible).
--   - No research-eligibility, qualification, scoring, opportunity or outreach
--     column. A subject is not a research root: nwf_research cannot even read
--     these tables, and no research code path references them.
--   - No merge, no canonical-entity table, no name-based uniqueness. Two
--     subjects with the same name stay two subjects; a shared typed external
--     identifier is indexed for REVIEW, never unique-constrained.
--   - No social-platform or messaging URL (as a website claim or as a source),
--     because a profile there may be a personal account. Admitting one is a
--     separate OWNER decision.
--
-- WRITERS
--
--   NO runtime role may write any of these tables. Registration, claims and
--   reviews travel the trusted OWNER path - the credential that applies
--   migrations - exactly as root promotions do (migration 0007), until a
--   separately authorised B2.2 writer exists. Because grants cannot constrain
--   the owner, append-only is ALSO enforced by a trigger that refuses UPDATE
--   and DELETE for every role (see the end of this file).

-- ---------------------------------------------------------------------------
-- Pure admissibility predicates, shared by every CHECK below.
-- ---------------------------------------------------------------------------
--
-- Mirrored exactly by src/orgunits/identity/admissibility.ts; the integration
-- test asserts the two agree on the same inputs.

-- A public URL this schema may hold: http(s), a lower-case DNS host with an
-- alphabetic (or IDNA) top-level label, no userinfo, no port, no query, no
-- fragment, no "@" anywhere (raw or %40), no whitespace, at most 2048 chars,
-- and not a social-platform or messaging host.
CREATE FUNCTION discovery_identity_url_admissible(candidate text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT length(candidate) <= 2048
       AND candidate ~ '^https?://[a-z0-9.-]+(/[^[:space:]?#@]*)?$'
       AND candidate !~* '%40'
       AND substring(candidate from '^https?://([^/]+)')
           ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$'
       AND substring(candidate from '^https?://([^/]+)')
           !~ '(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|messenger\.com|linkedin\.com|lnkd\.in|twitter\.com|x\.com|t\.co|tiktok\.com|snapchat\.com|whatsapp\.com|wa\.me|t\.me|telegram\.me|telegram\.org|discord\.com|discord\.gg|youtube\.com|youtu\.be|linktr\.ee|threads\.net|bsky\.app|vk\.com)$'
$$;

-- Free text this schema may hold: no control characters, no "@" (mailbox
-- shape), and no run of nine or more digits joined only by space . ( ) + / -
-- (telephone shape). Ordinary years and ranges ("2021-2027") pass.
CREATE FUNCTION discovery_identity_text_admissible(candidate text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT candidate !~ '[[:cntrl:]]'
       AND candidate !~ '@'
       AND candidate !~ '[0-9]([ .()+/-]{0,2}[0-9]){8}'
$$;

-- ---------------------------------------------------------------------------
-- A. discovery_subjects - one opaque candidate identity.
-- ---------------------------------------------------------------------------

CREATE TABLE discovery_subjects (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    registered_kind         text        NOT NULL,
    registered_by_actor_key text        NOT NULL,
    registration_note       text,
    created_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT discovery_subjects_registered_kind_chk
        CHECK (registered_kind IN (
            'FACULTY_SCHOOL_DEPARTMENT', 'INTERNAL_STUDENT_GROUP',
            'INDEPENDENT_STUDENT_ASSOCIATION', 'NETWORK_LOCAL_CHAPTER',
            'ORGANISATION_NETWORK', 'INDEPENDENT_COMMUNITY',
            'OTHER_ORGANISATIONAL_UNIT', 'UNCERTAIN')),
    CONSTRAINT discovery_subjects_actor_key_chk
        CHECK (registered_by_actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
    CONSTRAINT discovery_subjects_registration_note_chk
        CHECK (registration_note IS NULL
               OR (length(registration_note) BETWEEN 1 AND 500
                   AND discovery_identity_text_admissible(registration_note)))
);

COMMENT ON TABLE discovery_subjects IS
    'ONE OPAQUE CANDIDATE IDENTITY registered by a trusted path - a faculty, '
    'a student group, an association, a network chapter, a network, a '
    'community or another organisational unit. It is NOT an ECHE organisation '
    'and has no mandatory parent. A row asserts only that the identity was '
    'registered; it is not evidence that the organisation exists, it does not '
    'settle its kind, and it grants no research eligibility and no commercial '
    'qualification. Names, kinds, websites and identifiers are CLAIMS in '
    'discovery_subject_identity_claims; reviewed identity is DERIVED from '
    'discovery_subject_reviews. Append-only (trigger-enforced).';

COMMENT ON COLUMN discovery_subjects.registered_kind IS
    'The registering path''s WORKING LABEL at registration time, UNCERTAIN '
    'allowed. Not a verified classification and not a legal form: '
    'INDEPENDENT_STUDENT_ASSOCIATION does not assert legal personality. A '
    'reviewed kind exists only where a CONFIRMED review heads an ENTITY_KIND '
    'claim; this column never becomes one.';

COMMENT ON COLUMN discovery_subjects.registered_by_actor_key IS
    'AN OPAQUE KEY NAMING THE TRUSTED PATH that registered the subject, with '
    'exactly the semantics and prohibitions of orgunit_root_promotions.'
    'actor_key: never a person''s name, handle or mailbox.';

-- ---------------------------------------------------------------------------
-- B. discovery_subject_identity_claims - source-backed identity claims.
-- ---------------------------------------------------------------------------
--
-- PROVENANCE IS MANDATORY AND EXTERNAL. Every claim cites exactly one source:
-- an orgunit_page_evidence row, a website_claims row, or a public URL. The
-- actor that RECORDED the claim is a separate column - a human typing a value
-- is not a source, and an owner-entered row is not evidence that the
-- organisation exists.

CREATE TABLE discovery_subject_identity_claims (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id              uuid        NOT NULL REFERENCES discovery_subjects (id),
    claim_kind              text        NOT NULL,

    -- Payload: exactly the columns the claim kind names (see payload_chk).
    name_text               text,
    name_language           text,
    claimed_kind            text,
    website_url             text,
    identifier_scheme       text,
    identifier_value        text,

    -- Provenance.
    source_type             text        NOT NULL,
    source_page_evidence_id uuid        REFERENCES orgunit_page_evidence (id),
    source_website_claim_id uuid        REFERENCES website_claims (id),
    source_url              text,
    source_version_ref      text,
    observed_at             timestamptz NOT NULL,
    claim_basis             text        NOT NULL,
    recorded_by_actor_key   text        NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),

    provenance_key          text        NOT NULL GENERATED ALWAYS AS (
        CASE source_type
            WHEN 'PAGE_EVIDENCE' THEN 'page_evidence:' || source_page_evidence_id::text
            WHEN 'WEBSITE_CLAIM' THEN 'website_claim:' || source_website_claim_id::text
            ELSE 'url:' || source_url || '|v=' || coalesce(source_version_ref, '')
        END) STORED,
    value_key               text        NOT NULL GENERATED ALWAYS AS (
        CASE claim_kind
            WHEN 'ENTITY_KIND'         THEN 'kind:' || claimed_kind
            WHEN 'PUBLIC_WEBSITE'      THEN 'url:' || website_url
            WHEN 'EXTERNAL_IDENTIFIER' THEN 'id:' || identifier_scheme || ':' || identifier_value
            ELSE 'name:' || coalesce(name_language, '') || ':' || name_text
        END) STORED,

    CONSTRAINT discovery_subject_identity_claims_kind_chk
        CHECK (claim_kind IN ('NAME', 'ALTERNATE_NAME', 'NATIVE_NAME', 'ENTITY_KIND',
                              'PUBLIC_WEBSITE', 'EXTERNAL_IDENTIFIER')),
    CONSTRAINT discovery_subject_identity_claims_payload_chk
        CHECK (CASE claim_kind
            WHEN 'ENTITY_KIND' THEN
                claimed_kind IS NOT NULL
                AND num_nonnulls(name_text, name_language, website_url,
                                 identifier_scheme, identifier_value) = 0
            WHEN 'PUBLIC_WEBSITE' THEN
                website_url IS NOT NULL
                AND num_nonnulls(name_text, name_language, claimed_kind,
                                 identifier_scheme, identifier_value) = 0
            WHEN 'EXTERNAL_IDENTIFIER' THEN
                identifier_scheme IS NOT NULL AND identifier_value IS NOT NULL
                AND num_nonnulls(name_text, name_language, claimed_kind, website_url) = 0
            WHEN 'NATIVE_NAME' THEN
                name_text IS NOT NULL AND name_language IS NOT NULL
                AND num_nonnulls(claimed_kind, website_url,
                                 identifier_scheme, identifier_value) = 0
            ELSE
                name_text IS NOT NULL
                AND num_nonnulls(claimed_kind, website_url,
                                 identifier_scheme, identifier_value) = 0
        END),
    CONSTRAINT discovery_subject_identity_claims_name_text_chk
        CHECK (name_text IS NULL
               OR (length(name_text) BETWEEN 1 AND 300
                   AND name_text = btrim(name_text)
                   AND discovery_identity_text_admissible(name_text))),
    CONSTRAINT discovery_subject_identity_claims_name_language_chk
        CHECK (name_language IS NULL
               OR name_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
    CONSTRAINT discovery_subject_identity_claims_claimed_kind_chk
        CHECK (claimed_kind IS NULL OR claimed_kind IN (
            'FACULTY_SCHOOL_DEPARTMENT', 'INTERNAL_STUDENT_GROUP',
            'INDEPENDENT_STUDENT_ASSOCIATION', 'NETWORK_LOCAL_CHAPTER',
            'ORGANISATION_NETWORK', 'INDEPENDENT_COMMUNITY',
            'OTHER_ORGANISATIONAL_UNIT', 'UNCERTAIN')),
    CONSTRAINT discovery_subject_identity_claims_website_url_chk
        CHECK (website_url IS NULL OR discovery_identity_url_admissible(website_url)),
    -- SHAPE ONLY. A well-formed value is not a valid registration.
    CONSTRAINT discovery_subject_identity_claims_identifier_chk
        CHECK (identifier_scheme IS NULL
               OR (identifier_scheme = 'EU_PIC' AND identifier_value ~ '^[0-9]{9}$')
               OR (identifier_scheme = 'FR_RNA' AND identifier_value ~ '^W[0-9A-Z]{9}$')
               OR (identifier_scheme = 'NL_KVK' AND identifier_value ~ '^[0-9]{8}$')),
    CONSTRAINT discovery_subject_identity_claims_source_chk
        CHECK ((source_type = 'PAGE_EVIDENCE'
                AND source_page_evidence_id IS NOT NULL
                AND source_website_claim_id IS NULL AND source_url IS NULL)
            OR (source_type = 'WEBSITE_CLAIM'
                AND source_website_claim_id IS NOT NULL
                AND source_page_evidence_id IS NULL AND source_url IS NULL)
            OR (source_type = 'PUBLIC_URL'
                AND source_url IS NOT NULL
                AND source_page_evidence_id IS NULL AND source_website_claim_id IS NULL)),
    CONSTRAINT discovery_subject_identity_claims_source_url_chk
        CHECK (source_url IS NULL OR discovery_identity_url_admissible(source_url)),
    CONSTRAINT discovery_subject_identity_claims_source_version_chk
        CHECK (source_version_ref IS NULL OR source_version_ref ~ '^[0-9a-f]{64}$'),
    CONSTRAINT discovery_subject_identity_claims_basis_chk
        CHECK (claim_basis IN ('SOURCE_STATED', 'INFERRED')),
    CONSTRAINT discovery_subject_identity_claims_actor_key_chk
        CHECK (recorded_by_actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

-- THE SAME SOURCE MAY NOT SAY THE SAME THING TWICE. A second source saying it
-- is corroboration and is kept; a repeat of the same source is a duplicate.
CREATE UNIQUE INDEX discovery_subject_identity_claims_dedupe_uidx
    ON discovery_subject_identity_claims (subject_id, claim_kind, value_key, provenance_key);

CREATE INDEX discovery_subject_identity_claims_subject_idx
    ON discovery_subject_identity_claims (subject_id);

-- FOR REVIEW, NEVER FOR MERGING. Deliberately NOT unique: two subjects citing
-- the same identifier is a duplicate-candidate signal for a human, and a
-- unique index would force the writer to pick a winner silently.
CREATE INDEX discovery_subject_identity_claims_identifier_idx
    ON discovery_subject_identity_claims (identifier_scheme, identifier_value)
    WHERE identifier_scheme IS NOT NULL;

COMMENT ON TABLE discovery_subject_identity_claims IS
    'ONE SOURCE''S CLAIM about ONE subject''s name, alternate or native name, '
    'kind, public website or typed external identifier. A claim, never a '
    'conclusion: two sources may disagree, and both rows stay. Provenance is '
    'mandatory and external (page evidence, a website claim or a public URL); '
    'recorded_by_actor_key is who RECORDED it, never its source. Whether a '
    'claim was reviewed is DERIVED from discovery_subject_reviews. No name is '
    'an identity key. Append-only (trigger-enforced).';

COMMENT ON COLUMN discovery_subject_identity_claims.claim_basis IS
    'SOURCE_STATED: the source says this explicitly. INFERRED: a reader '
    'concluded it from the source without the source saying it. Neither is a '
    'review; a human confirmation is a discovery_subject_reviews row.';

COMMENT ON COLUMN discovery_subject_identity_claims.identifier_value IS
    'A typed external identifier as the source published it, checked for '
    'SHAPE only (EU_PIC 9 digits, FR_RNA W+9, NL_KVK 8 digits). A well-formed '
    'value is not a valid registration, and a shared value across subjects is '
    'a review signal, never a merge.';

-- ---------------------------------------------------------------------------
-- C. discovery_subject_relationship_claims - many directed relationships.
-- ---------------------------------------------------------------------------
--
-- A target is EITHER another subject OR an ECHE source row, referenced by
-- eche_row_key with a real foreign key into organisations - so a relationship
-- to an institution the working database does not hold cannot be recorded,
-- and nothing has to fabricate an ECHE row to satisfy the constraint.

CREATE TABLE discovery_subject_relationship_claims (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id              uuid        NOT NULL REFERENCES discovery_subjects (id),
    predicate               text        NOT NULL,
    target_subject_id       uuid        REFERENCES discovery_subjects (id),
    target_eche_row_key     text        REFERENCES organisations (eche_row_key),

    source_type             text        NOT NULL,
    source_page_evidence_id uuid        REFERENCES orgunit_page_evidence (id),
    source_website_claim_id uuid        REFERENCES website_claims (id),
    source_url              text,
    source_version_ref      text,
    observed_at             timestamptz NOT NULL,
    claim_basis             text        NOT NULL,
    recorded_by_actor_key   text        NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),

    target_key              text        NOT NULL GENERATED ALWAYS AS (
        CASE WHEN target_subject_id IS NOT NULL
             THEN 'subject:' || target_subject_id::text
             ELSE 'eche:' || target_eche_row_key
        END) STORED,
    provenance_key          text        NOT NULL GENERATED ALWAYS AS (
        CASE source_type
            WHEN 'PAGE_EVIDENCE' THEN 'page_evidence:' || source_page_evidence_id::text
            WHEN 'WEBSITE_CLAIM' THEN 'website_claim:' || source_website_claim_id::text
            ELSE 'url:' || source_url || '|v=' || coalesce(source_version_ref, '')
        END) STORED,

    CONSTRAINT discovery_subject_relationship_claims_predicate_chk
        CHECK (predicate IN ('PART_OF', 'AFFILIATED_WITH', 'LOCAL_CHAPTER_OF',
                             'OPERATES_AT', 'HOSTED_BY', 'SERVES_AUDIENCE_AT')),
    CONSTRAINT discovery_subject_relationship_claims_one_target_chk
        CHECK (num_nonnulls(target_subject_id, target_eche_row_key) = 1),
    CONSTRAINT discovery_subject_relationship_claims_not_self_chk
        CHECK (target_subject_id IS NULL OR target_subject_id <> subject_id),
    -- A local chapter is a chapter of a NETWORK, which is never an ECHE row.
    CONSTRAINT discovery_subject_relationship_claims_chapter_target_chk
        CHECK (predicate <> 'LOCAL_CHAPTER_OF' OR target_subject_id IS NOT NULL),
    CONSTRAINT discovery_subject_relationship_claims_source_chk
        CHECK ((source_type = 'PAGE_EVIDENCE'
                AND source_page_evidence_id IS NOT NULL
                AND source_website_claim_id IS NULL AND source_url IS NULL)
            OR (source_type = 'WEBSITE_CLAIM'
                AND source_website_claim_id IS NOT NULL
                AND source_page_evidence_id IS NULL AND source_url IS NULL)
            OR (source_type = 'PUBLIC_URL'
                AND source_url IS NOT NULL
                AND source_page_evidence_id IS NULL AND source_website_claim_id IS NULL)),
    CONSTRAINT discovery_subject_relationship_claims_source_url_chk
        CHECK (source_url IS NULL OR discovery_identity_url_admissible(source_url)),
    CONSTRAINT discovery_subject_relationship_claims_source_version_chk
        CHECK (source_version_ref IS NULL OR source_version_ref ~ '^[0-9a-f]{64}$'),
    CONSTRAINT discovery_subject_relationship_claims_basis_chk
        CHECK (claim_basis IN ('SOURCE_STATED', 'INFERRED')),
    CONSTRAINT discovery_subject_relationship_claims_actor_key_chk
        CHECK (recorded_by_actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$')
);

CREATE UNIQUE INDEX discovery_subject_relationship_claims_dedupe_uidx
    ON discovery_subject_relationship_claims (subject_id, predicate, target_key, provenance_key);

CREATE INDEX discovery_subject_relationship_claims_subject_idx
    ON discovery_subject_relationship_claims (subject_id);
CREATE INDEX discovery_subject_relationship_claims_target_subject_idx
    ON discovery_subject_relationship_claims (target_subject_id)
    WHERE target_subject_id IS NOT NULL;
CREATE INDEX discovery_subject_relationship_claims_target_eche_idx
    ON discovery_subject_relationship_claims (target_eche_row_key)
    WHERE target_eche_row_key IS NOT NULL;

COMMENT ON TABLE discovery_subject_relationship_claims IS
    'ONE SOURCE''S CLAIM that a subject stands in ONE directed relationship to '
    'another subject or to an ECHE source row. Many per subject - a chapter '
    'of a network may also be affiliated with two universities and operate '
    'at a third - so there is no parent_id anywhere. A row is an assertion, '
    'NOT a true relationship: its reviewed state is DERIVED from '
    'discovery_subject_reviews. Only PART_OF is structural. Cycles are not '
    'refused here (two sources may contradict each other); a CONFIRMED cycle '
    'is refused by the pure validator. Append-only (trigger-enforced).';

COMMENT ON COLUMN discovery_subject_relationship_claims.target_eche_row_key IS
    'An ECHE SOURCE ROW, by its idempotency key, with a real foreign key into '
    'organisations. A relationship to it says nothing about entity resolution '
    'and never makes the subject an ECHE organisation or a member of any '
    'evaluation cohort.';

-- ---------------------------------------------------------------------------
-- D. discovery_subject_reviews - append-only review decisions.
-- ---------------------------------------------------------------------------
--
-- ONE LINEAR CHAIN PER REVIEWED THING. The first review of a target has no
-- supersedes_review_id; each later review supersedes exactly the previous
-- head of the SAME target. Two indexes make the chain linear: at most one
-- chain root per target, and at most one successor per review. The composite
-- foreign key makes it impossible to supersede a review of a different target.
-- The current state is the head of the chain, DERIVED at read time;
-- WITHDRAWN at the head means "not reviewed".

CREATE TABLE discovery_subject_reviews (
    id                             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    reviewed_subject_id            uuid        REFERENCES discovery_subjects (id),
    reviewed_identity_claim_id     uuid        REFERENCES discovery_subject_identity_claims (id),
    reviewed_relationship_claim_id uuid        REFERENCES discovery_subject_relationship_claims (id),
    review_outcome                 text        NOT NULL,
    supersedes_review_id           uuid,
    actor_key                      text        NOT NULL,
    reviewed_at                    timestamptz NOT NULL,
    reason                         text,
    created_at                     timestamptz NOT NULL DEFAULT now(),

    review_target_key              text        NOT NULL GENERATED ALWAYS AS (
        CASE
            WHEN reviewed_subject_id IS NOT NULL
                THEN 'subject:' || reviewed_subject_id::text
            WHEN reviewed_identity_claim_id IS NOT NULL
                THEN 'identity_claim:' || reviewed_identity_claim_id::text
            ELSE 'relationship_claim:' || reviewed_relationship_claim_id::text
        END) STORED,

    CONSTRAINT discovery_subject_reviews_one_target_chk
        CHECK (num_nonnulls(reviewed_subject_id, reviewed_identity_claim_id,
                            reviewed_relationship_claim_id) = 1),
    CONSTRAINT discovery_subject_reviews_outcome_chk
        CHECK (review_outcome IN ('CONFIRMED', 'DISPUTED', 'REJECTED', 'WITHDRAWN')),
    -- Withdrawal only ever withdraws an earlier review.
    CONSTRAINT discovery_subject_reviews_withdrawn_supersedes_chk
        CHECK (review_outcome <> 'WITHDRAWN' OR supersedes_review_id IS NOT NULL),
    CONSTRAINT discovery_subject_reviews_not_self_chk
        CHECK (supersedes_review_id IS NULL OR supersedes_review_id <> id),
    CONSTRAINT discovery_subject_reviews_actor_key_chk
        CHECK (actor_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
    CONSTRAINT discovery_subject_reviews_reason_chk
        CHECK (reason IS NULL
               OR (length(reason) BETWEEN 1 AND 1000
                   AND discovery_identity_text_admissible(reason)))
);

CREATE UNIQUE INDEX discovery_subject_reviews_id_target_uidx
    ON discovery_subject_reviews (id, review_target_key);

ALTER TABLE discovery_subject_reviews
    ADD CONSTRAINT discovery_subject_reviews_supersedes_same_target_fk
    FOREIGN KEY (supersedes_review_id, review_target_key)
    REFERENCES discovery_subject_reviews (id, review_target_key);

-- At most one successor per review ...
CREATE UNIQUE INDEX discovery_subject_reviews_supersedes_uidx
    ON discovery_subject_reviews (supersedes_review_id)
    WHERE supersedes_review_id IS NOT NULL;

-- ... and at most one chain root per reviewed target.
CREATE UNIQUE INDEX discovery_subject_reviews_chain_root_uidx
    ON discovery_subject_reviews (review_target_key)
    WHERE supersedes_review_id IS NULL;

CREATE INDEX discovery_subject_reviews_target_idx
    ON discovery_subject_reviews (review_target_key);

COMMENT ON TABLE discovery_subject_reviews IS
    'APPEND-ONLY REVIEW DECISIONS about one subject''s identity or one claim. '
    'The decision actor (actor_key) is distinct from the source of the claim '
    'reviewed. A correction or retraction is a NEW row superseding the '
    'previous head of the same target; nothing is edited. The current reviewed '
    'state is DERIVED from the head of the chain. CONFIRMED on a subject means '
    'a trusted path accepted it as a distinct organisational identity - it is '
    'NOT research authority, NOT commercial qualification and NOT outreach '
    'permission, none of which exists in this schema.';

COMMENT ON COLUMN discovery_subject_reviews.actor_key IS
    'AN OPAQUE KEY NAMING THE TRUSTED PATH THAT DECIDED, with exactly the '
    'semantics and prohibitions of orgunit_root_promotions.actor_key.';

-- ---------------------------------------------------------------------------
-- E. Append-only, for every role including the owner.
-- ---------------------------------------------------------------------------
--
-- Grants already deny UPDATE and DELETE to every runtime role (none is
-- granted anything but nwf_readonly's SELECT). The owner, which is the only
-- writer, is not constrained by grants - so the refusal is a trigger. Raised
-- as object_not_in_prerequisite_state (SQLSTATE 55000).
--
-- TRUNCATE is NOT trigger-refused, deliberately: no runtime role holds it,
-- and the owner-only integration-test cleanup (helpers.ts truncateAll) must
-- keep working against nwf_pe_test.

CREATE FUNCTION discovery_identity_refuse_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = format('%s is append-only: %s refused', TG_TABLE_NAME, TG_OP);
END;
$$;

CREATE TRIGGER discovery_subjects_append_only
    BEFORE UPDATE OR DELETE ON discovery_subjects
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER discovery_subject_identity_claims_append_only
    BEFORE UPDATE OR DELETE ON discovery_subject_identity_claims
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER discovery_subject_relationship_claims_append_only
    BEFORE UPDATE OR DELETE ON discovery_subject_relationship_claims
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER discovery_subject_reviews_append_only
    BEFORE UPDATE OR DELETE ON discovery_subject_reviews
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

-- ---------------------------------------------------------------------------
-- F. Grants: NO runtime writer. Read-only audit access only.
-- ---------------------------------------------------------------------------
--
--   nwf_ingest, nwf_research, nwf_classifier : NOTHING, not even SELECT.
--     Research cannot read a subject, so no research path can treat one as a
--     root or as authority, and the classifier cannot see one.
--   nwf_readonly : SELECT, exactly as on every other evidence table
--     (0002, 0003, 0005, 0007, 0009). It remains unable to write.
--   writers : the trusted owner path only, until a separately authorised
--     B2.2 writer exists.

REVOKE ALL ON discovery_subjects, discovery_subject_identity_claims,
              discovery_subject_relationship_claims, discovery_subject_reviews
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly;

GRANT SELECT ON discovery_subjects, discovery_subject_identity_claims,
                discovery_subject_relationship_claims, discovery_subject_reviews
    TO nwf_readonly;
