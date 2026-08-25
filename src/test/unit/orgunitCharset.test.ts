/**
 * Charset resolution, in the frozen precedence: BOM > HTTP header > meta >
 * strict UTF-8 probe > windows-1252 fallback.
 *
 * The late-meta case reproduces the exact shape of the 2026-08-24 holdout
 * finding (ADR 0004 s3): a real declaration sitting past the 1024-byte
 * prescan window, preceded by blank-line padding, over bytes that are not
 * valid UTF-8.
 */
import { describe, expect, it } from 'vitest';
import { extractHttpCharset, resolveCharset } from '../../orgunits/web/charset.js';

function html(head: string, body = '<p>hello</p>'): string {
  return `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
}

describe('extractHttpCharset', () => {
  it('reads charset from a Content-Type header, unquoted and quoted', () => {
    expect(extractHttpCharset('text/html; charset=utf-8')).toBe('utf-8');
    expect(extractHttpCharset('text/html; charset="utf-8"')).toBe('utf-8');
    expect(extractHttpCharset("text/html; charset='iso-8859-1'")).toBe('iso-8859-1');
    expect(extractHttpCharset('text/html;charset=UTF-8')).toBe('UTF-8');
  });

  it('returns null when absent or blank', () => {
    expect(extractHttpCharset(null)).toBeNull();
    expect(extractHttpCharset('text/html')).toBeNull();
    expect(extractHttpCharset('text/html; charset=')).toBeNull();
  });
});

describe('resolveCharset: precedence', () => {
  it('BOM beats everything, including a conflicting HTTP header', () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('café', 'utf-8')]);
    const result = resolveCharset(bytes, 'text/html; charset=windows-1252');
    expect(result).toMatchObject({
      outcome: 'RESOLVED',
      charset: 'utf-8',
      source: 'BOM',
      confidence: 'DECLARED',
    });
    if (result.outcome === 'RESOLVED') expect(result.text).toBe('café');
  });

  it('UTF-16LE and UTF-16BE BOMs are detected', () => {
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hi', 'utf-16le')]);
    expect(resolveCharset(le, null)).toMatchObject({ charset: 'utf-16le', source: 'BOM' });
    const be = Buffer.from([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]);
    expect(resolveCharset(be, null)).toMatchObject({ charset: 'utf-16be', source: 'BOM' });
  });

  it('HTTP header beats a meta declaration', () => {
    const body = Buffer.from(html('<meta charset="windows-1252">'), 'utf-8');
    const result = resolveCharset(body, 'text/html; charset=utf-8');
    expect(result).toMatchObject({
      outcome: 'RESOLVED',
      charset: 'utf-8',
      source: 'HTTP_HEADER',
      confidence: 'DECLARED',
    });
  });

  it('recognises <meta charset> within the 1024-byte prescan window', () => {
    const body = Buffer.from(html('<meta charset="utf-8">'), 'utf-8');
    const result = resolveCharset(body, null);
    expect(result).toMatchObject({ outcome: 'RESOLVED', charset: 'utf-8', source: 'META_PRESCAN' });
  });

  it('recognises the http-equiv content-type meta form', () => {
    const body = Buffer.from(
      html('<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">'),
      'latin1',
    );
    const result = resolveCharset(body, null);
    expect(result).toMatchObject({
      outcome: 'RESOLVED',
      charset: 'windows-1252',
      source: 'META_PRESCAN',
    });
  });

  it('THE HOLDOUT CASE: recognises a meta declaration past byte 1024, over invalid UTF-8', () => {
    // A comment block pads the head well past the 1024-byte prescan window,
    // exactly as ADR 0004 s3 measured (the real declaration sat at byte 1050).
    const padding = `<!--${' '.repeat(1040)}-->`;
    const head = `${padding}<meta charset="windows-1252">`;
    // The body itself carries a byte (0xe9, "é" in windows-1252) that is not
    // valid UTF-8 on its own, so decoding it as UTF-8 would have produced
    // exactly the corruption the holdout measured.
    const bodyBytes = Buffer.concat([
      Buffer.from(`<!DOCTYPE html><html><head>${head}</head><body><p>`, 'latin1'),
      Buffer.from([0xe9]),
      Buffer.from('cole</p></body></html>', 'latin1'),
    ]);
    const declarationOffset = bodyBytes.indexOf(Buffer.from('<meta charset', 'latin1'));
    expect(declarationOffset).toBeGreaterThan(1024);

    const result = resolveCharset(bodyBytes, null);
    expect(result).toMatchObject({
      outcome: 'RESOLVED',
      charset: 'windows-1252',
      source: 'META_LATE',
      confidence: 'DECLARED',
    });
    if (result.outcome === 'RESOLVED') expect(result.text).toContain('école');
  });

  it('does not scan past the 64 KiB ceiling', () => {
    const filler = '<!-- '.padEnd(70_000, 'x') + ' -->';
    const body = Buffer.from(
      `<!DOCTYPE html><html><head>${filler}<meta charset="windows-1252"></head><body></body></html>`,
      'latin1',
    );
    const declarationOffset = body.indexOf(Buffer.from('<meta charset', 'latin1'));
    expect(declarationOffset).toBeGreaterThan(64 * 1024);
    const result = resolveCharset(body, null);
    // No declaration was found within the ceiling, so this falls through to
    // the UTF-8 probe / windows-1252 fallback, never to the (out-of-window)
    // declaration.
    expect(result.outcome).toBe('RESOLVED');
    if (result.outcome === 'RESOLVED') expect(result.source).not.toBe('META_LATE');
  });

  it('ignores a meta charset appearing after </head>', () => {
    const body = Buffer.from(
      '<!DOCTYPE html><html><head></head><body><meta charset="windows-1252"></body></html>',
      'latin1',
    );
    const result = resolveCharset(body, null);
    expect(result.outcome).toBe('RESOLVED');
    if (result.outcome === 'RESOLVED') expect(result.source).not.toMatch(/^META_/);
  });

  it('falls through to a strict UTF-8 probe when nothing is declared', () => {
    const body = Buffer.from(html(''), 'utf-8');
    const result = resolveCharset(body, null);
    expect(result).toMatchObject({
      outcome: 'RESOLVED',
      charset: 'utf-8',
      source: 'UTF8_VALIDITY_PROBE',
      confidence: 'PROBED',
    });
  });

  it('the UTF-8 probe is STRICT: invalid UTF-8 falls through to windows-1252, not through', () => {
    const invalid = Buffer.from([0xc3, 0x28]); // 0xC3 starts a 2-byte sequence; 0x28 is not a valid continuation.
    const result = resolveCharset(invalid, null);
    expect(result).toMatchObject({
      outcome: 'RESOLVED',
      charset: 'windows-1252',
      source: 'FALLBACK',
      confidence: 'ASSUMED',
    });
  });

  it('windows-1252 fallback decodes accented bytes with LOW (ASSUMED) confidence', () => {
    const bytes = Buffer.from([0xe9, 0xe8, 0xea]); // é è ê in windows-1252
    const result = resolveCharset(bytes, null);
    expect(result).toMatchObject({
      outcome: 'RESOLVED',
      charset: 'windows-1252',
      source: 'FALLBACK',
      confidence: 'ASSUMED',
    });
    if (result.outcome === 'RESOLVED') expect(result.text).toBe('éèê');
  });

  it('refuses an unsupported EXPLICIT declaration rather than guessing windows-1252', () => {
    const body = Buffer.from('plain ascii body', 'utf-8');
    const result = resolveCharset(body, 'text/html; charset=x-made-up-charset');
    expect(result.outcome).toBe('UNRESOLVED');
    if (result.outcome === 'UNRESOLVED') {
      expect(result.reason).toContain('x-made-up-charset');
    }
  });

  it('refuses an unsupported meta declaration the same way', () => {
    const body = Buffer.from(html('<meta charset="x-made-up-charset">'), 'utf-8');
    const result = resolveCharset(body, null);
    expect(result.outcome).toBe('UNRESOLVED');
  });
});
