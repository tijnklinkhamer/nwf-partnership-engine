/**
 * EXACT-CONTENT DEDUPE: representative selection, provenance retention, and
 * row-order independence - the properties the design's §3/§9/§30 depend on.
 */
import { describe, expect, it } from 'vitest';
import {
  dedupeByResponseSha256,
  distinctRootKeys,
  distinctTracks,
  distinctUrls,
} from '../../orgunits/classify/dedupe.js';
import type { RawEligibleCandidateRow } from '../../orgunits/classify/types.js';

function row(
  overrides: Partial<RawEligibleCandidateRow> & { candidateId: string },
): RawEligibleCandidateRow {
  return {
    pageEvidenceId: `page-${overrides.candidateId}`,
    rootKey: 'claim:11111111-1111-1111-1111-111111111111',
    track: 'A',
    candidateScore: 5,
    rankWithinRoot: 1,
    signals: [],
    title: 'Title',
    declaredLang: 'en',
    headings: [],
    mainText: 'Body text.',
    mainTextTruncated: false,
    extractionRuleVersion: 'orgunit-extraction-v1',
    url: 'https://www.example.ac.uk/a',
    discoveryMethod: 'LINK',
    responseSha256: 'a'.repeat(64),
    ...overrides,
  };
}

describe('dedupeByResponseSha256', () => {
  it('groups exact-content duplicates into one group', () => {
    const rows = [
      row({
        candidateId: '1',
        url: 'https://x.fr/a?RH=1',
        responseSha256: 'sha-a',
        rankWithinRoot: 3,
      }),
      row({
        candidateId: '2',
        url: 'https://x.fr/a?RH=2',
        responseSha256: 'sha-a',
        rankWithinRoot: 1,
      }),
      row({
        candidateId: '3',
        url: 'https://x.fr/a?RH=3',
        responseSha256: 'sha-a',
        rankWithinRoot: 2,
      }),
    ];
    const groups = dedupeByResponseSha256(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.subjects).toHaveLength(3);
  });

  it('picks the best rankWithinRoot as representative, ties broken by lexically-least URL', () => {
    const rows = [
      row({ candidateId: '1', url: 'https://x.fr/b', responseSha256: 'sha-a', rankWithinRoot: 2 }),
      row({ candidateId: '2', url: 'https://x.fr/a', responseSha256: 'sha-a', rankWithinRoot: 2 }),
      row({ candidateId: '3', url: 'https://x.fr/c', responseSha256: 'sha-a', rankWithinRoot: 1 }),
    ];
    const [group] = dedupeByResponseSha256(rows);
    // rank 1 beats rank 2 regardless of URL.
    expect(group!.representative.candidateId).toBe('3');
  });

  it('breaks a rank tie by lexically-least URL', () => {
    const rows = [
      row({ candidateId: '1', url: 'https://x.fr/z', responseSha256: 'sha-a', rankWithinRoot: 1 }),
      row({ candidateId: '2', url: 'https://x.fr/a', responseSha256: 'sha-a', rankWithinRoot: 1 }),
    ];
    const [group] = dedupeByResponseSha256(rows);
    expect(group!.representative.url).toBe('https://x.fr/a');
  });

  it('keeps different content in different groups', () => {
    const rows = [
      row({ candidateId: '1', responseSha256: 'sha-a' }),
      row({ candidateId: '2', responseSha256: 'sha-b' }),
    ];
    expect(dedupeByResponseSha256(rows)).toHaveLength(2);
  });

  it('produces an identical result regardless of input row order', () => {
    const rows = [
      row({ candidateId: '1', url: 'https://x.fr/c', responseSha256: 'sha-a', rankWithinRoot: 3 }),
      row({ candidateId: '2', url: 'https://x.fr/a', responseSha256: 'sha-a', rankWithinRoot: 1 }),
      row({ candidateId: '3', url: 'https://x.fr/b', responseSha256: 'sha-a', rankWithinRoot: 2 }),
      row({ candidateId: '4', responseSha256: 'sha-b' }),
    ];
    const forward = dedupeByResponseSha256(rows);
    const reversed = dedupeByResponseSha256([...rows].reverse());
    const shuffled = dedupeByResponseSha256([rows[2]!, rows[0]!, rows[3]!, rows[1]!]);

    const summarise = (groups: ReturnType<typeof dedupeByResponseSha256>) =>
      groups.map((g) => ({
        rep: g.representative.candidateId,
        subjects: g.subjects.map((s) => s.candidateId).sort(),
      }));

    expect(summarise(forward)).toEqual(summarise(reversed));
    expect(summarise(forward)).toEqual(summarise(shuffled));
  });
});

describe('provenance accessors', () => {
  it('distinctRootKeys/Urls/Tracks are sorted and deduplicated', () => {
    const rows = [
      row({
        candidateId: '1',
        rootKey: 'claim:b',
        url: 'https://x.fr/2',
        track: 'B',
        responseSha256: 'sha-a',
      }),
      row({
        candidateId: '2',
        rootKey: 'claim:a',
        url: 'https://x.fr/1',
        track: 'A',
        responseSha256: 'sha-a',
      }),
      row({
        candidateId: '3',
        rootKey: 'claim:a',
        url: 'https://x.fr/1',
        track: 'A',
        responseSha256: 'sha-a',
      }),
    ];
    const [group] = dedupeByResponseSha256(rows);
    expect(distinctRootKeys(group!)).toEqual(['claim:a', 'claim:b']);
    expect(distinctUrls(group!)).toEqual(['https://x.fr/1', 'https://x.fr/2']);
    expect(distinctTracks(group!)).toEqual(['A', 'B']);
  });

  it('reflects cross-root duplication (the INSA shape) without losing either root', () => {
    const rows = [
      row({
        candidateId: '1',
        rootKey: 'claim:root-1',
        url: 'https://insa.fr/international',
        responseSha256: 'sha-insa',
      }),
      row({
        candidateId: '2',
        rootKey: 'promotion:root-2',
        url: 'https://insa.fr/international',
        responseSha256: 'sha-insa',
        rankWithinRoot: 5,
      }),
    ];
    const [group] = dedupeByResponseSha256(rows);
    expect(distinctRootKeys(group!)).toEqual(['claim:root-1', 'promotion:root-2']);
    expect(group!.subjects.map((s) => s.candidateId).sort()).toEqual(['1', '2']);
  });

  it('reflects cross-track duplication when the same page is eligible on both tracks', () => {
    const rows = [
      row({ candidateId: '1', track: 'A', responseSha256: 'sha-a', rankWithinRoot: 1 }),
      row({ candidateId: '2', track: 'B', responseSha256: 'sha-a', rankWithinRoot: 4 }),
    ];
    const [group] = dedupeByResponseSha256(rows);
    expect(distinctTracks(group!)).toEqual(['A', 'B']);
  });
});
