# ADR 0026 - Independent source-discovery nominations (REL L2 / U1)

Status: Proposed (local implementation under the OWNER directive of
2026-10-26; recorded in
`docs/evaluation/REL_L2_SOURCE_DISCOVERY_OWNER_DIRECTIVE_RECORD_V1.json`).
The number may need renumbering if a parallel lane lands an ADR 0026 first.

## Context

Organisations entered the engine only from official registers or when an
operator proposed a discovery subject by hand. Off-domain anchors found during
bounded acquisition were discarded. The audience NWF serves - language
learners - is reached through community associations, language cafes,
cultural institutes, small schools and clubs that no register lists, in any
country. The pilot geographies are Japan, Mexico and the Netherlands.

## Decision

1. A separate namespace, `src/orgunits/sourceDiscovery/`, NOMINATES public
   URLs. It never fetches, classifies, merges or roots research in one. It does
   not import `src/orgunits/classify/` and the classifier does not import it
   (`relL2SourceDiscovery.firewall.test.ts`).
2. Migration 0019 adds three append-only tables (briefs, runs, nominations)
   and the NOLOGIN capability `nwf_source_discovery` (SELECT + INSERT, plus
   two read-only column grants used to MEASURE). A nomination's URL passes the
   same admissibility as a discovery-subject PUBLIC_URL (no social or
   messaging host, no query, no port, no userinfo), its title and snippet are
   redacted, the same registrable domain within one run is one row, and
   `eche_overlap` is recomputed by the database on INSERT - a measurement,
   never a merge. `hei_signal` is a versioned flag, not a verdict.
3. Briefs are deterministic, versioned query plans identified by digest. The
   pilot brief `nwf-discovery-brief-v1` holds local-language and English
   queries for JP, MX and NL. A geography is read only to select a section of
   the brief's own claim; no nomination carries a country.
4. Search goes through a `SearchProvider` port. The Claude Max adapter offers,
   allows and permits `WebSearch` only, takes an injected SDK `query`, and
   requires a `SourceDiscoveryAuthorisation` whose only constructor throws
   outside vitest. Live search is NOT authorised; `discover-sources --execute`
   refuses.
5. `runRootAcquisition` hands off-domain anchors of persisted pages to an
   optional sink (default no-op); they become PAGE_LINK_OUT nominations citing
   the page evidence and are never fetched.
6. `orgunits nominations promote` turns ONE nomination into ONE discovery
   subject through the existing B2.2 writer; the name claim cites the
   nomination as a PUBLIC_URL source observed at its retrieval time. Nothing
   promotes automatically.

7. REL P2 (OWNER directives of 2026-10-27, recorded in
   `docs/evaluation/REL_P2_LINK_OUT_NOMINATIONS_OWNER_DIRECTIVE_RECORD_V1.json`)
   completes PERSISTENT link-out nominations under the existing capability:
   - Migration 0020 adds two append-only tables granted SELECT + INSERT to
     `nwf_source_discovery` and SELECT to `nwf_readonly`, and nothing else:
     `source_discovery_nomination_identities` (ONE row per nominated
     registrable domain, across runs and methods, naming its FIRST
     nomination) and `source_discovery_nomination_sightings` (ONE row per
     link-out nomination, source page evidence and URL, with the redacted
     anchor text and the page's own `observed_at`). 0019's per-run dedupe is
     unchanged; what it used to DROP - a second page, a later run - is now
     kept as a sighting. The database re-checks that an identity's first
     nomination carries its domain and that a sighting belongs to a
     PAGE_LINK_OUT nomination of the same domain, observed when its page was.
   - Only an identity's first nomination is promotable
     (`NOMINATION_NOT_CANONICAL` otherwise), so one domain cannot be promoted
     from two nominations. `orgunits nominations show` prints a nomination,
     its identity and a bounded page of sightings (readonly role).
   - `orgunits subjects research --execute` records link-outs when
     `DATABASE_URL_SOURCE_DISCOVERY` names a login holding the capability, and
     says they were DISCARDED when it is not set (no silent zero, no
     fallback). Subject research refuses a link-out login that cannot enter
     the capability BEFORE the run starts (`LINK_OUT_CAPABILITY_REFUSED`).
   - No migration gives the capability LOGIN. A disposable, NOINHERIT,
     SET-ROLE-only login is created only in a loopback `*_test` database
     (`src/test/helpers/sourceDiscoveryLogin.ts`,
     `scripts/disposable-source-discovery-login.ts`).
   - A nomination, identity or sighting authorises NO fetch. Another
     registrable domain is fetched only after promote -> review -> OWNER
     admission -> research of that subject, under its own admission; the
     gateway's root scope is unchanged (`relP2LinkOutNominations.test.ts`).

## Consequences

Open: wiring a real Agent SDK `query`, the subscription profile and the ADR
0010 auth-conflict guard into the adapter; verifying how structured output
interacts with a WebSearch-only `canUseTool`; a run-completion record for
discovery runs; and the OWNER decision to apply 0019 and 0020 to any
persistent database (the H5 runbook names 0013-0019 only) and to provision a
deployment login for `DATABASE_URL_SOURCE_DISCOVERY`.
