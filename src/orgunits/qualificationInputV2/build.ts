/**
 * WW E-X - THE PURE v2 QUALIFICATION-INPUT EXPORT BUILDER
 * (`nwf-pe-qualification-input-producer-v2`).
 *
 * `buildQualificationInputExportV2(records, options)` first builds the v1
 * document with the UNCHANGED v1 builder - so every as-of cut, refusal,
 * exclusion, channel, source and claim v1 makes is made identically - and
 * then reads the captures v1 already exports as sources (the pages of the
 * included research runs) with the pure C1 extraction rules
 * (`../c1Extraction/`), adding:
 *
 *   channels    the additional channels the captures show (OBSERVED) or the
 *               subject's own pages name (PROPOSAL_ONLY), C1 kinds only;
 *   claims      OBSERVED, NWF_SYSTEM, EXACT, linked ONLY to page captures;
 *   proposals   self-descriptions, never claims;
 *   researchStatus / contradictions / gaps / freshness.
 *
 * Reads nothing but its arguments - no clock, no randomness, no environment -
 * so equal records and an equal evaluation instant give byte-identical
 * output. Every list is sorted.
 */
import { extractC1, type C1PageInput, type PageClass } from '../c1Extraction/extract.js';
import {
  C1_DIMENSION_OF,
  C1_SUBCRITERIA,
  C1_SUBCRITERION_KEYS,
  type C1Subcriterion,
} from '../c1Extraction/vocabulary.js';
import {
  buildQualificationInputExport,
  type BuildOptions,
  type QualificationInputRecords,
} from '../qualificationInput/build.js';
import {
  EVIDENCE_CLASS,
  PERMISSIONS,
  QualificationInputExportRefusal,
  RESEARCH_REAL_CLAIM_PRODUCERS,
  RESEARCH_REAL_MODE_REPRODUCIBILITY,
  derivedUuid,
  rpRef,
  sha256Hex,
  type ExportClaimLink,
  type ExportSource,
  type ResearchRealConflict,
} from '../qualificationInput/contract.js';
import {
  LIMITATIONS_V2,
  MAX_PROPOSALS,
  QUALIFICATION_INPUT_EXPORT_CONTRACT_V2,
  QUALIFICATION_INPUT_PRODUCER_VERSION_V2,
  type Contradiction,
  type ExportChannelV2,
  type ExportClaimV2,
  type ExportProposal,
  type ExportedClaimKeyV2,
  type Freshness,
  type Gap,
  type QualificationInputExportDocumentV2,
  type ResearchStatusEntry,
} from './contract.js';

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const distinctSorted = (values: Iterable<string>) => [...new Set(values)].sort(byCodeUnit);

/**
 * Which captured page classes make a miss SEARCHED_NOT_FOUND for each
 * subcriterion. Empty: no v1 extraction rule reads these keys, so a miss is
 * always NOT_RESEARCHED.
 */
export const RELEVANT_PAGE_CLASSES: Readonly<Record<C1Subcriterion, readonly PageClass[]>> =
  Object.freeze({
    AF1: ['HOME', 'ABOUT'],
    AF2: ['HOME', 'ABOUT'],
    AF3: [],
    DP1: ['HOME'],
    DP2: ['HOME', 'NEWSLETTER'],
    DP3: ['HOME', 'EVENTS', 'NEWSLETTER'],
    DP4: ['HOME', 'ABOUT', 'NEWSLETTER'],
    AP1: ['HOME', 'EVENTS', 'EXTERNAL_LINKS'],
    AP2: ['HOME', 'EVENTS', 'NEWSLETTER'],
    SV1: ['EVENTS'],
    SV2: [],
    SV3: ['HOME', 'ABOUT'],
  });

/** Keys no v1 extraction rule ever emits, and why (always listed as gaps). */
export const STRUCTURAL_GAPS: readonly { readonly target: string; readonly reason: string }[] = [
  { target: 'audience.stated_need', reason: 'VALUE_PROPOSITION_REGISTER_NOT_HELD_BY_THE_ENGINE' },
  { target: 'audience.minor_presence', reason: 'NO_EXTRACTION_RULE' },
  { target: 'candidate.network_membership', reason: 'NO_NETWORK_OWN_DIRECTORY_CAPTURE' },
  { target: 'candidate.network_directory_absence', reason: 'NO_NETWORK_OWN_DIRECTORY_CAPTURE' },
  { target: 'channel.operator_continuity', reason: 'HANDOVER_HISTORY_NOT_EXTRACTED' },
  { target: 'channel.publishing_route', reason: 'NO_RULE_OBSERVES_A_PUBLISHING_ROUTE' },
];

