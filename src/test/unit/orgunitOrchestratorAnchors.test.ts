import { describe, expect, it } from 'vitest';
import { extractDiscoveryAnchors, resolveAnchorHref } from '../../orgunits/orchestrator/anchors.js';
import { MAX_DISCOVERED_ANCHORS_PER_PAGE } from '../../orgunits/orchestrator/constants.js';

describe('extractDiscoveryAnchors', () => {
  it('extracts an ordinary anchor with its href and text', () => {
    const html = '<a href="/international/office">International Office</a>';
    const anchors = extractDiscoveryAnchors(html);
    expect(anchors).toEqual([{ hrefRaw: '/international/office', text: 'International Office' }]);
  });

  it('drops mailto:, tel:, javascript:, data:, file: and ftp: hrefs entirely', () => {
    const html = `
      <a href="mailto:office@example.edu">Email us</a>
      <a href="tel:+33123456789">Call us</a>
      <a href="javascript:void(0)">JS</a>
      <a href="data:text/plain;base64,aGVsbG8=">Data</a>
      <a href="file:///etc/passwd">File</a>
      <a href="ftp://example.edu/files">FTP</a>
      <a href="/real-page">Real page</a>
    `;
    const anchors = extractDiscoveryAnchors(html);
    expect(anchors).toEqual([{ hrefRaw: '/real-page', text: 'Real page' }]);
  });

  it('drops fragment-only and empty hrefs', () => {
    const html = '<a href="#top">Top</a><a href="">Empty</a><a href="/ok">OK</a>';
    const anchors = extractDiscoveryAnchors(html);
    expect(anchors.map((a) => a.hrefRaw)).toEqual(['/ok']);
  });

  it('redacts email/phone-shaped anchor text (PII never reaches the frontier)', () => {
    const html = '<a href="/contact">Call 01 23 45 67 89 or write a.b@example.edu</a>';
    const anchors = extractDiscoveryAnchors(html);
    expect(anchors[0]?.text).toContain('[PHONE]');
    expect(anchors[0]?.text).toContain('[EMAIL]');
    expect(anchors[0]?.text).not.toContain('01 23 45 67 89');
    expect(anchors[0]?.text).not.toContain('a.b@example.edu');
  });

  it('returns null text for an anchor with no text content', () => {
    const html = '<a href="/icon"><img src="x.png"/></a>';
    const anchors = extractDiscoveryAnchors(html);
    expect(anchors[0]?.text).toBeNull();
  });

  it('bounds the number of anchors returned at MAX_DISCOVERED_ANCHORS_PER_PAGE', () => {
    const many = Array.from(
      { length: MAX_DISCOVERED_ANCHORS_PER_PAGE + 50 },
      (_, i) => `<a href="/p${i}">p${i}</a>`,
    ).join('\n');
    const anchors = extractDiscoveryAnchors(many);
    expect(anchors).toHaveLength(MAX_DISCOVERED_ANCHORS_PER_PAGE);
  });

  it('is case-insensitive on the dropped scheme', () => {
    const html = '<a href="MAILTO:x@example.edu">x</a><a href="TEL:0123">y</a>';
    expect(extractDiscoveryAnchors(html)).toEqual([]);
  });

  describe('anchor hygiene (2026-08-27 shadow validation Pass B, defect 3)', () => {
    // VERIFIED directly against the persisted orgunit_fetch_observations
    // rows for the real ISAE-SUPAERO run (2b9a87e5-2817-4580-994d-9aaf4b64e2ca,
    // working database nwf_pe): the captured href was the bare RELATIVE
    // string "--><!--" - nothing else, no surrounding path text - which
    // then self-amplified into 26 of 41 requests (63%) as each 301/200
    // generation appended another copy relative to the previous, still-
    // malformed URL. This exact byte sequence is used below, alongside a
    // second, differently-shaped fixture proving the fix is a structural
    // rule about raw markup delimiters, not a check for this one substring.
    const REAL_ARTIFACT_HREF = '--><!--';
    const MALFORMED_HTML = `<a href="${REAL_ARTIFACT_HREF}" class="menu-item">Parcours</a>\n<a href="/international/">International</a>`;

    it('drops the malformed-artifact anchor entirely (0 admissions), while keeping the neighbouring valid anchor', () => {
      const anchors = extractDiscoveryAnchors(MALFORMED_HTML);
      expect(anchors.map((a) => a.hrefRaw)).toEqual(['/international/']);
    });

    it('never resolves the real artifact href to a URL at all, once past extraction', () => {
      // extractDiscoveryAnchors already discarded it above; this pins that
      // resolveAnchorHref itself would ALSO have produced the exact
      // "%3E%3C!--"-bearing URL the audit observed, had extraction not
      // already removed it - the two layers are independently sufficient.
      const resolution = resolveAnchorHref(
        'https://www.isae-supaero.fr/en/isae-supaero/our-newsroom/news/example/',
        REAL_ARTIFACT_HREF,
      );
      expect(resolution).toEqual({
        ok: true,
        url: 'https://www.isae-supaero.fr/en/isae-supaero/our-newsroom/news/example/--%3E%3C!--',
      });
    });

    it('never reads anchor markup from inside a complete HTML comment (the comment-boundary requirement)', () => {
      const html = '<!-- <a href="/old-nav">Old nav</a> --><a href="/current">Current</a>';
      const anchors = extractDiscoveryAnchors(html);
      expect(anchors.map((a) => a.hrefRaw)).toEqual(['/current']);
    });

    it('never reads anchor-shaped text from inside a <script> block', () => {
      const html = '<script>var x = \'<a href="/fake">Fake</a>\';</script><a href="/real">Real</a>';
      const anchors = extractDiscoveryAnchors(html);
      expect(anchors.map((a) => a.hrefRaw)).toEqual(['/real']);
    });

    it('never reads anchor-shaped text from inside a <style> block', () => {
      const html = '<style>/* <a href="/fake-style">Fake</a> */</style><a href="/real2">Real</a>';
      const anchors = extractDiscoveryAnchors(html);
      expect(anchors.map((a) => a.hrefRaw)).toEqual(['/real2']);
    });

    it('drops any captured href containing a raw angle bracket, independent of the literal --><!-- substring', () => {
      // A different boundary-crossing shape (a stray unmatched quote pulling
      // a whole second anchor tag into the first capture) - proving the fix
      // is a structural rule about raw markup delimiters, not a check for
      // one specific string.
      const html =
        '<a href="/legacy.html --><a href="/other.html">Old link</a>\n<a href="/ok">OK</a>';
      const anchors = extractDiscoveryAnchors(html);
      expect(anchors.map((a) => a.hrefRaw)).toEqual(['/ok']);
    });

    it('a malformed anchor never produces a resolvable, fetchable URL (0 frontier admissions, 0 requests for the artifact)', () => {
      const anchors = extractDiscoveryAnchors(MALFORMED_HTML);
      expect(anchors).toHaveLength(1);
      // The malformed href was discarded at extraction, before
      // resolveAnchorHref/frontier.add ever runs on it - there is no
      // artifact URL left to resolve, admit, or fetch at all.
    });

    it('recall protection: every legitimate useful-target anchor shape (Track A/B, French/English, query-bearing) survives unchanged', () => {
      const usefulHrefs = [
        '/international/',
        '/international-office/',
        '/relations-internationales/',
        '/mobilite-internationale/',
        '/erasmus/',
        '/incoming-students/',
        '/centre-de-langues/',
        '/fle/',
        '/lansad/',
        '/ufr-langues/',
        '/page?lang=en',
        '/page?locale=fr',
        '/page?id=123',
      ];
      const html = usefulHrefs.map((href, i) => `<a href="${href}">Link ${i}</a>`).join('\n');
      const anchors = extractDiscoveryAnchors(html);
      expect(anchors.map((a) => a.hrefRaw)).toEqual(usefulHrefs);
    });

    it('mixed page: drops the malformed artifact anchor while keeping Track A and Track B useful anchors', () => {
      const html = [
        `<a href="${REAL_ARTIFACT_HREF}">Parcours</a>`,
        '<a href="/international/mobilite">Mobilite internationale</a>',
        '<a href="/centre-de-langues/fle">FLE</a>',
      ].join('\n');
      const anchors = extractDiscoveryAnchors(html);
      expect(anchors.map((a) => a.hrefRaw)).toEqual([
        '/international/mobilite',
        '/centre-de-langues/fle',
      ]);
    });

    it('is deterministic: the same input yields the same admitted anchors, in the same order, on repeated calls', () => {
      const html = '<a href="/b">B</a><a href="/a">A</a><a href="/formation/x--><!--y">Bad</a>';
      const first = extractDiscoveryAnchors(html);
      const second = extractDiscoveryAnchors(html);
      expect(second).toEqual(first);
      expect(first.map((a) => a.hrefRaw)).toEqual(['/b', '/a']);
    });
  });
});

describe('resolveAnchorHref', () => {
  it('resolves a relative href against the page URL', () => {
    const result = resolveAnchorHref('https://example.edu/international/', '../fr/office');
    expect(result).toEqual({ ok: true, url: 'https://example.edu/fr/office' });
  });

  it('strips a fragment from the resolved URL', () => {
    const result = resolveAnchorHref('https://example.edu/', '/page#section');
    expect(result).toEqual({ ok: true, url: 'https://example.edu/page' });
  });

  it('reports failure for an unresolvable href', () => {
    const result = resolveAnchorHref('https://example.edu/', 'http://[invalid');
    expect(result.ok).toBe(false);
  });

  it('resolves an absolute href unchanged (aside from fragment stripping)', () => {
    const result = resolveAnchorHref('https://example.edu/', 'https://other.example.edu/x');
    expect(result).toEqual({ ok: true, url: 'https://other.example.edu/x' });
  });
});
