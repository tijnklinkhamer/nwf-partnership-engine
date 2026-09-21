/**
 * FETCH POLICY v6 - DISCOVERY RCDATA MARKUP HYGIENE, PURE LAYER.
 *
 * Owner decisions AUTHORISE_A2_DISCOVERY_RCDATA_MARKUP_HYGIENE_REPAIR_IMPLEMENTATION_V1
 * and APPROVE_FETCH_POLICY_V6_FOR_RCDATA_DISCOVERY_HYGIENE_V1
 * (docs/evaluation/PHASE_2B_2D_A2_DISCOVERY_RCDATA_FETCH_POLICY_V6_REPAIR_V1.json).
 *
 * `<title>` and `<textarea>` are RCDATA: their content is text, so an
 * `<a href>` or `<base href>` written inside one is never an element. Under
 * v5 the regex extractors read it as live markup. v6 reads
 * `stripNonNavigableMarkup` (stripNonContent + complete title/textarea
 * elements) for discovery only; `extractPage` is untouched.
 *
 * The differential block loads the REAL v5 modules from git at the v5
 * terminal commit, so "v5 was affected" is measured, not re-implemented.
 * Every host is a synthetic example domain.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  extractDiscoveryAnchors,
  extractDocumentBaseHref,
  resolveAnchorHref,
  resolveDocumentBase,
} from '../../orgunits/orchestrator/anchors.js';
import {
  extractPage,
  stripNonContent,
  stripNonNavigableMarkup,
} from '../../orgunits/web/extract.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The v5 terminal commit: the last commit whose production source is v5. */
const V5_TERMINAL_COMMIT = '05645a619e63ae478a58176a92a78ef45826b292';

const PAGE = 'https://www.example.edu/root/page';

/** Exactly the composition `rootRunner.ingestFetchedPage` runs before `admissibleUrl`. */
type AnchorsModule = {
  extractDiscoveryAnchors: typeof extractDiscoveryAnchors;
  extractDocumentBaseHref: typeof extractDocumentBaseHref;
  resolveAnchorHref: typeof resolveAnchorHref;
  resolveDocumentBase: typeof resolveDocumentBase;
};

function discoverWith(mod: AnchorsModule, pageUrl: string, html: string): string[] {
  const base = mod.resolveDocumentBase(pageUrl, mod.extractDocumentBaseHref(html));
  const out: string[] = [];
  for (const anchor of mod.extractDiscoveryAnchors(html)) {
    const resolution = mod.resolveAnchorHref(base.url, anchor.hrefRaw);
    if (resolution.ok) out.push(resolution.url);
  }
  return out;
}

const V6: AnchorsModule = {
  extractDiscoveryAnchors,
  extractDocumentBaseHref,
  resolveAnchorHref,
  resolveDocumentBase,
};

const discover = (html: string, pageUrl = PAGE) => discoverWith(V6, pageUrl, html);
const hrefs = (html: string) => extractDiscoveryAnchors(html).map((a) => a.hrefRaw);

describe('v6: an <a> written inside an RCDATA element is not a discovery anchor', () => {
  it('anchor inside <title> -> zero anchors', () => {
    expect(extractDiscoveryAnchors('<title>\n  <a href="/fake">text</a>\n</title>')).toEqual([]);
  });

  it('anchor inside <textarea> -> zero anchors', () => {
    expect(extractDiscoveryAnchors('<textarea>\n  <a href="/fake">text</a>\n</textarea>')).toEqual(
      [],
    );
  });

  it('attributes and upper case on the RCDATA element do not defeat the filter', () => {
    expect(hrefs('<TITLE lang="en"><a href="/fake">t</a></TITLE >')).toEqual([]);
    expect(hrefs('<textarea name="q" rows="3"><A HREF="/fake">t</A></textarea>')).toEqual([]);
  });

  it('a real anchor IMMEDIATELY after </title> is still discovered', () => {
    expect(hrefs('<title><a href="/fake">t</a></title><a href="/real">r</a>')).toEqual(['/real']);
  });

  it('a real anchor IMMEDIATELY after </textarea> is still discovered', () => {
    expect(hrefs('<textarea><a href="/fake">t</a></textarea><a href="/real">r</a>')).toEqual([
      '/real',
    ]);
  });

  it('real anchors before and between RCDATA elements survive, in document order', () => {
    const html =
      '<a href="/one">1</a><title><a href="/fake1">x</a></title><a href="/two">2</a>' +
      '<textarea><a href="/fake2">y</a></textarea><a href="/three">3</a>';
    expect(hrefs(html)).toEqual(['/one', '/two', '/three']);
  });

  it('plain title and textarea text never produced an anchor and still does not', () => {
    expect(hrefs('<title>Home</title><textarea>notes</textarea><a href="/x">x</a>')).toEqual([
      '/x',
    ]);
  });
});

