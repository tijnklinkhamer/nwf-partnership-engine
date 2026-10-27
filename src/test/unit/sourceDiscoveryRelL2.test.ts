/**
 * REL L2 / U1 - source discovery, the PURE parts: briefs, nomination
 * preparation, the HEI flag, the sealed authorisation and the Claude Max
 * adapter against a FAKE SDK `query`. No database, no network, no model.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  BriefRefusal,
  KNOWN_BRIEFS,
  NWF_DISCOVERY_BRIEF_V1,
  PILOT_BRIEF_KEY,
  assertBriefWellFormed,
  briefByKey,
  briefDigest,
  queriesFor,
  type DiscoveryBrief,
} from '../../orgunits/sourceDiscovery/brief.js';
import { HEI_SIGNAL_RULE_VERSION, heiSignalOf } from '../../orgunits/sourceDiscovery/heiSignal.js';
import {
  prepareNomination,
  sanitiseNominationText,
} from '../../orgunits/sourceDiscovery/nomination.js';
import { SourceDiscoveryAuthorisation } from '../../orgunits/sourceDiscovery/authorisation.js';
import {
  ClaudeMaxWebSearchProvider,
  REFUSED_TOOLS,
  WebSearchGate,
  buildWebSearchAgentOptions,
  buildWebSearchPrompt,
  type AgentMessage,
  type AgentQueryFn,
  type WebSearchAgentOptions,
} from '../../orgunits/sourceDiscovery/claudeMaxWebSearchProvider.js';
import {
  SearchProviderError,
  type SearchRequest,
} from '../../orgunits/sourceDiscovery/provider.js';
import { ScriptedSearchProvider } from '../../orgunits/sourceDiscovery/scriptedProvider.js';
import {
  nominationCitationDigest,
  promotionRequest,
  PromotionRefusal,
} from '../../orgunits/sourceDiscovery/promote.js';
import type { NominationRow } from '../../orgunits/sourceDiscovery/store.js';

/** The pilot brief's digest, pinned: changing one query character must fail here first. */
const PILOT_BRIEF_DIGEST = '2bccbc8946e4f0c82c0c63047d90f66e0b83c04da58f36fa47435385d95febac';

