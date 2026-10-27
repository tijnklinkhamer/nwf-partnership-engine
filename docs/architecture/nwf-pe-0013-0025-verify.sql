-- nwf-pe-0013-0025-verify.sql - READ-ONLY verification for
-- docs/architecture/NWF_PE_MIGRATIONS_0013_0025_APPLY_RUNBOOK_V1.md, section 6.
--
-- PREPARED, NOT EXECUTED against nwf_pe. Run it only under the runbook's
-- signed OWNER authorisation (runbook section 2), AFTER `npm run db:migrate` reported migrations 0013-0025
-- applied, on the owner path (the cluster superuser that ran the migrations:
-- the role check reads pg_authid):
--
--   psql "<owner URL for nwf_pe>" -X -v ON_ERROR_STOP=1 -f docs/architecture/nwf-pe-0013-0025-verify.sql
--
-- It only reads. One transaction, READ ONLY, ended by ROLLBACK. Every
-- expected value below was measured from THIS tree's migrations on a
-- disposable database migrated 0001-0025, and is the state the migrations
-- leave and nothing else: no privilege row, no campaign, no search authority, no key,
-- no member of any capability role.
--
-- Output: one row per check (check, ok, detail), then ALL_CHECKS_TRUE. The
-- expected result is ok = t on EVERY row, including ALL_CHECKS_TRUE. Any f
-- means STOP and escalate to the OWNER (runbook section 7); nothing here
-- repairs anything.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;
SET LOCAL statement_timeout = '120s';