describe('v6: a <base> written inside an RCDATA element is not the document base', () => {
  it('base inside <title>, then a real base -> the real base is first', () => {
    const html = '<title>\n  <base href="/fake/">\n</title>\n<base href="/real/">';
    expect(extractDocumentBaseHref(html)).toBe('/real/');
    expect(resolveDocumentBase(PAGE, extractDocumentBaseHref(html))).toEqual({
      source: 'BASE_ELEMENT',
      url: 'https://www.example.edu/real/',
    });
  });

  it('base inside <textarea>, then a real base -> the real base is first', () => {
    const html = '<textarea>\n  <base href="/fake/">\n</textarea>\n<base href="/real/">';
    expect(extractDocumentBaseHref(html)).toBe('/real/');
  });

  it('base inside <title> with NO real base -> the fetched document URL', () => {
    const html = '<title><base href="/fake/"></title><a href="child">child</a>';
    expect(extractDocumentBaseHref(html)).toBeNull();
    expect(resolveDocumentBase(PAGE, extractDocumentBaseHref(html))).toEqual({
      source: 'DOCUMENT_URL',
      url: PAGE,
      reason: 'NO_BASE_HREF',
    });
    expect(discover(html)).toEqual(['https://www.example.edu/root/child']);
  });

  it('base inside <textarea> with NO real base -> the fetched document URL', () => {
    const html = '<textarea><base href="/fake/"></textarea><a href="child">child</a>';
    expect(extractDocumentBaseHref(html)).toBeNull();
    expect(discover(html)).toEqual(['https://www.example.edu/root/child']);
  });
});

describe('v6 keeps the v5 first-href-bearing base semantics AFTER RCDATA filtering', () => {
  it('the first REAL href-bearing base wins over a later one', () => {
    const html = '<title><base href="/fake/"></title><base href="/first/"><base href="/second/">';
    expect(extractDocumentBaseHref(html)).toBe('/first/');
  });

  it('a real target-only base is still skipped', () => {
    const html = '<textarea><base href="/fake/"></textarea><base target="_blank"><base href="/r/">';
    expect(extractDocumentBaseHref(html)).toBe('/r/');
  });

  it('an unusable first REAL base still blocks a later valid one', () => {
    for (const first of ['http://[invalid', 'javascript:void(0)', 'data:text/html,x']) {
      const html =
        `<title><base href="/fake/"></title><base href="${first}">` +
        '<base href="/later-valid/"><a href="child">c</a>';
      expect(extractDocumentBaseHref(html), first).toBe(first);
      expect(resolveDocumentBase(PAGE, extractDocumentBaseHref(html)).source, first).toBe(
        'DOCUMENT_URL',
      );
      expect(discover(html), first).toEqual(['https://www.example.edu/root/child']);
    }
  });

  it('resolution against a real base is unchanged: child, ../, /root, ?query, absolute', () => {
    const html =
      '<title><base href="/fake/"></title><base href="/app/sub/">' +
      '<a href="child">1</a><a href="../up">2</a><a href="/rooted">3</a>' +
      '<a href="?q=1">4</a><a href="https://www.example.edu/abs#frag">5</a>';
    expect(discover(html)).toEqual([
      'https://www.example.edu/app/sub/child',
      'https://www.example.edu/app/up',
      'https://www.example.edu/rooted',
      'https://www.example.edu/app/sub/?q=1',
      'https://www.example.edu/abs',
    ]);
  });
});