describe('REL L2 briefs: deterministic, versioned, geography-claimed', () => {
  it('the pilot brief is well-formed, claims exactly JP/MX/NL and is pinned by digest', () => {
    assertBriefWellFormed(NWF_DISCOVERY_BRIEF_V1);
    expect(NWF_DISCOVERY_BRIEF_V1.briefKey).toBe('nwf-discovery-brief-v1');
    expect([...NWF_DISCOVERY_BRIEF_V1.geographyClaim]).toEqual(['JP', 'MX', 'NL']);
    expect(briefDigest(NWF_DISCOVERY_BRIEF_V1)).toBe(PILOT_BRIEF_DIGEST);
    expect(briefDigest(briefByKey(PILOT_BRIEF_KEY))).toBe(PILOT_BRIEF_DIGEST);
    expect([...KNOWN_BRIEFS.keys()]).toEqual([PILOT_BRIEF_KEY]);
  });

  it('gives each country local-language plus English queries for NWF audiences', () => {
    const expected = { JP: ['ja', 'en'], MX: ['es', 'en'], NL: ['nl', 'en'] } as const;
    for (const [geo, langs] of Object.entries(expected)) {
      const section = queriesFor(NWF_DISCOVERY_BRIEF_V1, geo);
      expect([...section.languages]).toEqual(langs);
      for (const lang of langs) {
        expect(section.queries.filter((q) => q.language === lang).length).toBeGreaterThan(1);
      }
      for (const q of section.queries)
        expect(q.queryId.startsWith(`${geo.toLowerCase()}.`)).toBe(true);
    }
    const texts = NWF_DISCOVERY_BRIEF_V1.sections.flatMap((s) => s.queries.map((q) => q.text));
    expect(texts).toContain('国際交流協会 語学');
    expect(texts).toContain('intercambio de idiomas asociación');
    expect(texts).toContain('taalcafé vrijwilligers');
    const kinds = new Set(
      NWF_DISCOVERY_BRIEF_V1.sections.flatMap((s) => s.queries.map((q) => q.targetKind)),
    );
    for (const k of [
      'LANGUAGE_EXCHANGE_GROUP',
      'LANGUAGE_CAFE',
      'CULTURAL_CENTRE',
      'COMMUNITY_LANGUAGE_CLASS',
    ]) {
      expect(kinds.has(k as never), k).toBe(true);
    }
  });

  it('refuses a geography the brief does not claim, and an unknown brief', () => {
    expect(() => queriesFor(NWF_DISCOVERY_BRIEF_V1, 'FR')).toThrow(BriefRefusal);
    expect(() => queriesFor(NWF_DISCOVERY_BRIEF_V1, 'jp')).toThrow(/GEOGRAPHY_NOT_CLAIMED/);
    expect(() => briefByKey('nwf-discovery-brief-v2')).toThrow(/BRIEF_UNKNOWN/);
  });

  it('a one-character change is a new digest, and a malformed brief is refused', () => {
    const changed: DiscoveryBrief = {
      ...NWF_DISCOVERY_BRIEF_V1,
      sections: NWF_DISCOVERY_BRIEF_V1.sections.map((s, i) =>
        i === 0
          ? { ...s, queries: s.queries.map((q, j) => (j === 0 ? { ...q, text: `${q.text}!` } : q)) }
          : s,
      ),
    };
    expect(briefDigest(changed)).not.toBe(PILOT_BRIEF_DIGEST);
    const dup: DiscoveryBrief = {
      ...NWF_DISCOVERY_BRIEF_V1,
      sections: NWF_DISCOVERY_BRIEF_V1.sections.map((s, i) =>
        i === 0 ? { ...s, queries: [...s.queries, s.queries[0]!] } : s,
      ),
    };
    expect(() => assertBriefWellFormed(dup)).toThrow(/duplicate query id/);
    const noEnglish: DiscoveryBrief = {
      ...NWF_DISCOVERY_BRIEF_V1,
      sections: NWF_DISCOVERY_BRIEF_V1.sections.map((s) => ({
        ...s,
        languages: s.languages.filter((l) => l !== 'en'),
        queries: s.queries.filter((q) => q.language !== 'en'),
      })),
    };
    expect(() => assertBriefWellFormed(noEnglish)).toThrow(/no English/);
  });
});