/** True for the admitted website's own root URL (path `/`, no query, its own host). */
function isSiteRoot(requestedUrl: string, rootHost: string | null): boolean {
  try {
    const url = new URL(requestedUrl);
    return url.pathname === '/' && url.search === '' && url.hostname === rootHost;
  } catch {
    return false;
  }
}

/** The v2 document for one subject. Throws `QualificationInputExportRefusal`. */
export function buildQualificationInputExportV2(
  records: QualificationInputRecords,
  options: BuildOptions,
): QualificationInputExportDocumentV2 {
  const v1 = buildQualificationInputExport(records, options);
  const asOf = Date.parse(v1.evaluatedAt);
  const sourceOf = new Map<string, ExportSource>(v1.sources.map((s) => [s.sourceRef, s]));

  // ---- The captures v1 exports: pages of included runs, each with its admitted root website.
  const rootOfAdmission = new Map<string, string>();
  for (const ch of v1.channels) {
    for (const a of ch.admissionIds) rootOfAdmission.set(a, ch.websiteClaimId);
  }
  const includedRuns = new Map(
    v1.researchRuns.filter((r) => r.included).map((r) => [r.runId, r.admissionId]),
  );
  const websiteOf = new Map(records.identityClaims.map((c) => [c.id, c.websiteUrl]));
  const hostOf = (url: string | null): string | null => {
    if (url === null) return null;
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  };
  const pages: C1PageInput[] = [];
  for (const page of records.pages) {
    const admissionId = includedRuns.get(page.runId);
    if (admissionId === undefined || page.responseSha256 === null) continue;
    if (Date.parse(page.createdAt) > asOf) continue;
    const rootKey = rootOfAdmission.get(admissionId);
    const source = sourceOf.get(rpRef('source', page.id));
    if (rootKey === undefined || source === undefined) continue;
    const isRootUrl = isSiteRoot(page.requestedUrl, hostOf(websiteOf.get(rootKey) ?? null));
    pages.push({
      pageId: page.id,
      rootKey,
      isRootUrl,
      publisher: source.publisherRelation,
      capturedDay: page.observedAt.slice(0, 10),
      title: page.title,
      headings: page.headings.map((h) => h.text),
      mainText: page.mainText,
    });
  }
  const extraction = extractC1(pages, { candidateRef: v1.candidate.candidateRef });

  // ---- Channels.
  const v1ChannelOf = new Map(v1.channels.map((c) => [c.websiteClaimId, c]));
  const channelRefOf = (channelKey: string): string => {
    const [kind, rootKey] = channelKey.split('|') as [string, string];
    return kind === 'RESOURCE_PAGE' ? rpRef('channel', rootKey) : rpRef('channel', channelKey);
  };
  const channels: ExportChannelV2[] = [
    ...v1.channels.map((c): ExportChannelV2 => ({
      channelRef: c.channelRef,
      kind: c.kind,
      channelClass: 'STATIC',
      visibility: c.visibility,
      websiteClaimId: c.websiteClaimId,
      admissionIds: c.admissionIds,
      derivation: 'ADMITTED_ROOT_WEBSITE',
      establishedBy: 'OBSERVED_CLAIM',
      ruleIds: [],
    })),
    ...extraction.channels.map((c): ExportChannelV2 => ({
      channelRef: channelRefOf(c.channelKey),
      kind: c.kind,
      channelClass: c.channelClass,
      visibility: c.visibility,
      websiteClaimId: c.rootKey,
      admissionIds: v1ChannelOf.get(c.rootKey)?.admissionIds ?? [],
      derivation:
        c.establishedBy === 'OBSERVED_CLAIM'
          ? 'OBSERVED_ON_ADMITTED_SITE'
          : 'NAMED_ON_ADMITTED_SITE',
      establishedBy: c.establishedBy,
      ruleIds: c.ruleIds,
    })),
  ].sort((a, b) => byCodeUnit(a.channelRef, b.channelRef));

  // ---- OBSERVED claims, linked only to the page captures that show them.
  const claims: ExportClaimV2[] = [...v1.claims];
  const links: ExportClaimLink[] = [...v1.claimLinks];
  for (const c of extraction.claims) {
    const claimRef = rpRef(
      'claim',
      `c1x|${c.key}|${c.channelKey}|${sha256Hex(JSON.stringify(c.value))}`,
    );
    const sourceRefs = distinctSorted(c.pageIds.map((id) => rpRef('source', id)));
    const conflicts = new Set<ResearchRealConflict>();
    for (const ref of sourceRefs) {
      const s = sourceOf.get(ref)!;
      if (!RESEARCH_REAL_MODE_REPRODUCIBILITY.OBSERVED.includes(s.reproducibility.kind)) {
        conflicts.add('MODE_NEEDS_PRESERVED_SOURCE_MATERIAL_ENGINE_HOLDS_DIGEST_ONLY');
      }
      if (s.reproducibility.origin === null) conflicts.add('SOURCE_ORIGIN_NOT_HTTPS');
    }
    if (!RESEARCH_REAL_CLAIM_PRODUCERS.includes('NWF_SYSTEM')) {
      conflicts.add('PRODUCER_NWF_SYSTEM_NOT_A_RESEARCH_REAL_PRODUCER');
    }
    claims.push({
      evidenceClass: EVIDENCE_CLASS,
      claimRef,
      claimKey: c.key as ExportedClaimKeyV2,
      subject: { kind: 'CHANNEL', ref: channelRefOf(c.channelKey) },
      mode: 'OBSERVED',
      attribution: 'EXACT',
      producedBy: 'NWF_SYSTEM',
      value: c.value,
      basis: {
        origin: 'C1_EXTRACTION_RULE',
        rulesVersion: extraction.rulesVersion,
        dateRuleVersion: extraction.dateRuleVersion,
        ruleIds: c.ruleIds,
        pageEvidenceIds: c.pageIds,
        statedDates: c.statedDates,
      },
      researchRealConflicts: [...conflicts].sort(byCodeUnit),
    });
    for (const sourceRef of sourceRefs) links.push({ claimRef, sourceRef, relation: 'SUPPORTS' });
  }
  claims.sort((a, b) => byCodeUnit(a.claimRef, b.claimRef));
  links.sort((a, b) => byCodeUnit(a.claimRef, b.claimRef) || byCodeUnit(a.sourceRef, b.sourceRef));

  // ---- Proposals.
  const proposals: ExportProposal[] = extraction.proposals
    .map((p): ExportProposal => {
      const subjectRef =
        p.subject.kind === 'CANDIDATE'
          ? v1.candidate.candidateRef
          : channelRefOf(p.subject.channelKey);
      const sourceRef = rpRef('source', p.pageId);
      const value = JSON.stringify(p.value);
      return {
        proposalId: `rp-proposal:${derivedUuid(`proposal|${p.key}|${subjectRef}|${value}|${p.pageId}`)}`,
        key: p.key as ExportProposal['key'],
        subject: { kind: p.subject.kind, ref: subjectRef },
        proposedValue: p.value,
        assertionMode: p.mode,
        attribution: p.mode === 'SELF_ASSERTED' ? 'EXACT' : 'LIKELY',
        sourceRef,
        observedAt: sourceOf.get(sourceRef)!.capturedAt,
        extraction: {
          ruleId: p.ruleId,
          rulesVersion: extraction.rulesVersion,
          language: p.language,
          matchedTerms: p.matchedTerms,
        },
        quote: p.quote,
        quoteTruncated: p.quoteTruncated,
        quoteSha256: p.quoteSha256,
      };
    })
    .sort((a, b) => byCodeUnit(a.proposalId, b.proposalId));
  if (proposals.length > MAX_PROPOSALS) {
    throw new QualificationInputExportRefusal('BOUND_EXCEEDED', `proposals ${proposals.length}`);
  }

  // ---- Research status per C1 subcriterion.
  const captured = new Set(extraction.pageClasses.flatMap((p) => p.classes));
  const researchStatus: ResearchStatusEntry[] = C1_SUBCRITERIA.map((id) => {
    const keys = C1_SUBCRITERION_KEYS[id];
    const claimRefs = claims.filter((c) => keys.includes(c.claimKey)).map((c) => c.claimRef);
    const proposalIds = proposals.filter((p) => keys.includes(p.key)).map((p) => p.proposalId);
    const relevant = RELEVANT_PAGE_CLASSES[id];
    const capturedRelevant = relevant.filter((c) => captured.has(c));
    const status: ResearchStatusEntry['status'] =
      claimRefs.length > 0
        ? 'EVIDENCE_FOUND'
        : proposalIds.length > 0
          ? 'PROPOSAL_ONLY'
          : capturedRelevant.length > 0
            ? 'SEARCHED_NOT_FOUND'
            : 'NOT_RESEARCHED';
    return {
      subcriterionId: id,
      dimension: C1_DIMENSION_OF[id],
      status,
      claimKeys: keys,
      claimRefs: distinctSorted(claimRefs),
      proposalIds: distinctSorted(proposalIds),
      relevantPageClasses: relevant,
      capturedPageClasses: capturedRelevant,
      reason:
        status === 'SEARCHED_NOT_FOUND'
          ? 'RELEVANT_PAGE_CLASS_CAPTURED_NOTHING_FOUND'
          : status !== 'NOT_RESEARCHED'
            ? null
            : relevant.length === 0
              ? 'NO_EXTRACTION_RULE_FOR_THESE_KEYS'
              : 'RELEVANT_PAGE_CLASS_NOT_CAPTURED',
    };
  });

  // ---- Contradictions: two records on one key and subject that cannot both hold.
  const linkedSources = (claimRef: string) =>
    links.filter((l) => l.claimRef === claimRef).map((l) => l.sourceRef);
  const contradictions: Contradiction[] = [];
  const groups = new Map<
    string,
    {
      key: string;
      subject: Contradiction['subject'];
      among: Contradiction['among'];
      items: { ref: string; value: string; sources: string[] }[];
    }
  >();
  const add = (
    among: Contradiction['among'],
    key: string,
    subject: Contradiction['subject'],
    ref: string,
    value: Readonly<Record<string, unknown>>,
    sources: string[],
  ) => {
    const facet = facetOf(key, value);
    if (facet === null) return;
    const g = `${among}|${key}|${subject.kind}|${subject.ref}|${facet.group}`;
    const entry = groups.get(g) ?? { key, subject, among, items: [] };
    entry.items.push({ ref, value: facet.value, sources });
    groups.set(g, entry);
  };
  for (const c of claims) {
    add(
      'CLAIMS',
      c.claimKey,
      c.subject as Contradiction['subject'],
      c.claimRef,
      c.value as Readonly<Record<string, unknown>>,
      linkedSources(c.claimRef),
    );
  }
  for (const p of proposals) {
    add('PROPOSALS', p.key, p.subject, p.proposalId, p.proposedValue, [p.sourceRef]);
  }
  for (const g of groups.values()) {
    const values = refineKinds(g.key, new Set(g.items.map((i) => i.value)));
    if (values.size < 2) continue;
    contradictions.push({
      key: g.key,
      subject: g.subject,
      among: g.among,
      refs: distinctSorted(g.items.map((i) => i.ref)),
      sourceRefs: distinctSorted(g.items.flatMap((i) => i.sources)),
      distinctValues: values.size,
    });
  }
  contradictions.sort(
    (a, b) =>
      byCodeUnit(a.key, b.key) ||
      byCodeUnit(a.subject.ref, b.subject.ref) ||
      byCodeUnit(a.refs[0]!, b.refs[0]!),
  );

  // ---- Gaps: explicit, never silent.
  const pageSource = (ids: readonly string[]) =>
    distinctSorted(ids.map((id) => rpRef('source', id)));
  const gaps: Gap[] = [
    ...researchStatus
      .filter((r) => r.status === 'NOT_RESEARCHED' || r.status === 'SEARCHED_NOT_FOUND')
      .map((r) => ({
        target: r.subcriterionId,
        reason: r.reason!,
        ruleId: null,
        label: null,
        sourceRefs: [],
      })),
    ...STRUCTURAL_GAPS.map((g) => ({ ...g, ruleId: null, label: null, sourceRefs: [] })),
    ...extraction.unmapped.map((u) => ({
      target: 'FINDING',
      reason: u.reason,
      ruleId: u.ruleId,
      label: u.label,
      sourceRefs: pageSource(u.pageIds),
    })),
    ...extraction.withheld.map((w) => ({
      target: w.key,
      reason: `PROPOSAL_WITHHELD_${w.reason}`,
      ruleId: w.ruleId,
      label: null,
      sourceRefs: pageSource([w.pageId]),
    })),
  ];
  const gapKey = (g: Gap) => `${g.target}|${g.reason}|${g.ruleId ?? ''}|${g.label ?? ''}`;
  const mergedGaps = new Map<string, Gap>();
  for (const g of gaps) {
    const prior = mergedGaps.get(gapKey(g));
    mergedGaps.set(
      gapKey(g),
      prior === undefined
        ? g
        : { ...g, sourceRefs: distinctSorted([...prior.sourceRefs, ...g.sourceRefs]) },
    );
  }

  // ---- Freshness: the latest capture behind each key.
  const fresh = new Map<
    string,
    { latest: string; sourceRef: string; claims: number; proposals: number }
  >();
  const touch = (key: string, sourceRefs: readonly string[], kind: 'claims' | 'proposals') => {
    const entry = fresh.get(key) ?? { latest: '', sourceRef: '', claims: 0, proposals: 0 };
    entry[kind] += 1;
    for (const ref of sourceRefs) {
      const at = sourceOf.get(ref)?.capturedAt ?? '';
      if (at > entry.latest || (at === entry.latest && byCodeUnit(ref, entry.sourceRef) < 0)) {
        entry.latest = at;
        entry.sourceRef = ref;
      }
    }
    fresh.set(key, entry);
  };
  for (const c of claims) touch(c.claimKey, linkedSources(c.claimRef), 'claims');
  for (const p of proposals) touch(p.key, [p.sourceRef], 'proposals');
  const freshness: Freshness[] = [...fresh.entries()]
    .filter(([, f]) => f.latest !== '')
    .map(([key, f]) => ({
      key,
      latestCapturedAt: f.latest,
      sourceRef: f.sourceRef,
      claims: f.claims,
      proposals: f.proposals,
    }))
    .sort((a, b) => byCodeUnit(a.key, b.key));

  return {
    document: QUALIFICATION_INPUT_EXPORT_CONTRACT_V2,
    producerVersion: QUALIFICATION_INPUT_PRODUCER_VERSION_V2,
    extraction: {
      rulesVersion: extraction.rulesVersion,
      dateRuleVersion: extraction.dateRuleVersion,
      pageClasses: extraction.pageClasses
        .map((p) => ({ sourceRef: rpRef('source', p.pageId), classes: p.classes }))
        .sort((a, b) => byCodeUnit(a.sourceRef, b.sourceRef)),
    },
    targetContracts: v1.targetContracts,
    evidenceClass: v1.evidenceClass,
    instantRule: v1.instantRule,
    dateRuleVersion: v1.dateRuleVersion,
    sourceRepository: v1.sourceRepository,
    readConsistency: v1.readConsistency,
    subjectId: v1.subjectId,
    evaluatedAt: v1.evaluatedAt,
    candidate: v1.candidate,
    country: v1.country,
    channels,
    sources: v1.sources,
    claims,
    claimLinks: links,
    proposals,
    researchStatus,
    contradictions,
    gaps: [...mergedGaps.values()].sort((a, b) => byCodeUnit(gapKey(a), gapKey(b))),
    freshness,
    excluded: v1.excluded,
    researchRuns: v1.researchRuns,
    permissions: PERMISSIONS,
    limitations: LIMITATIONS_V2,
  };
}