describe('the already-stripped non-content elements stay stripped', () => {
  it('comments, script, style, noscript, svg, template and iframe still hide anchors and bases', () => {
    const wrappers: Array<[string, string]> = [
      ['<!--', '-->'],
      ['<script>', '</script>'],
      ['<style>', '</style>'],
      ['<noscript>', '</noscript>'],
      ['<svg>', '</svg>'],
      ['<template>', '</template>'],
      ['<iframe>', '</iframe>'],
    ];
    for (const [open, close] of wrappers) {
      const html = `${open}<base href="/fake/"><a href="/fake">x</a>${close}<a href="/real">r</a>`;
      expect(extractDocumentBaseHref(html), open).toBeNull();
      expect(hrefs(html), open).toEqual(['/real']);
    }
  });

  it('stripNonNavigableMarkup is stripNonContent plus title/textarea removal, nothing more', () => {
    const noRcdata =
      '<html><head><meta charset="utf-8"></head><body><!-- c --><script>x</script>' +
      '<main><a href="/a">a</a><p>text</p></main></body></html>';
    expect(stripNonNavigableMarkup(noRcdata)).toBe(stripNonContent(noRcdata));
    const withRcdata = '<title>T</title><p>keep</p><textarea>X</textarea>';
    expect(stripNonNavigableMarkup(withRcdata)).toBe(' <p>keep</p> ');
    expect(stripNonContent(withRcdata)).toBe(withRcdata);
  });
});

describe('extractPage page-evidence semantics are UNCHANGED (discovery-only repair)', () => {
  const html =
    '<html lang="en"><head><title>Office <a href="/x">t</a></title></head><body><main>' +
    '<h1>Heading</h1><p>Body text.</p><textarea>Typed notes stay evidence.</textarea>' +
    '</main></body></html>';

  it('textarea text is still in mainText and the title is still extracted', () => {
    const page = extractPage(html);
    expect(page.mainText).toContain('Typed notes stay evidence.');
    expect(page.title).toBe('Office t');
    expect(page.extractionMethod).toBe('MAIN_ELEMENT');
  });
});

describe('KNOWN OPEN CAPABILITY is still open: no character-reference decoding', () => {
  it('an anchor href after a title is still used raw: &amp; is not decoded', () => {
    expect(hrefs('<title>T</title><a href="/p?a=1&amp;b=2">x</a>')).toEqual(['/p?a=1&amp;b=2']);
  });

  it('a base href after a textarea is still used raw: &#47; is not decoded', () => {
    expect(extractDocumentBaseHref('<textarea>T</textarea><base href="&#47;app&#47;">')).toBe(
      '&#47;app&#47;',
    );
  });
});

describe('the current policy stamp', () => {
  it('production is orgunit-fetch-policy-v6', () => {
    expect(FETCH_POLICY_VERSION).toBe('orgunit-fetch-policy-v6');
  });
});

/*
 * ---------------------------------------------------------------------------
 * THE v5 -> v6 DIFFERENTIAL, against the REAL v5 source.
 * ---------------------------------------------------------------------------
 */

function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const v5Available = commitExists(V5_TERMINAL_COMMIT);

/** Every module the v5 anchors.ts / extract.ts pair imports, transitively. */
const V5_MODULES = [
  'orchestrator/anchors.ts',
  'orchestrator/constants.ts',
  'web/extract.ts',
  'web/redact.ts',
  'web/evidenceCanonical.ts',
  'web/policy.ts',
];

