/**
 * REL Engine integration: `orgunit-extraction-v3`.
 *
 * The Japan/Mexico/Netherlands redaction change alters extracted text (more
 * phone shapes redacted, whole day-month-year dates kept), so the label
 * `orgunit-extraction-v2` would otherwise name two different transforms.
 * Newly extracted evidence is v3; v1 and v2 rows keep their labels and are
 * read exactly as before; the classifier accepts v3 exactly as v2.
 */
import { describe, expect, it } from 'vitest';
import { EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION } from '../../orgunits/classify/constants.js';
import { dedupeByResponseSha256 } from '../../orgunits/classify/dedupe.js';
import { buildDocumentContent } from '../../orgunits/classify/document.js';
import type { ClassifierRootRef, RawEligibleCandidateRow } from '../../orgunits/classify/types.js';
import { EXTRACTION_RULE_VERSION as COLLECTION_VERSION } from '../../orgunits/orchestrator/pageCollection.js';
import { EXTRACTION_RULE_VERSION as SINGLE_PAGE_VERSION } from '../../orgunits/web/pageEvidence.js';
import { extractPage } from '../../orgunits/web/extract.js';

const V1 = 'orgunit-extraction-v1';
const V2 = 'orgunit-extraction-v2';
const V3 = 'orgunit-extraction-v3';
const V4 = 'orgunit-extraction-v4';

const ROOT: ClassifierRootRef = {
  rootKey: 'claim:11111111-1111-1111-1111-111111111111',
  authorityKind: 'claim',
  url: 'https://www.example.ac.jp/',
};

function build(extractionRuleVersion: string, fields: Partial<RawEligibleCandidateRow> = {}) {
  const row: RawEligibleCandidateRow = {
    candidateId: '1',
    pageEvidenceId: 'page-1',
    rootKey: ROOT.rootKey,
    track: 'B',
    candidateScore: 4,
    rankWithinRoot: 1,
    signals: [],
    title: 'Caf&eacute; &amp; Co',
    declaredLang: 'ja',
    headings: [{ level: 1, text: '国際交流センター &laquo;tandem&raquo;' }],
    mainText: '&Eacute;cole — 電話 [PHONE] — 26-10-2026',
    mainTextTruncated: false,
    extractionRuleVersion,
    url: 'https://www.example.ac.jp/kokusai/',
    discoveryMethod: 'LINK',
    responseSha256: 'a'.repeat(64),
    ...fields,
  };
  const [group] = dedupeByResponseSha256([row]);
  return buildDocumentContent(group!, new Map([[ROOT.rootKey, ROOT]]));
}

describe('orgunit-extraction-v3: one label, one transform', () => {
  it('is no longer stamped on new evidence: both writers stamp v4 (WW H-EX, P2-9)', () => {
    // v4 changed redaction only (bare digit runs redacted, a valid ISBN-13 kept); v3 keeps
    // naming the transform before it, frozen in redact.ts for stored rows.
    expect(SINGLE_PAGE_VERSION).toBe(V4);
    expect(COLLECTION_VERSION).toBe(V4);
  });

  it('exists because the redaction transform changed: v3 text differs from what v2 produced', () => {
    const html =
      '<html><head><title>国際交流</title></head><body><main><p>電話 ０３－１２３４－５６７８（平日）</p>' +
      '<p>Inschrijven van 26-10-2026 tot 30-10-2026</p></main></body></html>';
    const page = extractPage(html);
    // Full-width JP phone: redacted under v3 (v2 left it intact).
    expect(page.mainText).toContain('電話 [PHONE]（平日）');
    expect(page.mainText).not.toContain('１２３４');
    // Whole DMY dates: kept under v3 (v2 destroyed them as [PHONE]).
    expect(page.mainText).toContain('van 26-10-2026 tot 30-10-2026');
  });
});

describe('the classifier input path: v3 exactly as v2, v1 and v2 read exactly as before', () => {
  it('still canonicalises at assembly for exactly one historical version, v1', () => {
    expect(EXTRACTION_VERSION_REQUIRING_ASSEMBLY_CANONICALISATION).toBe(V1);
  });

  it('builds a v4 document identical to the v2 document but for the provenance label', () => {
    const v2 = build(V2);
    const v4 = build(V4);
    expect(v4.extractionRuleVersion).toBe(V4);
    expect({ ...v4, extractionRuleVersion: null }).toEqual({ ...v2, extractionRuleVersion: null });
  });

  it('builds a v3 document identical to the v2 document but for the provenance label', () => {
    const v2 = build(V2);
    const v3 = build(V3);
    expect(v3.extractionRuleVersion).toBe(V3);
    expect(v2.extractionRuleVersion).toBe(V2);
    expect({ ...v3, extractionRuleVersion: null }).toEqual({ ...v2, extractionRuleVersion: null });
    // Already canonical: no second decoding pass over v3 either.
    expect(v3.title).toBe('Caf&eacute; &amp; Co');
  });

  it('reads historical v1 rows exactly as before (canonicalised) and v2 rows untouched', () => {
    const v1 = build(V1);
    expect(v1.title).toBe('Café & Co');
    expect(v1.headings).toEqual([{ level: 1, text: '国際交流センター «tandem»' }]);
    expect(v1.extractionRuleVersion).toBe(V1);
    const v2 = build(V2);
    expect(v2.title).toBe('Caf&eacute; &amp; Co');
    expect(v2.excerpt).toBe('&Eacute;cole — 電話 [PHONE] — 26-10-2026');
  });
});
