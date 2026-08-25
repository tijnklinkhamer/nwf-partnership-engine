/**
 * HTML extraction: semantic-container preference, tag stripping, entity
 * decoding, whitespace normalisation, and the boilerplate-differencing
 * PRIMITIVE kept separate from the single-page path it does not run on.
 */
import { describe, expect, it } from 'vitest';
import {
  computeChromeLines,
  decodeEntities,
  extractPage,
  htmlFragmentToText,
  removeChromeLines,
} from '../../orgunits/web/extract.js';

function page(head: string, body: string, htmlAttrs = ''): string {
  return `<!DOCTYPE html><html${htmlAttrs}><head>${head}</head><body>${body}</body></html>`;
}

describe('extractPage: semantic-container preference', () => {
  it('prefers <main> over everything else', () => {
    const html = page(
      '<title>T</title>',
      '<nav>nav noise</nav><main><p>real content</p></main><footer>footer noise</footer>',
    );
    const result = extractPage(html);
    expect(result.extractionMethod).toBe('MAIN_ELEMENT');
    expect(result.mainText).toContain('real content');
    expect(result.mainText).not.toContain('nav noise');
    expect(result.mainText).not.toContain('footer noise');
  });

  it('uses role="main" when no <main> element exists', () => {
    const html = page('', '<div role="main"><p>role content</p></div><div>chrome</div>');
    const result = extractPage(html);
    expect(result.extractionMethod).toBe('MAIN_ELEMENT');
    expect(result.mainText).toContain('role content');
    expect(result.mainText).not.toContain('chrome');
  });

  it('falls back to <article> when neither <main> nor role="main" exists', () => {
    const html = page('', '<header>header</header><article><p>article content</p></article>');
    const result = extractPage(html);
    expect(result.extractionMethod).toBe('MAIN_ELEMENT');
    expect(result.mainText).toContain('article content');
  });

  it('falls back to the whole body when no semantic container exists', () => {
    const html = page('', '<div><p>plain body content</p></div>');
    const result = extractPage(html);
    expect(result.extractionMethod).toBe('FULL_BODY');
    expect(result.mainText).toContain('plain body content');
  });

  it('handles a <main> that wraps nearly the whole body', () => {
    const html = page(
      '',
      '<main><header>site header</header><p>the actual content</p><footer>site footer</footer></main>',
    );
    const result = extractPage(html);
    expect(result.extractionMethod).toBe('MAIN_ELEMENT');
    expect(result.mainText).toContain('the actual content');
  });
});

describe('extractPage: title and declared language', () => {
  it('extracts the title', () => {
    expect(extractPage(page('<title>International Office</title>', '')).title).toBe(
      'International Office',
    );
  });

  it('extracts html lang', () => {
    expect(extractPage(page('', '', ' lang="fr"')).declaredLang).toBe('fr');
    expect(extractPage(page('', '')).declaredLang).toBeNull();
  });

  it('returns null title when absent', () => {
    expect(extractPage(page('', '<p>x</p>')).title).toBeNull();
  });
});

describe('extractPage: heading extraction', () => {
  it('extracts nested h1/h2/h3 headings in document order', () => {
    const html = page(
      '',
      '<main><h1>Top</h1><section><h2>Second</h2><h3>Third</h3></section></main>',
    );
    const result = extractPage(html);
    expect(result.headings).toEqual([
      { level: 1, text: 'Top' },
      { level: 2, text: 'Second' },
      { level: 3, text: 'Third' },
    ]);
  });

  it('ignores h4+ headings entirely', () => {
    const html = page('', '<main><h1>One</h1><h4>Ignored</h4></main>');
    expect(extractPage(html).headings).toEqual([{ level: 1, text: 'One' }]);
  });
});

describe('extractPage: non-content removal', () => {
  it('removes script contents entirely', () => {
    const html = page('', '<main><script>alert("x")</script><p>real</p></main>');
    expect(extractPage(html).mainText).toBe('real');
  });

  it('removes style contents entirely', () => {
    const html = page('', '<main><style>.x{color:red}</style><p>real</p></main>');
    expect(extractPage(html).mainText).toBe('real');
  });

  it('removes noscript contents entirely', () => {
    const html = page('', '<main><noscript>enable JS</noscript><p>real</p></main>');
    expect(extractPage(html).mainText).toBe('real');
  });

  it('removes svg contents entirely', () => {
    const html = page('', '<main><svg><path d="M0 0"/></svg><p>real</p></main>');
    expect(extractPage(html).mainText).toBe('real');
  });

  it('removes template contents entirely', () => {
    const html = page('', '<main><template><p>hidden</p></template><p>real</p></main>');
    expect(extractPage(html).mainText).toBe('real');
  });

  it('removes iframe contents entirely', () => {
    const html = page(
      '',
      '<main><iframe src="https://evil.example/">fallback text</iframe><p>real</p></main>',
    );
    expect(extractPage(html).mainText).toBe('real');
  });

  it('removes HTML comments', () => {
    const html = page('', '<main><!-- internal note --><p>real</p></main>');
    expect(extractPage(html).mainText).toBe('real');
  });
});

