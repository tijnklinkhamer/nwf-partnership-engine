/**
 * FETCH POLICY v5 - THE ANCHOR DOCUMENT-BASE REPAIR, PURE LAYER.
 *
 * Owner decisions AUTHORISE_A2_ANCHOR_DOCUMENT_BASE_CAPABILITY_REPAIR_IMPLEMENTATION_V1
 * and APPROVE_HTML_DOCUMENT_BASE_FIRST_HREF_ELEMENT_SEMANTICS_V1
 * (docs/evaluation/PHASE_2B_2D_A2_ANCHOR_DOCUMENT_BASE_FETCH_POLICY_V5_REPAIR_V1.json).
 *
 * The selection rule is FIRST_BASE_ELEMENT_WITH_HREF_ATTRIBUTE_IN_TREE_ORDER:
 * the first `<base>` that HAS an href claims the document base; an unusable
 * one falls back to the fetched document URL and the search stops there.
 *
 * `discover` below is exactly the composition `rootRunner.ingestFetchedPage`
 * runs before `admissibleUrl`; `discoverV4` is the v4 composition, kept here
 * as the compatibility oracle. Every host is a synthetic example domain.
 */
import { describe, expect, it } from 'vitest';
import {
  extractDiscoveryAnchors,
  extractDocumentBaseHref,
  resolveAnchorHref,
  resolveDocumentBase,
} from '../../orgunits/orchestrator/anchors.js';
import { checkRootScope, validateRequestUrl } from '../../orgunits/web/url.js';

const PAGE = 'https://www.example.edu/root/page';
const SITE_ROOT = 'https://www.example.edu/';

/** v5: every anchor resolved against the document base. */
function discover(pageUrl: string, html: string): string[] {
  const base = resolveDocumentBase(pageUrl, extractDocumentBaseHref(html));
  const out: string[] = [];
  for (const anchor of extractDiscoveryAnchors(html)) {
    const resolution = resolveAnchorHref(base.url, anchor.hrefRaw);
    if (resolution.ok) out.push(resolution.url);
  }
  return out;
}

/** v4: every anchor resolved against the fetched document URL. The oracle. */
function discoverV4(pageUrl: string, html: string): string[] {
  const out: string[] = [];
  for (const anchor of extractDiscoveryAnchors(html)) {
    const resolution = resolveAnchorHref(pageUrl, anchor.hrefRaw);
    if (resolution.ok) out.push(resolution.url);
  }
  return out;
}

function baseOf(html: string, pageUrl = PAGE) {
  return resolveDocumentBase(pageUrl, extractDocumentBaseHref(html));
}