describe('REL L2 nomination preparation: the existing URL, host and redaction rules', () => {
  const ok = (url: string, title: string | null = 'Taalcafé', snippet: string | null = null) => {
    const r = prepareNomination({ url, title, snippet });
    if (!r.ok) throw new Error(`refused ${url}: ${r.reason}`);
    return r.value;
  };
  const reason = (url: string) => {
    const r = prepareNomination({ url, title: null, snippet: null });
    return r.ok ? 'ADMITTED' : r.reason;
  };

  it('admits an ordinary organisation URL and computes its registrable domain with tldts', () => {
    const v = ok('https://WWW.Taalcafe-Fict.nl/over-ons');
    expect(v.url).toBe('https://www.taalcafe-fict.nl/over-ons');
    expect(v.hostname).toBe('www.taalcafe-fict.nl');
    expect(v.registrableDomain).toBe('taalcafe-fict.nl');
    expect(ok('https://kokusai-koryu-fict.or.jp/').registrableDomain).toBe(
      'kokusai-koryu-fict.or.jp',
    );
    expect(ok('http://intercambio-fict.org.mx/').registrableDomain).toBe('intercambio-fict.org.mx');
  });

  it('applies url.ts rules: scheme, port (even :443), userinfo, IP literal, fragment, suffix', () => {
    expect(reason('taalcafe-fict.nl')).toBe('URL_SCHEME_MISSING');
    expect(reason('ftp://taalcafe-fict.nl/')).toBe('URL_SCHEME_NOT_HTTP');
    expect(reason('https://taalcafe-fict.nl:443/')).toBe('URL_EXPLICIT_PORT');
    expect(reason('https://taalcafe-fict.nl:8080/')).toBe('URL_EXPLICIT_PORT');
    expect(reason('https://user:pw@taalcafe-fict.nl/')).toBe('URL_USERINFO_PRESENT');
    expect(reason('https://93.184.216.34/')).toBe('URL_HOST_IS_IP_LITERAL');
    expect(reason('https://taalcafe-fict.nl/#x')).toBe('URL_FRAGMENT_PRESENT');
    expect(reason('https://taalcafe.invalidtld/')).toBe('URL_NO_ICANN_PUBLIC_SUFFIX');
  });

  it('refuses social-platform and messaging hosts, service subdomains and query strings', () => {
    for (const url of [
      'https://www.facebook.com/groups/taalcafe',
      'https://instagram.com/gogaku_cafe',
      'https://m.facebook.com/x',
      'https://wa.me/31612345678',
      'https://t.me/intercambio',
      'https://www.linkedin.com/company/x',
      'https://discord.gg/abc',
      'https://www.youtube.com/@x',
    ]) {
      expect(reason(url), url).toBe('SOCIAL_OR_MESSAGING_HOST');
    }
    expect(reason('https://mail.taalcafe-fict.nl/')).toBe('SERVICE_SUBDOMAIN');
    expect(reason('https://taalcafe-fict.nl/?page=1')).toBe('URL_NOT_ADMISSIBLE');
  });

  it('redacts emails, Japanese and international phone numbers and handles in title and snippet', () => {
    const v = ok(
      'https://gogaku-fict.jp/',
      '語学カフェ 03(1234)5678',
      'お問い合わせ: info@gogaku-fict.jp / 電話 03-1234-5678 / 携帯 +81 90-1234-5678 / 0312345678 / @gogaku_cafe 2026年',
    );
    expect(v.title).toBe('語学カフェ [PHONE]');
    expect(v.snippet).toContain('[EMAIL]');
    expect(v.snippet).toContain('[HANDLE]');
    expect(v.snippet).not.toMatch(/@/);
    expect(v.snippet).not.toMatch(/[0-9](?:[ .()+/-]{0,2}[0-9]){8}/);
    expect(v.snippet!.match(/\[PHONE\]/g)).toHaveLength(3);
    expect(v.snippet).toContain('2026年');
  });

  it('caps title and snippet deterministically by code point, after redaction', () => {
    const long = '語'.repeat(400);
    expect([...sanitiseNominationText(long, 300)!]).toHaveLength(300);
    expect(sanitiseNominationText('   ', 300)).toBeNull();
    expect(sanitiseNominationText(null, 300)).toBeNull();
    expect(sanitiseNominationText('a\u0000b\tc', 300)).toBe('a b c');
  });
});

describe('REL L2 hei_signal: a flag from a versioned rule, never a verdict', () => {
  it('flags academic hosts and higher-education titles, and nothing else', () => {
    expect(heiSignalOf('www.fict-u.ac.jp', null)).toMatchObject({
      flag: true,
      reasons: ['ACADEMIC_HOST'],
    });
    expect(heiSignalOf('fict.edu.mx', null).flag).toBe(true);
    expect(heiSignalOf('fict.edu', null).flag).toBe(true);
    expect(heiSignalOf('fict-u.jp', '架空大学 国際センター').reasons).toEqual([
      'HEI_TERM_IN_TITLE',
    ]);
    expect(heiSignalOf('fict.nl', 'Universiteit van Fictie').flag).toBe(true);
    expect(heiSignalOf('fict.mx', 'Universidad Ficticia').flag).toBe(true);
    expect(heiSignalOf('taalcafe-fict.nl', 'Taalcafé Fictief').flag).toBe(false);
    expect(heiSignalOf('fict.jp', 'Community language class (not university-run)').flag).toBe(true);
    expect(heiSignalOf('fict.jp', 'Universitystyle cafe').flag).toBe(false);
    expect(heiSignalOf('edu-fict.jp', null).flag).toBe(false);
    expect(heiSignalOf('x.jp', null).ruleVersion).toBe(HEI_SIGNAL_RULE_VERSION);
  });
});

