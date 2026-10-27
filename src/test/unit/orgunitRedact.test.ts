/**
 * PII redaction: conservative enough that ordinary institutional text -
 * years, page numbers, short reference codes - survives untouched, while
 * every contact-shaped value in the test matrix is destroyed.
 */
import { describe, expect, it } from 'vitest';
import {
  foldPhoneCharacters,
  maskAcademicYearRanges,
  redactContactData,
  redactEmails,
  redactHrefTarget,
  redactPhones,
} from '../../orgunits/web/redact.js';

describe('redactEmails', () => {
  it('redacts a plain email address', () => {
    expect(redactEmails('Contact: jane.doe@example.edu for details.')).toBe(
      'Contact: [EMAIL] for details.',
    );
  });

  it('redacts an email inside a heading-shaped string', () => {
    expect(redactEmails('International Office - contact@intl.example.edu')).toBe(
      'International Office - [EMAIL]',
    );
  });

  it('redacts multiple emails independently', () => {
    expect(redactEmails('a@x.fr and b@y.de')).toBe('[EMAIL] and [EMAIL]');
  });

  it('does not over-redact an ordinary "@" that is not an email', () => {
    expect(redactEmails('Room @ building 3, floor 2')).toBe('Room @ building 3, floor 2');
    expect(redactEmails('meet @ 3pm')).toBe('meet @ 3pm');
  });
});

describe('redactPhones', () => {
  it('redacts an international-format phone number', () => {
    expect(redactPhones('Call +33 1 23 45 67 89 for information.')).toBe(
      'Call [PHONE] for information.',
    );
  });

  it('redacts a French-formatted phone number', () => {
    expect(redactPhones('Tél : 01 23 45 67 89')).toBe('Tél : [PHONE]');
  });

  it('redacts a German-style phone number', () => {
    expect(redactPhones('Telefon: +49 (0)30 1234567')).toBe('Telefon: [PHONE]');
    expect(redactPhones('Telefon: 030-123-4567')).toBe('Telefon: [PHONE]');
  });

  it('redacts a Dutch-style phone number', () => {
    expect(redactPhones('Tel: 020-1234567')).toBe('Tel: [PHONE]');
    expect(redactPhones('Tel: +31 20 123 4567')).toBe('Tel: [PHONE]');
  });

  it('redacts phone numbers separated by spaces', () => {
    expect(redactPhones('+1 415 555 0134')).toBe('[PHONE]');
  });

  it('redacts phone numbers separated by hyphens', () => {
    expect(redactPhones('call 555-0134-9921')).toBe('call [PHONE]');
  });

  it('redacts a phone number inside main text', () => {
    const text = 'For more information about our programmes, call +33 1 23 45 67 89 today.';
    expect(redactPhones(text)).toBe(
      'For more information about our programmes, call [PHONE] today.',
    );
  });

  it('leaves an ordinary year untouched', () => {
    expect(redactPhones('Founded in 1987, accredited since 2024.')).toBe(
      'Founded in 1987, accredited since 2024.',
    );
  });

  it('leaves ordinary short numeric values untouched', () => {
    expect(redactPhones('Room 12, page 8, module 3.')).toBe('Room 12, page 8, module 3.');
    expect(redactPhones('ECTS: 30 credits over 2 semesters')).toBe(
      'ECTS: 30 credits over 2 semesters',
    );
  });

  it('leaves a short numeric range untouched even with a hyphen', () => {
    expect(redactPhones('Pages 12-15 cover the curriculum.')).toBe(
      'Pages 12-15 cover the curriculum.',
    );
  });
});

describe('redactContactData: composition', () => {
  it('redacts both an email and a phone in the same text', () => {
    const text = 'Contact jane.doe@example.edu or call +33 1 23 45 67 89.';
    expect(redactContactData(text)).toBe('Contact [EMAIL] or call [PHONE].');
  });

  it('an email local part is not separately misread as a phone number', () => {
    const text = 'Write to office2024@example.edu.';
    expect(redactContactData(text)).toBe('Write to [EMAIL].');
  });

  it('produces zero literal test contact values in a realistic composite page', () => {
    const text = [
      'International Office',
      'Contact: international@example.edu',
      'Phone: +33 1 23 45 67 89',
      'Founded in 1987. Room 204, building B.',
    ].join('\n');
    const redacted = redactContactData(text);
    expect(redacted).not.toContain('international@example.edu');
    expect(redacted).not.toContain('23 45 67 89');
    expect(redacted).toContain('1987');
    expect(redacted).toContain('204');
  });
});

