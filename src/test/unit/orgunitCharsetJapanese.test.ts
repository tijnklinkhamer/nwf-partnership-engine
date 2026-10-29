/**
 * Japanese legacy encodings: Shift_JIS, EUC-JP and ISO-2022-JP.
 *
 * Node has no ENCODER for any of the three, so the byte fixtures below were
 * produced once, offline, with the platform `iconv` (UTF-8 -> SHIFT_JIS /
 * EUC-JP / ISO-2022-JP; the `①` vector with CP932, the Windows superset the
 * WHATWG `shift_jis` decoder actually implements) and are pinned here as hex
 * so the test is machine-independent. Each fixture is ONLY the Japanese
 * text; the surrounding markup is plain ASCII, which all three encodings
 * share byte-for-byte (ISO-2022-JP returns to ASCII with `ESC ( B` at the end
 * of every fixture).
 *
 * What is proved, per encoding, and for BOTH declaration routes (HTTP
 * header and `<meta>`):
 *
 *   - `resolveCharset` RESOLVES with this Node build's decoder, as
 *     DECLARED, and the decoded text is exactly the original Japanese;
 *   - `extractPage` over that text yields the correct title, headings and
 *     main text, with no U+FFFD replacement character anywhere;
 *   - the full-width-free JP postcode in the body survives redaction.
 *
 * And the unchanged refusal: an explicit-but-unsupported declaration is
 * still UNRESOLVED, never silently decoded as windows-1252.
 */
import { describe, expect, it } from 'vitest';
import { resolveCharset } from '../../orgunits/web/charset.js';
import { extractPage } from '../../orgunits/web/extract.js';

const TITLE = '国際交流センター';
const BODY = '留学生のための日本語教室と語学サロン。〒100-0001 東京都千代田区';

const FIXTURES = {
  shift_jis: {
    labels: ['Shift_JIS', 'shift_jis', 'x-sjis', 'windows-31j', 'MS_Kanji'],
    title: '8d918ddb8cf097ac835a8393835e815b',
    body: '97af8a7790b682cc82bd82df82cc93fa967b8cea8bb38eba82c68cea8a778354838d8393814281a73130302d3030303120938c8b9e937390e791e393638be6',
  },
  'euc-jp': {
    labels: ['EUC-JP', 'euc-jp', 'x-euc-jp'],
    title: 'b9f1baddb8f2ceaea5bba5f3a5bfa1bc',
    body: 'ceb1b3d8c0b8a4cea4bfa4e1a4cec6fccbdcb8ecb6b5bcbca4c8b8ecb3d8a5b5a5eda5f3a1a3a2a93130302d3030303120c5ecb5fec5d4c0e9c2e5c5c4b6e8',
  },
  'iso-2022-jp': {
    labels: ['ISO-2022-JP', 'iso-2022-jp', 'csISO2022JP'],
    title: '1b244239713a5d38724e2e253b2573253f213c1b2842',
    body: '1b24424e3133584038244e243f2461244e467c4b5c386c36353c3c2448386c33582535256d2573212322291b28423130302d30303031201b2442456c357e455440694265454436681b2842',
  },
} as const;

type Encoding = keyof typeof FIXTURES;
const ENCODINGS = Object.keys(FIXTURES) as Encoding[];

function page(encoding: Encoding, head: string): Buffer {
  const fixture = FIXTURES[encoding];
  return Buffer.concat([
    Buffer.from(`<!DOCTYPE html><html lang="ja"><head>${head}<title>`, 'ascii'),
    Buffer.from(fixture.title, 'hex'),
    Buffer.from('</title></head><body><nav>menu</nav><main><h1>', 'ascii'),
    Buffer.from(fixture.title, 'hex'),
    Buffer.from('</h1><p>', 'ascii'),
    Buffer.from(fixture.body, 'hex'),
    Buffer.from('</p></main></body></html>', 'ascii'),
  ]);
}

function expectJapanese(text: string): void {
  const extracted = extractPage(text);
  expect(extracted.title).toBe(TITLE);
  expect(extracted.declaredLang).toBe('ja');
  expect(extracted.headings).toEqual([{ level: 1, text: TITLE }]);
  expect(extracted.mainText).toContain(TITLE);
  expect(extracted.mainText).toContain(BODY);
  expect(extracted.mainText).not.toContain('�');
  expect(extracted.extractionMethod).toBe('MAIN_ELEMENT');
}

