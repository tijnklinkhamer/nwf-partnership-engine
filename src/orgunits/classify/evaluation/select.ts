/**
 * CORPUS SELECTION - the pure pipeline from production-assembled batches to
 * frozen gold-corpus items.
 *
 * WHAT THE POOL IS. The candidate pool is exactly the set of documents the
 * PRODUCTION assembly (`assemble.ts`) would hand a classifier for each
 * organisation's latest COMPLETED research run: same rank-8 eligibility,
 * same content-hash dedupe, same excerpt/heading bounds, same canonical
 * ordering. The corpus therefore measures models on the workload production
 * will actually send - never on documents production could not produce.
 *
 * WHAT THIS MODULE ADDS. A content-derived `goldId`, mechanical strata, a
 * deterministic per-organisation cap (protocol
 * `MAX_CORPUS_ITEMS_PER_ORGANISATION`, priority: best rank ascending, then
 * URL ascending - the pages production ranks highest are the ones whose
 * classification matters most), the deterministic split, and the frozen
 * document hash. It NEVER edits a document: the `document` field is the
 * assembled `ClassifierDocument` verbatim.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import type { AssembledBatch, ClassifierDocument } from '../types.js';
import { hashDocument, sha256OfCanonical } from './hashes.js';
import {
  MAX_CORPUS_ITEMS_PER_ORGANISATION,
  ORGUNIT_CLASSIFIER_GOLD_CORPUS_VERSION,
  type SplitAssignment,
} from './protocol.js';
import { assignSplits } from './split.js';
import { deriveStrata, type MechanicalStrata } from './strata.js';

export interface CandidateMeta {
  readonly track: 'A' | 'B';
  readonly candidateScore: number;
  readonly rankWithinRoot: number;
  readonly rootKey: string;
}

export interface PageMeta {
  readonly responseSha256: string;
  readonly candidates: readonly CandidateMeta[];
}

export interface OrganisationAssemblyInput {
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly organisationName: string;
  readonly countryCode: string;
  readonly runId: string;
  readonly batches: readonly AssembledBatch[];
  /** Keyed by `orgunit_page_evidence` id (the dedupe representative's). */
  readonly pageMetaByEvidenceId: ReadonlyMap<string, PageMeta>;
}

/**
 * The in-memory corpus item shape (readonly). The committed JSONL rows are
 * validated against `goldSchema.ts`'s `GoldCorpusItemSchema`, and the
 * generator parses every item through that schema before writing, so the
 * two shapes cannot drift silently.
 */
export interface CorpusItem {
  readonly goldId: string;
  readonly corpusVersion: string;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly organisationName: string;
  readonly countryCode: string;
  readonly runId: string;
  readonly batchRootKey: string | null;
  readonly assemblyInputSha256: string;
  readonly docIndex: number;
  readonly pageEvidenceId: string;
  readonly responseSha256: string;
  readonly candidateMeta: readonly CandidateMeta[];
  readonly document: ClassifierDocument;
  readonly documentSha256: string;
  readonly strata: MechanicalStrata;
  readonly split: SplitAssignment;
}

export interface CorpusBuildResult {
  readonly items: readonly CorpusItem[];
  /** goldIds removed by the per-organisation cap, in removal order. */
  readonly cappedOut: readonly { goldId: string; echeRowKey: string; url: string }[];
}

export function deriveGoldId(echeRowKey: string, responseSha256: string): string {
  return `g${sha256OfCanonical({ echeRowKey, responseSha256 }).slice(0, 16)}`;
}

interface DraftItem {
  readonly goldId: string;
  readonly organisation: OrganisationAssemblyInput;
  readonly batchRootKey: string | null;
  readonly assemblyInputSha256: string;
  readonly document: ClassifierDocument;
  readonly pageEvidenceId: string;
  readonly meta: PageMeta;
  readonly bestRank: number;
}