describe('REL L2 sealing: the authorisation and both providers exist only under vitest', () => {
  const vitest = process.env['VITEST'];
  afterEach(() => {
    process.env['VITEST'] = vitest;
  });

  it('the authorisation has a private brand that a literal, a clone or a cast cannot pass', () => {
    const auth = SourceDiscoveryAuthorisation.sealedForVitest('unit');
    expect(SourceDiscoveryAuthorisation.isAuthorisation(auth)).toBe(true);
    expect(SourceDiscoveryAuthorisation.isAuthorisation({ scope: 'unit' })).toBe(false);
    expect(SourceDiscoveryAuthorisation.isAuthorisation({ ...auth })).toBe(false);
    expect(SourceDiscoveryAuthorisation.isAuthorisation(Object.create(auth) as unknown)).toBe(
      false,
    );
    expect(SourceDiscoveryAuthorisation.isAuthorisation(null)).toBe(false);
  });

  it('outside vitest the only constructor throws, and so does the scripted provider', () => {
    process.env['VITEST'] = 'false';
    expect(() => SourceDiscoveryAuthorisation.sealedForVitest('prod')).toThrow(/TEST SEAM/);
    expect(() => new ScriptedSearchProvider(new Map(), '2026-10-20T00:00:00Z')).toThrow(
      /TEST SEAM/,
    );
  });

  it('the Claude Max adapter refuses anything but a sealed authorisation', () => {
    const query: AgentQueryFn = () => {
      throw new Error('must not be called');
    };
    for (const forged of [{ scope: 'x' }, null, undefined, 'ALLOWED']) {
      expect(
        () =>
          new ClaudeMaxWebSearchProvider(forged as unknown as SourceDiscoveryAuthorisation, {
            query,
            now: () => new Date(),
          }),
      ).toThrow(SearchProviderError);
    }
  });
});

