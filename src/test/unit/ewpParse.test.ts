/**
 * EWP catalogue parser.
 *
 * Everything here runs against the committed fixture or against inline XML.
 * CI never fetches the live registry.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEwpCatalogue } from '../../ingest/ewp/parse.js';
import { EwpMalformedEntryError, EwpSchemaDriftError } from '../../ingest/ewp/schema.js';

const FIXTURE_PATH = resolve(process.cwd(), 'src/test/fixtures/ewp-catalogue-sample.xml');
const FIXTURE = readFileSync(FIXTURE_PATH);

const NS = {
  registry: 'https://github.com/erasmus-without-paper/ewp-specs-api-registry/tree/stable-v1',
  ewp: 'https://github.com/erasmus-without-paper/ewp-specs-architecture/blob/stable-v1/common-types.xsd',
};

function xml(body: string, rootNs = NS.registry): Buffer {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<catalogue xmlns="${rootNs}" xmlns:ewp="${NS.ewp}">${body}</catalogue>`,
    'utf8',
  );
}

/** A minimal well-formed catalogue with one institution. */
function withInstitutions(institutions: string): Buffer {
  return xml(`<institutions>${institutions}</institutions>`);
}

describe('parseEwpCatalogue: the committed fixture', () => {
  const parsed = parseEwpCatalogue(FIXTURE);

  it('reads every host and every institution', () => {
    expect(parsed.hosts).toHaveLength(5);
    expect(parsed.heis).toHaveLength(18);
  });

  it('preserves the SCHAC id exactly as published, including its case', () => {
    const ids = parsed.heis.map((hei) => hei.heiId);
    expect(ids).toContain('upper.Example.ORG');
    expect(ids).toContain('0123456A.registry.example.gouv.fr');
  });

  it('keeps hei entries in document order', () => {
    parsed.heis.forEach((hei, index) => expect(hei.documentIndex).toBe(index));
  });

  it('preserves multiple names with and without xml:lang', () => {
    const rma = parsed.heis.find((hei) => hei.heiId === 'rma.ac.be');
    expect(rma?.names).toEqual([
      { lang: null, value: 'PATRIMOINE DE L&#39;ECOLE ROYALE MILITAIRE' },
      { lang: 'en', value: 'Royal Military Academy' },
    ]);
  });

  it('does NOT double-decode an entity the source already escaped twice', () => {
    // The live catalogue publishes "&amp;#39;", which decodes to the literal
    // text "&#39;". Decoding again would silently rewrite the published name.
    const rma = parsed.heis.find((hei) => hei.heiId === 'rma.ac.be');
    expect(rma?.names[0]?.value).toContain('&#39;');
    expect(rma?.names[0]?.value).not.toContain("'");
  });

  it('preserves every identifier a hei publishes, including repeats of one type', () => {
    const multi = parsed.heis.find((hei) => hei.heiId === 'multi-code.example');
    expect(multi?.otherIds.filter((other) => other.type === 'erasmus')).toHaveLength(3);
  });

  it('preserves an identifier type this repository has never seen', () => {
    const variant = parsed.heis.find((hei) => hei.heiId === 'case-variant-type.example');
    const types = variant?.otherIds.map((other) => other.type) ?? [];
    expect(types).toContain('brand-new-type-not-seen-before');
  });

  it('preserves both "oid" and "OID" without folding them together', () => {
    const variant = parsed.heis.find((hei) => hei.heiId === 'case-variant-type.example');
    const types = variant?.otherIds.map((other) => other.type) ?? [];
    expect(types).toContain('oid');
    expect(types).toContain('OID');
  });

  it('preserves an identifier value with surrounding whitespace verbatim', () => {
    const padded = parsed.heis.find((hei) => hei.heiId === 'padded-pic.example');
    const pic = padded?.otherIds.find((other) => other.type === 'pic');
    expect(pic?.value).toBe(' 888888888 ');
  });

  it('reports an empty identifier as an anomaly instead of storing or raising', () => {
    expect(parsed.anomalies).toEqual([
      {
        kind: 'empty_other_id_value',
        heiId: 'empty-id.example',
        detail: '<other-id type="euc"> published with no value',
      },
    ]);
    const empty = parsed.heis.find((hei) => hei.heiId === 'empty-id.example');
    expect(empty?.otherIds.map((other) => other.type)).not.toContain('euc');
  });

  it('reads a host that covers no institutions and declares no APIs', () => {
    const bare = parsed.hosts[2];
    expect(bare?.coveredHeiIds).toEqual([]);
    expect(bare?.apis).toEqual([]);
    expect(bare?.adminProvider).toBeNull();
  });

  it('reads a host that covers more than one institution', () => {
    expect(parsed.hosts[1]?.coveredHeiIds).toEqual(['fu-berlin.de', 'tul.edu']);
  });

  it('keeps a covered hei-id that has no matching <hei> entry', () => {
    const dangling = parsed.hosts[3]?.coveredHeiIds ?? [];
    expect(dangling).toEqual(['not-in-institutions.example']);
    expect(parsed.heis.map((hei) => hei.heiId)).not.toContain('not-in-institutions.example');
  });

  it('distinguishes the same API local name under different namespaces', () => {
    const apis = parsed.hosts[4]?.apis ?? [];
    expect(apis.map((api) => api.localName)).toEqual(['imobilities', 'imobilities']);
    expect(apis[0]?.namespaceUri).not.toBe(apis[1]?.namespaceUri);
    expect(apis[0]?.version).toBe('1.0.0');
    expect(apis[1]?.version).toBe('2.0.0');
  });

  it('captures every endpoint shape and nothing else', () => {
    const iias = parsed.hosts[1]?.apis[0];
    expect(iias?.localName).toBe('iias');
    expect(iias?.endpoints).toEqual({
      'get-url': 'https://ewp.b.example/iia/get',
      'index-url': 'https://ewp.b.example/iia/index',
      'stats-url': 'https://ewp.b.example/iia/stats',
    });
    // max-iia-ids is a limit, not an endpoint.
    expect(Object.keys(iias?.endpoints ?? {})).not.toContain('max-iia-ids');
  });

  it('records the OUnits API as declared without recording any call to it', () => {
    const ounits = parsed.hosts[0]?.apis.find((api) => api.localName === 'organizational-units');
    expect(ounits?.endpoints['url']).toBe('https://ewp.rma.example/ounits');
  });

  it('reads the host admin provider', () => {
    expect(parsed.hosts[0]?.adminProvider).toBe('Test Provider A');
  });
});