describe('document-base SELECTION: the first href-bearing <base>, in tree order', () => {
  it('E: no <base href> -> the fetched document URL', () => {
    expect(extractDocumentBaseHref('<html><head></head><body>x</body></html>')).toBeNull();
    expect(baseOf('<p>no base</p>')).toEqual({
      source: 'DOCUMENT_URL',
      url: PAGE,
      reason: 'NO_BASE_HREF',
    });
  });

  it('one relative base resolves against the page URL', () => {
    expect(baseOf('<head><base href="/directory/"></head>')).toEqual({
      source: 'BASE_ELEMENT',
      url: 'https://www.example.edu/directory/',
    });
  });

  it('a path-relative base resolves against the PAGE URL, not against itself', () => {
    // "sub/" against /root/page is /root/sub/. Resolving the base against
    // itself (or against the origin) would give /sub/.
    expect(baseOf('<base href="sub/">').url).toBe('https://www.example.edu/root/sub/');
  });

  it('one absolute base is used as written', () => {
    expect(baseOf('<base href="https://www.example.edu/app/">').url).toBe(
      'https://www.example.edu/app/',
    );
  });

  it('A: the first href-bearing base wins over a later one', () => {
    const html = '<base href="/directory/"><base href="/other/">';
    expect(extractDocumentBaseHref(html)).toBe('/directory/');
    expect(baseOf(html).url).toBe('https://www.example.edu/directory/');
  });

  it('B: a target-only base claims nothing; the next href-bearing base is first', () => {
    const html = '<base target="_blank"><base href="/directory/">';
    expect(extractDocumentBaseHref(html)).toBe('/directory/');
    expect(baseOf(html).url).toBe('https://www.example.edu/directory/');
  });

  it('C: an unparseable first base falls back to the page URL - never to a later base', () => {
    const html = '<base href="http://[invalid"><base href="/later-valid/">';
    expect(extractDocumentBaseHref(html)).toBe('http://[invalid');
    expect(baseOf(html)).toEqual({
      source: 'DOCUMENT_URL',
      url: PAGE,
      reason: 'BASE_HREF_UNPARSEABLE',
    });
    expect(discover(PAGE, `${html}<a href="child">c</a>`)).toEqual([
      'https://www.example.edu/root/child',
    ]);
  });

  it('D: a javascript: first base falls back to the page URL - never to a later base', () => {
    const html = '<base href="javascript:void(0)"><base href="/later-valid/">';
    expect(baseOf(html)).toEqual({
      source: 'DOCUMENT_URL',
      url: PAGE,
      reason: 'BASE_HREF_NOT_HTTP',
    });
    expect(discover(PAGE, `${html}<a href="child">c</a>`)).toEqual([
      'https://www.example.edu/root/child',
    ]);
  });

  it('a data: first base falls back to the page URL - never to a later base', () => {
    const html = '<base href="data:text/html,x"><base href="/later-valid/">';
    expect(baseOf(html)).toEqual({
      source: 'DOCUMENT_URL',
      url: PAGE,
      reason: 'BASE_HREF_NOT_HTTP',
    });
  });

  it('reads the href attribute in every attribute syntax, case-insensitively', () => {
    expect(extractDocumentBaseHref("<BASE HREF='/single/'>")).toBe('/single/');
    expect(extractDocumentBaseHref('<base href=/unquoted/>')).toBe('/unquoted/');
    expect(extractDocumentBaseHref('<base\n  target="_self"\n  href = "/spaced/" >')).toBe(
      '/spaced/',
    );
    expect(extractDocumentBaseHref('<base href="/self-closing/" />')).toBe('/self-closing/');
  });

  it('a valueless or empty href still CLAIMS the base (and resolves to the page URL)', () => {
    const valueless = '<base href><base href="/later/">';
    expect(extractDocumentBaseHref(valueless)).toBe('');
    expect(baseOf(valueless)).toEqual({ source: 'BASE_ELEMENT', url: PAGE });
    expect(extractDocumentBaseHref('<base href=""><base href="/later/">')).toBe('');
  });

  it('does not mistake another attribute for href', () => {
    expect(extractDocumentBaseHref('<base data-href="/nope/"><base href="/yes/">')).toBe('/yes/');
    expect(extractDocumentBaseHref('<base target="x href=/nope/"><base href="/yes/">')).toBe(
      '/yes/',
    );
  });

  it('does not mistake <basefont> or a <base-x> custom element for <base>', () => {
    expect(extractDocumentBaseHref('<basefont href="/nope/"><base-x href="/nope/">')).toBeNull();
  });

  it('reads a quoted href containing ">" as one tag', () => {
    expect(extractDocumentBaseHref('<base href="/a>b/">')).toBe('/a>b/');
  });

  it('trims surrounding whitespace from the base href, as URL parsing does', () => {
    expect(extractDocumentBaseHref('<base href="  /padded/  ">')).toBe('/padded/');
  });
});

describe('document-base SELECTION ignores non-content markup (the canonical stripNonContent)', () => {
  it('a commented fake base is not a base', () => {
    const html = '<!-- <base href="/fake/"> --><a href="child">c</a>';
    expect(extractDocumentBaseHref(html)).toBeNull();
    expect(discover(PAGE, html)).toEqual(['https://www.example.edu/root/child']);
  });

  it('a commented fake base does not pre-empt the real first base', () => {
    expect(extractDocumentBaseHref('<!-- <base href="/fake/"> --><base href="/real/">')).toBe(
      '/real/',
    );
  });

  it('a scripted fake base is not a base', () => {
    const html = `<script>document.write('<base href="/fake/">')</script><a href="child">c</a>`;
    expect(extractDocumentBaseHref(html)).toBeNull();
  });

  it('a template fake base is not a base', () => {
    expect(extractDocumentBaseHref('<template><base href="/fake/"></template>')).toBeNull();
  });

  it('style, noscript, svg and iframe content are not searched either', () => {
    for (const tag of ['style', 'noscript', 'svg', 'iframe']) {
      expect(extractDocumentBaseHref(`<${tag}><base href="/fake/"></${tag}>`), tag).toBeNull();
    }
  });
});

