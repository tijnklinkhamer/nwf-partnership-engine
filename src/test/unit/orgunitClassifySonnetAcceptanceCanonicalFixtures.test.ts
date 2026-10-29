/**
 * Integrity of the DERIVED, DEVELOPMENT-ONLY canonical corpus
 * (`orgunit-classifier-sonnet-acceptance-v1-canonical-v2*`) produced by
 * `scripts/build-sonnet-acceptance-canonical-corpus.ts`, plus the six known
 * 2D2B rejection cases exercised against the real frozen documents.
 *
 * THE HOLDOUT BOUNDARY BINDS HERE TOO. This file reads the source corpus
 * only far enough to learn each row's `split` - unavoidable, because the
 * source file interleaves both splits - and then touches DEVELOPMENT rows
 * only. It never builds a HOLDOUT id set, never counts HOLDOUT rows by
 * inspecting them, never parses one against the document schema, and never
 * reads a HOLDOUT document's text. The membership proof is POSITIVE: derived
 * ids are compared against source DEVELOPMENT ids.
 *
 * ZERO model calls, zero database - this reads committed files only.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { GoldCorpusItemSchema } from '../../orgunits/classify/evaluation/goldSchema.js';
import { hashDocument, hashRecords } from '../../orgunits/classify/evaluation/hashes.js';
import {
  evidenceSpanVerifies,
  unitNameVerifies,
} from '../../orgunits/classify/evidenceVerification.js';
import { canonicalEvidenceText } from '../../orgunits/web/evidenceCanonical.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '..', 'fixtures', 'evaluation');
const SOURCE_NAME = 'orgunit-classifier-sonnet-acceptance-v1.jsonl';
const SOURCE_MANIFEST_NAME = 'orgunit-classifier-sonnet-acceptance-v1.manifest.jsonl';
const DERIVED_NAME = 'orgunit-classifier-sonnet-acceptance-v1-canonical-v2.jsonl';
const DERIVED_MANIFEST_NAME = 'orgunit-classifier-sonnet-acceptance-v1-canonical-v2.manifest.jsonl';

/** The frozen, immutable source corpus. Byte-identical across this whole slice. */
const SOURCE_CORPUS_RAW_SHA256 = 'dec0a5992afa4fd7b64009202d461edc91ddc29218f35e35f6bb7edd40d63ede';
/** The already-approved source content hash, read as a STRING from the source manifest. */
const SOURCE_MANIFEST_CORPUS_SHA256 =
  '42f041ee5704408788ff301811983c123c200f4c1d6f4fa89696d6b4abaea44b';

/** The six DEVELOPMENT items whose 2D2B classifier outputs the validator rejected. */
const REJECTED_GOLD_IDS = [
  'ga435ea22d4b11cf4',
  'gdb5b7246327094ef',
  'g0ec0d43dad311a77',
  'g877a05e6f5bba835',
  'gcce4e2a5f608de5d',
  'gf65026e32d9da8db',
] as const;

function rawOf(name: string): string {
  return readFileSync(resolve(FIXTURES, name), 'utf8');
}

function fileSha256(name: string): string {
  return createHash('sha256')
    .update(readFileSync(resolve(FIXTURES, name)))
    .digest('hex');
}

/**
 * Reads `split` and nothing else, then keeps DEVELOPMENT rows only. A row
 * that fails the filter is dropped inside this expression and is never
 * bound, retained, indexed, printed or schema-validated.
 */
function sourceDevelopmentItems(): ReturnType<typeof GoldCorpusItemSchema.parse>[] {
  return rawOf(SOURCE_NAME)
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { split?: unknown })
    .filter((row) => row.split === 'DEVELOPMENT')
    .map((row) => GoldCorpusItemSchema.parse(row));
}

function derivedItems(): ReturnType<typeof GoldCorpusItemSchema.parse>[] {
  const raw = rawOf(DERIVED_NAME);
  expect(raw.endsWith('\n'), `${DERIVED_NAME} must end with a newline`).toBe(true);
  return raw
    .trim()
    .split('\n')
    .map((line) => GoldCorpusItemSchema.parse(JSON.parse(line) as unknown));
}

