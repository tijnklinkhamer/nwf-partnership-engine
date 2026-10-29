/**
 * WW H-ACQ (lead addendum, ADR 0030 s5a) - COUNTRY MENTIONS IN A SUBJECT'S
 * OWN CAPTURED PAGES, AND THE OWNER'S STATEMENT OF WHAT ONE OF THEM SAYS.
 *
 * The autonomous pipeline never records a country: a country is STATED BY A
 * SOURCE and CONFIRMED BY THE OWNER, never inferred. Without one the C1
 * export is not rankable (NO_STATED_COUNTRY). This closes that gap inside
 * the batched OWNER identity review, and nowhere else:
 *
 *   `countryMentionsOf` - for `review list`: at most THREE lines (each at most
 *     200 characters) from the subject's OWN admitted page evidence - its
 *     redacted title, headings and main text, exactly as extraction stored
 *     them - that contain, as a whole word, the name of one of the 249
 *     officially assigned ISO 3166-1 alpha-2 countries (English names, plus
 *     names in the page's OWN declared language), each with its page
 *     evidence id and observed instant. A MENTION, never a suggestion: no
 *     domain, top-level domain, language, script or address format is ever
 *     read as a country, and a page that names a country may name it for any
 *     reason (a partner university, an exchange destination).
 *   `planCountryStatement` / `recordCountryStatement` - for `review sign
 *     --country <subjectId>=<CC>@<pageEvidenceId>`: the cited page must be one
 *     of the subject's own shown mention lines AND that line must name that
 *     country; then ONE `SOURCE_STATED` `COUNTRY_OF_OPERATION` claim is
 *     planned / recorded through the EXISTING jurisdiction-claim writer
 *     (migration 0021: the writer capability, actor key
 *     `discovery-subjects-cli`, a source the subject already holds, observed_at
 *     equal to the page's). The claim is the OWNER's statement of what that
 *     source says (migration 0021's own definition of a writer claim).
 *
 * Reads on the readonly role; writes only through the writer path. Opens no
 * socket.
 */
import type pg from 'pg';

import {
  planCountryOfOperationClaim,
  recordCountryOfOperationClaim,
  type CountryOfOperationResult,
} from '../jurisdictionClaimWriter/record.js';
import { ISO_3166_1_ALPHA2_ASSIGNED } from '../subjectJurisdiction/vocabulary.js';

export const COUNTRY_MENTION_MAX_LINES = 3;
export const COUNTRY_MENTION_MAX_CHARS = 200;

/** One shown line: where it was captured, when, and which assigned countries it names. */
export interface CountryMention {
  readonly pageEvidenceId: string;
  readonly observedAt: string;
  readonly line: string;
  /** ISO 3166-1 alpha-2 codes whose name the line contains as a whole word, sorted. */
  readonly countries: readonly string[];
}

interface PageRow {
  id: string;
  title: string | null;
  declared_lang: string | null;
  headings: unknown;
  main_text: string;
  observed_at: Date;
}

