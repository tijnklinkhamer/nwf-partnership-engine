-- 0014_discovery_subject_writer.sql
-- Track B, B2.2: A NARROW WRITER CAPABILITY FOR DISCOVERY-SUBJECT REGISTRATION
-- AND CLAIMS - and NOTHING for reviews. Reasoned about in
-- docs/adr/0020-controlled-discovery-subject-registry.md.
--
-- WHY THIS EXISTS
--
--   Migration 0013 left every discovery-subject table writable by the owner
--   path only, "until a separately authorised B2.2 writer exists". B2.2 adds a
--   CLI (`nwf-pe discovery-subjects`) that registers synthetic candidate
--   subjects and appends source-backed claims. Running that CLI on the owner
--   (migration, superuser) credential would hand an everyday command the power
--   to rewrite schema, disable triggers and record reviews under any actor key.
--   So the CLI gets its own capability role, and that role can do exactly what
--   the CLI needs and nothing else.
--
-- WHAT THE ROLE IS - AND IS NOT
--
--   nwf_discovery_subject_writer is a NOLOGIN CAPABILITY ROLE. Nobody connects
--   AS it. A deployment grants it to a separately provisioned LOGIN role,
--   outside any migration; no migration creates a password-bearing writer
--   login, and no credential for one exists in this repository.
--
--   IT IS NAMED FOR THE DISCOVERY-SUBJECT REGISTRY, AND FOR NOTHING WIDER. A
--   discovery subject is a PROVISIONAL, Track-B-local evidence subject, not a
--   canonical Candidate or Channel identity (ADR 0020 s12). The canonical
--   identity layer, its identifiers and its roles belong to another track, so
--   this role deliberately does not carry a generic "identity" name, owns no
--   canonical table, and can issue no canonical identifier, merge, split or
--   equivalence decision.
--
--   HOLDING IT IS A DATABASE CAPABILITY, NOT AN IDENTITY. It proves the caller
--   holds a credential that was granted the capability. It does NOT prove the
--   caller is the OWNER, and nothing it can write is a review. That is why it
--   receives no privilege at all on discovery_subject_reviews beyond SELECT.
--
-- PRIVILEGES, AND WHY EACH IS NEEDED
--
--   discovery_subjects                    SELECT, INSERT
--   discovery_subject_identity_claims     SELECT, INSERT
--   discovery_subject_relationship_claims SELECT, INSERT
--     INSERT is the capability. SELECT is READING FOR VALIDATION: the writer
--     loads the bounded neighbourhood of the subject inside the same
--     transaction and runs the pure B2.1 validator over existing + new rows
--     before inserting. Reading is not modifying, and SELECT confers no
--     UPDATE, DELETE or TRUNCATE.
--   discovery_subject_reviews             SELECT only
--     The derived review state of a claim is part of what the validator
--     checks. The writer can never record a review: there is no trusted
--     reviewer identity in this repository (ADR 0020 s6).
--   organisations (eche_row_key)          SELECT on that ONE column
--     The validator refuses a relationship to an ECHE row it is not told
--     exists. Existence is all the writer may learn about an institution - not
--     its name, country, website or anything else.
--
--   NOT granted, deliberately: UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
--   TEMPORARY, any sequence, any orgunit_* / classifier / website / ECHE /
--   EWP / ingest table. Foreign keys into orgunit_page_evidence and
--   website_claims are still enforced, because PostgreSQL checks them with the
--   referenced table's owner's rights - the writer learns only whether its own
--   INSERT succeeded.
--
--   No existing role is changed. nwf_ingest, nwf_research, nwf_classifier and
--   nwf_readonly are not granted this role and keep exactly what 0013 gave
--   them (readonly: SELECT; the rest: nothing).
--
-- THE RECORDED ACTOR IS BOUND, NOT TYPED
--
--   0013 records WHICH TRUSTED PATH registered a subject or recorded a claim
--   (registered_by_actor_key / recorded_by_actor_key). A writer that could put
--   any slug there - `owner`, `owner-cli` - could make its rows read as if the
--   owner path had recorded them. So every INSERT by a session that is not the
--   table owner must carry exactly the path key `discovery-subjects-cli`, and
--   anything else is refused with SQLSTATE 42501. The owner path of 0013 is
--   untouched: an owner (or superuser) INSERT is checked exactly as before.
--
-- APPEND-ONLY IS UNCHANGED
--
--   0013's BEFORE UPDATE OR DELETE trigger still refuses both for every role.
--   This migration adds no UPDATE, DELETE or TRUNCATE grant, alters no column,
--   constraint or existing trigger of 0013, and inserts no row.