describe('redactHrefTarget', () => {
  it('redacts a mailto target to [EMAIL]', () => {
    expect(redactHrefTarget('mailto:jane.doe@example.edu')).toBe('[EMAIL]');
    expect(redactHrefTarget('MAILTO:jane.doe@example.edu')).toBe('[EMAIL]');
  });

  it('redacts a tel target to [PHONE]', () => {
    expect(redactHrefTarget('tel:+33123456789')).toBe('[PHONE]');
    expect(redactHrefTarget('TEL:+33123456789')).toBe('[PHONE]');
  });

  it('returns null for an ordinary href, which the caller leaves untouched', () => {
    expect(redactHrefTarget('https://example.edu/international')).toBeNull();
    expect(redactHrefTarget('/international')).toBeNull();
  });

  it('never lets the actual target string survive in the returned value', () => {
    const mailto = redactHrefTarget('mailto:secret.person@example.edu');
    const tel = redactHrefTarget('tel:+15551234567');
    expect(mailto).not.toContain('secret.person');
    expect(tel).not.toContain('5551234567');
  });
});

describe('redactPhones: Japanese, Mexican and Dutch formats', () => {
  const POSITIVE: readonly (readonly [string, string])[] = [
    // JP: Tokyo landline, mobile, toll-free, international, full-width.
    ['電話：03-1234-5678', '電話：[PHONE]'],
    ['携帯 090-1234-5678 まで', '携帯 [PHONE] まで'],
    ['フリーダイヤル 0120-123-456', 'フリーダイヤル [PHONE]'],
    ['Tel +81 3 1234 5678', 'Tel [PHONE]'],
    ['電話 ０３－１２３４－５６７８（平日）', '電話 [PHONE]（平日）'],
    ['ＴＥＬ：０９０ー１２３４ー５６７８', 'ＴＥＬ：[PHONE]'],
    ['ＴＥＬ　＋８１　３　１２３４　５６７８', 'ＴＥＬ　[PHONE]'],
    ['電話 03（1234）5678', '電話 [PHONE]'],
    ['電話 03(1234)5678', '電話 [PHONE]'],
    // MX
    ['Teléfono: +52 55 1234 5678', 'Teléfono: [PHONE]'],
    ['Tel. (55) 1234-5678', 'Tel. [PHONE]'],
    // NL
    ['Bel +31 20 123 4567', 'Bel [PHONE]'],
    ['Tel: 020-1234567', 'Tel: [PHONE]'],
    ['Mobiel: 06-12345678', 'Mobiel: [PHONE]'],
  ];

  for (const [input, expected] of POSITIVE) {
    it(`redacts ${JSON.stringify(input)}`, () => {
      expect(redactPhones(input)).toBe(expected);
      expect(redactContactData(input)).toBe(expected);
    });
  }

  const NEGATIVE: readonly string[] = [
    // years and year ranges
    '2024年度 / 2024-2025 / 令和6年',
    '２０２４年４月１日',
    '2019–2020 and 2021–2022',
    '２０１９－２０２０',
    // postcodes
    'Postbus 1234, 1012 AB Amsterdam',
    '1012AB Amsterdam',
    '〒100-0001 東京都千代田区',
    '〒１００－０００１',
    'C.P. 04510, Ciudad de México',
    // dates
    '2026-10-26',
    '26-10-2026',
    '26.10.2026',
    '1-2-2026',
    'van 26-10-2026 tot 30-10-2026',
    'del 26-10-2026 al 30-10-2026',
    '２６－１０－２０２６',
    '２０２６．１０．２６',
    '26/10/2026',
    // prices
    '¥12,000',
    '１２，０００円',
    '€ 1.250,00',
    '$1,250.00 MXN',
    // room numbers / short codes
    'Room 3.14, Sala 204, lokaal 2.05',
    '研究棟 3-201 号室',
    'ECTS 30 / 単位 2',
  ];

  for (const input of NEGATIVE) {
    it(`leaves ${JSON.stringify(input)} untouched`, () => {
      expect(redactContactData(input)).toBe(input);
    });
  }

  it('keeps every full-width character OUTSIDE a redacted span byte-identical', () => {
    const text = '国際交流センター（本館２階）　電話 ０３－１２３４－５６７８　受付：平日';
    expect(redactPhones(text)).toBe('国際交流センター（本館２階）　電話 [PHONE]　受付：平日');
  });

  it('foldPhoneCharacters is length-preserving and leaves ASCII untouched', () => {
    const ascii = 'Tel: +33 1 23 45 67 89 (office) - 2024.';
    expect(foldPhoneCharacters(ascii)).toBe(ascii);
    const wide = '＋８１　３（１２３４）５６７８．－ー';
    const folded = foldPhoneCharacters(wide);
    expect(folded).toBe('+81 3(1234)5678.--');
    expect(folded.length).toBe(wide.length);
  });

  it('a date-shaped run does not shelter a longer phone-shaped candidate', () => {
    // The day-month-year exemption is a WHOLE-candidate check only.
    expect(redactPhones('Tel. 010-12-12-2019')).toBe('Tel. [PHONE]');
    expect(redactPhones('Tel. +31 26-10-2026')).toBe('Tel. [PHONE]');
    // Not a valid day/month: never exempt.
    expect(redactPhones('Tel. 45-67-2012')).toBe('Tel. [PHONE]');
  });

  it('redacts several mixed-width numbers in one text independently', () => {
    expect(redactPhones('東京 03-1234-5678、大阪 ０６－１２３４－５６７８、NL 020-1234567')).toBe(
      '東京 [PHONE]、大阪 [PHONE]、NL [PHONE]',
    );
  });
});

