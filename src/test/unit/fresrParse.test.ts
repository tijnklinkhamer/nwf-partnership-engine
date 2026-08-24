/**
 * Parsing the French Ministry register export, against the committed
 * hand-written fixture.
 *
 * The fixture is hand-written rather than sliced from the live artifact, and
 * it reproduces the register's real quirks on purpose: a record with no PIC, a
 * record publishing TWO ";"-separated PIC values, a record publishing several
 * ";"-separated UAI codes, a record with no website, a broken scheme, and a
 * value that is an email address rather than a site.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fresrPic, parseFresrExport } from '../../ingest/fresr/parse.js';
import { FresrSchemaDriftError } from '../../ingest/fresr/schema.js';

const FIXTURE = resolve(process.cwd(), 'src/test/fixtures/fresr-sample.json');
const bytes = readFileSync(FIXTURE);

describe('fresr parse: the fixture', () => {
  it('parses every record', () => {
    const parsed = parseFresrExport(bytes);
    expect(parsed.records).toHaveLength(12);
  });

  it('counts usable and unusable PIC values separately', () => {
    const parsed = parseFresrExport(bytes);
    // 12 records: one publishes no PIC, one publishes two ";"-separated PICs.
    expect(parsed.recordsWithPic).toBe(10);
    expect(parsed.recordsWithNonComparablePic).toBe(1);
  });

  it('counts records publishing several UAI codes in one field', () => {
    expect(parseFresrExport(bytes).recordsWithMultipleUai).toBe(1);
  });

  it('counts records publishing a website value at all', () => {
    expect(parseFresrExport(bytes).recordsWithUrlValue).toBe(11);
  });
});

describe('fresr parse: PIC handling never repairs a value', () => {
  it('trims surrounding whitespace', () => {
    expect(fresrPic({ etablissement_id_paysage: 'X', identifiant_pic: '  999831575  ' })).toBe(
      '999831575',
    );
  });

  it('refuses to split two PIC values published in one field', () => {
    // The record publishes ONE website and TWO identifiers, and nothing in the
    // source says which identifier that website belongs to. Splitting would be
    // a guess, so the record joins nothing.
    expect(
      fresrPic({ etablissement_id_paysage: 'X', identifiant_pic: '900456724;999489941' }),
    ).toBeNull();
  });

  it.each(['9.9958762E8', 'E10158141', '99 963 0009', ''])(
    'gives no comparison value for the non-digit PIC %s',
    (value) => {
      expect(fresrPic({ etablissement_id_paysage: 'X', identifiant_pic: value })).toBeNull();
    },
  );

  it('treats an absent PIC as absent, not as an error', () => {
    expect(fresrPic({ etablissement_id_paysage: 'X', identifiant_pic: null })).toBeNull();
  });
});

describe('fresr parse: the narrow schema is a capability boundary', () => {
  it('REFUSES a record carrying a contact field', () => {
    // The single most important test in this file. The full dataset publishes
    // a telephone number and could gain other contact columns upstream. If one
    // ever arrives, the run must STOP rather than quietly ignore it: silently
    // ignoring extra keys is how a repository ends up holding data it has no
    // approved capability for.
    const withContact = Buffer.from(
      JSON.stringify([
        {
          etablissement_id_paysage: 'AAA01',
          uo_lib: 'Test',
          uai: '0000000A',
          identifiant_pic: '999859123',
          url: 'https://www.test-example.fr/',
          numero_telephone_uai: '0000000000',
        },
      ]),
    );
    expect(() => parseFresrExport(withContact)).toThrow(FresrSchemaDriftError);
  });

  it('refuses ANY unexpected field, contact-related or not', () => {
    const withExtra = Buffer.from(
      JSON.stringify([{ etablissement_id_paysage: 'AAA01', compte_twitter: '@x' }]),
    );
    expect(() => parseFresrExport(withExtra)).toThrow(FresrSchemaDriftError);
  });

  it('refuses a record with no stable identifier', () => {
    const noId = Buffer.from(JSON.stringify([{ etablissement_id_paysage: '', url: null }]));
    expect(() => parseFresrExport(noId)).toThrow(FresrSchemaDriftError);
  });

  it('refuses a document that is not an array of records', () => {
    expect(() => parseFresrExport(Buffer.from('{"records":[]}'))).toThrow(FresrSchemaDriftError);
  });

  it('refuses bytes that are not JSON at all', () => {
    expect(() => parseFresrExport(Buffer.from('<html>error</html>'))).toThrow(/not valid JSON/);
  });

  it('accepts a record whose optional fields are omitted entirely', () => {
    // Omitting a key and publishing null are the same fact: nothing published.
    const parsed = parseFresrExport(
      Buffer.from(JSON.stringify([{ etablissement_id_paysage: 'AAA01' }])),
    );
    expect(parsed.records).toHaveLength(1);
    expect(parsed.recordsWithPic).toBe(0);
  });
});