WITH
-- L. The migration ledger: exactly 0001-0025, and 0013-0025 with these digests.
expected_ledger(version, checksum) AS (
    VALUES
        ('0013', '98af165685793512f61946b32225652465b49f669267a3eedb298fc3002cc8b2'),
        ('0014', '71dc4f69092bb6eac456c057af4ae15b4be5dd302a419f935e64f0c2aa1bbb35'),
        ('0015', 'f1e95ec8f24908e1baf13bfcf4ba48f2d1e176f37539e4269627b4dcdcbd09ca'),
        ('0016', '56c877f3344a2f51b15b4210d2ac488dcbe30e7bee437c35ac19f87926bf8f1c'),
        ('0017', '2c96644175202cd827a580e3dd857a20c308b6302f5c99c443db10c099792c9f'),
        ('0018', '4d29d623f5eee8d964711d0688145cbc71d2bef7a0902998d05adb41b832d065'),
        ('0019', '7c046ec9604f1c2bc4f76af43c862b5f1a1fa1556067fe70d34ff3e1818347d6'),
        ('0020', '667c0066a6773acb9e28bee46b363bde82060cdf21afdf14e47e2c8abe1d6d19'),
        ('0021', '791bf4b5ceb97b7b04b36f5c477023a86e435152737406dadbdfe23027b1cff4'),
        ('0022', '87b541b16c26022e01343f42ff20ab6f10da1ea3a0646a321cf38674e8a2a880'),
        ('0023', 'a433f2769fc5458be5a33d1b9caa289e035da0a84eb2fdb9511826107f3351e3'),
        ('0024', '72bc76aa58ad4eb11a09616b3b5093b7d089effca3e96eb7198ed8713c2e2acf'),
        ('0025', '26920ea160608a7cfd4001d9aaa503ceb2575f686ab7ab8c77fdb67c9516b4db')
),
actual_ledger AS (
    SELECT version, checksum FROM public.schema_migrations WHERE version >= '0013'
),
-- G1. Every non-owner privilege on every relation in schema public, as
--     (relation, grantee, aclitem letters): r = SELECT, a = append.
expected_acl(relname, grantee, privs) AS (
    VALUES
        ('acquisition_campaign_control_events', 'nwf_acquisition_worker', 'r'),
        ('acquisition_campaign_control_events', 'nwf_readonly', 'r'),
        ('acquisition_campaign_subjects', 'nwf_acquisition_worker', 'ar'),
        ('acquisition_campaign_subjects', 'nwf_readonly', 'r'),
        ('acquisition_campaigns', 'nwf_acquisition_worker', 'r'),
        ('acquisition_campaigns', 'nwf_readonly', 'r'),
        ('acquisition_claim_lease_extensions', 'nwf_acquisition_worker', 'ar'),
        ('acquisition_claim_lease_extensions', 'nwf_readonly', 'r'),
        ('acquisition_outbox_entries', 'nwf_acquisition_worker', 'ar'),
        ('acquisition_outbox_entries', 'nwf_readonly', 'r'),
        ('acquisition_signals', 'nwf_acquisition_worker', 'ar'),
        ('acquisition_signals', 'nwf_readonly', 'r'),
        ('acquisition_work_claims', 'nwf_acquisition_worker', 'ar'),
        ('acquisition_work_claims', 'nwf_readonly', 'r'),
        ('acquisition_work_item_states', 'nwf_acquisition_worker', 'r'),
        ('acquisition_work_item_states', 'nwf_readonly', 'r'),
        ('acquisition_work_items', 'nwf_acquisition_worker', 'ar'),
        ('acquisition_work_items', 'nwf_readonly', 'r'),
        ('acquisition_work_outcomes', 'nwf_acquisition_worker', 'ar'),
        ('acquisition_work_outcomes', 'nwf_readonly', 'r'),
        ('acquisition_worker_stops', 'nwf_acquisition_worker', 'ar'),
        ('acquisition_worker_stops', 'nwf_readonly', 'r'),
        ('discovery_subject_identity_claims', 'nwf_discovery_subject_reviewer', 'r'),
        ('discovery_subject_identity_claims', 'nwf_discovery_subject_writer', 'ar'),
        ('discovery_subject_identity_claims', 'nwf_readonly', 'r'),
        ('discovery_subject_relationship_claims', 'nwf_discovery_subject_reviewer', 'r'),
        ('discovery_subject_relationship_claims', 'nwf_discovery_subject_writer', 'ar'),
        ('discovery_subject_relationship_claims', 'nwf_readonly', 'r'),
        ('discovery_subject_reviews', 'nwf_discovery_subject_reviewer', 'ar'),
        ('discovery_subject_reviews', 'nwf_discovery_subject_writer', 'r'),
        ('discovery_subject_reviews', 'nwf_readonly', 'r'),
        ('discovery_subjects', 'nwf_discovery_subject_reviewer', 'r'),
        ('discovery_subjects', 'nwf_discovery_subject_writer', 'ar'),
        ('discovery_subjects', 'nwf_readonly', 'r'),
        ('ewp_api_declarations', 'nwf_ingest', 'ar'),
        ('ewp_api_declarations', 'nwf_readonly', 'r'),
        ('ewp_hei_other_ids', 'nwf_ingest', 'ar'),
        ('ewp_hei_other_ids', 'nwf_readonly', 'r'),
        ('ewp_heis', 'nwf_ingest', 'ar'),
        ('ewp_heis', 'nwf_readonly', 'r'),
        ('ewp_host_covered_heis', 'nwf_ingest', 'ar'),
        ('ewp_host_covered_heis', 'nwf_readonly', 'r'),
        ('ewp_hosts', 'nwf_ingest', 'ar'),
        ('ewp_hosts', 'nwf_readonly', 'r'),
        ('ewp_snapshots', 'nwf_ingest', 'ar'),
        ('ewp_snapshots', 'nwf_readonly', 'r'),
        ('ingest_runs', 'nwf_ingest', 'arw'),
        ('ingest_runs', 'nwf_readonly', 'r'),
        ('organisation_sources', 'nwf_ingest', 'ar'),
        ('organisation_sources', 'nwf_readonly', 'r'),
        ('organisations', 'nwf_classifier', 'r'),
        ('organisations', 'nwf_ingest', 'arw'),
        ('organisations', 'nwf_readonly', 'r'),
        ('organisations', 'nwf_research', 'r'),
        ('orgunit_classification_subjects', 'nwf_classifier', 'ar'),
        ('orgunit_classification_subjects', 'nwf_readonly', 'r'),
        ('orgunit_classifier_call_completions', 'nwf_classifier', 'ar'),
        ('orgunit_classifier_call_completions', 'nwf_readonly', 'r'),
        ('orgunit_classifier_calls', 'nwf_classifier', 'ar'),
        ('orgunit_classifier_calls', 'nwf_readonly', 'r'),
        ('orgunit_fetch_observations', 'nwf_classifier', 'r'),
        ('orgunit_fetch_observations', 'nwf_readonly', 'r'),
        ('orgunit_fetch_observations', 'nwf_research', 'ar'),
        ('orgunit_page_candidates', 'nwf_classifier', 'r'),
        ('orgunit_page_candidates', 'nwf_readonly', 'r'),
        ('orgunit_page_candidates', 'nwf_research', 'ar'),
        ('orgunit_page_classifications', 'nwf_classifier', 'ar'),
        ('orgunit_page_classifications', 'nwf_readonly', 'r'),
        ('orgunit_page_evidence', 'nwf_classifier', 'r'),
        ('orgunit_page_evidence', 'nwf_readonly', 'r'),
        ('orgunit_page_evidence', 'nwf_research', 'ar'),
        ('orgunit_redirect_observations', 'nwf_readonly', 'r'),
        ('orgunit_redirect_observations', 'nwf_research', 'ar'),
        ('orgunit_research_run_completions', 'nwf_readonly', 'r'),
        ('orgunit_research_run_completions', 'nwf_research', 'ar'),
        ('orgunit_research_runs', 'nwf_classifier', 'r'),
        ('orgunit_research_runs', 'nwf_readonly', 'r'),
        ('orgunit_research_runs', 'nwf_research', 'ar'),
        ('orgunit_root_promotion_revocations', 'nwf_readonly', 'r'),
        ('orgunit_root_promotion_revocations', 'nwf_research', 'r'),
        ('orgunit_root_promotions', 'nwf_readonly', 'r'),
        ('orgunit_root_promotions', 'nwf_research', 'r'),
        ('source_discovery_briefs', 'nwf_readonly', 'r'),
        ('source_discovery_briefs', 'nwf_source_discovery', 'ar'),
        ('source_discovery_grant_uses', 'nwf_readonly', 'r'),
        ('source_discovery_grant_uses', 'nwf_source_discovery', 'ar'),
        ('source_discovery_grants', 'nwf_readonly', 'r'),
        ('source_discovery_grants', 'nwf_source_discovery', 'r'),
        ('source_discovery_nomination_identities', 'nwf_readonly', 'r'),
        ('source_discovery_nomination_identities', 'nwf_source_discovery', 'ar'),
        ('source_discovery_nomination_known_marks', 'nwf_readonly', 'r'),
        ('source_discovery_nomination_known_marks', 'nwf_source_discovery', 'ar'),
        ('source_discovery_nomination_sightings', 'nwf_readonly', 'r'),
        ('source_discovery_nomination_sightings', 'nwf_source_discovery', 'ar'),
        ('source_discovery_nominations', 'nwf_readonly', 'r'),
        ('source_discovery_nominations', 'nwf_source_discovery', 'ar'),
        ('source_discovery_query_call_starts', 'nwf_readonly', 'r'),
        ('source_discovery_query_call_starts', 'nwf_source_discovery', 'ar'),
        ('source_discovery_query_calls', 'nwf_readonly', 'r'),
        ('source_discovery_query_calls', 'nwf_source_discovery', 'ar'),
        ('source_discovery_run_completions', 'nwf_readonly', 'r'),
        ('source_discovery_run_completions', 'nwf_source_discovery', 'ar'),
        ('source_discovery_runs', 'nwf_readonly', 'r'),
        ('source_discovery_runs', 'nwf_source_discovery', 'ar'),
        ('source_discovery_smoke_verifications', 'nwf_readonly', 'r'),
        ('source_discovery_smoke_verifications', 'nwf_source_discovery', 'r'),
        ('subject_jurisdiction_claims', 'nwf_discovery_subject_writer', 'ar'),
        ('subject_jurisdiction_claims', 'nwf_readonly', 'r'),
        ('subject_research_admission_revocations', 'nwf_acquisition_worker', 'r'),
        ('subject_research_admission_revocations', 'nwf_readonly', 'r'),
        ('subject_research_admission_revocations', 'nwf_research', 'r'),
        ('subject_research_admissions', 'nwf_acquisition_worker', 'ar'),
        ('subject_research_admissions', 'nwf_readonly', 'r'),
        ('subject_research_admissions', 'nwf_research', 'r'),
        ('subject_research_registry_fingerprint', 'nwf_readonly', 'r'),
        ('subject_research_registry_fingerprint', 'nwf_research', 'r'),
        ('subject_review_attestations', 'nwf_discovery_subject_reviewer', 'ar'),
        ('subject_review_attestations', 'nwf_readonly', 'r'),
        ('subject_review_environment', 'nwf_acquisition_worker', 'r'),
        ('subject_review_environment', 'nwf_discovery_subject_reviewer', 'r'),
        ('subject_review_environment', 'nwf_readonly', 'r'),
        ('website_claims', 'nwf_ingest', 'ar'),
        ('website_claims', 'nwf_readonly', 'r'),
        ('website_claims', 'nwf_research', 'r'),
        ('website_source_snapshots', 'nwf_ingest', 'ar'),
        ('website_source_snapshots', 'nwf_readonly', 'r')
),
actual_acl(relname, grantee, privs) AS (
    SELECT c.relname::text,
           CASE WHEN split_part(i::text, '=', 1) = '' THEN 'PUBLIC'
                ELSE split_part(i::text, '=', 1) END AS grantee,
           split_part(split_part(i::text, '=', 2), '/', 1) AS privs
      FROM pg_catalog.pg_class c
     CROSS JOIN LATERAL unnest(c.relacl) AS i
     WHERE c.relnamespace = 'public'::regnamespace
       AND split_part(i::text, '=', 1) <> pg_catalog.pg_get_userbyid(c.relowner)
),
-- G2. Every column-level privilege in schema public.
expected_colacl(relname, attname, grantee, privs) AS (
    VALUES
        ('organisations', 'eche_row_key', 'nwf_discovery_subject_reviewer', 'r'),
        ('organisations', 'eche_row_key', 'nwf_discovery_subject_writer', 'r'),
        ('orgunit_page_evidence', 'id', 'nwf_discovery_subject_writer', 'r'),
        ('orgunit_page_evidence', 'id', 'nwf_source_discovery', 'r'),
        ('orgunit_page_evidence', 'observed_at', 'nwf_discovery_subject_writer', 'r'),
        ('orgunit_page_evidence', 'observed_at', 'nwf_source_discovery', 'r'),
        ('orgunit_page_evidence', 'root_key', 'nwf_discovery_subject_writer', 'r'),
        ('orgunit_research_runs', 'id', 'nwf_acquisition_worker', 'r'),
        ('orgunit_research_runs', 'root_scope', 'nwf_acquisition_worker', 'r'),
        ('source_discovery_nominations', 'id', 'nwf_acquisition_worker', 'r'),
        ('source_discovery_nominations', 'registrable_domain', 'nwf_acquisition_worker', 'r'),
        ('source_discovery_nominations', 'url', 'nwf_acquisition_worker', 'r'),
        ('subject_research_admissions', 'id', 'nwf_discovery_subject_writer', 'r'),
        ('subject_research_admissions', 'subject_id', 'nwf_discovery_subject_writer', 'r'),
        ('website_claims', 'registrable_domain', 'nwf_source_discovery', 'r')
),
actual_colacl(relname, attname, grantee, privs) AS (
    SELECT c.relname::text, a.attname::text,
           CASE WHEN split_part(i::text, '=', 1) = '' THEN 'PUBLIC'
                ELSE split_part(i::text, '=', 1) END,
           split_part(split_part(i::text, '=', 2), '/', 1)
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
     CROSS JOIN LATERAL unnest(a.attacl) AS i
     WHERE c.relnamespace = 'public'::regnamespace AND a.attacl IS NOT NULL
),
-- R3. Database privileges (c = CONNECT); no PUBLIC entry, no TEMPORARY.
expected_dbacl(grantee, privs) AS (
    VALUES
        ('nwf_acquisition_worker', 'c'),
        ('nwf_classifier', 'c'),
        ('nwf_discovery_subject_reviewer', 'c'),
        ('nwf_discovery_subject_writer', 'c'),
        ('nwf_ingest', 'c'),
        ('nwf_readonly', 'c'),
        ('nwf_research', 'c'),
        ('nwf_source_discovery', 'c')
),
actual_dbacl(grantee, privs) AS (
    SELECT CASE WHEN split_part(i::text, '=', 1) = '' THEN 'PUBLIC'
                ELSE split_part(i::text, '=', 1) END,
           split_part(split_part(i::text, '=', 2), '/', 1)
      FROM pg_catalog.pg_database d
     CROSS JOIN LATERAL unnest(d.datacl) AS i
     WHERE d.datname = current_database()
       AND split_part(i::text, '=', 1) <> pg_catalog.pg_get_userbyid(d.datdba)
),
-- R4. Schema public privileges (U = USAGE).
expected_nspacl(grantee, privs) AS (
    VALUES
        ('nwf_acquisition_worker', 'U'),
        ('nwf_classifier', 'U'),
        ('nwf_discovery_subject_reviewer', 'U'),
        ('nwf_discovery_subject_writer', 'U'),
        ('nwf_ingest', 'U'),
        ('nwf_readonly', 'U'),
        ('nwf_research', 'U'),
        ('nwf_source_discovery', 'U')
),
actual_nspacl(grantee, privs) AS (
    SELECT CASE WHEN split_part(i::text, '=', 1) = '' THEN 'PUBLIC'
                ELSE split_part(i::text, '=', 1) END,
           split_part(split_part(i::text, '=', 2), '/', 1)
      FROM pg_catalog.pg_namespace n
     CROSS JOIN LATERAL unnest(n.nspacl) AS i
     WHERE n.nspname = 'public'
       AND split_part(i::text, '=', 1) <> pg_catalog.pg_get_userbyid(n.nspowner)
),
-- F1. Every function in schema public and its pinned configuration. ''
--     means NO pinned search_path: the fourteen functions so marked were
--     committed that way by migrations 0011 and 0013-0021 (runbook s1.3).
expected_fn(signature, config) AS (
    VALUES
        ('acquisition_campaign_control_state(uuid)', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_campaign_lock_key(uuid)', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_campaign_spend(uuid)', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_campaign_subject_verify_insert()', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_campaign_verify_insert()', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_claim_lease_until(uuid)', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_claim_verify_insert()', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_control_verify_insert()', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_is_owner_path()', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_item_in_flight(uuid)', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_item_lock_key(uuid)', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_lease_extension_verify_insert()', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_outbox_entry_verify_insert()', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_outcome_verify_insert()', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_signal_verify_insert()', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_stage_ordinal(text)', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_work_item_shape_verify()', 'search_path=public, pg_catalog, pg_temp'),
        ('acquisition_work_item_verify_insert()', 'search_path=public, pg_catalog, pg_temp'),
        ('discovery_identity_bind_writer_actor()', ''),
        ('discovery_identity_refuse_mutation()', ''),
        ('discovery_identity_text_admissible(text)', ''),
        ('discovery_identity_url_admissible(text)', ''),
        ('discovery_review_bind_reviewer_actor()', ''),
        ('discovery_review_require_attestation()', ''),
        ('orgunit_classifier_calls_refuse_repair_of_repair()', ''),
        ('source_discovery_require_grant_use()', 'search_path=public, pg_catalog, pg_temp'),
        ('source_discovery_verify_grant()', 'search_path=public, pg_catalog, pg_temp'),
        ('source_discovery_verify_grant_use()', 'search_path=public, pg_catalog, pg_temp'),
        ('source_discovery_verify_known_mark()', 'search_path=public, pg_catalog, pg_temp'),
        ('source_discovery_verify_nomination()', ''),
        ('source_discovery_verify_nomination_identity()', ''),
        ('source_discovery_verify_nomination_sighting()', ''),
        ('source_discovery_verify_query_call()', 'search_path=public, pg_catalog, pg_temp'),
        ('source_discovery_verify_query_call_start()', 'search_path=public, pg_catalog, pg_temp'),
        ('source_discovery_verify_run_completion()', 'search_path=public, pg_catalog, pg_temp'),
        ('source_discovery_verify_smoke_verification()', 'search_path=public, pg_catalog, pg_temp'),
        ('subject_iso3166_alpha2_assigned(text)', ''),
        ('subject_jurisdiction_writer_scope()', ''),
        ('subject_research_admission_campaign_verify()', 'search_path=public, pg_catalog, pg_temp'),
        ('subject_research_admission_stamp()', ''),
        ('subject_review_attestation_bind()', '')
),
actual_fn(signature, config) AS (
    SELECT p.oid::regprocedure::text,
           coalesce(array_to_string(p.proconfig, ';'), '')
      FROM pg_catalog.pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
),
-- T1. Every user trigger in schema public: (table, trigger, function, tgtype).
--     tgtype 27 = row-level BEFORE on two mutating events (the append-only
--     refusal); 7 = row-level BEFORE on append; 5 = row-level AFTER on
--     append (the two deferred constraint triggers); 34 = statement-level
--     BEFORE on emptying the table.
expected_trg(relname, tgname, proname, tgtype) AS (
    VALUES
        ('acquisition_campaign_control_events', 'acquisition_control_append_only', 'discovery_identity_refuse_mutation', 27),
        ('acquisition_campaign_control_events', 'acquisition_control_verify', 'acquisition_control_verify_insert', 7),
        ('acquisition_campaign_subjects', 'acquisition_campaign_subjects_append_only', 'discovery_identity_refuse_mutation', 27),
        ('acquisition_campaign_subjects', 'acquisition_campaign_subjects_verify', 'acquisition_campaign_subject_verify_insert', 7),
        ('acquisition_campaigns', 'acquisition_campaigns_append_only', 'discovery_identity_refuse_mutation', 27),
        ('acquisition_campaigns', 'acquisition_campaigns_verify', 'acquisition_campaign_verify_insert', 7),
        ('acquisition_claim_lease_extensions', 'acquisition_lease_extensions_append_only', 'discovery_identity_refuse_mutation', 27),
        ('acquisition_claim_lease_extensions', 'acquisition_lease_extensions_verify', 'acquisition_lease_extension_verify_insert', 7),
        ('acquisition_outbox_entries', 'acquisition_outbox_entries_append_only', 'discovery_identity_refuse_mutation', 27),
        ('acquisition_outbox_entries', 'acquisition_outbox_entries_verify', 'acquisition_outbox_entry_verify_insert', 7),
        ('acquisition_signals', 'acquisition_signals_append_only', 'discovery_identity_refuse_mutation', 27),
        ('acquisition_signals', 'acquisition_signals_verify', 'acquisition_signal_verify_insert', 7),
        ('acquisition_work_claims', 'acquisition_work_claims_append_only', 'discovery_identity_refuse_mutation', 27),
        ('acquisition_work_claims', 'acquisition_work_claims_verify', 'acquisition_claim_verify_insert', 7),
        ('acquisition_work_items', 'acquisition_work_items_append_only', 'discovery_identity_refuse_mutation', 27),
        ('acquisition_work_items', 'acquisition_work_items_verify', 'acquisition_work_item_verify_insert', 7),
        ('acquisition_work_items', 'acquisition_work_items_verify_shape', 'acquisition_work_item_shape_verify', 7),
        ('acquisition_work_outcomes', 'acquisition_work_outcomes_append_only', 'discovery_identity_refuse_mutation', 27),
        ('acquisition_work_outcomes', 'acquisition_work_outcomes_verify', 'acquisition_outcome_verify_insert', 7),
        ('acquisition_worker_stops', 'acquisition_worker_stops_append_only', 'discovery_identity_refuse_mutation', 27),
        ('discovery_subject_identity_claims', 'discovery_subject_identity_claims_append_only', 'discovery_identity_refuse_mutation', 27),
        ('discovery_subject_identity_claims', 'discovery_subject_identity_claims_writer_actor', 'discovery_identity_bind_writer_actor', 7),
        ('discovery_subject_relationship_claims', 'discovery_subject_relationship_claims_append_only', 'discovery_identity_refuse_mutation', 27),
        ('discovery_subject_relationship_claims', 'discovery_subject_relationship_claims_writer_actor', 'discovery_identity_bind_writer_actor', 7),
        ('discovery_subject_reviews', 'discovery_subject_reviews_append_only', 'discovery_identity_refuse_mutation', 27),
        ('discovery_subject_reviews', 'discovery_subject_reviews_require_attestation', 'discovery_review_require_attestation', 5),
        ('discovery_subject_reviews', 'discovery_subject_reviews_reviewer_actor', 'discovery_review_bind_reviewer_actor', 7),
        ('discovery_subjects', 'discovery_subjects_append_only', 'discovery_identity_refuse_mutation', 27),
        ('discovery_subjects', 'discovery_subjects_writer_actor', 'discovery_identity_bind_writer_actor', 7),
        ('orgunit_classifier_calls', 'orgunit_classifier_calls_refuse_repair_of_repair', 'orgunit_classifier_calls_refuse_repair_of_repair', 7),
        ('source_discovery_briefs', 'source_discovery_briefs_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_grant_uses', 'source_discovery_grant_uses_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_grant_uses', 'source_discovery_grant_uses_verify', 'source_discovery_verify_grant_use', 7),
        ('source_discovery_grants', 'source_discovery_grants_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_grants', 'source_discovery_grants_verify', 'source_discovery_verify_grant', 7),
        ('source_discovery_nomination_identities', 'source_discovery_nomination_identities_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_nomination_identities', 'source_discovery_nomination_identities_verify', 'source_discovery_verify_nomination_identity', 7),
        ('source_discovery_nomination_known_marks', 'source_discovery_nomination_known_marks_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_nomination_known_marks', 'source_discovery_nomination_known_marks_verify', 'source_discovery_verify_known_mark', 7),
        ('source_discovery_nomination_sightings', 'source_discovery_nomination_sightings_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_nomination_sightings', 'source_discovery_nomination_sightings_verify', 'source_discovery_verify_nomination_sighting', 7),
        ('source_discovery_nominations', 'source_discovery_nominations_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_nominations', 'source_discovery_nominations_verify', 'source_discovery_verify_nomination', 7),
        ('source_discovery_query_call_starts', 'source_discovery_query_call_starts_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_query_call_starts', 'source_discovery_query_call_starts_verify', 'source_discovery_verify_query_call_start', 7),
        ('source_discovery_query_calls', 'source_discovery_query_calls_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_query_calls', 'source_discovery_query_calls_verify', 'source_discovery_verify_query_call', 7),
        ('source_discovery_run_completions', 'source_discovery_run_completions_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_run_completions', 'source_discovery_run_completions_verify', 'source_discovery_verify_run_completion', 7),
        ('source_discovery_runs', 'source_discovery_runs_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_runs', 'source_discovery_runs_live_requires_grant', 'source_discovery_require_grant_use', 5),
        ('source_discovery_smoke_verifications', 'source_discovery_smoke_verifications_append_only', 'discovery_identity_refuse_mutation', 27),
        ('source_discovery_smoke_verifications', 'source_discovery_smoke_verifications_verify', 'source_discovery_verify_smoke_verification', 7),
        ('subject_jurisdiction_claims', 'subject_jurisdiction_claims_append_only', 'discovery_identity_refuse_mutation', 27),
        ('subject_jurisdiction_claims', 'subject_jurisdiction_claims_writer_actor', 'discovery_identity_bind_writer_actor', 7),
        ('subject_jurisdiction_claims', 'subject_jurisdiction_claims_writer_scope', 'subject_jurisdiction_writer_scope', 7),
        ('subject_research_admission_revocations', 'subject_research_admission_revocations_append_only', 'discovery_identity_refuse_mutation', 27),
        ('subject_research_admissions', 'subject_research_admissions_append_only', 'discovery_identity_refuse_mutation', 27),
        ('subject_research_admissions', 'subject_research_admissions_campaign_verify', 'subject_research_admission_campaign_verify', 7),
        ('subject_research_admissions', 'subject_research_admissions_stamp', 'subject_research_admission_stamp', 7),
        ('subject_review_attestations', 'subject_review_attestations_append_only', 'discovery_identity_refuse_mutation', 27),
        ('subject_review_attestations', 'subject_review_attestations_bind', 'subject_review_attestation_bind', 7),
        ('subject_review_environment', 'subject_review_environment_append_only', 'discovery_identity_refuse_mutation', 27),
        ('subject_review_environment', 'subject_review_environment_no_truncate', 'discovery_identity_refuse_mutation', 34)
),
actual_trg(relname, tgname, proname, tgtype) AS (
    SELECT c.relname::text, t.tgname::text, p.proname::text, t.tgtype::integer
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
),
-- The thirty-one base tables migrations 0013-0025 add.
new_tables(relname) AS (
    VALUES
        ('acquisition_campaign_control_events'),
        ('acquisition_campaign_subjects'),
        ('acquisition_campaigns'),
        ('acquisition_claim_lease_extensions'),
        ('acquisition_outbox_entries'),
        ('acquisition_signals'),
        ('acquisition_work_claims'),
        ('acquisition_work_items'),
        ('acquisition_work_outcomes'),
        ('acquisition_worker_stops'),
        ('discovery_subject_identity_claims'),
        ('discovery_subject_relationship_claims'),
        ('discovery_subject_reviews'),
        ('discovery_subjects'),
        ('source_discovery_briefs'),
        ('source_discovery_grant_uses'),
        ('source_discovery_grants'),
        ('source_discovery_nomination_identities'),
        ('source_discovery_nomination_known_marks'),
        ('source_discovery_nomination_sightings'),
        ('source_discovery_nominations'),
        ('source_discovery_query_call_starts'),
        ('source_discovery_query_calls'),
        ('source_discovery_run_completions'),
        ('source_discovery_runs'),
        ('source_discovery_smoke_verifications'),
        ('subject_jurisdiction_claims'),
        ('subject_research_admission_revocations'),
        ('subject_research_admissions'),
        ('subject_review_attestations'),
        ('subject_review_environment')
),
capability_roles(rolname) AS (
    VALUES
        ('nwf_discovery_subject_writer'),
        ('nwf_discovery_subject_reviewer'),
        ('nwf_source_discovery'),
        ('nwf_acquisition_worker')
),
checks(check_id, ok, detail) AS (
    SELECT 'L1 ledger 0013-0025 equals the runbook table',
           NOT EXISTS ((SELECT * FROM expected_ledger EXCEPT SELECT * FROM actual_ledger)
                       UNION ALL
                       (SELECT * FROM actual_ledger EXCEPT SELECT * FROM expected_ledger)),
           (SELECT count(*) FROM actual_ledger) || ' rows >= 0013'
    UNION ALL
    SELECT 'L2 ledger is exactly 0001-0025, no gap, nothing newer',
           (SELECT array_agg(version ORDER BY version) FROM public.schema_migrations)
             = (SELECT array_agg(lpad(g::text, 4, '0') ORDER BY g) FROM generate_series(1, 25) AS g),
           (SELECT count(*) FROM public.schema_migrations) || ' rows'
    UNION ALL
    SELECT 'R1 the four capability roles exist, NOLOGIN, no attribute, no password',
           (SELECT count(*) FROM pg_catalog.pg_authid a JOIN capability_roles r ON r.rolname = a.rolname
             WHERE NOT a.rolcanlogin AND NOT a.rolsuper AND NOT a.rolcreatedb AND NOT a.rolcreaterole
               AND NOT a.rolreplication AND NOT a.rolbypassrls
               AND a.rolpassword IS NULL AND a.rolvaliduntil IS NULL) = 4,
           (SELECT string_agg(a.rolname || ':login=' || a.rolcanlogin, ' ' ORDER BY a.rolname)
              FROM pg_catalog.pg_authid a JOIN capability_roles r ON r.rolname = a.rolname)
    UNION ALL
    SELECT 'R2 no role is a member of a capability role, and they are members of none',
           NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
                        WHERE m.roleid IN (SELECT oid FROM pg_catalog.pg_roles
                                            WHERE rolname IN (SELECT rolname FROM capability_roles))
                           OR m.member IN (SELECT oid FROM pg_catalog.pg_roles
                                            WHERE rolname IN (SELECT rolname FROM capability_roles))),
           (SELECT count(*) FROM pg_catalog.pg_auth_members m
              JOIN pg_catalog.pg_roles r ON r.oid IN (m.roleid, m.member)
             WHERE r.rolname IN (SELECT rolname FROM capability_roles)) || ' membership rows'
    UNION ALL
    SELECT 'R3 database privileges: CONNECT only, exactly these eight roles',
           NOT EXISTS ((SELECT * FROM expected_dbacl EXCEPT SELECT * FROM actual_dbacl)
                       UNION ALL
                       (SELECT * FROM actual_dbacl EXCEPT SELECT * FROM expected_dbacl)),
           (SELECT string_agg(grantee || '=' || privs, ' ' ORDER BY grantee) FROM actual_dbacl)
    UNION ALL
    SELECT 'R4 schema public: USAGE only, exactly these eight roles',
           NOT EXISTS ((SELECT * FROM expected_nspacl EXCEPT SELECT * FROM actual_nspacl)
                       UNION ALL
                       (SELECT * FROM actual_nspacl EXCEPT SELECT * FROM expected_nspacl)),
           (SELECT count(*) FROM actual_nspacl) || ' entries'
    UNION ALL
    SELECT 'G1 relation privileges equal the expected map exactly (all relations)',
           NOT EXISTS ((SELECT * FROM expected_acl EXCEPT SELECT * FROM actual_acl)
                       UNION ALL
                       (SELECT * FROM actual_acl EXCEPT SELECT * FROM expected_acl)),
           'missing=' || (SELECT count(*) FROM (SELECT * FROM expected_acl EXCEPT SELECT * FROM actual_acl) x)
             || ' unexpected=' || (SELECT count(*) FROM (SELECT * FROM actual_acl EXCEPT SELECT * FROM expected_acl) y)
    UNION ALL
    SELECT 'G2 column privileges equal the expected map exactly',
           NOT EXISTS ((SELECT * FROM expected_colacl EXCEPT SELECT * FROM actual_colacl)
                       UNION ALL
                       (SELECT * FROM actual_colacl EXCEPT SELECT * FROM expected_colacl)),
           (SELECT count(*) FROM actual_colacl) || ' column entries'
    UNION ALL
    SELECT 'G3 no runtime role holds a mutating privilege beyond append',
           NOT EXISTS (SELECT 1 FROM actual_acl
                        WHERE grantee <> 'nwf_ingest' AND privs ~ '[wdDxtm]')
           AND NOT EXISTS (SELECT 1 FROM actual_acl
                            WHERE grantee = 'nwf_ingest' AND privs ~ '[dDxtm]'),
           'letters other than r/a are reserved to the pre-0013 nwf_ingest rows'
    UNION ALL
    SELECT 'G4 no default privileges are configured',
           NOT EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl),
           (SELECT count(*) FROM pg_catalog.pg_default_acl) || ' rows'
    UNION ALL
    SELECT 'F1 functions in public and their pinned search_path equal the expected list',
           NOT EXISTS ((SELECT * FROM expected_fn EXCEPT SELECT * FROM actual_fn)
                       UNION ALL
                       (SELECT * FROM actual_fn EXCEPT SELECT * FROM expected_fn)),
           (SELECT count(*) FROM actual_fn) || ' functions, '
             || (SELECT count(*) FROM actual_fn WHERE config <> '') || ' pinned'
    UNION ALL
    SELECT 'F2 every pinned function pins exactly search_path = public, pg_catalog, pg_temp',
           (SELECT count(*) FROM actual_fn
             WHERE config = 'search_path=public, pg_catalog, pg_temp') = 27
           AND NOT EXISTS (SELECT 1 FROM actual_fn
                            WHERE config NOT IN ('', 'search_path=public, pg_catalog, pg_temp')),
           (SELECT count(*) FROM actual_fn
             WHERE config = 'search_path=public, pg_catalog, pg_temp') || ' pinned'
    UNION ALL
    SELECT 'F3 no SECURITY DEFINER function in public',
           NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc
                        WHERE pronamespace = 'public'::regnamespace AND prosecdef),
           (SELECT count(*) FROM pg_catalog.pg_proc
             WHERE pronamespace = 'public'::regnamespace AND prosecdef) || ' definer functions'
    UNION ALL
    SELECT 'T1 user triggers in public equal the expected list, all enabled',
           NOT EXISTS ((SELECT * FROM expected_trg EXCEPT SELECT * FROM actual_trg)
                       UNION ALL
                       (SELECT * FROM actual_trg EXCEPT SELECT * FROM expected_trg))
           AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
                             JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
                            WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
                              AND t.tgenabled <> 'O'),
           (SELECT count(*) FROM actual_trg) || ' triggers'
    UNION ALL
    SELECT 'T2 every new base table carries the append-only refusal trigger',
           (SELECT count(DISTINCT n.relname) FROM new_tables n
              JOIN actual_trg t ON t.relname = n.relname
             WHERE t.proname = 'discovery_identity_refuse_mutation' AND t.tgtype = 27) = 31,
           (SELECT count(*) FROM new_tables) || ' new base tables'
    UNION ALL
    SELECT 'V1 acquisition_work_item_states is security_invoker',
           (SELECT reloptions FROM pg_catalog.pg_class
             WHERE oid = 'public.acquisition_work_item_states'::regclass) @> ARRAY['security_invoker=true'],
           ''
    UNION ALL
    SELECT 'C1 every constraint in public is validated',
           NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                        WHERE connamespace = 'public'::regnamespace AND NOT convalidated),
           ''
    UNION ALL
    SELECT 'C2 research roots are ECHE only, no subject-admission root on any fetch',
           NOT EXISTS (SELECT 1 FROM public.orgunit_research_runs WHERE root_scope <> 'ECHE')
           AND NOT EXISTS (SELECT 1 FROM public.orgunit_page_candidates WHERE run_root_scope <> 'ECHE')
           AND NOT EXISTS (SELECT 1 FROM public.orgunit_fetch_observations
                            WHERE root_subject_admission_id IS NOT NULL),
           ''
    UNION ALL
    SELECT 'X1 no page evidence carries extraction label orgunit-extraction-v3',
           NOT EXISTS (SELECT 1 FROM public.orgunit_page_evidence
                        WHERE rule_version = 'orgunit-extraction-v3'),
           (SELECT count(*) FROM public.orgunit_page_evidence
             WHERE rule_version = 'orgunit-extraction-v3') || ' v3 rows'
    UNION ALL
    SELECT 'N registry fingerprint is all zero',
           (SELECT fingerprint FROM public.subject_research_registry_fingerprint) = 's=0;i=0;r=0;v=0;a=0',
           (SELECT fingerprint FROM public.subject_research_registry_fingerprint)
    UNION ALL
    SELECT 'N acquisition_work_item_states (view)',
           (SELECT count(*) FROM public.acquisition_work_item_states) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_work_item_states)
    UNION ALL
    SELECT 'N acquisition_campaign_control_events', (SELECT count(*) FROM public.acquisition_campaign_control_events) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_campaign_control_events) || ' expected=0'
    UNION ALL
    SELECT 'N acquisition_campaign_subjects', (SELECT count(*) FROM public.acquisition_campaign_subjects) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_campaign_subjects) || ' expected=0'
    UNION ALL
    SELECT 'N acquisition_campaigns', (SELECT count(*) FROM public.acquisition_campaigns) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_campaigns) || ' expected=0'
    UNION ALL
    SELECT 'N acquisition_claim_lease_extensions', (SELECT count(*) FROM public.acquisition_claim_lease_extensions) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_claim_lease_extensions) || ' expected=0'
    UNION ALL
    SELECT 'N acquisition_outbox_entries', (SELECT count(*) FROM public.acquisition_outbox_entries) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_outbox_entries) || ' expected=0'
    UNION ALL
    SELECT 'N acquisition_signals', (SELECT count(*) FROM public.acquisition_signals) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_signals) || ' expected=0'
    UNION ALL
    SELECT 'N acquisition_work_claims', (SELECT count(*) FROM public.acquisition_work_claims) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_work_claims) || ' expected=0'
    UNION ALL
    SELECT 'N acquisition_work_items', (SELECT count(*) FROM public.acquisition_work_items) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_work_items) || ' expected=0'
    UNION ALL
    SELECT 'N acquisition_work_outcomes', (SELECT count(*) FROM public.acquisition_work_outcomes) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_work_outcomes) || ' expected=0'
    UNION ALL
    SELECT 'N acquisition_worker_stops', (SELECT count(*) FROM public.acquisition_worker_stops) = 0,
           'rows=' || (SELECT count(*) FROM public.acquisition_worker_stops) || ' expected=0'
    UNION ALL
    SELECT 'N discovery_subject_identity_claims', (SELECT count(*) FROM public.discovery_subject_identity_claims) = 0,
           'rows=' || (SELECT count(*) FROM public.discovery_subject_identity_claims) || ' expected=0'
    UNION ALL
    SELECT 'N discovery_subject_relationship_claims', (SELECT count(*) FROM public.discovery_subject_relationship_claims) = 0,
           'rows=' || (SELECT count(*) FROM public.discovery_subject_relationship_claims) || ' expected=0'
    UNION ALL
    SELECT 'N discovery_subject_reviews', (SELECT count(*) FROM public.discovery_subject_reviews) = 0,
           'rows=' || (SELECT count(*) FROM public.discovery_subject_reviews) || ' expected=0'
    UNION ALL
    SELECT 'N discovery_subjects', (SELECT count(*) FROM public.discovery_subjects) = 0,
           'rows=' || (SELECT count(*) FROM public.discovery_subjects) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_briefs', (SELECT count(*) FROM public.source_discovery_briefs) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_briefs) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_grant_uses', (SELECT count(*) FROM public.source_discovery_grant_uses) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_grant_uses) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_grants', (SELECT count(*) FROM public.source_discovery_grants) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_grants) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_nomination_identities', (SELECT count(*) FROM public.source_discovery_nomination_identities) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_nomination_identities) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_nomination_known_marks', (SELECT count(*) FROM public.source_discovery_nomination_known_marks) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_nomination_known_marks) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_nomination_sightings', (SELECT count(*) FROM public.source_discovery_nomination_sightings) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_nomination_sightings) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_nominations', (SELECT count(*) FROM public.source_discovery_nominations) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_nominations) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_query_call_starts', (SELECT count(*) FROM public.source_discovery_query_call_starts) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_query_call_starts) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_query_calls', (SELECT count(*) FROM public.source_discovery_query_calls) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_query_calls) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_run_completions', (SELECT count(*) FROM public.source_discovery_run_completions) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_run_completions) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_runs', (SELECT count(*) FROM public.source_discovery_runs) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_runs) || ' expected=0'
    UNION ALL
    SELECT 'N source_discovery_smoke_verifications', (SELECT count(*) FROM public.source_discovery_smoke_verifications) = 0,
           'rows=' || (SELECT count(*) FROM public.source_discovery_smoke_verifications) || ' expected=0'
    UNION ALL
    SELECT 'N subject_jurisdiction_claims', (SELECT count(*) FROM public.subject_jurisdiction_claims) = 0,
           'rows=' || (SELECT count(*) FROM public.subject_jurisdiction_claims) || ' expected=0'
    UNION ALL
    SELECT 'N subject_research_admission_revocations', (SELECT count(*) FROM public.subject_research_admission_revocations) = 0,
           'rows=' || (SELECT count(*) FROM public.subject_research_admission_revocations) || ' expected=0'
    UNION ALL
    SELECT 'N subject_research_admissions', (SELECT count(*) FROM public.subject_research_admissions) = 0,
           'rows=' || (SELECT count(*) FROM public.subject_research_admissions) || ' expected=0'
    UNION ALL
    SELECT 'N subject_review_attestations', (SELECT count(*) FROM public.subject_review_attestations) = 0,
           'rows=' || (SELECT count(*) FROM public.subject_review_attestations) || ' expected=0'
    UNION ALL
    SELECT 'N subject_review_environment', (SELECT count(*) FROM public.subject_review_environment) = 1,
           'rows=' || (SELECT count(*) FROM public.subject_review_environment) || ' expected=1'
)
SELECT check_id AS "check", ok, detail FROM checks
UNION ALL
SELECT 'ALL_CHECKS_TRUE', bool_and(ok) AND count(*) = 52, count(*) || ' checks' FROM checks;

ROLLBACK;
