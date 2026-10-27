/**
 * REL P1 - THE PURE QUALIFICATION-INPUT EXPORT BUILDER.
 *
 * `buildQualificationInputExport(records, options)` turns the stored records
 * `load.ts` reads for ONE discovery subject into one
 * `nwf-pe.qualification-input-export.v1` document (`contract.ts`). It reads
 * nothing but its arguments - no clock (the evaluation instant is an option,
 * or the database clock the loader read), no randomness, no environment - so
 * equal records and an equal evaluation instant give byte-identical output.
 * Every list is sorted before it is emitted.
 *
 * THE RULES (`nwf-pe-qualification-input-producer-v1`):
 *
 *   as of       a record counts only if it was CREATED (recorded, admitted,
 *               completed) at or before `evaluatedAt`; a revocation counts
 *               from its own instant. `evaluatedAt` after the database clock
 *               is refused: the evidence set of the future is not fixed.
 *   refusal     a subject that does not exist as of `evaluatedAt`, or carries
 *               ANY stored DISPUTED/REJECTED review, is refused - never
 *               exported with its evidence quietly dropped.
 *   research    only COMPLETED, non-dry runs rooted in one of this subject's
 *               admissions (`subject_admission:<id>`) that was not revoked by
 *               `evaluatedAt`, and whose root website claim carries no
 *               negative review. Each admitted root website is ONE channel:
 *               RESOURCE_PAGE, PUBLIC (fetched without credentials).
 *   publisher   SELF when the source URL's ICANN registrable domain is the
 *               registrable domain of one of this subject's researched root
 *               websites; THIRD_PARTY otherwise (a listing is never assumed
 *               to be the subject's own).
 *   modes       channel.existence / operator_binding / static_currency:
 *               OBSERVED, EXACT, produced by NWF_SYSTEM (the Engine's own
 *               capture). candidate.location / candidate.kind: recorded by a
 *               person from a cited source, so HUMAN_RESEARCHER, and
 *               SELF_ASSERTED + EXACT from a SELF source, THIRD_PARTY_ASSERTED
 *               + LIKELY otherwise. Provenance never raises a mode.
 *   country     `deriveJurisdictionStanding` over the subject's own ADR 0024
 *               claims: STATED -> one candidate.location claim per agreeing
 *               COUNTRY_OF_OPERATION record, and `country.value`; UNKNOWN or
 *               CONFLICTING -> no location claim and `country.value: null`.
 */
import { icannRegistrableDomain } from '../../website/parse.js';
import { nominationCitationDigestOf, type JurisdictionClaimRow } from '../subjectFacts/facts.js';
import { deriveJurisdictionStanding } from '../subjectJurisdiction/standing.js';
import {
  ENGINE_SOURCE_REPOSITORY,
  EVIDENCE_CLASS,
  INSTANT_RULE,
  LIMITATIONS,
  PERMISSIONS,
  QUALIFICATION_INPUT_EXPORT_CONTRACT,
  QUALIFICATION_INPUT_PRODUCER_VERSION,
  QualificationInputExportRefusal,
  REGISTRY_KIND_TO_C1,
  RESEARCH_REAL_CLAIM_PRODUCERS,
  RESEARCH_REAL_MODE_REPRODUCIBILITY,
  TARGET_CONTRACTS,
  UUID,
  WHOLE_SECOND_INSTANT,
  isHttpsLocator,
  rpRef,
  sha256Hex,
  toWholeSecond,
  type AssertionMode,
  type Attribution,
  type ClaimBasis,
  type ClaimProducer,
  type ClaimValue,
  type ExclusionReason,
  type ExportClaim,
  type ExportClaimLink,
  type ExportSource,
  type ExportedClaimKey,
  type PublisherRelation,
  type QualificationInputExportDocument,
  type ReadConsistencyClass,
  type ResearchRealConflict,
  type SourceRecord,
} from './contract.js';
import { STATED_DATE_RULE_VERSION, currentOrUpcomingYearDates } from './dates.js';

