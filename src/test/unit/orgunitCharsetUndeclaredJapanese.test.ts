/**
 * Undeclared Shift_JIS / EUC-JP: the strict Japanese detection step that
 * runs after the UTF-8 probe and before the windows-1252 fallback.
 *
 * Node has no encoder for either encoding, so the Japanese byte fixtures were
 * produced once, offline, with the platform `iconv` (UTF-8 -> SHIFT_JIS and
 * UTF-8 -> EUC-JP) and are pinned here as hex. The surrounding markup is
 * plain ASCII, which both encodings share byte-for-byte, and declares NO
 * charset anywhere (no BOM, no header parameter, no meta).
 */
import { describe, expect, it } from 'vitest';
import {
  detectUndeclaredJapanese,
  JAPANESE_MIN_KANA_SHARE,
  JAPANESE_MIN_NON_ASCII,
  JAPANESE_MIN_SCRIPT_SHARE,
  resolveCharset,
  UNDECLARED_JAPANESE_CANDIDATES,
} from '../../orgunits/web/charset.js';
import { extractPage } from '../../orgunits/web/extract.js';

const TITLE = '国際交流センター';
const BODY = '留学生のための日本語教室と語学サロン。';

/** `国際交流センター`, then ` 留学生のための日本語教室と語学サロン。電話 ０３（１２３４）５６７８ 平日のみ`. */
const FIXTURES = {
  shift_jis: {
    title: '8d918ddb8cf097ac835a8393835e815b',
    body: '2097af8a7790b682cc82bd82df82cc93fa967b8cea8bb38eba82c68cea8a778354838d839381429364986220824f825281698250825182528253816a82548255825682572095bd93fa82cc82dd',
  },
  'euc-jp': {
    title: 'b9f1baddb8f2ceaea5bba5f3a5bfa1bc',
    body: '20ceb1b3d8c0b8a4cea4bfa4e1a4cec6fccbdcb8ecb6b5bcbca4c8b8ecb3d8a5b5a5eda5f3a1a3c5c5cfc320a3b0a3b3a1caa3b1a3b2a3b3a3b4a1cba3b5a3b6a3b7a3b820cabfc6fca4cea4df',
  },
} as const;

function undeclaredPage(titleHex: string, bodyHex: string): Buffer {
  return Buffer.concat([
    Buffer.from('<!DOCTYPE html><html lang="ja"><head><title>', 'ascii'),
    Buffer.from(titleHex, 'hex'),
    Buffer.from('</title></head><body><main><h1>', 'ascii'),
    Buffer.from(titleHex, 'hex'),
    Buffer.from('</h1><p>', 'ascii'),
    Buffer.from(bodyHex, 'hex'),
    Buffer.from('</p></main></body></html>', 'ascii'),
  ]);
}

function latinPage(text: string): Buffer {
  return Buffer.from(
    `<!DOCTYPE html><html lang="fr"><head><title>Relations internationales</title></head><body><main><p>${text}</p></main></body></html>`,
    'latin1',
  );
}