/**
 * Which part of a value two records must agree on to be compatible, per key
 * (`group` separates records that describe different things - a segment, a
 * count basis - and `value` is what must then be equal). Null: records of this
 * key never contradict each other (complementary facts).
 */
function facetOf(
  key: string,
  value: Readonly<Record<string, unknown>>,
): { readonly group: string; readonly value: string } | null {
  switch (key) {
    case 'candidate.kind':
      return { group: '', value: String(value['kind']) };
    case 'audience.cohort':
      return { group: '', value: String(value['cohort']) };
    case 'audience.languages':
      return { group: '', value: JSON.stringify(value['languages']) };
    case 'audience.segment_definition':
      return { group: String(value['segment']), value: String(value['scope']) };
    case 'channel.audience_count':
      return { group: String(value['basis']), value: String(value['count']) };
    case 'channel.existence':
    case 'channel.reach_mode':
    case 'channel.event_instances':
    case 'channel.cycle_history':
    case 'channel.feed_activity':
    case 'channel.static_currency':
      return { group: '', value: JSON.stringify(value) };
    default:
      return null;
  }
}

/** A generic kind refined by a specific one (student association ⊂ international one) is no contradiction. */
function refineKinds(key: string, values: Set<string>): Set<string> {
  if (key !== 'candidate.kind') return values;
  const out = new Set(values);
  if (out.has('INTERNATIONAL_STUDENT_ASSOCIATION')) out.delete('STUDENT_ASSOCIATION');
  return out;
}