export function buildCorpusItems(
  organisations: readonly OrganisationAssemblyInput[],
): CorpusBuildResult {
  const drafts: DraftItem[] = [];
  const seenGoldIds = new Set<string>();

  for (const organisation of organisations) {
    for (const assembled of organisation.batches) {
      for (const document of assembled.batch.documents) {
        const pageEvidenceId = assembled.pageEvidenceIdByDocIndex.get(document.docIndex);
        if (pageEvidenceId === undefined) {
          throw new Error(
            `buildCorpusItems: batch ${assembled.assemblyInputSha256} has no page-evidence id for doc_index ${document.docIndex}`,
          );
        }
        const meta = organisation.pageMetaByEvidenceId.get(pageEvidenceId);
        if (meta === undefined) {
          throw new Error(`buildCorpusItems: no page meta for page evidence ${pageEvidenceId}`);
        }
        if (meta.candidates.length === 0) {
          throw new Error(`buildCorpusItems: page evidence ${pageEvidenceId} has no candidates`);
        }
        const goldId = deriveGoldId(organisation.echeRowKey, meta.responseSha256);
        if (seenGoldIds.has(goldId)) {
          throw new Error(
            `buildCorpusItems: duplicate goldId ${goldId} (organisation ${organisation.echeRowKey}, url ${document.url}) - dedupe should have collapsed this content`,
          );
        }
        seenGoldIds.add(goldId);
        drafts.push({
          goldId,
          organisation,
          batchRootKey: assembled.batch.context.rootKey,
          assemblyInputSha256: assembled.assemblyInputSha256,
          document,
          pageEvidenceId,
          meta,
          bestRank: Math.min(...meta.candidates.map((c) => c.rankWithinRoot)),
        });
      }
    }
  }

  const kept: DraftItem[] = [];
  const cappedOut: { goldId: string; echeRowKey: string; url: string }[] = [];
  const byOrganisation = new Map<string, DraftItem[]>();
  for (const draft of drafts) {
    const group = byOrganisation.get(draft.organisation.echeRowKey);
    if (group === undefined) byOrganisation.set(draft.organisation.echeRowKey, [draft]);
    else group.push(draft);
  }
  for (const group of byOrganisation.values()) {
    const prioritised = [...group].sort((a, b) => {
      if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
      return a.document.url < b.document.url ? -1 : a.document.url > b.document.url ? 1 : 0;
    });
    kept.push(...prioritised.slice(0, MAX_CORPUS_ITEMS_PER_ORGANISATION));
    for (const dropped of prioritised.slice(MAX_CORPUS_ITEMS_PER_ORGANISATION)) {
      cappedOut.push({
        goldId: dropped.goldId,
        echeRowKey: dropped.organisation.echeRowKey,
        url: dropped.document.url,
      });
    }
  }

  const splits = assignSplits(
    kept.map((draft) => ({ goldId: draft.goldId, echeRowKey: draft.organisation.echeRowKey })),
  );

  const items = kept
    .map((draft): CorpusItem => {
      const split = splits.get(draft.goldId);
      if (split === undefined) throw new Error(`buildCorpusItems: no split for ${draft.goldId}`);
      const trackScores = draft.meta.candidates.map((c) => ({
        track: c.track,
        candidateScore: c.candidateScore,
      }));
      return {
        goldId: draft.goldId,
        corpusVersion: ORGUNIT_CLASSIFIER_GOLD_CORPUS_VERSION,
        echeRowKey: draft.organisation.echeRowKey,
        organisationId: draft.organisation.organisationId,
        organisationName: draft.organisation.organisationName,
        countryCode: draft.organisation.countryCode,
        runId: draft.organisation.runId,
        batchRootKey: draft.batchRootKey,
        assemblyInputSha256: draft.assemblyInputSha256,
        docIndex: draft.document.docIndex,
        pageEvidenceId: draft.pageEvidenceId,
        responseSha256: draft.meta.responseSha256,
        candidateMeta: [...draft.meta.candidates].sort((a, b) => {
          if (a.track !== b.track) return a.track < b.track ? -1 : 1;
          if (a.rootKey !== b.rootKey) return a.rootKey < b.rootKey ? -1 : 1;
          return a.rankWithinRoot - b.rankWithinRoot;
        }),
        document: draft.document,
        documentSha256: hashDocument(draft.document),
        strata: deriveStrata(draft.document, trackScores),
        split,
      };
    })
    .sort((a, b) => {
      if (a.echeRowKey !== b.echeRowKey) return a.echeRowKey < b.echeRowKey ? -1 : 1;
      if (a.document.url !== b.document.url) return a.document.url < b.document.url ? -1 : 1;
      return a.goldId < b.goldId ? -1 : 1;
    });

  return { items, cappedOut };
}