/** Deterministic byte source (a 32-bit LCG): the test never depends on a random seed. */
function lcgBytes(seed: number, length: number): Buffer {
  let state = seed >>> 0;
  const out = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

describe('the documented rule', () => {
  it('tries shift_jis then euc-jp, under fixed conservative thresholds', () => {
    expect(UNDECLARED_JAPANESE_CANDIDATES).toEqual(['shift_jis', 'euc-jp']);
    expect(JAPANESE_MIN_NON_ASCII).toBe(10);
    expect(JAPANESE_MIN_SCRIPT_SHARE).toBe(0.95);
    expect(JAPANESE_MIN_KANA_SHARE).toBe(0.2);
  });
});

describe('undeclared Japanese pages decode correctly', () => {
  for (const charset of UNDECLARED_JAPANESE_CANDIDATES) {
    it(`${charset}: resolved as ${charset}, FALLBACK/PROBED, and extracted with the phone redacted`, () => {
      const bytes = undeclaredPage(FIXTURES[charset].title, FIXTURES[charset].body);
      // The fixture really is not UTF-8, so the old path ended in windows-1252.
      expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toThrow();
      for (const contentType of [null, 'text/html']) {
        const resolved = resolveCharset(bytes, contentType);
        expect(resolved).toMatchObject({
          outcome: 'RESOLVED',
          charset,
          source: 'FALLBACK',
          confidence: 'PROBED',
        });
        if (resolved.outcome !== 'RESOLVED') return;
        const page = extractPage(resolved.text);
        expect(page.title).toBe(TITLE);
        expect(page.headings).toEqual([{ level: 1, text: TITLE }]);
        expect(page.mainText).toContain(BODY);
        expect(page.mainText).toContain('電話 [PHONE]');
        expect(page.mainText).not.toContain('１２３４');
        expect(page.mainText).not.toContain('�');
      }
    });
  }

  it('EUC-JP bytes are never accepted as Shift_JIS: half-width katakana alone carries no kana share', () => {
    const bytes = undeclaredPage(FIXTURES['euc-jp'].title, FIXTURES['euc-jp'].body);
    expect(detectUndeclaredJapanese(bytes)?.charset).toBe('euc-jp');
  });

  it('a declaration still wins: declared windows-1252 over Shift_JIS bytes is honoured, not sniffed', () => {
    const bytes = undeclaredPage(FIXTURES.shift_jis.title, FIXTURES.shift_jis.body);
    expect(resolveCharset(bytes, 'text/html; charset=windows-1252')).toMatchObject({
      outcome: 'RESOLVED',
      charset: 'windows-1252',
      source: 'HTTP_HEADER',
      confidence: 'DECLARED',
    });
  });

  it('valid UTF-8 Japanese stays a UTF-8 probe result', () => {
    const bytes = Buffer.from(`<html><body><p>${TITLE}${BODY}</p></body></html>`, 'utf8');
    expect(resolveCharset(bytes, null)).toMatchObject({
      charset: 'utf-8',
      source: 'UTF8_VALIDITY_PROBE',
    });
  });

  it('too little Japanese text to be sure falls back to windows-1252 (conservative)', () => {
    // `国際交流` alone: four code points, below the ten-code-point minimum.
    const bytes = undeclaredPage('8d918ddb8cf097ac', '');
    expect(detectUndeclaredJapanese(bytes)).toBeNull();
    expect(resolveCharset(bytes, null)).toMatchObject({
      charset: 'windows-1252',
      source: 'FALLBACK',
      confidence: 'ASSUMED',
    });
  });
});

describe('no misdetection', () => {
  it('a windows-1252 Latin page is still windows-1252', () => {
    const text =
      "Le service des relations internationales accueille les étudiants étrangers. Été 2026 : cours de français, échanges, réunions à l'université. Ça commence bientôt - Müller, Zoë, naïve, façade.";
    const resolved = resolveCharset(latinPage(text), 'text/html');
    expect(resolved).toMatchObject({
      outcome: 'RESOLVED',
      charset: 'windows-1252',
      source: 'FALLBACK',
      confidence: 'ASSUMED',
    });
    if (resolved.outcome === 'RESOLVED') expect(extractPage(resolved.text).mainText).toBe(text);
  });

  it('a windows-1252 page whose bytes ARE valid Shift_JIS is still windows-1252 (no kana)', () => {
    const text =
      'Désirée rédige Pépinière Créée Gérée Désirée Décès Hélène Désirée rédige Pépinière Créée Gérée Désirée Décès Hélène';
    const bytes = latinPage(text);
    // The trap: a fatal Shift_JIS decoder accepts every byte (as ideographs).
    expect(() => new TextDecoder('shift_jis', { fatal: true }).decode(bytes)).not.toThrow();
    expect(detectUndeclaredJapanese(bytes)).toBeNull();
    const resolved = resolveCharset(bytes, null);
    expect(resolved).toMatchObject({ charset: 'windows-1252', confidence: 'ASSUMED' });
    if (resolved.outcome === 'RESOLVED') expect(extractPage(resolved.text).mainText).toBe(text);
  });

  it('random bytes are never detected as Japanese', () => {
    let fatalShiftJisDecodable = 0;
    for (let i = 0; i < 2000; i++) {
      const bytes = lcgBytes(0x5eed + i, 16 + (i % 1024));
      try {
        new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
        fatalShiftJisDecodable += 1;
      } catch {
        // Expected for almost every buffer.
      }
      expect(detectUndeclaredJapanese(bytes), `buffer ${i}`).toBeNull();
      const resolved = resolveCharset(bytes, null);
      expect(
        resolved.outcome === 'RESOLVED' ? resolved.charset : 'UNRESOLVED',
        `buffer ${i}`,
      ).not.toMatch(/shift_jis|euc-jp/);
    }
    // Some random buffers DO decode under a fatal Shift_JIS decoder; the
    // script and kana thresholds, not decoder failure alone, refuse them.
    expect(fatalShiftJisDecodable).toBeGreaterThan(0);
  });
});