describe('resolveCharset + extractPage: Japanese legacy encodings', () => {
  for (const encoding of ENCODINGS) {
    describe(encoding, () => {
      it('the pinned fixtures are NOT valid UTF-8 or plain ASCII (so the test proves decoding)', () => {
        const bytes = page(encoding, '');
        // ISO-2022-JP is 7-bit, so it would pass a UTF-8 probe as mojibake
        // ESC-sequence text; the other two are not even valid UTF-8.
        if (encoding === 'iso-2022-jp') {
          expect(bytes.includes(0x1b)).toBe(true);
        } else {
          expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toThrow();
        }
      });

      for (const label of FIXTURES[encoding].labels) {
        it(`decodes a page declared "${label}" by the HTTP header`, () => {
          const result = resolveCharset(page(encoding, ''), `text/html; charset=${label}`);
          expect(result).toMatchObject({
            outcome: 'RESOLVED',
            charset: label.toLowerCase(),
            source: 'HTTP_HEADER',
            confidence: 'DECLARED',
          });
          if (result.outcome !== 'RESOLVED') throw new Error('unreachable');
          expectJapanese(result.text);
        });
      }

      it('decodes a page declared by <meta charset>', () => {
        const label = FIXTURES[encoding].labels[0];
        const result = resolveCharset(page(encoding, `<meta charset="${label}">`), 'text/html');
        expect(result).toMatchObject({
          outcome: 'RESOLVED',
          source: 'META_PRESCAN',
          confidence: 'DECLARED',
        });
        if (result.outcome !== 'RESOLVED') throw new Error('unreachable');
        expectJapanese(result.text);
      });

      it('decodes a page declared by <meta http-equiv="Content-Type">', () => {
        const label = FIXTURES[encoding].labels[0];
        const result = resolveCharset(
          page(encoding, `<meta http-equiv="Content-Type" content="text/html; charset=${label}">`),
          null,
        );
        expect(result).toMatchObject({
          outcome: 'RESOLVED',
          charset: label.toLowerCase(),
          source: 'META_PRESCAN',
        });
        if (result.outcome !== 'RESOLVED') throw new Error('unreachable');
        expectJapanese(result.text);
      });

      it('decodes a page whose meta declaration sits past the 1024-byte prescan window', () => {
        const label = FIXTURES[encoding].labels[0];
        const padding = '\n'.repeat(1100);
        const result = resolveCharset(page(encoding, `${padding}<meta charset="${label}">`), null);
        expect(result).toMatchObject({ outcome: 'RESOLVED', source: 'META_LATE' });
        if (result.outcome !== 'RESOLVED') throw new Error('unreachable');
        expectJapanese(result.text);
      });
    });
  }

  it('Shift_JIS decodes the CP932 (Windows) extension characters too', () => {
    // `①` is 0x87 0x40 in CP932 only; WHATWG `shift_jis` is that superset.
    const result = resolveCharset(Buffer.from('8740', 'hex'), 'text/html; charset=Shift_JIS');
    expect(result).toMatchObject({ outcome: 'RESOLVED', text: '①' });
  });

  it('the HTTP header still beats a conflicting meta declaration', () => {
    const bytes = page('euc-jp', '<meta charset="Shift_JIS">');
    const result = resolveCharset(bytes, 'text/html; charset=EUC-JP');
    expect(result).toMatchObject({ outcome: 'RESOLVED', charset: 'euc-jp', source: 'HTTP_HEADER' });
    if (result.outcome !== 'RESOLVED') throw new Error('unreachable');
    expectJapanese(result.text);
  });

  it('an unsupported explicit Japanese-looking declaration is still a REFUSAL', () => {
    for (const contentType of [
      'text/html; charset=x-jis-made-up',
      'text/html; charset=EUC-JIS-2004',
      'text/html; charset=Shift_JIS-2004',
    ]) {
      const result = resolveCharset(page('shift_jis', ''), contentType);
      expect(result.outcome, contentType).toBe('UNRESOLVED');
    }
    const meta = resolveCharset(page('euc-jp', '<meta charset="x-jis-made-up">'), null);
    expect(meta.outcome).toBe('UNRESOLVED');
  });
});
