-- 0015_discovery_subject_review_attestation.sql
-- Track B, B2.3: OWNER-ATTESTED DISCOVERY-SUBJECT REVIEWS - a database
-- environment identity, an append-only attestation table bound one-to-one to
-- reviews, and a narrow NOLOGIN reviewer capability. Reasoned about in
-- docs/adr/0023-owner-attested-discovery-subject-review.md.
--
-- WHY THIS EXISTS
--
--   B2.2 (migration 0014, ADR 0020 s6) left review execution disabled: the
--   Engine had no way to tell an authorised OWNER decision from anyone holding
--   a database credential. B2.3 adds that way - an Ed25519 signature by a
--   PINNED OWNER key over a canonical review payload (ADR 0021 RC2 s3) - and
--   this migration gives the result somewhere to live.
--
-- WHAT THE DATABASE CAN AND CANNOT PROVE
--
--   PostgreSQL cannot verify an Ed25519 signature here, and nothing below
--   pretends to. The CONSTRAINTS in this file prove structure: one attestation
--   per review and one review per attestation, a nonce never reused, a review
--   and its attestation written in the same transaction, the attestation's
--   copies of target, outcome, expected head, subject and actor agreeing with
--   the review row, the environment being this database's, and the instants
--   lying inside the envelope's window by the DATABASE clock. The CRYPTOGRAPHY
--   is checked in application code before the INSERT and AGAIN on every read
--   (src/orgunits/subjectRegistry/reviewAttestation.ts), against public keys
--   pinned in reviewed source - never stored here. A row that satisfies every
--   constraint but carries a bad signature is therefore an integrity hold on
--   every read, never authority.
--
--   Triggers do not make a superuser or the table owner incapable of
--   tampering: they can disable triggers, drop constraints or edit rows. What
--   they cannot do is make a tampered review READ as authoritative without
--   also holding a pinned private key. ADR 0023 s9.
--
-- WHAT IS DELIBERATELY ABSENT
--
--   - No public-key or trust table. Which keys may speak for the OWNER is
--     reviewed source (src/orgunits/subjectReview/trust.ts); no role, however
--     privileged, can make a key trusted by writing a row.
--   - No private key, passphrase or secret of any kind.
--   - No research-admission, eligibility, clearance, suppression, canonical
--     identity, equivalence, opportunity or outreach column. A signed review
--     is a factual review of Track B's own provisional evidence and nothing
--     more (ADR 0023 s10, s11).
--   - No change to any table, column, constraint or trigger of 0013 or 0014.

-- ---------------------------------------------------------------------------
-- A. subject_review_environment - this database's own identity.
-- ---------------------------------------------------------------------------
--
-- An envelope names the database it was prepared against, so an envelope for
-- one database is refused by every other. The id is generated HERE, at
-- migration time, independently in every database this migration runs in; no
-- environment id is written in this repository. A byte-for-byte restore of a
-- database carries its id with it and is, for this purpose, the same
-- environment.

CREATE TABLE subject_review_environment (
    singleton      boolean     PRIMARY KEY DEFAULT true,
    environment_id uuid        NOT NULL DEFAULT gen_random_uuid(),
    created_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT subject_review_environment_singleton_chk CHECK (singleton)
);

CREATE UNIQUE INDEX subject_review_environment_id_uidx
    ON subject_review_environment (environment_id);

INSERT INTO subject_review_environment DEFAULT VALUES;

COMMENT ON TABLE subject_review_environment IS
    'THIS DATABASE''S REVIEW ENVIRONMENT IDENTITY: exactly one row, generated '
    'when migration 0015 ran here. Every OWNER review envelope binds it, so an '
    'envelope prepared against one database is refused by every other. It is '
    'not a secret and not an authority. Immutable: UPDATE, DELETE and TRUNCATE '
    'are refused for every role.';

-- ---------------------------------------------------------------------------
-- B. subject_review_attestations - one per attested review.
-- ---------------------------------------------------------------------------

