/**
 * FOCUSED HTML EXTRACTION, without a DOM or browser dependency.
 *
 * WHY NO jsdom / cheerio / parse5 / @mozilla/readability / defuddle / turndown
 *
 *   The design audit measured the actual corpus this phase reads and rejected
 *   every one of these after that measurement, not on principle: a real DOM
 *   parser is a large, actively-maintained attack surface for content this
 *   repository does not trust, and the corpus does not need one. ADR 0004
 *   s3's holdout found that a MEASURED, deterministic strategy - prefer a
 *   semantic container, fall back to the whole body - already accounts for
 *   most of an institutional page's usable text (median retained fraction
 *   0.570 for main-element extraction alone). This module implements exactly
 *   that strategy with regular expressions over already-decoded text, which
 *   is sufficient for HTML this repository chose (via `charset.ts`) precisely
 *   because it is well-formed enough to have a resolvable charset in the
 *   first place.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 *   - execute JavaScript, or interpret a <script> tag's contents as anything
 *     but bytes to discard;
 *   - fetch a resource the page references (an image, a stylesheet, a script
 *     src, an iframe src);
 *   - apply cross-page boilerplate differencing to a SINGLE page's evidence.
 *     `computeChromeLines` below is the PURE differencing primitive the
 *     eventual multi-page strategy composes with main-element extraction
 *     (ADR 0004 s3), implemented now because it belongs in this module and can
 *     be tested in complete isolation - but it is not called by
 *     `extractPage`, because one page cannot supply a valid site-level
 *     boilerplate profile. Removing lines because "100% of the one page we
 *     have contains them" would remove the page's entire content, and no
 *     hidden minimum-page-count threshold is invented here to paper over
 *     that: real site-level application waits for the bounded multi-page
 *     orchestration a later slice builds.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { redactContactData } from './redact.js';

export type ExtractionMethod =
  'MAIN_ELEMENT' | 'BOILERPLATE_DIFFERENCED' | 'MAIN_ELEMENT_AND_DIFFERENCED' | 'FULL_BODY';

export interface Heading {
  level: 1 | 2 | 3;
  text: string;
}

export interface ExtractedPage {
  title: string | null;
  declaredLang: string | null;
  headings: Heading[];
  mainText: string;
  extractionMethod: ExtractionMethod;
}

const REMOVABLE_TAGS = ['script', 'style', 'noscript', 'svg', 'template', 'iframe'];

/** Strips one element type (open tag through matching close tag), non-greedy, across the whole document. */
function stripElement(html: string, tag: string): string {
  const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
  return html.replace(pattern, ' ');
}

/** Removes every element this extractor must never read the contents of, plus HTML comments. */
function stripNonContent(html: string): string {
  let result = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of REMOVABLE_TAGS) {
    result = stripElement(result, tag);
  }
  return result;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
});

/** Decodes named, decimal and hexadecimal HTML entities, tolerantly. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

/**
 * Turns a fragment of (already non-content-stripped) HTML into normalised
 * text: every remaining tag becomes a word boundary rather than being
 * concatenated with its neighbours, entities are decoded, and whitespace
 * collapses to single spaces while paragraph/heading boundaries survive as
 * newlines.
 */
export function htmlFragmentToText(html: string): string {
  // Block-level and line-breaking elements become a newline; everything else
  // becomes a plain space, so removing a <span> never welds two words
  // together but removing a <p> still separates paragraphs.
  const BLOCK_TAGS =
    /<\/?(p|div|br|h[1-6]|li|ul|ol|table|tr|td|th|section|article|header|footer|nav|aside|main|blockquote|pre|hr)\b[^>]*>/gi;
  const withBreaks = html.replace(BLOCK_TAGS, '\n');
  const withoutTags = withBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeEntities(withoutTags);
  return decoded
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

function extractTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (match === null) return null;
  const text = htmlFragmentToText(match[1] ?? '')
    .replace(/\n+/g, ' ')
    .trim();
  return text === '' ? null : text;
}

function extractDeclaredLang(html: string): string | null {
  const match = /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(html);
  if (match === null) return null;
  const value = (match[1] ?? '').trim();
  return /^[A-Za-z0-9-]+$/.test(value) && value.length <= 35 ? value : null;
}