describe('anchor RESOLUTION against the document base', () => {
  const TRAILING = '<base href="https://www.example.edu/app/">';
  const NO_TRAILING = '<base href="https://www.example.edu/app">';

  it('child, base with a trailing slash', () => {
    expect(discover(PAGE, `${TRAILING}<a href="child">x</a>`)).toEqual([
      'https://www.example.edu/app/child',
    ]);
  });

  it('child, base WITHOUT a trailing slash: ordinary URL semantics', () => {
    expect(discover(PAGE, `${NO_TRAILING}<a href="child">x</a>`)).toEqual([
      'https://www.example.edu/child',
    ]);
  });

  it('../child resolves against the base', () => {
    const html = '<base href="https://www.example.edu/a/b/"><a href="../child">x</a>';
    expect(discover(PAGE, html)).toEqual(['https://www.example.edu/a/child']);
  });

  it('/child is root-relative whatever the base path', () => {
    expect(discover(PAGE, `${TRAILING}<a href="/child">x</a>`)).toEqual([
      'https://www.example.edu/child',
    ]);
  });

  it('?x=1 resolves against the base, not the page', () => {
    expect(discover(PAGE, `${TRAILING}<a href="?x=1">x</a>`)).toEqual([
      'https://www.example.edu/app/?x=1',
    ]);
  });

  it('an absolute anchor stays absolute', () => {
    expect(discover(PAGE, `${TRAILING}<a href="https://www.example.edu/abs/x">x</a>`)).toEqual([
      'https://www.example.edu/abs/x',
    ]);
  });

  it('a fragment is still stripped before frontier admission', () => {
    expect(discover(PAGE, `${TRAILING}<a href="child#top">x</a><a href="child">y</a>`)).toEqual([
      'https://www.example.edu/app/child',
      'https://www.example.edu/app/child',
    ]);
  });

  it('a base fragment never survives into an anchor URL', () => {
    const html = '<base href="https://www.example.edu/app/#frag"><a href="child">x</a>';
    expect(discover(PAGE, html)).toEqual(['https://www.example.edu/app/child']);
  });

  it('a relative base resolves against the page, then anchors against the result', () => {
    const html = '<base href="../app/"><a href="child">x</a>';
    // page /root/page -> base /app/ -> anchor /app/child
    expect(discover(PAGE, html)).toEqual(['https://www.example.edu/app/child']);
  });

  it('is deterministic: repeated calls give identical output', () => {
    const html = `${TRAILING}<a href="a">1</a><a href="../b">2</a><a href="?c">3</a>`;
    const first = discover(PAGE, html);
    for (let i = 0; i < 5; i += 1) expect(discover(PAGE, html)).toEqual(first);
  });
});

describe('a base grants NO authority: the existing admission gate still decides', () => {
  const ROOT = validateRequestUrl(SITE_ROOT);

  /** The scope half of rootRunner.admissibleUrl, over the same exported primitives. */
  function inScope(url: string): boolean {
    if (!ROOT.ok) throw new Error('fixture root must validate');
    const validated = validateRequestUrl(url);
    return validated.ok && checkRootScope(ROOT.value, validated.value).ok;
  }

  it('a cross-registrable-domain base only produces URLs the scope gate refuses', () => {
    const html = '<base href="https://www.example.org/"><a href="child">x</a><a href="p/q">y</a>';
    const urls = discover(SITE_ROOT, html);
    expect(urls).toEqual(['https://www.example.org/child', 'https://www.example.org/p/q']);
    for (const url of urls) expect(inScope(url), url).toBe(false);
  });

  it('an http base under an https root is refused as a downgrade', () => {
    const urls = discover(SITE_ROOT, '<base href="http://www.example.edu/"><a href="x">x</a>');
    expect(urls).toEqual(['http://www.example.edu/x']);
    expect(inScope(urls[0]!)).toBe(false);
  });

  it('a base carrying credentials only produces URLs URL validation refuses', () => {
    const urls = discover(
      SITE_ROOT,
      '<base href="https://user:secret@www.example.edu/"><a href="x">x</a>',
    );
    expect(validateRequestUrl(urls[0]!).ok).toBe(false);
  });

  it('a base with an explicit port only produces URLs URL validation refuses', () => {
    const urls = discover(
      SITE_ROOT,
      '<base href="https://www.example.edu:8443/"><a href="x">x</a>',
    );
    expect(validateRequestUrl(urls[0]!).ok).toBe(false);
  });

  it('an in-scope base produces URLs the gate admits', () => {
    const urls = discover(SITE_ROOT, '<base href="/app/"><a href="x">x</a>');
    expect(urls).toEqual(['https://www.example.edu/app/x']);
    expect(inScope(urls[0]!)).toBe(true);
  });
});