const SOURCE_DEV = sourceDevelopmentItems();
const DERIVED = derivedItems();
const DERIVED_MANIFEST = JSON.parse(rawOf(DERIVED_MANIFEST_NAME).trim()) as Record<string, unknown>;

describe('the source corpus is untouched by this slice', () => {
  it('is byte-identical to the frozen acceptance corpus', () => {
    expect(fileSha256(SOURCE_NAME)).toBe(SOURCE_CORPUS_RAW_SHA256);
  });

  it('still publishes the approved content hash in its own manifest', () => {
    const manifest = JSON.parse(rawOf(SOURCE_MANIFEST_NAME).trim()) as { corpusSha256: string };
    expect(manifest.corpusSha256).toBe(SOURCE_MANIFEST_CORPUS_SHA256);
  });
});

describe('the derived corpus is exactly the 49 DEVELOPMENT items', () => {
  it('contains 49 items', () => {
    expect(DERIVED).toHaveLength(49);
    expect(SOURCE_DEV).toHaveLength(49);
  });

  it('carries split DEVELOPMENT on every item', () => {
    for (const item of DERIVED) expect(item.split).toBe('DEVELOPMENT');
  });

  it('proves membership POSITIVELY against the source DEVELOPMENT gold ids', () => {
    // Deliberately NOT "no derived id is a HOLDOUT id" - proving the
    // complement would require materialising the HOLDOUT id set.
    expect(DERIVED.map((i) => i.goldId)).toEqual(SOURCE_DEV.map((i) => i.goldId));
  });

  it('preserves each item’s goldId, split, corpus version and label join key', () => {
    for (const [index, item] of DERIVED.entries()) {
      const source = SOURCE_DEV[index]!;
      expect(item.goldId).toBe(source.goldId);
      expect(item.split).toBe(source.split);
      expect(item.corpusVersion).toBe(source.corpusVersion);
      expect(item.echeRowKey).toBe(source.echeRowKey);
      expect(item.organisationName).toBe(source.organisationName);
    }
  });

  it('preserves every source provenance field untouched', () => {
    for (const [index, item] of DERIVED.entries()) {
      const source = SOURCE_DEV[index]!;
      expect(item.runId).toBe(source.runId);
      expect(item.pageEvidenceId).toBe(source.pageEvidenceId);
      expect(item.responseSha256).toBe(source.responseSha256);
      expect(item.assemblyInputSha256).toBe(source.assemblyInputSha256);
      expect(item.docIndex).toBe(source.docIndex);
      expect(canonicalStringify(item.candidateMeta)).toBe(canonicalStringify(source.candidateMeta));
      expect(canonicalStringify(item.strata)).toBe(canonicalStringify(source.strata));
    }
  });
});

describe('exactly 12 of 49 documents changed, and 37 are byte-identical', () => {
  const changed = DERIVED.filter(
    (item, index) =>
      canonicalStringify(item.document) !== canonicalStringify(SOURCE_DEV[index]!.document),
  );

  it('changes exactly 12 documents', () => {
    expect(changed).toHaveLength(12);
    expect(DERIVED_MANIFEST['changedDocumentCount']).toBe(12);
  });

  it('leaves exactly 37 documents byte-identical, extractionRuleVersion included', () => {
    const unchanged = DERIVED.filter(
      (item, index) =>
        canonicalStringify(item.document) === canonicalStringify(SOURCE_DEV[index]!.document),
    );
    expect(unchanged).toHaveLength(37);
    expect(DERIVED_MANIFEST['unchangedDocumentCount']).toBe(37);
    for (const item of unchanged)
      expect(item.document.extractionRuleVersion).toBe('orgunit-extraction-v1');
  });

  it('preserves extractionRuleVersion as provenance on the CHANGED documents too', () => {
    for (const item of changed) {
      expect(item.document.extractionRuleVersion).toBe('orgunit-extraction-v1');
    }
  });

  it('includes all six known rejected DEVELOPMENT items among the changed documents', () => {
    const changedIds = new Set(changed.map((i) => i.goldId));
    for (const goldId of REJECTED_GOLD_IDS) {
      expect(changedIds.has(goldId), `${goldId} should have been canonicalised`).toBe(true);
    }
  });

  it('changes a document only by canonicalising title, headings and excerpt', () => {
    for (const [index, item] of DERIVED.entries()) {
      const source = SOURCE_DEV[index]!.document;
      expect(item.document.url).toBe(source.url);
      expect(item.document.declaredLang).toBe(source.declaredLang);
      expect(item.document.discoveryMethod).toBe(source.discoveryMethod);
      expect(item.document.mainTextTruncated).toBe(source.mainTextTruncated);
      expect(item.document.excerptTruncated).toBe(source.excerptTruncated);
      expect(canonicalStringify(item.document.signals)).toBe(canonicalStringify(source.signals));
      expect(canonicalStringify(item.document.roots)).toBe(canonicalStringify(source.roots));
      expect(canonicalStringify(item.document.duplicateUrls)).toBe(
        canonicalStringify(source.duplicateUrls),
      );
    }
  });
});

