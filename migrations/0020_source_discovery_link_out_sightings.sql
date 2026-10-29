-- Migration 0020 - REL P2: PERSISTENT LINK-OUT NOMINATIONS. ONE IDENTITY PER
-- REGISTRABLE DOMAIN, AND EVERY SIGHTING KEPT.
--
-- Migration 0019 deduplicates a nomination per (discovery run, registrable
-- domain). That is right for the nomination row, and it leaves two gaps this
-- migration closes, append-only and without touching 0019:
--
--   A. `source_discovery_nomination_identities` - ONE row per nominated
--      registrable domain, across every run and every method. It names the
--      FIRST nomination of that domain (the one an operator promotes). The
--      same domain nominated again - by another research run, another page,
--      another provider - is the same identity, never a second one. It is a
--      DEDUPLICATION KEY ONLY: not an organisation, not a subject, not a
--      root, not a verdict, and never a merge (sharing a registrable domain
--      is not identity of organisations; CLAUDE.md "canonical_domain is
--      descriptive/enrichment data, NOT an identity key").
--   B. `source_discovery_nomination_sightings` - ONE row per (link-out
--      nomination, source page evidence, URL). 0019's dedupe key keeps only
--      the first page of a run that linked out to a domain; every further
--      page of that run, and every page of every later run, was dropped. A
--      sighting keeps each of them as EVIDENCE: which page (by its page
--      evidence id, which reaches the research run and its root by join),
--      which URL, the REDACTED anchor text, and when that page was observed.
--
-- NOTHING HERE AUTHORISES A FETCH. No orgunit_* table references either
-- table, no root kind names them, and the research role holds no privilege
-- on them. Fetching a nominated domain still takes the separate, existing
-- path: an operator promotes the nomination to a discovery subject (B2.2),
-- the subject is reviewed (B2.3), the OWNER admits it (0017), and only then
-- is it researched - under its own admission, never under the page that
-- linked to it.
--
-- WHAT IT DOES NOT DO. No LOGIN role (a deployment, or a disposable test
-- database, provisions a login holding the 0019 capability), no new role at
-- all, no contact column, no country/locale/market column, no score, no
-- relevance, no status, no UPDATE or DELETE grant to anyone, no SECURITY
-- DEFINER function, and no change to any existing table, role or grant.

-- ---------------------------------------------------------------------------
-- A. Identities.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_nomination_identities (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    registrable_domain   text        NOT NULL,
    first_nomination_id  uuid        NOT NULL REFERENCES source_discovery_nominations (id),
    created_at           timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT source_discovery_nomination_identities_domain_chk
        CHECK (registrable_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$')
);

-- THE CROSS-RUN DEDUPE KEY: one identity per registrable domain, ever.
CREATE UNIQUE INDEX source_discovery_nomination_identities_domain_uidx
    ON source_discovery_nomination_identities (registrable_domain);

-- A nomination is the first of at most one identity.
CREATE UNIQUE INDEX source_discovery_nomination_identities_first_uidx
    ON source_discovery_nomination_identities (first_nomination_id);

-- The composite target that pins a sighting's domain to its identity's.
CREATE UNIQUE INDEX source_discovery_nomination_identities_id_domain_uidx
    ON source_discovery_nomination_identities (id, registrable_domain);

COMMENT ON TABLE source_discovery_nomination_identities IS
    'ONE NOMINATED REGISTRABLE DOMAIN, across every run and method, naming its '
    'FIRST nomination. A deduplication key only: NOT an organisation, NOT a '
    'discovery subject, NOT a research root, NOT a verdict and never a merge. '
    'Nothing fetches it. Append-only (trigger-enforced).';

COMMENT ON COLUMN source_discovery_nomination_identities.first_nomination_id IS
    'The earliest nomination of this registrable domain when the identity was '
    'recorded (enforced on INSERT to carry the same domain). An operator '
    'promotes THIS nomination; a later nomination of the same domain is '
    'evidence, not a second candidate.';

-- ---------------------------------------------------------------------------
-- B. Sightings.
-- ---------------------------------------------------------------------------

CREATE TABLE source_discovery_nomination_sightings (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id              uuid        NOT NULL,
    registrable_domain       text        NOT NULL,
    nomination_id            uuid        NOT NULL REFERENCES source_discovery_nominations (id),
    source_page_evidence_id  uuid        NOT NULL REFERENCES orgunit_page_evidence (id),
    url                      text        NOT NULL,
    hostname                 text        NOT NULL,
    anchor_text              text,
    observed_at              timestamptz NOT NULL,
    created_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT source_discovery_nomination_sightings_identity_fk
        FOREIGN KEY (identity_id, registrable_domain)
        REFERENCES source_discovery_nomination_identities (id, registrable_domain),
    -- The SAME admissibility as a nomination URL (0019) and a discovery-subject
    -- PUBLIC_URL (0013).
    CONSTRAINT source_discovery_nomination_sightings_url_chk
        CHECK (discovery_identity_url_admissible(url)),
    CONSTRAINT source_discovery_nomination_sightings_host_chk
        CHECK (substring(url from '^https?://([^/]+)') = hostname
               AND (hostname = registrable_domain
                    OR right(hostname, length(registrable_domain) + 1) = '.' || registrable_domain)),
    -- Anchor text is REDACTED before it arrives (redactContactData plus the
    -- nomination text rules); this CHECK is the backstop, exactly 0019's title
    -- CHECK: bounded, no control character, no at-sign.
    CONSTRAINT source_discovery_nomination_sightings_anchor_text_chk
        CHECK (anchor_text IS NULL
               OR (length(anchor_text) BETWEEN 1 AND 300
                   AND anchor_text !~ '[[:cntrl:]]' AND position('@' in anchor_text) = 0))
);

-- THE SIGHTING DEDUPE KEY: re-offering the same href of the same page to the
-- same nomination is idempotent; every OTHER page, URL or run is kept.
CREATE UNIQUE INDEX source_discovery_nomination_sightings_dedupe_uidx
    ON source_discovery_nomination_sightings (nomination_id, source_page_evidence_id, url);

CREATE INDEX source_discovery_nomination_sightings_identity_idx
    ON source_discovery_nomination_sightings (identity_id, observed_at, id);

COMMENT ON TABLE source_discovery_nomination_sightings IS
    'ONE OBSERVATION of an already-read page linking out to a nominated '
    'registrable domain: the page evidence it came from, the URL, the REDACTED '
    'anchor text and the page''s observed_at. EVIDENCE only: it grants no '
    'research authority and nothing fetches its URL. Append-only '
    '(trigger-enforced).';

COMMENT ON COLUMN source_discovery_nomination_sightings.nomination_id IS
    'The PAGE_LINK_OUT nomination of the SAME research run this sighting '
    'belongs to (enforced on INSERT to be PAGE_LINK_OUT and to carry the same '
    'registrable domain). The run is reached by join, never duplicated here.';

COMMENT ON COLUMN source_discovery_nomination_sightings.observed_at IS
    'Exactly the observed_at of the source page evidence (enforced on INSERT).';

-- ---------------------------------------------------------------------------
-- C. The consistency is the database's, not the caller's.
-- ---------------------------------------------------------------------------
--
-- Run with the INSERTING role's rights (no SECURITY DEFINER). Every relation
-- they read is already SELECT-granted to the 0019 capability: its own tables,
-- and orgunit_page_evidence (id, observed_at). Raised as check_violation
-- (SQLSTATE 23514).

CREATE FUNCTION source_discovery_verify_nomination_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    first_domain text;
BEGIN
    SELECT registrable_domain INTO first_domain
      FROM source_discovery_nominations WHERE id = NEW.first_nomination_id;
    IF first_domain IS DISTINCT FROM NEW.registrable_domain THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nomination_identities: the first nomination must carry the identity''s registrable domain';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER source_discovery_nomination_identities_verify
    BEFORE INSERT ON source_discovery_nomination_identities
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_nomination_identity();

CREATE FUNCTION source_discovery_verify_nomination_sighting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    nominated_domain text;
    nominated_method text;
    page_observed timestamptz;
BEGIN
    SELECT registrable_domain, discovery_method INTO nominated_domain, nominated_method
      FROM source_discovery_nominations WHERE id = NEW.nomination_id;
    IF nominated_method IS DISTINCT FROM 'PAGE_LINK_OUT'
       OR nominated_domain IS DISTINCT FROM NEW.registrable_domain THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nomination_sightings: a sighting belongs to a PAGE_LINK_OUT nomination of the same registrable domain';
    END IF;
    SELECT observed_at INTO page_observed
      FROM orgunit_page_evidence WHERE id = NEW.source_page_evidence_id;
    IF NEW.observed_at IS DISTINCT FROM page_observed THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'source_discovery_nomination_sightings: observed_at must equal its source page observed_at';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER source_discovery_nomination_sightings_verify
    BEFORE INSERT ON source_discovery_nomination_sightings
    FOR EACH ROW EXECUTE FUNCTION source_discovery_verify_nomination_sighting();

-- ---------------------------------------------------------------------------
-- D. Append-only, for every role including the owner (0013's function).
-- ---------------------------------------------------------------------------

CREATE TRIGGER source_discovery_nomination_identities_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_nomination_identities
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();
CREATE TRIGGER source_discovery_nomination_sightings_append_only
    BEFORE UPDATE OR DELETE ON source_discovery_nomination_sightings
    FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation();

-- ---------------------------------------------------------------------------
-- E. Grants. SELECT + INSERT for the 0019 capability; SELECT for audit.
-- ---------------------------------------------------------------------------

REVOKE ALL ON source_discovery_nomination_identities, source_discovery_nomination_sightings
    FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly,
         nwf_discovery_subject_writer, nwf_discovery_subject_reviewer;

GRANT SELECT, INSERT ON source_discovery_nomination_identities,
                        source_discovery_nomination_sightings
    TO nwf_source_discovery;

GRANT SELECT ON source_discovery_nomination_identities, source_discovery_nomination_sightings
    TO nwf_readonly;