-- ---------------------------------------------------------------------------
-- A. The capability role. NOLOGIN, no password, no attributes.
-- ---------------------------------------------------------------------------
--
-- Roles are cluster-wide and this migration is applied to the working and the
-- test database alike, so creation is guarded; the ALTER then pins the
-- attributes even if a same-named role was created beforehand by hand.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles
                    WHERE rolname = 'nwf_discovery_subject_writer') THEN
        CREATE ROLE nwf_discovery_subject_writer NOLOGIN;
    END IF;
END
$$;

ALTER ROLE nwf_discovery_subject_writer
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;

COMMENT ON ROLE nwf_discovery_subject_writer IS
    'Track B B2.2 CAPABILITY ROLE (NOLOGIN): may register discovery subjects and '
    'append identity and relationship claims, under the bound actor key '
    'discovery-subjects-cli. May NOT record a review, update, delete or '
    'truncate anything. Holding it is a database capability, not OWNER '
    'identity and not research authority. Granted to a deployment-provisioned '
    'login only; see ADR 0020.';

-- ---------------------------------------------------------------------------
-- B. Grants.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    db text := current_database();
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO nwf_discovery_subject_writer', db);
END
$$;

GRANT USAGE ON SCHEMA public TO nwf_discovery_subject_writer;

GRANT SELECT, INSERT ON discovery_subjects, discovery_subject_identity_claims,
                        discovery_subject_relationship_claims
    TO nwf_discovery_subject_writer;

GRANT SELECT ON discovery_subject_reviews TO nwf_discovery_subject_writer;

GRANT SELECT (eche_row_key) ON organisations TO nwf_discovery_subject_writer;

-- ---------------------------------------------------------------------------
-- C. The recorded actor of a non-owner INSERT is the CLI path key.
-- ---------------------------------------------------------------------------
--
-- "Owner" is decided from the catalogue (pg_class.relowner of the table being
-- written), never from a setting or an argument. A superuser is a member of
-- every role and therefore passes as the owner path, exactly as it already
-- bypasses every grant; the CLI refuses to run on such a connection (ADR 0020
-- s3). Raised as insufficient_privilege (SQLSTATE 42501).

CREATE FUNCTION discovery_identity_bind_writer_actor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    table_owner oid;
    recorded    text;
BEGIN
    SELECT relowner INTO table_owner FROM pg_class WHERE oid = TG_RELID;
    IF pg_has_role(current_user, table_owner, 'MEMBER') THEN
        RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'discovery_subjects' THEN
        recorded := NEW.registered_by_actor_key;
    ELSE
        recorded := NEW.recorded_by_actor_key;
    END IF;
    IF recorded IS DISTINCT FROM 'discovery-subjects-cli' THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
                '%s: a non-owner writer may record only the actor key discovery-subjects-cli',
                TG_TABLE_NAME);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER discovery_subjects_writer_actor
    BEFORE INSERT ON discovery_subjects
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_bind_writer_actor();
CREATE TRIGGER discovery_subject_identity_claims_writer_actor
    BEFORE INSERT ON discovery_subject_identity_claims
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_bind_writer_actor();
CREATE TRIGGER discovery_subject_relationship_claims_writer_actor
    BEFORE INSERT ON discovery_subject_relationship_claims
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_bind_writer_actor();