describe('v4 COMPATIBILITY: no usable <base href> -> v5 frontier input is identical to v4', () => {
  const FIXTURES: ReadonlyArray<readonly [string, string]> = [
    ['https://www.example.edu/', '<a href="a">1</a><a href="/b/">2</a><a href="../c">3</a>'],
    [
      'https://www.example.edu/dir/page.html',
      '<a href="x">x</a><a href="?q=1">q</a><a href="#top">t</a><a href="y#f">y</a>',
    ],
    [
      'https://www.example.edu/dir/',
      '<nav><a href="https://www.example.edu/abs">a</a><a href="//www.example.edu/proto">p</a></nav>',
    ],
    [
      'https://www.example.edu/fr/accueil',
      '<!-- <base href="/fake/"> --><a href="contact/">c</a><a href="mailto:a@b.example">m</a>',
    ],
    [
      'https://www.example.edu/x/y/z',
      '<base target="_blank"><a href="../../up">u</a><a href="same">s</a><a href="&amp;x">e</a>',
    ],
    [
      'https://www.example.edu/',
      '<base href="http://[bad"><base href="/later/"><a href="child">c</a><a href="/root">r</a>',
    ],
    [
      'https://www.example.edu/p',
      '<base href="javascript:alert(1)"><base href="/later/"><a href="child">c</a>',
    ],
    ['https://www.example.edu/p', '<template><base href="/fake/"></template><a href="k">k</a>'],
    ['https://www.example.edu/', ''],
  ];

  it.each(FIXTURES)('page %s', (pageUrl, html) => {
    expect(resolveDocumentBase(pageUrl, extractDocumentBaseHref(html)).url).toBe(pageUrl);
    expect(discover(pageUrl, html)).toEqual(discoverV4(pageUrl, html));
  });

  it('the fixture set is not vacuous: it yields anchors', () => {
    const total = FIXTURES.reduce((n, [pageUrl, html]) => n + discover(pageUrl, html).length, 0);
    expect(total).toBe(16);
  });
});

describe('the v5 DELTA: a document WITH a usable base differs from v4', () => {
  it('synthetic P:12-class shape: site-root page, application-root base, single-segment slugs', () => {
    // Capability class only. Synthetic host, synthetic slugs, no copied
    // content; this does NOT show that any real page carried a <base>.
    const slugs = Array.from({ length: 12 }, (_, i) => `section-${String.fromCharCode(97 + i)}/`);
    const html = [
      '<html><head><base href="/portal/"></head><body><main>',
      ...slugs.map((slug) => `<a href="${slug}">${slug}</a>`),
      '</main></body></html>',
    ].join('\n');

    const v4 = discoverV4(SITE_ROOT, html);
    const v5 = discover(SITE_ROOT, html);

    expect(v4).toEqual(slugs.map((slug) => `https://www.example.edu/${slug}`));
    expect(v5).toEqual(slugs.map((slug) => `https://www.example.edu/portal/${slug}`));
    for (const url of v4) expect(new URL(url).pathname.split('/').filter(Boolean)).toHaveLength(1);
    for (const url of v5) expect(new URL(url).pathname.startsWith('/portal/')).toBe(true);
    expect(v5.filter((url) => v4.includes(url))).toEqual([]);
  });
});

describe('KNOWN OPEN CAPABILITY: HTML character references in URL-valued attributes', () => {
  // Owner decision DEFER_ANCHOR_HREF_CHARACTER_REFERENCE_DECODING_AS_SEPARATE_CAPABILITY_V1.
  // These pin the CURRENT, KNOWN-INCOMPLETE behaviour so that the gap cannot
  // disappear silently: a future decoder must change these on purpose, under
  // its own authority and fetch-policy version.
  it('an anchor href is used raw: &amp; is not decoded', () => {
    expect(extractDiscoveryAnchors('<a href="/p?a=1&amp;b=2">x</a>')[0]?.hrefRaw).toBe(
      '/p?a=1&amp;b=2',
    );
  });

  it('a base href is used raw: character references are not decoded', () => {
    expect(extractDocumentBaseHref('<base href="/a&#47;b/">')).toBe('/a&#47;b/');
    // Undecoded, "&#47;" is not "/": its "#" starts a fragment, so the base
    // path is "/a&" and a relative anchor lands at the site root. A browser
    // would have used "/a/b/". This is the recorded, deferred gap.
    expect(baseOf('<base href="/a&#47;b/">').url).toBe('https://www.example.edu/a&#47;b/');
    expect(discover(PAGE, '<base href="/a&#47;b/"><a href="child">c</a>')).toEqual([
      'https://www.example.edu/child',
    ]);
  });
});