describe('decodeEntities', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeEntities('caf&eacute;'.replace('&eacute;', '&#233;'))).toBe('café');
  });

  it('decodes decimal and hexadecimal numeric entities', () => {
    expect(decodeEntities('&#233;cole')).toBe('école');
    expect(decodeEntities('&#xE9;cole')).toBe('école');
  });

  it('leaves an unrecognised entity-shaped string untouched', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
  });
});

describe('htmlFragmentToText: whitespace and word-boundary handling', () => {
  it('does not concatenate words across a removed inline tag', () => {
    expect(htmlFragmentToText('<p>hello<span>world</span></p>')).toBe('hello world');
  });

  it('separates paragraphs with a newline, not a space', () => {
    expect(htmlFragmentToText('<p>first</p><p>second</p>')).toBe('first\nsecond');
  });

  it('collapses repeated whitespace', () => {
    expect(htmlFragmentToText('<p>a    b\t\tc</p>')).toBe('a b c');
  });

  it('drops empty lines produced by adjacent block tags', () => {
    expect(htmlFragmentToText('<div></div><p>content</p>')).toBe('content');
  });
});

describe('extractPage: realistic noisy page', () => {
  it('keeps main content and drops nav/header/footer noise together', () => {
    const html = page(
      '<title>Language Centre</title>',
      [
        '<header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>',
        '<main>',
        '<h1>Language Centre</h1>',
        '<p>We offer courses in French, German and Dutch.</p>',
        '</main>',
        '<footer>Copyright 2026. All rights reserved.</footer>',
      ].join(''),
    );
    const result = extractPage(html);
    expect(result.mainText).toContain('We offer courses');
    expect(result.mainText).not.toContain('Home');
    expect(result.mainText).not.toContain('Copyright');
    expect(result.headings).toEqual([{ level: 1, text: 'Language Centre' }]);
  });
});

describe('extractPage: PII redaction is applied to every returned field', () => {
  it('redacts an email in the title', () => {
    const html = page('<title>Contact us at office@example.edu</title>', '<p>x</p>');
    expect(extractPage(html).title).toBe('Contact us at [EMAIL]');
  });

  it('redacts a phone number in main text', () => {
    const html = page('', '<main><p>Call +33 1 23 45 67 89 for help.</p></main>');
    expect(extractPage(html).mainText).toBe('Call [PHONE] for help.');
  });

  it('redacts contact data inside a heading', () => {
    const html = page('', '<main><h2>Reach us: admissions@example.edu</h2></main>');
    expect(extractPage(html).headings).toEqual([{ level: 2, text: 'Reach us: [EMAIL]' }]);
  });
});

describe('computeChromeLines: the pure differencing primitive', () => {
  it('identifies lines recurring on at least the threshold fraction of pages', () => {
    const pages = [
      ['Home', 'About', 'Page 1 content'],
      ['Home', 'About', 'Page 2 content'],
      ['Home', 'About', 'Page 3 content'],
      ['Page 4 content only'],
    ];
    // "Home" and "About" recur on 3/4 = 75% >= 45%; page-specific lines do not.
    const chrome = computeChromeLines(pages, 0.45);
    expect(chrome.has('Home')).toBe(true);
    expect(chrome.has('About')).toBe(true);
    expect(chrome.has('Page 1 content')).toBe(false);
  });

  it('respects a custom threshold', () => {
    const pages = [
      ['A', 'B'],
      ['A', 'C'],
      ['A', 'D'],
      ['A', 'E'],
    ];
    // "A" recurs on 4/4 = 100% of pages, which clears even a 90% threshold.
    expect(computeChromeLines(pages, 0.9).has('A')).toBe(true);
    // No count can ever reach a threshold above 100%.
    expect(computeChromeLines(pages, 1.01).has('A')).toBe(false);
  });

  it('returns an empty set for an empty page-set input', () => {
    expect(computeChromeLines([])).toEqual(new Set());
  });

  it('removeChromeLines strips exactly the chrome lines and nothing else', () => {
    const chrome = new Set(['Home', 'About']);
    expect(removeChromeLines('Home\nAbout\nUnique content', chrome)).toBe('Unique content');
  });
});

describe('computeChromeLines: NOT applied to a single page (documented, tested boundary)', () => {
  it('a single page trivially recurs at 100%, and extractPage never calls this primitive', () => {
    // This is the exact trap this module documents avoiding: naively applying
    // chrome-detection to a ONE-page sample would remove every line, because
    // every line of the one page you have "recurs on 100% of pages".
    const onePage = [['Home', 'About', 'This is the actual unique content of the page.']];
    const chrome = computeChromeLines(onePage, 0.45);
    expect(chrome.size).toBe(3); // every line qualifies - this is why it must not be applied to one page.

    // extractPage's own output is unaffected: it never calls computeChromeLines.
    const html = page(
      '',
      '<main><p>Home About This is the actual unique content of the page.</p></main>',
    );
    const result = extractPage(html);
    expect(result.mainText.length).toBeGreaterThan(0);
    expect(result.extractionMethod).toBe('MAIN_ELEMENT');
  });
});