// ---------------------------------------------------------------------------
// Records, as the loader reads them (instants ISO-8601 ms UTC).
// ---------------------------------------------------------------------------

export type IdentitySourceType = 'PAGE_EVIDENCE' | 'WEBSITE_CLAIM' | 'PUBLIC_URL';

export interface IdentityClaimRow {
  readonly id: string;
  readonly subjectId: string;
  readonly claimKind: string;
  readonly claimedKind: string | null;
  readonly websiteUrl: string | null;
  readonly sourceType: IdentitySourceType;
  readonly sourcePageEvidenceId: string | null;
  readonly sourceWebsiteClaimId: string | null;
  readonly sourceUrl: string | null;
  readonly sourceVersionRef: string | null;
  readonly observedAt: string;
  readonly claimBasis: string;
  readonly createdAt: string;
}

export interface ReviewRow {
  readonly id: string;
  readonly targetKey: string;
  readonly outcome: string;
  readonly createdAt: string;
}

export interface AdmissionRow {
  readonly id: string;
  readonly subjectId: string;
  readonly identityClaimId: string;
  readonly websiteUrl: string;
  readonly admittedAt: string;
}

export interface RevocationRow {
  readonly id: string;
  readonly admissionId: string;
  readonly revokedAt: string;
}

export interface RunRow {
  readonly id: string;
  readonly rootScope: string;
  readonly dryRun: boolean;
  readonly completion: { readonly terminalState: string; readonly createdAt: string } | null;
}

export interface PageRow {
  readonly id: string;
  readonly fetchObservationId: string;
  readonly runId: string;
  readonly rootKey: string;
  readonly requestedUrl: string;
  readonly observedAt: string;
  readonly responseSha256: string | null;
  readonly title: string | null;
  readonly headings: readonly { readonly level: number; readonly text: string }[];
  readonly mainText: string;
  readonly ruleVersion: string;
  readonly createdAt: string;
}

export interface CandidateRow {
  readonly id: string;
  readonly pageEvidenceId: string;
  readonly track: string;
  readonly candidateScore: string;
  readonly rankWithinRoot: number;
  readonly ruleVersion: string;
}

export interface NominationRow {
  readonly id: string;
  readonly discoveryRunId: string;
  readonly url: string;
  readonly retrievedAt: string;
}

export interface WebsiteClaimSourceRow {
  readonly id: string;
  readonly ingestRunId: string;
  readonly normalisedUrl: string | null;
  readonly observedAt: string;
}

export interface QualificationInputRecords {
  /** The database clock when the snapshot was read (ms). Never exported. */
  readonly databaseNow: string;
  readonly subjectId: string;
  readonly subject: { readonly id: string; readonly createdAt: string } | null;
  readonly identityClaims: readonly IdentityClaimRow[];
  readonly reviews: readonly ReviewRow[];
  readonly jurisdictionClaims: readonly JurisdictionClaimRow[];
  readonly admissions: readonly AdmissionRow[];
  readonly revocations: readonly RevocationRow[];
  readonly runs: readonly RunRow[];
  /** Pages of the subject's runs AND any page an identity/jurisdiction claim cites. */
  readonly pages: readonly PageRow[];
  readonly candidates: readonly CandidateRow[];
  readonly nominations: readonly NominationRow[];
  readonly websiteClaims: readonly WebsiteClaimSourceRow[];
}

export interface BuildOptions {
  /** Whole-second UTC instant, or null for the database clock (truncated). */
  readonly evaluatedAt: string | null;
  readonly readConsistency: ReadConsistencyClass;
}

export const MAX_SOURCES = 2000;
export const MAX_CLAIMS = 2000;

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const NEGATIVE_OUTCOMES: ReadonlySet<string> = new Set(['DISPUTED', 'REJECTED']);
const ROOT_SCOPE = /^subject_admission:([0-9a-f-]{36})$/;

function domainOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    return icannRegistrableDomain(new URL(url).hostname);
  } catch {
    return null;
  }
}

