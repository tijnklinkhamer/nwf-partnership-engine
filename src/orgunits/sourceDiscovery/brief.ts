/**
 * REL L2 / U1 - DETERMINISTIC, VERSIONED DISCOVERY BRIEFS.
 *
 * A brief is a QUERY PLAN: for each geography it claims, the exact query texts
 * a search provider is asked, in that geography's local language(s) plus
 * English, each tagged with the target kind it is written for. It is data,
 * frozen in source, identified by the SHA-256 of its canonical JSON. Changing
 * one character of one query is a new digest; a new plan shape is a new
 * `briefKey` version.
 *
 * THE GEOGRAPHY IS THE BRIEF'S OWN CLAIM. `queriesFor` reads a geography code
 * only to select that geography's section of THIS brief, and refuses one the
 * brief does not claim. Nothing here, or anywhere in this namespace, reads a
 * country to decide anything about an ORGANISATION - a nomination carries no
 * country at all.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */
import { createHash } from 'node:crypto';

import { DISCOVERY_TARGET_KINDS, type DiscoveryTargetKind } from './types.js';

export interface DiscoveryQuery {
  /** `<geo>.<lang>.<slug>.<nn>`, unique within the brief. */
  readonly queryId: string;
  readonly language: string;
  readonly targetKind: DiscoveryTargetKind;
  readonly text: string;
}

export interface GeographySection {
  readonly geography: string;
  /** Local language(s) first, then English. */
  readonly languages: readonly string[];
  readonly queries: readonly DiscoveryQuery[];
}

export interface DiscoveryBrief {
  readonly briefKey: string;
  readonly geographyClaim: readonly string[];
  readonly targetKinds: readonly DiscoveryTargetKind[];
  readonly languages: readonly string[];
  readonly sections: readonly GeographySection[];
}

export const PILOT_BRIEF_KEY = 'nwf-discovery-brief-v1';

export const QUERY_ID_SHAPE = /^[a-z]{2}\.[a-z]{2,3}\.[a-z0-9-]{2,48}\.[0-9]{2}$/;

type Row = readonly [slug: string, language: string, targetKind: DiscoveryTargetKind, text: string];