describe('REL L2 Claude Max adapter: WebSearch only, against a FAKE SDK query', () => {
  const request: SearchRequest = {
    briefKey: PILOT_BRIEF_KEY,
    geography: 'NL',
    query: queriesFor(NWF_DISCOVERY_BRIEF_V1, 'NL').queries[0]!,
  };
  const NOW = new Date('2026-10-20T08:00:00.000Z');

  /**
   * A fake SDK `query`. An assistant message carrying tool uses is followed,
   * as the SDK does, by the PreToolUse hook and then `canUseTool` for each
   * (WW E-SDFX: WebSearch is never pre-approved, so both are consulted).
   */
  function fakeQuery(
    messages: AgentMessage[],
    seen: { options?: WebSearchAgentOptions; prompt?: string },
  ) {
    const fn: AgentQueryFn = (args) => {
      seen.options = args.options;
      seen.prompt = args.prompt;
      return (async function* () {
        for (const m of messages) {
          yield m;
          for (const use of m.toolUses ?? []) {
            const hook = await args.options.preToolUse({
              toolName: use.name,
              toolInput: use.input,
              toolUseId: use.id,
            });
            if (hook.decision === 'pass') {
              await args.options.canUseTool(use.name, use.input as Record<string, unknown>, use.id);
            }
          }
        }
        throw new Error('pulled past the terminal result');
      })();
    };
    return fn;
  }

  /** The one planned WebSearch, as the SDK would report it. */
  const plannedSearch: AgentMessage = {
    type: 'assistant',
    toolUses: [
      { kind: 'tool_use', id: 'toolu_1', name: 'WebSearch', input: { query: request.query.text } },
    ],
  };

  const provider = (query: AgentQueryFn) =>
    new ClaudeMaxWebSearchProvider(SourceDiscoveryAuthorisation.sealedForVitest('unit'), {
      query,
      now: () => NOW,
    });

  it('offers WebSearch only, pre-approves nothing, and permits only the planned query', async () => {
    const options = buildWebSearchAgentOptions(new WebSearchGate('x'));
    expect([...options.tools]).toEqual(['WebSearch']);
    // WW E-SDFX: an allowedTools entry is auto-allowed without canUseTool.
    expect([...options.allowedTools]).toEqual([]);
    expect(options.permissionMode).toBe('default');
    for (const t of ['WebFetch', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task']) {
      expect(REFUSED_TOOLS, t).toContain(t);
      expect((await options.canUseTool(t, {}, `id-${t}`)).behavior, t).toBe('deny');
    }
    expect(REFUSED_TOOLS).not.toContain('WebSearch');
    expect((await options.canUseTool('WebSearch', { query: 'x' }, 'ws-1')).behavior).toBe('allow');
    expect(options.settingSources).toEqual([]);
    expect(options.mcpServers).toEqual({});
    expect(options.persistSession).toBe(false);
    expect(options.strictMcpConfig).toBe(true);
    expect(buildWebSearchPrompt(request)).toContain(JSON.stringify('taalcafé vrijwilligers'));
  });

  it('returns schema-validated results, stops at the terminal result, and stamps the injected time', async () => {
    const seen: { options?: WebSearchAgentOptions } = {};
    const results = [{ url: 'https://taalcafe-fict.nl/', title: 'Taalcafé', snippet: null }];
    const response = await provider(
      fakeQuery(
        [
          { type: 'system', subtype: 'init' },
          plannedSearch,
          { type: 'result', subtype: 'success', structured_output: { results } },
        ],
        seen,
      ),
    ).search(request);
    expect(response).toEqual({
      results,
      retrievedAt: '2026-10-20T08:00:00.000Z',
      searchGate: { hookInvoked: true, permissionInvoked: true },
    });
    expect([...seen.options!.allowedTools]).toEqual([]);
  });

  it('refuses a missing result, an error result and output outside the schema', async () => {
    await expect(provider(fakeQuery([{ type: 'assistant' }], {})).search(request)).rejects.toThrow(
      /PROVIDER_RESULT_MISSING|pulled past/,
    );
    await expect(
      provider(
        fakeQuery([{ type: 'result', subtype: 'error_max_turns', is_error: true }], {}),
      ).search(request),
    ).rejects.toThrow(/PROVIDER_RESULT_ERROR/);
    await expect(
      provider(
        fakeQuery(
          [{ type: 'result', subtype: 'success', structured_output: { results: [{ url: 1 }] } }],
          {},
        ),
      ).search(request),
    ).rejects.toThrow(/PROVIDER_OUTPUT_INVALID/);
  });
});

describe('REL L2 promotion request: cites the nomination, never invents a name', () => {
  const nomination: NominationRow = {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    discoveryRunId: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001',
    discoveryMethod: 'SEARCH_PROVIDER',
    providerKey: 'scripted-search',
    queryId: 'nl.nl.language-cafe.01',
    sourcePageEvidenceId: null,
    url: 'https://taalcafe-fict.nl/',
    hostname: 'taalcafe-fict.nl',
    registrableDomain: 'taalcafe-fict.nl',
    title: 'Taalcafé Fictief',
    snippet: null,
    retrievedAt: '2026-10-20T08:00:00.000Z',
    echeOverlap: false,
    heiSignal: false,
    heiSignalRuleVersion: HEI_SIGNAL_RULE_VERSION,
  };

  it('is a PUBLIC_URL name claim observed at the retrieval time, version-pinned to the nomination', () => {
    const r = promotionRequest({
      nomination,
      subjectId: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000099',
      kind: 'INDEPENDENT_COMMUNITY',
      nameLanguage: 'nl',
    });
    expect(r.name).toBe('Taalcafé Fictief');
    expect(r.provenance).toEqual({
      source: {
        sourceType: 'PUBLIC_URL',
        url: nomination.url,
        versionRef: nominationCitationDigest(nomination),
      },
      observedAt: nomination.retrievedAt,
      claimBasis: 'SOURCE_STATED',
    });
    expect(nominationCitationDigest(nomination)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a nomination with no title', () => {
    expect(() =>
      promotionRequest({
        nomination: { ...nomination, title: null },
        subjectId: nomination.discoveryRunId,
        kind: 'UNCERTAIN',
        nameLanguage: null,
      }),
    ).toThrow(PromotionRefusal);
  });
});