describe('parseEwpCatalogue: contact data is never extracted', () => {
  it('exposes no admin email anywhere in the parse result', () => {
    const parsed = parseEwpCatalogue(FIXTURE);
    // The fixture contains <ewp:admin-email>never-store-me@example.invalid</...>.
    // Phase 1B has no contact capability, so the parser must not surface it.
    expect(JSON.stringify(parsed)).not.toContain('never-store-me');
    expect(JSON.stringify(parsed)).not.toContain('admin-email');
  });
});

describe('parseEwpCatalogue: chunk boundaries', () => {
  it('produces an identical result whatever the chunk size', () => {
    const whole = parseEwpCatalogue(FIXTURE);
    for (const chunkSize of [1, 7, 64, 997, 1 << 20]) {
      expect(parseEwpCatalogue(FIXTURE, chunkSize)).toEqual(whole);
    }
  });

  it('does not split a multi-byte character across chunks', () => {
    const accented = withInstitutions(
      '<hei id="a.example"><other-id type="erasmus">X  A01</other-id>' +
        '<name>Université de Genève — École</name></hei>',
    );
    // Chunk size 1 forces every multi-byte sequence to straddle a boundary.
    expect(parseEwpCatalogue(accented, 1).heis[0]?.names[0]?.value).toBe(
      'Université de Genève — École',
    );
  });
});