/** The document for one subject. Throws `QualificationInputExportRefusal`. */
export function buildQualificationInputExport(
  records: QualificationInputRecords,
  options: BuildOptions,
): QualificationInputExportDocument {
  const subjectId = records.subjectId;
  if (!UUID.test(subjectId))
    throw new QualificationInputExportRefusal('ARGUMENT_INVALID', 'subjectId');
  const evaluatedAt = options.evaluatedAt ?? toWholeSecond(records.databaseNow);
  if (!WHOLE_SECOND_INSTANT.test(evaluatedAt) || Number.isNaN(Date.parse(evaluatedAt))) {
    throw new QualificationInputExportRefusal('ARGUMENT_INVALID', 'evaluatedAt');
  }
  const asOf = Date.parse(evaluatedAt);
  if (asOf > Date.parse(records.databaseNow)) {
    throw new QualificationInputExportRefusal('EVALUATED_AT_IN_THE_FUTURE', evaluatedAt);
  }
  const at = (instant: string) => Date.parse(instant) <= asOf;

  if (
    records.subject === null ||
    records.subject.id !== subjectId ||
    !at(records.subject.createdAt)
  ) {
    throw new QualificationInputExportRefusal('SUBJECT_NOT_FOUND', subjectId);
  }
  const identityClaims = records.identityClaims.filter((c) => at(c.createdAt));
  for (const c of identityClaims) {
    if (c.subjectId !== subjectId) {
      throw new QualificationInputExportRefusal('RECORD_INCONSISTENT', `identity claim ${c.id}`);
    }
  }
  const negative = new Set(
    records.reviews
      .filter((r) => at(r.createdAt) && NEGATIVE_OUTCOMES.has(r.outcome))
      .map((r) => r.targetKey),
  );
  if (negative.has(`subject:${subjectId}`)) {
    throw new QualificationInputExportRefusal('SUBJECT_NEGATIVE_REVIEW_RECORDED', subjectId);
  }
  const excluded: { ref: string; reason: ExclusionReason }[] = [];
  const claimExclusion = (c: IdentityClaimRow): ExclusionReason | null =>
    negative.has(`identity_claim:${c.id}`)
      ? 'IDENTITY_CLAIM_NEGATIVE_REVIEW'
      : c.claimBasis !== 'SOURCE_STATED'
        ? 'IDENTITY_CLAIM_INFERRED'
        : null;

  // ---- Research: admissions -> runs -> pages, as of evaluatedAt.
  const admissions = records.admissions.filter(
    (a) => a.subjectId === subjectId && at(a.admittedAt),
  );
  const revoked = new Set(
    records.revocations.filter((r) => at(r.revokedAt)).map((r) => r.admissionId),
  );
  const admissionById = new Map(admissions.map((a) => [a.id, a]));
  const claimById = new Map(identityClaims.map((c) => [c.id, c]));
  const includedRuns = new Map<string, AdmissionRow>();
  const researchRuns: QualificationInputExportDocument['researchRuns'][number][] = [];
  const pagesOfRun = (runId: string) =>
    records.pages.filter((p) => p.runId === runId && at(p.createdAt) && p.responseSha256 !== null);
  for (const run of [...records.runs].sort((a, b) => byCodeUnit(a.id, b.id))) {
    const admissionId = ROOT_SCOPE.exec(run.rootScope)?.[1];
    const admission = admissionId === undefined ? undefined : admissionById.get(admissionId);
    if (admission === undefined) continue;
    const root = claimById.get(admission.identityClaimId);
    let reason: ExclusionReason | null = null;
    if (run.dryRun) reason = 'RUN_IS_DRY_RUN';
    else if (
      run.completion === null ||
      run.completion.terminalState !== 'COMPLETED' ||
      !at(run.completion.createdAt)
    ) {
      reason = 'RUN_NOT_COMPLETED';
    } else if (revoked.has(admission.id)) reason = 'ADMISSION_REVOKED_BY_EVALUATED_AT';
    else if (root === undefined || negative.has(`identity_claim:${root.id}`)) {
      reason = 'ROOT_WEBSITE_CLAIM_NEGATIVE_REVIEW';
    }
    if (reason !== null) excluded.push({ ref: `research_run:${run.id}`, reason });
    else includedRuns.set(run.id, admission);
    researchRuns.push({
      runId: run.id,
      admissionId: admission.id,
      included: reason === null,
      pages: reason === null ? pagesOfRun(run.id).length : 0,
    });
  }

  // ---- Channels: one per admitted root website with included pages.
  const channelPages = new Map<string, PageRow[]>();
  const channelAdmissions = new Map<string, Set<string>>();
  for (const [runId, admission] of includedRuns) {
    const pages = pagesOfRun(runId);
    if (pages.length === 0) continue;
    const key = admission.identityClaimId;
    channelPages.set(key, [...(channelPages.get(key) ?? []), ...pages]);
    channelAdmissions.set(key, (channelAdmissions.get(key) ?? new Set()).add(admission.id));
  }
  const selfDomains = new Set(
    [...channelPages.keys()]
      .map((claimId) => domainOf(claimById.get(claimId)?.websiteUrl ?? null))
      .filter((d): d is string => d !== null),
  );
  const publisherOf = (url: string | null): PublisherRelation => {
    const d = domainOf(url);
    return d !== null && selfDomains.has(d) ? 'SELF' : 'THIRD_PARTY';
  };

  // ---- Sources, created on first reference.
  const sources = new Map<string, ExportSource>();
  const pageById = new Map(records.pages.map((p) => [p.id, p]));
  const candidatesOf = (pageId: string) =>
    records.candidates
      .filter((c) => c.pageEvidenceId === pageId)
      .map((c) => ({
        candidateId: c.id,
        track: c.track,
        candidateScore: c.candidateScore,
        rankWithinRoot: c.rankWithinRoot,
        ruleVersion: c.ruleVersion,
      }))
      .sort((a, b) => byCodeUnit(a.track, b.track) || byCodeUnit(a.candidateId, b.candidateId));

  function pageSource(page: PageRow): string | null {
    if (page.responseSha256 === null || !at(page.createdAt)) return null;
    const sourceRef = rpRef('source', page.id);
    if (!sources.has(sourceRef)) {
      const capturedAt = toWholeSecond(page.observedAt);
      const https = isHttpsLocator(page.requestedUrl);
      const record: SourceRecord = {
        kind: 'PAGE_EVIDENCE',
        pageEvidenceId: page.id,
        fetchObservationId: page.fetchObservationId,
        researchRunId: page.runId,
        admissionId: ROOT_SCOPE.exec(page.rootKey)?.[1] ?? null,
        extractionRuleVersion: page.ruleVersion,
        candidates: candidatesOf(page.id),
      };
      sources.set(sourceRef, {
        evidenceClass: EVIDENCE_CLASS,
        sourceRef,
        publisherRelation: publisherOf(page.requestedUrl),
        capturedAt,
        c1: {
          captureKind: 'ARTEFACT',
          contentDigest: page.responseSha256,
          originKey: `url.${sha256Hex(page.requestedUrl)}`,
          derivedFromSourceRef: null,
          attesterRef: null,
          partnerRecordRef: null,
        },
        reproducibility: {
          kind: 'DIGEST_ONLY_BYTES_UNAVAILABLE',
          contentDigest: page.responseSha256,
          bytesAvailable: false,
          origin: https ? page.requestedUrl : null,
          digestRecordedAt: capturedAt,
        },
        record,
      });
    }
    return sourceRef;
  }

  function referenceSource(
    stableKey: string,
    url: string | null,
    accessedAtMs: string,
    record: SourceRecord,
  ): string {
    const sourceRef = rpRef('source', stableKey);
    const existing = sources.get(sourceRef);
    const capturedAt = toWholeSecond(accessedAtMs);
    if (existing !== undefined && byCodeUnit(existing.capturedAt, capturedAt) <= 0)
      return sourceRef;
    sources.set(sourceRef, {
      evidenceClass: EVIDENCE_CLASS,
      sourceRef,
      publisherRelation: publisherOf(url),
      capturedAt,
      c1: {
        captureKind: 'ARTEFACT',
        contentDigest: null,
        originKey: url === null ? `ref.${sha256Hex(stableKey)}` : `url.${sha256Hex(url)}`,
        derivedFromSourceRef: null,
        attesterRef: null,
        partnerRecordRef: null,
      },
      reproducibility: {
        kind: 'EXTERNAL_REFERENCE_ONLY',
        origin: url !== null && isHttpsLocator(url) ? url : null,
        accessedAt: capturedAt,
        contentDigest: null,
      },
      record,
    });
    return sourceRef;
  }

  /** The cited source of a recorded (identity or jurisdiction) claim, or null if unresolvable. */
  function citedSource(c: {
    readonly sourceType: string;
    readonly sourcePageEvidenceId: string | null;
    readonly sourceWebsiteClaimId: string | null;
    readonly sourceUrl: string | null;
    readonly sourceVersionRef: string | null;
    readonly observedAt: string;
  }): string | null {
    if (c.sourceType === 'PAGE_EVIDENCE') {
      const page =
        c.sourcePageEvidenceId === null ? undefined : pageById.get(c.sourcePageEvidenceId);
      return page === undefined ? null : pageSource(page);
    }
    if (c.sourceType === 'WEBSITE_CLAIM') {
      const w = records.websiteClaims.find((x) => x.id === c.sourceWebsiteClaimId);
      if (w === undefined) return null;
      return referenceSource(w.id, w.normalisedUrl, w.observedAt, {
        kind: 'WEBSITE_CLAIM',
        websiteClaimId: w.id,
        ingestRunId: w.ingestRunId,
      });
    }
    if (c.sourceUrl === null) return null;
    // Verified by recomputing the nomination citation digest: a URL alone resolves nothing.
    const nomination =
      c.sourceVersionRef === null
        ? undefined
        : records.nominations.find(
            (n) => n.url === c.sourceUrl && nominationCitationDigestOf(n) === c.sourceVersionRef,
          );
    if (nomination !== undefined) {
      return referenceSource(nomination.id, nomination.url, nomination.retrievedAt, {
        kind: 'SOURCE_DISCOVERY_NOMINATION',
        nominationId: nomination.id,
        discoveryRunId: nomination.discoveryRunId,
      });
    }
    const provenanceKey = `url:${c.sourceUrl}|v=${c.sourceVersionRef ?? ''}`;
    return referenceSource(`public-url|${provenanceKey}`, c.sourceUrl, c.observedAt, {
      kind: 'PUBLIC_URL_UNRESOLVED',
      provenanceKey,
    });
  }

  // ---- Claims.
  const claims: ExportClaim[] = [];
  const links: ExportClaimLink[] = [];
  const candidateRef = rpRef('candidate', subjectId);

  function addClaim(
    stableKey: string,
    claimKey: ExportedClaimKey,
    subject: ExportClaim['subject'],
    mode: AssertionMode,
    attribution: Attribution,
    producedBy: ClaimProducer,
    value: ClaimValue,
    basis: ClaimBasis,
    sourceRefs: readonly string[],
  ): void {
    const claimRef = rpRef('claim', stableKey);
    const supporting = [...new Set(sourceRefs)].sort(byCodeUnit);
    const conflicts = new Set<ResearchRealConflict>();
    for (const ref of supporting) {
      const s = sources.get(ref)!;
      if (!RESEARCH_REAL_MODE_REPRODUCIBILITY[mode].includes(s.reproducibility.kind)) {
        conflicts.add('MODE_NEEDS_PRESERVED_SOURCE_MATERIAL_ENGINE_HOLDS_DIGEST_ONLY');
      }
      if (s.reproducibility.origin === null) conflicts.add('SOURCE_ORIGIN_NOT_HTTPS');
    }
    if (!RESEARCH_REAL_CLAIM_PRODUCERS.includes(producedBy)) {
      conflicts.add('PRODUCER_NWF_SYSTEM_NOT_A_RESEARCH_REAL_PRODUCER');
    }
    claims.push({
      evidenceClass: EVIDENCE_CLASS,
      claimRef,
      claimKey,
      subject,
      mode,
      attribution,
      producedBy,
      value,
      basis,
      researchRealConflicts: [...conflicts].sort(byCodeUnit),
    });
    for (const sourceRef of supporting) links.push({ claimRef, sourceRef, relation: 'SUPPORTS' });
  }

  const recordedMode = (sourceRef: string): [AssertionMode, Attribution] =>
    sources.get(sourceRef)!.publisherRelation === 'SELF'
      ? ['SELF_ASSERTED', 'EXACT']
      : ['THIRD_PARTY_ASSERTED', 'LIKELY'];

  // candidate.location: ADR 0024, STATED only.
  const jurisdiction = records.jurisdictionClaims.filter(
    (j) => j.subjectId === subjectId && at(j.createdAt),
  );
  const standing = deriveJurisdictionStanding(subjectId, jurisdiction);
  const invalid = new Set(standing.excludedClaimIds);
  const operation = standing.countryOfOperation;
  for (const j of [...jurisdiction].sort((a, b) => byCodeUnit(a.id, b.id))) {
    if (invalid.has(j.id)) {
      excluded.push({ ref: `jurisdiction_claim:${j.id}`, reason: 'JURISDICTION_CLAIM_INVALID' });
      continue;
    }
    if (j.claimKind !== 'COUNTRY_OF_OPERATION') continue;
    if (operation.state !== 'STATED') {
      excluded.push({ ref: `jurisdiction_claim:${j.id}`, reason: 'COUNTRY_NOT_STATED' });
      continue;
    }
    const sourceRef = citedSource(j);
    if (sourceRef === null) {
      excluded.push({ ref: `jurisdiction_claim:${j.id}`, reason: 'SOURCE_UNRESOLVABLE' });
      continue;
    }
    const [mode, attribution] = recordedMode(sourceRef);
    addClaim(
      `location|${j.id}`,
      'candidate.location',
      { kind: 'CANDIDATE', ref: candidateRef },
      mode,
      attribution,
      'HUMAN_RESEARCHER',
      { countryCode: j.claimedCountry as string },
      {
        origin: 'ADR_0024_COUNTRY_OF_OPERATION',
        jurisdictionClaimId: j.id,
        recordedByActorKey: j.recordedByActorKey,
      },
      [sourceRef],
    );
  }

  // candidate.kind: read-only in C1, from admitted ENTITY_KIND registry claims.
  for (const c of [...identityClaims].sort((a, b) => byCodeUnit(a.id, b.id))) {
    if (c.claimKind !== 'ENTITY_KIND') continue;
    const exclusion = claimExclusion(c);
    const kind = c.claimedKind === null ? null : (REGISTRY_KIND_TO_C1[c.claimedKind] ?? null);
    const reason = exclusion ?? (kind === null ? 'REGISTRY_KIND_HAS_NO_FAITHFUL_C1_KIND' : null);
    if (reason !== null) {
      excluded.push({ ref: `identity_claim:${c.id}`, reason });
      continue;
    }
    const sourceRef = citedSource(c);
    if (sourceRef === null) {
      excluded.push({ ref: `identity_claim:${c.id}`, reason: 'SOURCE_UNRESOLVABLE' });
      continue;
    }
    const [mode, attribution] = recordedMode(sourceRef);
    addClaim(
      `kind|${c.id}`,
      'candidate.kind',
      { kind: 'CANDIDATE', ref: candidateRef },
      mode,
      attribution,
      'HUMAN_RESEARCHER',
      { kind: kind! },
      { origin: 'REGISTRY_ENTITY_KIND', identityClaimId: c.id, registryKind: c.claimedKind! },
      [sourceRef],
    );
  }

  // Channel claims: existence, binding, and per-page static currency.
  const channels: QualificationInputExportDocument['channels'][number][] = [];
  for (const websiteClaimId of [...channelPages.keys()].sort(byCodeUnit)) {
    const channelRef = rpRef('channel', websiteClaimId);
    const admissionIds = [...(channelAdmissions.get(websiteClaimId) ?? [])].sort(byCodeUnit);
    channels.push({
      channelRef,
      kind: 'RESOURCE_PAGE',
      visibility: 'PUBLIC',
      websiteClaimId,
      admissionIds,
    });
    const pages = [...(channelPages.get(websiteClaimId) ?? [])].sort((a, b) =>
      byCodeUnit(a.id, b.id),
    );
    const pageRefs = pages.map(pageSource).filter((r): r is string => r !== null);
    const subject = { kind: 'CHANNEL', ref: channelRef } as const;
    const captured: ClaimBasis = {
      origin: 'ADMITTED_WEBSITE_CAPTURED',
      websiteClaimId,
      admissionIds,
    };
    addClaim(
      `existence|${websiteClaimId}`,
      'channel.existence',
      subject,
      'OBSERVED',
      'EXACT',
      'NWF_SYSTEM',
      { status: 'EXISTS' },
      captured,
      pageRefs,
    );
    addClaim(
      `binding|${websiteClaimId}`,
      'channel.operator_binding',
      subject,
      'OBSERVED',
      'EXACT',
      'NWF_SYSTEM',
      { operatorCandidateId: candidateRef, basis: 'HOSTED_ON_CANDIDATE_SITE' },
      captured,
      pageRefs,
    );
    for (const page of pages) {
      const texts = [
        ...(page.title === null ? [] : [page.title]),
        ...page.headings.map((h) => h.text),
        page.mainText,
      ];
      const dates = currentOrUpcomingYearDates(texts, page.observedAt);
      if (dates.length === 0) continue;
      addClaim(
        `static_currency|${page.id}`,
        'channel.static_currency',
        subject,
        'OBSERVED',
        'EXACT',
        'NWF_SYSTEM',
        { marker: 'CURRENT_OR_UPCOMING_YEAR', lastModified: null },
        { origin: 'STATED_DATE_IN_CAPTURE', pageEvidenceId: page.id, statedDates: dates },
        [rpRef('source', page.id)],
      );
    }
  }

  if (sources.size > MAX_SOURCES || claims.length > MAX_CLAIMS) {
    throw new QualificationInputExportRefusal('BOUND_EXCEEDED', `${sources.size}/${claims.length}`);
  }
  const country = operation.state === 'STATED' ? (operation.value as string) : null;
  return {
    document: QUALIFICATION_INPUT_EXPORT_CONTRACT,
    producerVersion: QUALIFICATION_INPUT_PRODUCER_VERSION,
    targetContracts: TARGET_CONTRACTS,
    evidenceClass: EVIDENCE_CLASS,
    instantRule: INSTANT_RULE,
    dateRuleVersion: STATED_DATE_RULE_VERSION,
    sourceRepository: ENGINE_SOURCE_REPOSITORY,
    readConsistency: options.readConsistency,
    subjectId,
    evaluatedAt,
    candidate: { candidateRef, relations: [] },
    country: {
      value: country,
      standing: operation.state,
      rule: 'ADR_0024_COUNTRY_OF_OPERATION_STATED',
      notRankableReason: country === null ? 'NO_STATED_COUNTRY' : null,
    },
    channels,
    sources: [...sources.values()].sort((a, b) => byCodeUnit(a.sourceRef, b.sourceRef)),
    claims: claims.sort((a, b) => byCodeUnit(a.claimRef, b.claimRef)),
    claimLinks: links.sort(
      (a, b) => byCodeUnit(a.claimRef, b.claimRef) || byCodeUnit(a.sourceRef, b.sourceRef),
    ),
    excluded: excluded.sort((a, b) => byCodeUnit(a.ref, b.ref) || byCodeUnit(a.reason, b.reason)),
    researchRuns,
    permissions: PERMISSIONS,
    limitations: LIMITATIONS,
  };
}