describe('redactPhones: academic-year ranges are never phone numbers (REL final join A1)', () => {
  // The REL harvest (H4) found `2026-2027 2027-2028` redacted as [PHONE]:
  // two adjacent ranges are sixteen digits grouped by a hyphen and a space.
  const NEVER_REDACTED: readonly string[] = [
    '2026-2027',
    '2026–2027',
    '2026/2027',
    '2026-27',
    '2026 - 2027',
    '2026-2027 2027-2028',
    '2026-2027 2027-2028 2028-2029',
    '2026–2027 2027–2028',
    '2026/2027 2027/2028',
    '2026-27 2027-28 2028-29',
    '2026 - 2027 2027 - 2028',
    '2026-2027\n2027-2028',
    '２０２６－２０２７　２０２７－２０２８',
    '2014-2020 2021-2027',
    'academiejaar 2026-2027',
    'collegejaar 2026-2027 2027-2028.',
    'Op 26-10-2026 is er een open dag voor aankomende studenten van collegejaar 2026-2027 2027-2028.',
    'curso 2026-2027',
    'cursos 2026-2027 2027-2028',
    '2026年度',
    '令和8年',
    '2026年度（令和8年度）',
    // the day-month-year dates L6 kept, next to ranges
    'Inschrijven van 26-10-2026 tot 30-10-2026 voor 2026-2027 2027-2028',
    'del 26-10-2026 al 30-10-2026, curso 2026-2027',
  ];

  for (const input of NEVER_REDACTED) {
    it(`leaves ${JSON.stringify(input)} untouched`, () => {
      expect(redactPhones(input)).toBe(input);
      expect(redactContactData(input)).toBe(input);
    });
  }

  const STILL_REDACTED: readonly (readonly [string, string])[] = [
    // A year-shaped tail INSIDE a phone number is part of the phone.
    ['電話：03-2019-2020', '電話：[PHONE]'],
    ['Tel. (55) 2026-2027', 'Tel. [PHONE]'],
    ['Teléfono: +52 55 2026 2027', 'Teléfono: [PHONE]'],
    ['Bel 020-2026 2027', 'Bel [PHONE]'],
    // Not plausible ranges (end not after start, or too wide): never masked.
    ['2026-25 2027-2028', '[PHONE]'],
    ['2026-2026 2026-2026', '[PHONE]'],
    ['2026-2099 2099-2100', '[PHONE]'],
    // A run that continues into further digits is left to the phone pattern
    // (the conservative residual: a glued-on number is still redacted).
    ['2026-2027 2027-2028 30 EC', '[PHONE] EC'],
    // A real phone next to a range sequence is still redacted.
    [
      'collegejaar 2026-2027 2027-2028, bel 020-1234567',
      'collegejaar 2026-2027 2027-2028, bel [PHONE]',
    ],
    ['curso 2026-2027 / Tel. (55) 1234-5678', 'curso 2026-2027 / Tel. [PHONE]'],
    ['2026年度 電話 03-1234-5678', '2026年度 電話 [PHONE]'],
  ];

  for (const [input, expected] of STILL_REDACTED) {
    it(`redacts ${JSON.stringify(input)}`, () => {
      expect(redactPhones(input)).toBe(expected);
      expect(redactContactData(input)).toBe(expected);
    });
  }

  it('maskAcademicYearRanges is length-preserving and masks only plausible isolated runs', () => {
    const text = 'jaar 2026-2027 2027-2028; tel 03-2019-2020';
    const masked = maskAcademicYearRanges(text);
    expect(masked.length).toBe(text.length);
    expect(masked).toBe('jaar ###################; tel 03-2019-2020');
  });
});