/** A BCP 47 tag Intl accepts, or null. Never a country. */
function languageOf(tag: string | null): string | null {
  if (tag === null || tag.length === 0 || tag.length > 35) return null;
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch {
    return null;
  }
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const namesCache = new Map<string, ReadonlyMap<string, readonly RegExp[]>>();

/** Whole-word matchers per assigned code, for English plus `language`. */
function matchersFor(language: string | null): ReadonlyMap<string, readonly RegExp[]> {
  const key = language ?? '';
  const cached = namesCache.get(key);
  if (cached !== undefined) return cached;
  const displays = [new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })];
  if (language !== null && !language.toLowerCase().startsWith('en')) {
    try {
      displays.push(new Intl.DisplayNames([language], { type: 'region', fallback: 'none' }));
    } catch {
      // an unsupported language adds no names
    }
  }
  const out = new Map<string, readonly RegExp[]>();
  for (const code of ISO_3166_1_ALPHA2_ASSIGNED) {
    const names = new Set<string>();
    for (const d of displays) {
      const name = d.of(code);
      // A two-letter "name" is the code itself echoed back: never matched.
      if (name !== undefined && name.length > 2) names.add(name.normalize('NFC'));
    }
    out.set(
      code,
      [...names].map(
        (n) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(n)}(?![\\p{L}\\p{N}])`, 'iu'),
      ),
    );
  }
  namesCache.set(key, out);
  return out;
}

/** The assigned codes a line names as a whole word, sorted. */
export function countriesNamedIn(line: string, declaredLang: string | null): string[] {
  const text = line.normalize('NFC');
  const hits: string[] = [];
  for (const [code, res] of matchersFor(languageOf(declaredLang))) {
    if (res.some((re) => re.test(text))) hits.push(code);
  }
  return hits.sort();
}

/** At most 200 characters of `line`, centred on its first country mention. */
function excerpt(line: string, declaredLang: string | null, codes: readonly string[]): string {
  const flat = line.replace(/\s+/g, ' ').trim();
  if (flat.length <= COUNTRY_MENTION_MAX_CHARS) return flat;
  let at = 0;
  for (const res of codes.map((c) => matchersFor(languageOf(declaredLang)).get(c) ?? [])) {
    for (const re of res) {
      const index = flat.search(re);
      if (index >= 0) {
        at = index;
        break;
      }
    }
    if (at > 0) break;
  }
  const start = Math.max(
    0,
    Math.min(at - COUNTRY_MENTION_MAX_CHARS / 2, flat.length - COUNTRY_MENTION_MAX_CHARS),
  );
  return flat.slice(start, start + COUNTRY_MENTION_MAX_CHARS);
}

function headingTexts(headings: unknown): string[] {
  if (!Array.isArray(headings)) return [];
  return headings.flatMap((h) =>
    typeof h === 'object' && h !== null && typeof (h as { text?: unknown }).text === 'string'
      ? [(h as { text: string }).text]
      : [],
  );
}

/**
 * The shown country-mention lines of ONE subject: its own admitted page
 * evidence (every page rooted in one of its admissions), oldest page first,
 * title, then headings, then main-text lines; at most three lines.
 */
export async function countryMentionsOf(
  readonly: pg.Pool,
  subjectId: string,
): Promise<readonly CountryMention[]> {
  const { rows } = await readonly.query<PageRow>(
    `SELECT p.id, p.title, p.declared_lang, p.headings, p.main_text, p.observed_at
       FROM orgunit_page_evidence p
       JOIN subject_research_admissions a ON p.root_key = 'subject_admission:' || a.id::text
      WHERE a.subject_id = $1
      ORDER BY p.observed_at, p.id`,
    [subjectId],
  );
  const out: CountryMention[] = [];
  for (const page of rows) {
    const lines = [
      ...(page.title === null ? [] : [page.title]),
      ...headingTexts(page.headings),
      ...page.main_text.split(/\n+/),
    ];
    for (const raw of lines) {
      if (out.length >= COUNTRY_MENTION_MAX_LINES) return out;
      const countries = countriesNamedIn(raw, page.declared_lang);
      if (countries.length === 0) continue;
      out.push({
        pageEvidenceId: page.id,
        observedAt: page.observed_at.toISOString(),
        line: excerpt(raw, page.declared_lang, countries),
        countries,
      });
    }
  }
  return out;
}

/** One `--country <subjectId>=<CC>@<pageEvidenceId>` statement. */
export interface CountryStatement {
  readonly subjectId: string;
  readonly country: string;
  readonly pageEvidenceId: string;
}

export class CountryStatementRefusal extends Error {
  constructor(
    readonly code:
      | 'COUNTRY_STATEMENT_INVALID'
      | 'COUNTRY_SUBJECT_NOT_LISTED'
      | 'COUNTRY_PAGE_NOT_SHOWN'
      | 'COUNTRY_NOT_IN_SHOWN_LINES',
    readonly detail: string | null = null,
  ) {
    super(detail === null ? code : `${code}: ${detail}`);
    this.name = 'CountryStatementRefusal';
  }
}

const STATEMENT =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})=([A-Z]{2})@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Parses repeated `--country` values; one per subject, each for a listed subject. */
export function parseCountryStatements(
  values: readonly string[],
  listedSubjects: readonly string[],
): readonly CountryStatement[] {
  const seen = new Set<string>();
  return values.map((v) => {
    const m = v.match(STATEMENT);
    if (m === null || seen.has(m[1]!)) {
      throw new CountryStatementRefusal('COUNTRY_STATEMENT_INVALID', v.slice(0, 120));
    }
    seen.add(m[1]!);
    if (!listedSubjects.includes(m[1]!)) {
      throw new CountryStatementRefusal('COUNTRY_SUBJECT_NOT_LISTED', m[1]!);
    }
    return { subjectId: m[1]!, country: m[2]!, pageEvidenceId: m[3]! };
  });
}

/** Refuses a statement whose page is not one of the subject's SHOWN lines naming that country. */
async function assertShown(readonly: pg.Pool, s: CountryStatement): Promise<void> {
  const shown = (await countryMentionsOf(readonly, s.subjectId)).filter(
    (m) => m.pageEvidenceId === s.pageEvidenceId,
  );
  if (shown.length === 0) {
    throw new CountryStatementRefusal('COUNTRY_PAGE_NOT_SHOWN', s.pageEvidenceId);
  }
  if (!shown.some((m) => m.countries.includes(s.country))) {
    throw new CountryStatementRefusal('COUNTRY_NOT_IN_SHOWN_LINES', s.country);
  }
}

const requestOf = (s: CountryStatement) => ({
  subjectId: s.subjectId,
  statedCountry: s.country,
  source: { sourceType: 'PAGE_EVIDENCE' as const, pageEvidenceId: s.pageEvidenceId },
  claimBasis: 'SOURCE_STATED',
});

/** DRY RUN: the shown-line check, then the writer's own read-only judgement. Writes nothing. */
export async function planCountryStatement(
  readonly: pg.Pool,
  s: CountryStatement,
): Promise<CountryOfOperationResult> {
  await assertShown(readonly, s);
  return planCountryOfOperationClaim(readonly, requestOf(s));
}

/** EXECUTE: the shown-line check again, then ONE claim through the writer capability. */
export async function recordCountryStatement(
  pools: { readonly readonly: pg.Pool; readonly writer: pg.Pool },
  s: CountryStatement,
): Promise<CountryOfOperationResult> {
  await assertShown(pools.readonly, s);
  return recordCountryOfOperationClaim(pools.writer, requestOf(s));
}