function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = [];
  const pattern = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const level = Number.parseInt(match[1] ?? '1', 10) as 1 | 2 | 3;
    const text = htmlFragmentToText(match[2] ?? '')
      .replace(/\n+/g, ' ')
      .trim();
    if (text !== '') headings.push({ level, text });
  }
  return headings;
}

interface ContainerMatch {
  content: string;
  method: 'MAIN_ELEMENT' | 'FULL_BODY';
}

/**
 * Finds the preferred semantic container: `<main>`, `role="main"`, then
 * `<article>`, in that order - the measured preference from ADR 0004 s3.
 * Falls back to the whole `<body>` (or the whole document, defensively, if
 * even that is absent) when none exists.
 */
function findMainContainer(html: string): ContainerMatch {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(html);
  if (main !== null) return { content: main[1] ?? '', method: 'MAIN_ELEMENT' };

  const roleMain = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\brole\s*=\s*["']main["'][^>]*>/i.exec(html);
  if (roleMain !== null) {
    const tag = roleMain[1] ?? 'div';
    const closeFrom = roleMain.index + roleMain[0].length;
    const closer = new RegExp(`<\\/${tag}\\s*>`, 'i');
    const closerMatch = closer.exec(html.slice(closeFrom));
    const content =
      closerMatch === null
        ? html.slice(closeFrom)
        : html.slice(closeFrom, closeFrom + closerMatch.index);
    return { content, method: 'MAIN_ELEMENT' };
  }

  const article = /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i.exec(html);
  if (article !== null) return { content: article[1] ?? '', method: 'MAIN_ELEMENT' };

  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  return { content: body === null ? html : (body[1] ?? ''), method: 'FULL_BODY' };
}

/**
 * Extracts title, declared language, h1-h3 headings and main text from ONE
 * page's already charset-decoded HTML.
 *
 * REDACTS every returned textual field before returning it - not as a
 * separate step a caller might forget, but as part of what "extraction" means
 * in this repository. There is no code path that returns unredacted contact
 * data from this function.
 */
export function extractPage(html: string): ExtractedPage {
  const title = extractTitle(html);
  const declaredLang = extractDeclaredLang(html);
  const cleaned = stripNonContent(html);
  const headings = extractHeadings(cleaned);
  const { content, method } = findMainContainer(cleaned);
  const mainText = htmlFragmentToText(content);

  return {
    title: title === null ? null : redactContactData(title),
    declaredLang,
    headings: headings.map((heading) => ({ ...heading, text: redactContactData(heading.text) })),
    mainText: redactContactData(mainText),
    extractionMethod: method,
  };
}

/**
 * THE PURE CROSS-PAGE BOILERPLATE-DIFFERENCING PRIMITIVE.
 *
 * NOT CALLED BY `extractPage`. See the module comment: a single page cannot
 * supply a valid site-level boilerplate profile, and no hidden threshold
 * lowers `pagesLineSets.length` to 1 to make this "work" on one page - doing
 * so would remove that page's entire content, since every line it has trivially
 * recurs on 100% of a one-page sample.
 *
 * Given each page's lines (already extracted and normalised, one array per
 * page), returns the set of lines that recur on AT LEAST `threshold` (default
 * 0.45, i.e. ~45%) of the pages - the measured chrome-detection threshold
 * from ADR 0004 s3. A later multi-page orchestration slice is expected to
 * call this once it has a real same-site page set, subtract the returned
 * lines from each page's text, and record `extraction_method` as
 * `MAIN_ELEMENT_AND_DIFFERENCED` (composing with `findMainContainer`) or
 * `BOILERPLATE_DIFFERENCED` (applied to a FULL_BODY extraction) accordingly.
 */
export function computeChromeLines(
  pagesLineSets: readonly (readonly string[])[],
  threshold = 0.45,
): Set<string> {
  if (pagesLineSets.length === 0) return new Set();
  const counts = new Map<string, number>();
  for (const lines of pagesLineSets) {
    for (const line of new Set(lines)) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const minCount = threshold * pagesLineSets.length;
  const chrome = new Set<string>();
  for (const [line, count] of counts) {
    if (count >= minCount) chrome.add(line);
  }
  return chrome;
}

/** Removes chrome lines (from `computeChromeLines`) from one page's already-extracted text. */
export function removeChromeLines(text: string, chrome: ReadonlySet<string>): string {
  return text
    .split('\n')
    .filter((line) => !chrome.has(line))
    .join('\n');
}