describe('redactPhones: separator-less numbers (WW E-XFX, P1-1)', () => {
  // A bare run of digits was never matched before: each of these was stored readable.
  const POSITIVE: readonly (readonly [string, string])[] = [
    // NL: mobile, landline, international without separators.
    ['Bel 0612345678 voor info', 'Bel [PHONE] voor info'],
    ['Tel: 0201234567', 'Tel: [PHONE]'],
    ['WhatsApp +31612345678', 'WhatsApp [PHONE]'],
    // JP: Tokyo landline, mobile, toll-free, full-width digits.
    ['電話 0312345678', '電話 [PHONE]'],
    ['携帯 09012345678 まで', '携帯 [PHONE] まで'],
    ['フリーダイヤル 0120123456', 'フリーダイヤル [PHONE]'],
    ['電話 ０３１２３４５６７８（平日）', '電話 [PHONE]（平日）'],
    // MX: ten-digit national numbers, no trunk prefix.
    ['Llama al 8112345678', 'Llama al [PHONE]'],
    ['WhatsApp 5512345678.', 'WhatsApp [PHONE].'],
    // DE: a nine-digit Berlin number with the trunk prefix, an eleven-digit mobile.
    ['Telefon 030123456', 'Telefon [PHONE]'],
    ['Handy 01701234567', 'Handy [PHONE]'],
    // a URL path carrying a number (wa.me/<number>) loses the number
    ['wa.me/31612345678', 'wa.me/[PHONE]'],
  ];

  for (const [input, expected] of POSITIVE) {
    it(`redacts ${JSON.stringify(input)}`, () => {
      expect(redactPhones(input)).toBe(expected);
      expect(redactContactData(input)).toBe(expected);
    });
  }

  // Years, dates, page/room numbers, postcodes and academic-year ranges survive.
  const NEGATIVE: readonly string[] = [
    'Welcome Week 2026, 31 August 2026',
    'Aanmelden voor 20261026',
    'Datum: 2026-10-26, 26-10-2026, 26.10.2026',
    'Collegejaar 2026-2027 2027-2028',
    'Zie pagina 12345 en kamer 1.23',
    'Postbus 1234, 1012 AB Amsterdam; CP 64000 Monterrey; 〒530-0001',
    '123456789 is not a trunk-prefixed number',
    'KvK 12345678',
    'ISBN978123456789X',
    'versie v1.0612345678',
  ];

  for (const input of NEGATIVE) {
    it(`keeps ${JSON.stringify(input)}`, () => {
      expect(redactContactData(input)).toBe(input);
    });
  }

  it('the separator-less alternative changes no earlier match', () => {
    expect(redactPhones('Bel 020 123 4567 of 0612345678')).toBe('Bel [PHONE] of [PHONE]');
    expect(redactPhones('+33 1 23 45 67 89')).toBe('[PHONE]');
  });
});