describe.skipIf(!v5Available)('v5 -> v6 differential proof (synthetic)', () => {
  let dir: string;
  let V5: AnchorsModule;
  let v5ExtractPage: typeof extractPage;
  let v5PolicyVersion: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'nwf-v5-anchors-'));
    for (const rel of V5_MODULES) {
      const source = execFileSync(
        'git',
        ['-C', REPO_ROOT, 'show', `${V5_TERMINAL_COMMIT}:src/orgunits/${rel}`],
        { encoding: 'utf8' },
      );
      const target = join(dir, rel);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source);
    }
    V5 = (await import(join(dir, 'orchestrator/anchors.ts'))) as AnchorsModule;
    v5ExtractPage = (
      (await import(join(dir, 'web/extract.ts'))) as { extractPage: typeof extractPage }
    ).extractPage;
    v5PolicyVersion = (
      (await import(join(dir, 'web/policy.ts'))) as { FETCH_POLICY_VERSION: string }
    ).FETCH_POLICY_VERSION;
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const ROOT_PAGE = 'https://www.example.edu/';
  const LINKS = '<a href="admissions/">a</a><a href="library/">l</a>';

  it('the loaded source really is v5', () => {
    expect(v5PolicyVersion).toBe('orgunit-fetch-policy-v5');
  });

  it('A: fake base in <title> + real relative anchors', () => {
    const html = `<head><title><base href="/fake/"></title></head><body>${LINKS}</body>`;
    expect(discoverWith(V5, ROOT_PAGE, html)).toEqual([
      'https://www.example.edu/fake/admissions/',
      'https://www.example.edu/fake/library/',
    ]);
    expect(discover(html, ROOT_PAGE)).toEqual([
      'https://www.example.edu/admissions/',
      'https://www.example.edu/library/',
    ]);
  });

  it('B: fake base in <textarea> + real relative anchors', () => {
    const html = `<body><textarea><base href="/fake/"></textarea>${LINKS}</body>`;
    expect(discoverWith(V5, ROOT_PAGE, html)).toEqual([
      'https://www.example.edu/fake/admissions/',
      'https://www.example.edu/fake/library/',
    ]);
    expect(discover(html, ROOT_PAGE)).toEqual([
      'https://www.example.edu/admissions/',
      'https://www.example.edu/library/',
    ]);
  });

  it('C: fake anchor in <title>', () => {
    const html = '<head><title><a href="/fake">t</a></title></head><body>x</body>';
    expect(discoverWith(V5, ROOT_PAGE, html)).toEqual(['https://www.example.edu/fake']);
    expect(discover(html, ROOT_PAGE)).toEqual([]);
  });

  it('D: fake anchor in <textarea>', () => {
    const html = '<body><textarea><a href="/fake">t</a></textarea></body>';
    expect(discoverWith(V5, ROOT_PAGE, html)).toEqual(['https://www.example.edu/fake']);
    expect(discover(html, ROOT_PAGE)).toEqual([]);
  });

  it('E: fake base in <title> followed by a real base', () => {
    const html = `<head><title><base href="/fake/"></title><base href="/real/"></head>${LINKS}`;
    expect(V5.extractDocumentBaseHref(html)).toBe('/fake/');
    expect(extractDocumentBaseHref(html)).toBe('/real/');
    expect(discover(html, ROOT_PAGE)).toEqual([
      'https://www.example.edu/real/admissions/',
      'https://www.example.edu/real/library/',
    ]);
  });

  it('F: ordinary documents with no RCDATA-shaped markup are byte/sequence-identical v5 -> v6', () => {
    const fixtures = [
      `<html><head><title>Home</title></head><body>${LINKS}</body></html>`,
      `<html><head><title>Home</title><base href="/portal/"></head><body>${LINKS}</body></html>`,
      '<textarea>plain notes</textarea><a href="/x">x</a><a href="y?z=1#f">y</a>',
      '<!-- <a href="/c"> --><script>"<base href=/s/>"</script><a href="../up">u</a>',
      '<base target="_self"><base href="javascript:void(0)"><base href="/v/"><a href="k">k</a>',
      `<p>no anchors at all</p>`,
    ];
    let total = 0;
    for (const html of fixtures) {
      expect(V6.extractDiscoveryAnchors(html), html).toEqual(V5.extractDiscoveryAnchors(html));
      expect(V6.extractDocumentBaseHref(html), html).toBe(V5.extractDocumentBaseHref(html));
      const v6 = discover(html);
      expect(v6, html).toEqual(discoverWith(V5, PAGE, html));
      total += v6.length;
    }
    expect(total).toBeGreaterThan(5); // not vacuous
  });

  it('extractPage is identical v5 -> v6, RCDATA-shaped markup included', () => {
    for (const html of [
      '<html><head><title>T <a href="/x">a</a></title></head><body><main>M</main></body></html>',
      '<body><textarea><a href="/f">f</a> notes</textarea><article>A</article></body>',
      '<html><body><h2>H</h2><p>plain</p></body></html>',
    ]) {
      expect(extractPage(html), html).toEqual(v5ExtractPage(html));
    }
  });
});