CREATE TABLE subject_review_attestations (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id                uuid        NOT NULL REFERENCES discovery_subject_reviews (id),
    environment_id           uuid        NOT NULL
                                         REFERENCES subject_review_environment (environment_id),
    protocol                 text        NOT NULL,
    action                   text        NOT NULL,
    key_id                   text        NOT NULL,
    key_fingerprint          text        NOT NULL,
    nonce                    text        NOT NULL,
    subject_id               uuid        NOT NULL REFERENCES discovery_subjects (id),
    review_target_key        text        NOT NULL,
    review_outcome           text        NOT NULL,
    expected_head_review_id  uuid        REFERENCES discovery_subject_reviews (id),
    subject_state_digest     text        NOT NULL,
    evidence_snapshot_digest text        NOT NULL,
    target_record_digest     text        NOT NULL,
    rule_version             text        NOT NULL,
    issued_at                timestamptz NOT NULL,
    expires_at               timestamptz NOT NULL,
    signed_payload           text        NOT NULL,
    signature                text        NOT NULL,
    payload_sha256           text        NOT NULL,
    recorded_at              timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT subject_review_attestations_protocol_chk
        CHECK (protocol = 'nwf-pe.discovery-subject-review/1'),
    CONSTRAINT subject_review_attestations_action_chk
        CHECK (action = 'APPEND_DISCOVERY_SUBJECT_REVIEW'),
    CONSTRAINT subject_review_attestations_key_id_chk
        CHECK (key_id ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
    CONSTRAINT subject_review_attestations_fingerprint_chk
        CHECK (key_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT subject_review_attestations_nonce_chk
        CHECK (nonce ~ '^[A-Za-z0-9_-]{43}$'),
    CONSTRAINT subject_review_attestations_outcome_chk
        CHECK (review_outcome IN ('CONFIRMED', 'DISPUTED', 'REJECTED', 'WITHDRAWN')),
    CONSTRAINT subject_review_attestations_digests_chk
        CHECK (subject_state_digest ~ '^[0-9a-f]{64}$'
               AND evidence_snapshot_digest ~ '^[0-9a-f]{64}$'
               AND target_record_digest ~ '^[0-9a-f]{64}$'
               AND payload_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT subject_review_attestations_rule_version_chk
        CHECK (rule_version = 'discovery-identity-rules-v1'),
    -- G4: a window of more than zero and at most sixty minutes.
    CONSTRAINT subject_review_attestations_window_chk
        CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '60 minutes'),
    -- 128 KiB of payload, in unpadded base64url; a 64-byte signature likewise.
    CONSTRAINT subject_review_attestations_payload_chk
        CHECK (length(signed_payload) BETWEEN 1 AND 174763
               AND signed_payload ~ '^[A-Za-z0-9_-]+$'),
    CONSTRAINT subject_review_attestations_signature_chk
        CHECK (signature ~ '^[A-Za-z0-9_-]{86}$')
);

-- ONE attestation authorises ONE decision, and ONE decision has ONE attestation.
CREATE UNIQUE INDEX subject_review_attestations_review_uidx
    ON subject_review_attestations (review_id);

-- A nonce is never accepted twice, across every subject, key and outcome.
CREATE UNIQUE INDEX subject_review_attestations_nonce_uidx
    ON subject_review_attestations (nonce);

CREATE INDEX subject_review_attestations_subject_idx
    ON subject_review_attestations (subject_id);

COMMENT ON TABLE subject_review_attestations IS
    'ONE OWNER ATTESTATION of ONE discovery_subject_reviews row: the exact '
    'signed payload and Ed25519 signature that authorised it, plus copies of '
    'the values it binds so the database can check them against the review. '
    'A row here is NOT proof of authority by itself: the signature is '
    're-verified against the pinned trust set on every read, and an '
    'unverifiable row is an integrity hold. Never research clearance, never '
    'canonical identity. Append-only (trigger-enforced).';

COMMENT ON COLUMN subject_review_attestations.key_id IS
    'The id of the OWNER review key that signed, as the pinned trust set names '
    'it. It identifies a KEY, not a person; the review''s actor_key is derived '
    'from it as owner-review-<key_id>.';

COMMENT ON COLUMN subject_review_attestations.signed_payload IS
    'The canonical payload bytes exactly as signed, unpadded base64url. The '
    'signature covers UTF8(protocol || newline) || these bytes.';

-- ---------------------------------------------------------------------------
-- C. The attestation binds its review - structurally.
-- ---------------------------------------------------------------------------
--
-- Raised as check_violation (SQLSTATE 23514). Applies to every role, owner
-- included, so even the owner path cannot attach an attestation that names a
-- different target, outcome, head, subject or actor than its review - or one
-- written in a LATER transaction than the review (an attestation is never
-- attached after the fact to a review someone else wrote).

CREATE FUNCTION subject_review_attestation_bind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    r              discovery_subject_reviews%ROWTYPE;
    review_xmin    text;
    target_subject uuid;
    env            uuid;
    env_rows       bigint;
    now_ts         timestamptz := clock_timestamp();
BEGIN
    SELECT * INTO r FROM discovery_subject_reviews WHERE id = NEW.review_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_review_attestations: the review does not exist';
    END IF;
    IF r.review_target_key IS DISTINCT FROM NEW.review_target_key
       OR r.review_outcome IS DISTINCT FROM NEW.review_outcome
       OR r.supersedes_review_id IS DISTINCT FROM NEW.expected_head_review_id
       OR r.actor_key IS DISTINCT FROM ('owner-review-' || NEW.key_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_review_attestations: the attestation does not bind its review';
    END IF;

    target_subject := CASE
        WHEN r.reviewed_subject_id IS NOT NULL THEN r.reviewed_subject_id
        WHEN r.reviewed_identity_claim_id IS NOT NULL THEN
            (SELECT subject_id FROM discovery_subject_identity_claims
              WHERE id = r.reviewed_identity_claim_id)
        ELSE
            (SELECT subject_id FROM discovery_subject_relationship_claims
              WHERE id = r.reviewed_relationship_claim_id)
    END;
    IF target_subject IS DISTINCT FROM NEW.subject_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_review_attestations: the attestation names another subject';
    END IF;

    SELECT xmin::text INTO review_xmin FROM discovery_subject_reviews WHERE id = NEW.review_id;
    IF review_xmin::bigint <> (pg_current_xact_id()::text::bigint % 4294967296) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_review_attestations: the review was not written in this transaction';
    END IF;

    SELECT count(*), min(environment_id::text)::uuid INTO env_rows, env
      FROM subject_review_environment;
    IF env_rows <> 1 OR env IS DISTINCT FROM NEW.environment_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_review_attestations: not this database''s environment';
    END IF;

    -- Freshness, by the DATABASE clock (G4: 300 s of skew on issuance).
    IF NOT (r.reviewed_at >= NEW.issued_at - interval '300 seconds'
            AND r.reviewed_at < NEW.expires_at
            AND r.reviewed_at <= now_ts
            AND now_ts < NEW.expires_at
            AND NEW.issued_at <= now_ts + interval '300 seconds') THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'subject_review_attestations: outside the envelope validity window';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER subject_review_attestations_bind
    BEFORE INSERT ON subject_review_attestations
    FOR EACH ROW EXECUTE FUNCTION subject_review_attestation_bind();

-- ---------------------------------------------------------------------------
-- D. A non-owner review is an attested review.
-- ---------------------------------------------------------------------------
--
-- 0013 left reviews writable by the owner path only. This migration gives the
-- reviewer capability INSERT on reviews, so two rules now bind every INSERT by
-- a session that is not the table owner (owner decided from the catalogue,
-- exactly as 0014 decides it). Raised as insufficient_privilege (42501).
--
--   1. its actor key is a verified-reviewer key, `owner-review-<key id>` -
--      never `owner-cli`, never a free-form slug;
--   2. by COMMIT, exactly one attestation names it (a DEFERRED constraint
--      trigger, so the review can be inserted first and its attestation
--      second, in one transaction).
--
-- An owner (or superuser) INSERT is not constrained here, exactly as before:
-- grants and triggers cannot bind the owner. Such a review is an integrity
-- hold on every read, because it has no verifiable attestation.

CREATE FUNCTION discovery_review_bind_reviewer_actor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    table_owner oid;
BEGIN
    SELECT relowner INTO table_owner FROM pg_class WHERE oid = TG_RELID;
    IF pg_has_role(current_user, table_owner, 'MEMBER') THEN
        RETURN NEW;
    END IF;
    IF NEW.actor_key !~ '^owner-review-[a-z0-9][a-z0-9-]{2,40}$' THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'discovery_subject_reviews: a non-owner review must carry a verified-reviewer actor key';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER discovery_subject_reviews_reviewer_actor
    BEFORE INSERT ON discovery_subject_reviews
    FOR EACH ROW EXECUTE FUNCTION discovery_review_bind_reviewer_actor();

CREATE FUNCTION discovery_review_require_attestation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    table_owner oid;
    attested    bigint;
BEGIN
    SELECT relowner INTO table_owner FROM pg_class WHERE oid = TG_RELID;
    IF pg_has_role(current_user, table_owner, 'MEMBER') THEN
        RETURN NULL;
    END IF;
    SELECT count(*) INTO attested
      FROM subject_review_attestations WHERE review_id = NEW.id;
    IF attested <> 1 THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'discovery_subject_reviews: a non-owner review must commit with exactly one attestation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER discovery_subject_reviews_require_attestation
    AFTER INSERT ON discovery_subject_reviews
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION discovery_review_require_attestation();

-- ---------------------------------------------------------------------------
-- E. Append-only, for every role including the owner.
-- ---------------------------------------------------------------------------
--
-- Reuses 0013's refusal function (SQLSTATE 55000). The environment record
-- additionally refuses TRUNCATE: losing it would change this database's
-- identity. Attestations, like 0013's tables, do not refuse TRUNCATE, so the
-- owner-only integration-test cleanup (whose TRUNCATE of the reviews CASCADEs
-- here) keeps working; no runtime role holds TRUNCATE.

CREATE TRIGGER subject_review_environment_append_only
    BEFORE UPDATE OR DELETE ON subject_review_environment
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER subject_review_environment_no_truncate
    BEFORE TRUNCATE ON subject_review_environment
    FOR EACH STATEMENT EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER subject_review_attestations_append_only
    BEFORE UPDATE OR DELETE ON subject_review_attestations
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

-- ---------------------------------------------------------------------------
-- F. The reviewer capability. NOLOGIN, no password, no attributes.
-- ---------------------------------------------------------------------------
--
-- nwf_discovery_subject_reviewer is a CAPABILITY ROLE, exactly like 0014's
-- writer: nobody connects AS it, a deployment grants it to a separately
-- provisioned login, and no migration creates a password-bearing login.
-- HOLDING IT IS NOT AUTHORITY. It lets the attested-review path append a
-- review and its attestation; whether that review is AUTHORITATIVE is decided
-- by the signature, on every read. The trusted decision (an OWNER signature)
-- and the database capability (this role) are deliberately two things.
--
-- PRIVILEGES, AND WHY EACH IS NEEDED
--
--   discovery_subjects, discovery_subject_identity_claims,
--   discovery_subject_relationship_claims       SELECT
--     Reload the subject under lock and re-run the B2.2 judgement and the
--     evidence digests. No INSERT: a reviewer never registers evidence.
--   discovery_subject_reviews                   SELECT, INSERT
--     Read the chain; append the one decision.
--   subject_review_attestations       SELECT, INSERT
--     Verify the existing chain's attestations; append the new one.
--   subject_review_environment                SELECT
--     Check the envelope's audience.
--   organisations (eche_row_key)                SELECT on that ONE column
--     The B2.1 validator's existence check, exactly as the writer has it.
--
--   NOT granted: UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, TEMPORARY, any
--   sequence, and anything on orgunit_* / classifier / website / ECHE / EWP /
--   ingest tables. The role is granted to NO existing role - not
--   nwf_research, nwf_ingest, nwf_classifier, nwf_readonly, and not
--   nwf_discovery_subject_writer.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles
                    WHERE rolname = 'nwf_discovery_subject_reviewer') THEN
        CREATE ROLE nwf_discovery_subject_reviewer NOLOGIN;
    END IF;
END
$$;

ALTER ROLE nwf_discovery_subject_reviewer
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;

COMMENT ON ROLE nwf_discovery_subject_reviewer IS
    'Track B B2.3 CAPABILITY ROLE (NOLOGIN): may append one discovery-subject '
    'review together with its OWNER attestation, under a derived '
    'owner-review-<key id> actor key. Holding it is a database capability, not '
    'OWNER authority: a review counts only if its Ed25519 attestation verifies '
    'against the pinned trust set on read. May not register subjects or '
    'claims, update, delete or truncate anything. See ADR 0023.';

DO $$
DECLARE
    db text := current_database();
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO nwf_discovery_subject_reviewer', db);
END
$$;

GRANT USAGE ON SCHEMA public TO nwf_discovery_subject_reviewer;

GRANT SELECT ON discovery_subjects, discovery_subject_identity_claims,
                discovery_subject_relationship_claims
    TO nwf_discovery_subject_reviewer;

GRANT SELECT, INSERT ON discovery_subject_reviews, subject_review_attestations
    TO nwf_discovery_subject_reviewer;

GRANT SELECT ON subject_review_environment TO nwf_discovery_subject_reviewer;

GRANT SELECT (eche_row_key) ON organisations TO nwf_discovery_subject_reviewer;

-- ---------------------------------------------------------------------------
-- G. Everyone else: read-only audit access, or nothing.
-- ---------------------------------------------------------------------------
--
--   nwf_readonly : SELECT on both new tables, so `show` and `list` can
--     re-verify every review on read.
--   nwf_ingest, nwf_research, nwf_classifier, nwf_discovery_subject_writer :
--     NOTHING. The writer keeps exactly what 0014 gave it; it reads reviews
--     for validation but never their attestations, and its results say so
--     (NOT_EVALUATED).

REVOKE ALL ON subject_review_environment, subject_review_attestations
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly,
         nwf_discovery_subject_writer;

GRANT SELECT ON subject_review_environment, subject_review_attestations
    TO nwf_readonly;
