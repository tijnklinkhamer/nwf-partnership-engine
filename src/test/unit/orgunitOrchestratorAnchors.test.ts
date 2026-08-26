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
