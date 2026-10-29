/**
 * REL harvest H1 (ported from REL-F1-R2 Wave 2 item a) - the per-run signal
 * ruleset, PURE half.
 *
 * A run's STORED rule version selects its ruleset; v1 is the frozen ECHE
 * ruleset and the frontier's default, v2 the discovery-subject ruleset. The
 * database half (stamping, refusal before any request, candidate rows) is
 * `src/test/integration/relHarvestSignalRulesetPerRun.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { createFrontier } from '../../orgunits/orchestrator/frontier.js';
import {
  ECHE_RUN_SIGNAL_RULE_VERSION,
  RunSignalRulesetRefusal,
  SIGNAL_RULESET_V1,
  SIGNAL_RULESET_V2,
  SUBJECT_RUN_SIGNAL_RULE_VERSION,
  requiredSignalRuleVersion,
  signalRulesetFor,
} from '../../orgunits/orchestrator/signalRuleset.js';
import {
  ORGUNIT_SIGNAL_RULE_VERSION,
  scoreFetchedPageCandidate,
  scoreFrontierUrl,
} from '../../orgunits/signals/score.js';
import { ORGUNIT_SIGNAL_RULE_VERSION_V2 } from '../../orgunits/signals/scoreV2.js';

const JA_URL = 'https://www.synthetic-ja.example.jp/ryugakusei/';
const JA_ANCHOR = '留学生センター';

describe('the stored rule version selects the ruleset', () => {
  it('v1 and v2 are the two implemented rulesets; anything else is refused, never defaulted', () => {
    expect(signalRulesetFor(ORGUNIT_SIGNAL_RULE_VERSION)).toBe(SIGNAL_RULESET_V1);
    expect(signalRulesetFor(ORGUNIT_SIGNAL_RULE_VERSION_V2)).toBe(SIGNAL_RULESET_V2);
    for (const unknown of ['orgunit-signal-rules-v3', 'test-rules-1', '']) {
      expect(() => signalRulesetFor(unknown)).toThrow(RunSignalRulesetRefusal);
    }
  });

  it('v1 is exactly the frozen score.ts entry points', () => {
    expect(SIGNAL_RULESET_V1.scoreFrontierUrl).toBe(scoreFrontierUrl);
    expect(SIGNAL_RULESET_V1.scoreFetchedPageCandidate).toBe(scoreFetchedPageCandidate);
    expect(Object.isFrozen(SIGNAL_RULESET_V1) && Object.isFrozen(SIGNAL_RULESET_V2)).toBe(true);
  });

  it('a root scope requires exactly one version: ECHE -> v1, subject admission -> v2', () => {
    expect(ECHE_RUN_SIGNAL_RULE_VERSION).toBe('orgunit-signal-rules-v1');
    expect(SUBJECT_RUN_SIGNAL_RULE_VERSION).toBe('orgunit-signal-rules-v2');
    expect(requiredSignalRuleVersion({ subjectAdmissionId: null })).toBe(
      ECHE_RUN_SIGNAL_RULE_VERSION,
    );
    expect(
      requiredSignalRuleVersion({ subjectAdmissionId: '00000000-0000-4000-8000-000000000001' }),
    ).toBe(SUBJECT_RUN_SIGNAL_RULE_VERSION);
  });
});

describe('the frontier scores with the ruleset it was given', () => {
  it('defaults to v1, so every existing caller scores exactly as before', () => {
    const admission = createFrontier().add(JA_URL, 'LINK', null, JA_ANCHOR);
    expect(admission.ok).toBe(true);
    if (!admission.ok) return;
    expect(admission.entry.score).toEqual(
      scoreFrontierUrl({
        url: JA_URL,
        anchorText: JA_ANCHOR,
        discoveryParentUrl: null,
        sectionAncestors: [],
      }),
    );
    expect(admission.entry.score.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
  });

  it('under v2 a Japanese anchor carries a Track A signal v1 cannot see', () => {
    const v1 = createFrontier().add(JA_URL, 'LINK', null, JA_ANCHOR);
    const v2 = createFrontier(SIGNAL_RULESET_V2.scoreFrontierUrl).add(
      JA_URL,
      'LINK',
      null,
      JA_ANCHOR,
    );
    if (!v1.ok || !v2.ok) throw new Error('not admitted');
    const trackA = (entry: typeof v1.entry) => entry.score.tracks.find((t) => t.track === 'A')!;
    expect(v2.entry.score.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION_V2);
    expect(trackA(v2.entry).score).toBeGreaterThan(trackA(v1.entry).score);
    expect(trackA(v2.entry).matchedSignals.map((s) => s.pack)).toContain('ja');
    expect(trackA(v1.entry).matchedSignals.map((s) => s.pack)).not.toContain('ja');
  });

  it('candidate scoring under each ruleset is stamped with that ruleset', () => {
    const input = { url: JA_URL, title: '国際交流協会 留学生センター', headings: [] };
    expect(SIGNAL_RULESET_V1.scoreFetchedPageCandidate(input).ruleVersion).toBe(
      ORGUNIT_SIGNAL_RULE_VERSION,
    );
    expect(SIGNAL_RULESET_V2.scoreFetchedPageCandidate(input).ruleVersion).toBe(
      ORGUNIT_SIGNAL_RULE_VERSION_V2,
    );
  });
});
