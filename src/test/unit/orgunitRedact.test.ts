/**
 * PII redaction: conservative enough that ordinary institutional text -
 * years, page numbers, short reference codes - survives untouched, while
 * every contact-shaped value in the test matrix is destroyed.
 */
import { describe, expect, it } from 'vitest';
import {
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