describe('hashes recompute deterministically', () => {
  it('recomputes every per-document hash from the document itself', () => {
    for (const item of DERIVED) expect(hashDocument(item.document)).toBe(item.documentSha256);
  });

  it('recomputes the derived corpus content hash', () => {
    expect(DERIVED_MANIFEST['corpusSha256']).toBe(hashRecords(DERIVED));
  });

  it('applies canonicalEvidenceText itself to reproduce every derived document', () => {
    // The derivation is not trusted on its own word: each derived document is
    // rebuilt here from the SOURCE document through the public
    // canonicalisation function.
    for (const [index, item] of DERIVED.entries()) {
      const source = SOURCE_DEV[index]!.document;
      const rebuilt = {
        ...source,
        title: source.title === null ? null : canonicalEvidenceText(source.title),
        headings: source.headings.map((h) => ({
          level: h.level,
          text: canonicalEvidenceText(h.text),
        })),
        excerpt: canonicalEvidenceText(source.excerpt),
      };
      expect(canonicalStringify(item.document)).toBe(canonicalStringify(rebuilt));
      expect(item.documentSha256).toBe(hashDocument(rebuilt));
    }
  });

  it('canonicalising a derived document again is a no-op, so the derivation is idempotent', () => {
    for (const item of DERIVED) {
      const again = {
        ...item.document,
        title: item.document.title === null ? null : canonicalEvidenceText(item.document.title),
        headings: item.document.headings.map((h) => ({
          level: h.level,
          text: canonicalEvidenceText(h.text),
        })),
        excerpt: canonicalEvidenceText(item.document.excerpt),
      };
      expect(canonicalStringify(again)).toBe(canonicalStringify(item.document));
    }
  });
});

describe('re-running the derivation produces byte-identical output', () => {
  it('the committed corpus bytes are exactly what the derivation serializes', () => {
    // The script is deterministic by construction - no clock, no randomness,
    // no environment read, no database - so reproducing its serialization
    // in-process proves a re-run cannot produce different bytes.
    const rebuilt = `${DERIVED.map((item) => canonicalStringify(item)).join('\n')}\n`;
    expect(rawOf(DERIVED_NAME)).toBe(rebuilt);
  });

  it('the committed manifest bytes are exactly what the derivation serializes', () => {
    expect(rawOf(DERIVED_MANIFEST_NAME)).toBe(`${canonicalStringify(DERIVED_MANIFEST)}\n`);
  });
});

describe('the derived manifest identifies its inputs and its own output', () => {
  it('names the source corpus version and both source hashes', () => {
    expect(DERIVED_MANIFEST['sourceCorpusVersion']).toBe('orgunit-classifier-sonnet-acceptance-v1');
    expect(DERIVED_MANIFEST['sourceCorpusRawSha256']).toBe(SOURCE_CORPUS_RAW_SHA256);
    expect(DERIVED_MANIFEST['sourceManifestCorpusSha256']).toBe(SOURCE_MANIFEST_CORPUS_SHA256);
  });

  it('names the derivation and canonicalisation it performed', () => {
    expect(DERIVED_MANIFEST['derivationVersion']).toBe(
      'orgunit-classifier-sonnet-acceptance-canonical-v2',
    );
    expect(DERIVED_MANIFEST['canonicalisationRule']).toBe(
      'NFC(decodeHtmlEntities_HTML4_once(text))',
    );
    expect(DERIVED_MANIFEST['split']).toBe('DEVELOPMENT');
    expect(DERIVED_MANIFEST['itemCount']).toBe(49);
  });

  it('lists the changed gold ids, in corpus order, matching the recomputed set', () => {
    const changedIds = DERIVED.filter(
      (item, index) => item.documentSha256 !== SOURCE_DEV[index]!.documentSha256,
    ).map((item) => item.goldId);
    expect(DERIVED_MANIFEST['changedGoldIds']).toEqual(changedIds);
  });
});