describe('parseEwpCatalogue: fails closed on ambiguity', () => {
  it('rejects a document whose root is not a registry catalogue', () => {
    const wrongRoot = Buffer.from('<?xml version="1.0"?><notacatalogue/>', 'utf8');
    expect(() => parseEwpCatalogue(wrongRoot)).toThrow(EwpSchemaDriftError);
  });

  it('rejects a <catalogue> root in the wrong namespace', () => {
    expect(() =>
      parseEwpCatalogue(xml('<institutions/>', 'https://example.invalid/other')),
    ).toThrow(EwpSchemaDriftError);
  });

  it('rejects XML that is not well-formed', () => {
    const broken = Buffer.from(`<catalogue xmlns="${NS.registry}"><institutions>`, 'utf8');
    expect(() => parseEwpCatalogue(broken)).toThrow(EwpSchemaDriftError);
  });

  it('rejects a catalogue with no <institutions> block at all', () => {
    expect(() => parseEwpCatalogue(xml('<host/>'))).toThrow(/no <institutions> block/);
  });

  it('rejects an empty <institutions> block rather than reporting zero HEIs', () => {
    // Silently succeeding with zero institutions would look like a good ingest.
    expect(() => parseEwpCatalogue(withInstitutions(''))).toThrow(/no <hei> entries/);
  });

  it('rejects more than one <institutions> block instead of choosing one', () => {
    const twice = xml(
      '<institutions><hei id="a.example"><name>A</name></hei></institutions>' +
        '<institutions><hei id="b.example"><name>B</name></hei></institutions>',
    );
    expect(() => parseEwpCatalogue(twice)).toThrow(/more than one <institutions>/);
  });

  it('rejects a <hei> with no id attribute', () => {
    expect(() => parseEwpCatalogue(withInstitutions('<hei><name>X</name></hei>'))).toThrow(
      EwpMalformedEntryError,
    );
  });

  it('rejects a <hei> whose id is only whitespace', () => {
    expect(() => parseEwpCatalogue(withInstitutions('<hei id="   "><name>X</name></hei>'))).toThrow(
      EwpMalformedEntryError,
    );
  });

  it('rejects an <other-id> with no type attribute', () => {
    expect(() =>
      parseEwpCatalogue(withInstitutions('<hei id="a.example"><other-id>123</other-id></hei>')),
    ).toThrow(EwpMalformedEntryError);
  });

  it('rejects an empty <hei-id> inside <institutions-covered>', () => {
    const body =
      '<host><institutions-covered><hei-id> </hei-id></institutions-covered></host>' +
      '<institutions><hei id="a.example"><name>A</name></hei></institutions>';
    expect(() => parseEwpCatalogue(xml(body))).toThrow(EwpMalformedEntryError);
  });

  it('rejects an API entry declaring the same endpoint element twice', () => {
    const body =
      '<host><apis-implemented>' +
      '<x:institutions xmlns:x="https://example.invalid/api" version="1.0.0">' +
      '<x:url>https://a.example/one</x:url><x:url>https://a.example/two</x:url>' +
      '</x:institutions>' +
      '</apis-implemented></host>' +
      '<institutions><hei id="a.example"><name>A</name></hei></institutions>';
    expect(() => parseEwpCatalogue(xml(body))).toThrow(/more than once/);
  });
});

describe('parseEwpCatalogue: tolerates what is merely incomplete', () => {
  it('accepts a hei with no identifiers at all', () => {
    const parsed = parseEwpCatalogue(withInstitutions('<hei id="a.example"><name>A</name></hei>'));
    expect(parsed.heis[0]?.otherIds).toEqual([]);
  });

  it('accepts a hei with no name', () => {
    const parsed = parseEwpCatalogue(
      withInstitutions('<hei id="a.example"><other-id type="pic">1</other-id></hei>'),
    );
    expect(parsed.heis[0]?.names).toEqual([]);
  });

  it('accepts an API entry with no version attribute', () => {
    const body =
      '<host><apis-implemented>' +
      '<x:thing xmlns:x="https://example.invalid/api"><x:url>https://a.example</x:url></x:thing>' +
      '</apis-implemented></host>' +
      '<institutions><hei id="a.example"><name>A</name></hei></institutions>';
    expect(parseEwpCatalogue(xml(body)).hosts[0]?.apis[0]?.version).toBeNull();
  });

  it('accepts an API entry with no endpoint at all', () => {
    const body =
      '<host><apis-implemented>' +
      '<x:thing xmlns:x="https://example.invalid/api" version="1.0.0"/>' +
      '</apis-implemented></host>' +
      '<institutions><hei id="a.example"><name>A</name></hei></institutions>';
    expect(parseEwpCatalogue(xml(body)).hosts[0]?.apis[0]?.endpoints).toEqual({});
  });
});