function section(geography: string, languages: readonly string[], rows: readonly Row[]) {
  const geo = geography.toLowerCase();
  const seen = new Map<string, number>();
  const queries = rows.map(([slug, language, targetKind, text]): DiscoveryQuery => {
    const key = `${language}.${slug}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return {
      queryId: `${geo}.${language}.${slug}.${String(n).padStart(2, '0')}`,
      language,
      targetKind,
      text,
    };
  });
  return { geography, languages, queries };
}

/**
 * THE PILOT BRIEF: Japan, Mexico and the Netherlands.
 *
 * Written for NWF's audience - language learners, international students,
 * exchange and language-exchange groups, cultural centres, language cafes and
 * community language classes - and deliberately AWAY from the university and
 * Erasmus lists the engine already holds.
 */
export const NWF_DISCOVERY_BRIEF_V1: DiscoveryBrief = Object.freeze({
  briefKey: PILOT_BRIEF_KEY,
  geographyClaim: ['JP', 'MX', 'NL'],
  targetKinds: [...DISCOVERY_TARGET_KINDS],
  languages: ['en', 'es', 'ja', 'nl'],
  sections: [
    section(
      'JP',
      ['ja', 'en'],
      [
        ['exchange-association', 'ja', 'INTERNATIONAL_EXCHANGE_ASSOCIATION', '国際交流協会 語学'],
        ['language-exchange', 'ja', 'LANGUAGE_EXCHANGE_GROUP', '語学交流 サークル'],
        ['language-exchange', 'ja', 'LANGUAGE_EXCHANGE_GROUP', '言語交換 会 社会人'],
        ['language-cafe', 'ja', 'LANGUAGE_CAFE', '語学カフェ 外国人 交流'],
        ['community-class', 'ja', 'COMMUNITY_LANGUAGE_CLASS', '日本語教室 ボランティア 地域'],
        ['community-class', 'ja', 'COMMUNITY_LANGUAGE_CLASS', '多文化共生 語学講座 市民'],
        ['student-community', 'ja', 'INTERNATIONAL_STUDENT_COMMUNITY', '留学生 交流 団体'],
        ['cultural-centre', 'ja', 'CULTURAL_CENTRE', '国際文化センター 語学講座'],
        ['language-school', 'ja', 'SMALL_LANGUAGE_SCHOOL', '英会話 教室 地域 小規模'],
        ['language-exchange', 'en', 'LANGUAGE_EXCHANGE_GROUP', 'language exchange group Japan'],
        ['language-cafe', 'en', 'LANGUAGE_CAFE', 'language cafe meetup Japan'],
        [
          'student-community',
          'en',
          'INTERNATIONAL_STUDENT_COMMUNITY',
          'international students community association Japan',
        ],
        [
          'online-community',
          'en',
          'ONLINE_LANGUAGE_COMMUNITY',
          'online language learners community Japan',
        ],
      ],
    ),
    section(
      'MX',
      ['es', 'en'],
      [
        ['language-exchange', 'es', 'LANGUAGE_EXCHANGE_GROUP', 'intercambio de idiomas asociación'],
        ['language-exchange', 'es', 'LANGUAGE_EXCHANGE_GROUP', 'grupo de intercambio de idiomas'],
        ['language-cafe', 'es', 'LANGUAGE_CAFE', 'café de idiomas'],
        ['cultural-centre', 'es', 'CULTURAL_CENTRE', 'centro cultural clases de idiomas'],
        ['cultural-centre', 'es', 'CULTURAL_CENTRE', 'casa de la cultura talleres de idiomas'],
        [
          'community-class',
          'es',
          'COMMUNITY_LANGUAGE_CLASS',
          'clases de idiomas comunitarias voluntarios',
        ],
        [
          'student-community',
          'es',
          'INTERNATIONAL_STUDENT_COMMUNITY',
          'asociación de estudiantes internacionales',
        ],
        ['language-school', 'es', 'SMALL_LANGUAGE_SCHOOL', 'escuela de idiomas pequeña'],
        [
          'online-community',
          'es',
          'ONLINE_LANGUAGE_COMMUNITY',
          'comunidad en línea aprender idiomas',
        ],
        ['language-exchange', 'en', 'LANGUAGE_EXCHANGE_GROUP', 'language exchange Mexico'],
        [
          'student-community',
          'en',
          'INTERNATIONAL_STUDENT_COMMUNITY',
          'international students association Mexico',
        ],
        ['cultural-centre', 'en', 'CULTURAL_CENTRE', 'cultural institute Mexico language courses'],
      ],
    ),
    section(
      'NL',
      ['nl', 'en'],
      [
        ['language-cafe', 'nl', 'LANGUAGE_CAFE', 'taalcafé vrijwilligers'],
        ['language-exchange', 'nl', 'LANGUAGE_EXCHANGE_GROUP', 'taaluitwisseling groep'],
        [
          'community-class',
          'nl',
          'COMMUNITY_LANGUAGE_CLASS',
          'taalmaatje vrijwilligers organisatie',
        ],
        ['community-class', 'nl', 'COMMUNITY_LANGUAGE_CLASS', 'buurthuis taalles'],
        [
          'student-community',
          'nl',
          'INTERNATIONAL_STUDENT_COMMUNITY',
          'internationale studentenvereniging',
        ],
        ['cultural-centre', 'nl', 'CULTURAL_CENTRE', 'cultureel centrum taalcursus'],
        ['language-school', 'nl', 'SMALL_LANGUAGE_SCHOOL', 'kleine taalschool'],
        ['online-community', 'nl', 'ONLINE_LANGUAGE_COMMUNITY', 'online taalgemeenschap'],
        [
          'language-exchange',
          'en',
          'LANGUAGE_EXCHANGE_GROUP',
          'language exchange meetup Netherlands',
        ],
        [
          'student-community',
          'en',
          'INTERNATIONAL_STUDENT_COMMUNITY',
          'international student association Netherlands',
        ],
        [
          'community-class',
          'en',
          'COMMUNITY_LANGUAGE_CLASS',
          'expat community language classes Netherlands',
        ],
      ],
    ),
  ],
});

/** Every brief this build knows, by key. A brief is never constructed from input. */
export const KNOWN_BRIEFS: ReadonlyMap<string, DiscoveryBrief> = new Map([
  [PILOT_BRIEF_KEY, NWF_DISCOVERY_BRIEF_V1],
]);

export class BriefRefusal extends Error {
  constructor(
    readonly code: 'BRIEF_UNKNOWN' | 'GEOGRAPHY_NOT_CLAIMED' | 'BRIEF_MALFORMED',
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'BriefRefusal';
  }
}

export function briefByKey(briefKey: string): DiscoveryBrief {
  const brief = KNOWN_BRIEFS.get(briefKey);
  if (brief === undefined) {
    throw new BriefRefusal('BRIEF_UNKNOWN', `no brief named "${briefKey}" exists in this build.`);
  }
  return brief;
}

/** The section of THIS brief for ONE geography it claims. Refuses anything else. */
export function queriesFor(brief: DiscoveryBrief, geography: string): GeographySection {
  if (!brief.geographyClaim.includes(geography)) {
    throw new BriefRefusal(
      'GEOGRAPHY_NOT_CLAIMED',
      `brief ${brief.briefKey} claims ${brief.geographyClaim.join(', ')}, not "${geography}".`,
    );
  }
  const found = brief.sections.find((s) => s.geography === geography);
  if (found === undefined) {
    throw new BriefRefusal(
      'BRIEF_MALFORMED',
      `brief ${brief.briefKey} has no ${geography} section.`,
    );
  }
  return found;
}

/** Structural checks a brief must pass before it may be registered or run. */
export function assertBriefWellFormed(brief: DiscoveryBrief): void {
  const fail = (detail: string): never => {
    throw new BriefRefusal('BRIEF_MALFORMED', `${brief.briefKey}: ${detail}`);
  };
  const claimed = [...brief.geographyClaim].sort();
  const sectioned = brief.sections.map((s) => s.geography).sort();
  if (JSON.stringify(claimed) !== JSON.stringify(sectioned)) {
    fail('geography claim and sections disagree');
  }
  const ids = new Set<string>();
  for (const s of brief.sections) {
    if (!s.languages.includes('en')) fail(`${s.geography} has no English queries`);
    for (const q of s.queries) {
      if (!QUERY_ID_SHAPE.test(q.queryId)) fail(`malformed query id ${q.queryId}`);
      if (ids.has(q.queryId)) fail(`duplicate query id ${q.queryId}`);
      ids.add(q.queryId);
      if (!q.queryId.startsWith(`${s.geography.toLowerCase()}.${q.language}.`)) {
        fail(`query id ${q.queryId} does not name its own section and language`);
      }
      if (!s.languages.includes(q.language)) fail(`${q.queryId} uses an undeclared language`);
      if (!brief.languages.includes(q.language)) fail(`${q.queryId} language not in the brief`);
      if (!brief.targetKinds.includes(q.targetKind)) fail(`${q.queryId} target kind not in brief`);
      if (q.text.trim() !== q.text || q.text.length === 0 || q.text.length > 200) {
        fail(`${q.queryId} text is not trimmed and bounded`);
      }
    }
    for (const language of s.languages) {
      if (!s.queries.some((q) => q.language === language)) {
        fail(`${s.geography} declares ${language} but has no query in it`);
      }
    }
  }
}

type Json = string | number | boolean | null | readonly Json[] | { readonly [k: string]: Json };

/** Sorted-key, whitespace-free JSON. Deterministic for any value built from the types above. */
export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v: Json) => canonicalJson(v)).join(',')}]`;
  const record = value as { readonly [k: string]: Json };
  return `{${Object.keys(record)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k]!)}`)
    .join(',')}}`;
}

/** The query plan exactly as migration 0019 stores it. */
export function briefPlan(brief: DiscoveryBrief): { readonly [k: string]: Json } {
  return {
    briefKey: brief.briefKey,
    geographyClaim: [...brief.geographyClaim],
    targetKinds: [...brief.targetKinds],
    languages: [...brief.languages],
    sections: brief.sections.map((s) => ({
      geography: s.geography,
      languages: [...s.languages],
      queries: s.queries.map((q) => ({
        queryId: q.queryId,
        language: q.language,
        targetKind: q.targetKind,
        text: q.text,
      })),
    })),
  };
}

/** SHA-256 of the canonical plan, over UTF-8 NFC text. */
export function briefDigest(brief: DiscoveryBrief): string {
  return createHash('sha256')
    .update(canonicalJson(briefPlan(brief)).normalize('NFC'), 'utf8')
    .digest('hex');
}