describe('the six rejected 2D2B items, against the real frozen documents', () => {
  const derivedById = new Map(DERIVED.map((item) => [item.goldId, item]));
  const sourceById = new Map(SOURCE_DEV.map((item) => [item.goldId, item]));

  it('every rejected id is present in the DEVELOPMENT split', () => {
    for (const goldId of REJECTED_GOLD_IDS) expect(derivedById.has(goldId)).toBe(true);
  });

  it('carried undecoded entities before canonicalisation, and none after', () => {
    const ENTITY = /&[a-zA-Z][a-zA-Z0-9]*;/;
    for (const goldId of REJECTED_GOLD_IDS) {
      const before = sourceById.get(goldId)!.document;
      const after = derivedById.get(goldId)!.document;
      const textOf = (d: typeof before): string =>
        [d.title ?? '', d.excerpt, ...d.headings.map((h) => h.text)].join('\n');
      expect(ENTITY.test(textOf(before)), `${goldId} should carry an entity before`).toBe(true);
      expect(ENTITY.test(textOf(after)), `${goldId} should carry none after`).toBe(false);
    }
  });

  it('verifies a decoded TITLE quote against the canonical document but not the v1 one', () => {
    // gdb5b7246327094ef's v1 title reads `Coop&eacute;ration r&eacute;gionale`.
    const quote = 'Coopération régionale';
    expect(
      evidenceSpanVerifies(sourceById.get('gdb5b7246327094ef')!.document, 'TITLE', quote),
    ).toBe(false);
    expect(
      evidenceSpanVerifies(derivedById.get('gdb5b7246327094ef')!.document, 'TITLE', quote),
    ).toBe(true);
  });

  it('verifies the decoded organisation name on every Sorbonne rejected item', () => {
    for (const goldId of [
      'g0ec0d43dad311a77',
      'g877a05e6f5bba835',
      'gcce4e2a5f608de5d',
      'gf65026e32d9da8db',
    ]) {
      const quote = 'Université Sorbonne Nouvelle';
      expect(evidenceSpanVerifies(sourceById.get(goldId)!.document, 'TITLE', quote)).toBe(false);
      expect(evidenceSpanVerifies(derivedById.get(goldId)!.document, 'TITLE', quote)).toBe(true);
    }
  });

  it('accepts the Mayotte capitalisation difference on ga435ea22d4b11cf4', () => {
    // The document says `centre de documentation`; the returned name is
    // conventionally capitalised. Case folding is what makes this verify.
    const document = derivedById.get('ga435ea22d4b11cf4')!.document;
    expect(unitNameVerifies(document, 'Centre de documentation')).toBe(true);
    expect(unitNameVerifies(document, 'centre de documentation')).toBe(true);
  });

  it('accepts DAI on g0ec0d43dad311a77', () => {
    expect(unitNameVerifies(derivedById.get('g0ec0d43dad311a77')!.document, 'DAI')).toBe(true);
  });

  it('still REFUSES the sibling-only Sorbonne expansion, in any capitalisation', () => {
    // `Direction des Affaires Internationales (DAI)` appears only in SIBLING
    // documents, never in g0ec0d43dad311a77's own fields. Assembling a name
    // from a sibling is a fabrication about this document, and widening the
    // fold to case must not have made it verifiable.
    const document = derivedById.get('g0ec0d43dad311a77')!.document;
    expect(unitNameVerifies(document, 'Direction des Affaires Internationales (DAI)')).toBe(false);
    expect(unitNameVerifies(document, 'direction des affaires internationales (dai)')).toBe(false);
    expect(unitNameVerifies(document, 'DIRECTION DES AFFAIRES INTERNATIONALES (DAI)')).toBe(false);
    expect(unitNameVerifies(document, 'Direction des Affaires Internationales')).toBe(false);
  });
});
