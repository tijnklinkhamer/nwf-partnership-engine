/**
 * REL Q1 - the source-stated country-of-operation writer, offline: the
 * request shape is refused before any connection, and the CLI refuses a
 * missing source, a website claim, an inferred basis and every option it does
 * not name - without opening a pool.
 */
import { describe, expect, it } from 'vitest';

import {
  JURISDICTION_CLAIMS_OPTIONS,
  runJurisdictionClaimsCli,
} from '../../cli/commands/jurisdictionClaims.js';
import {
  JURISDICTION_WRITER_ACTOR_KEY,
  JurisdictionWriterRefusal,
  RECORDED_CLAIM_KIND,
  checkCountryOfOperationRequest,
  type CountryOfOperationRequest,
} from '../../orgunits/jurisdictionClaimWriter/record.js';

const SUBJECT = '66666666-0000-4000-8000-c10000000001';
const PAGE = '66666666-0000-4000-8000-c10000000002';

const request = (over: Partial<CountryOfOperationRequest> = {}): CountryOfOperationRequest => ({
  subjectId: SUBJECT,
  statedCountry: 'JP',
  source: { sourceType: 'PAGE_EVIDENCE', pageEvidenceId: PAGE },
  claimBasis: 'SOURCE_STATED',
  ...over,
});

const codeOf = (fn: () => void): string | null => {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof JurisdictionWriterRefusal ? error.code : 'OTHER';
  }
};

describe('REL Q1: the request shape', () => {
  it('records one kind, under the bound CLI path key', () => {
    expect(RECORDED_CLAIM_KIND).toBe('COUNTRY_OF_OPERATION');
    expect(JURISDICTION_WRITER_ACTOR_KEY).toBe('discovery-subjects-cli');
    expect(codeOf(() => checkCountryOfOperationRequest(request()))).toBeNull();
  });

  it('refuses an inferred basis, a website claim and malformed ids or instants', () => {
    expect(codeOf(() => checkCountryOfOperationRequest(request({ claimBasis: 'INFERRED' })))).toBe(
      'BASIS_NOT_SOURCE_STATED',
    );
    expect(
      codeOf(() =>
        checkCountryOfOperationRequest(
          request({ source: { sourceType: 'WEBSITE_CLAIM', websiteClaimId: PAGE } }),
        ),
      ),
    ).toBe('SOURCE_STATES_NO_COUNTRY');
    expect(codeOf(() => checkCountryOfOperationRequest(request({ subjectId: 'S1' })))).toBe(
      'INPUT_INVALID',
    );
    for (const source of [
      { sourceType: 'PAGE_EVIDENCE', pageEvidenceId: PAGE.toUpperCase() },
      {
        sourceType: 'PUBLIC_URL',
        url: 'https://x.example/',
        versionRef: 'abc',
        observedAt: '2026-10-26T09:00:00Z',
      },
      {
        sourceType: 'PUBLIC_URL',
        url: 'https://x.example/',
        versionRef: null,
        observedAt: '2026-10-26 09:00',
      },
      {
        sourceType: 'PUBLIC_URL',
        url: 'https://x.example/',
        versionRef: null,
        observedAt: '2026-10-26T09:00:00+02:00',
      },
    ] as const) {
      expect(codeOf(() => checkCountryOfOperationRequest(request({ source })))).toBe(
        'INPUT_INVALID',
      );
    }
  });
});

describe('REL Q1: the CLI, before any connection', () => {
  async function run(argv: readonly string[]) {
    let out = '';
    let err = '';
    const fail = () => {
      throw new Error('no pool may be opened for a refused request');
    };
    const exit = await runJurisdictionClaimsCli(argv, {
      readonlyPool: fail,
      writerPool: fail,
      out: (t) => void (out += t),
      err: (t) => void (err += t),
    });
    return { exit, out, err };
  }
  const base = ['record', '--subject-id', SUBJECT, '--country-of-operation', 'JP'];

  it('names no actor, credential, domain, name, language, Erasmus or bulk option', () => {
    expect(Object.keys(JURISDICTION_CLAIMS_OPTIONS).sort()).toEqual(
      [
        'basis',
        'country-of-operation',
        'execute',
        'json',
        'observed-at',
        'source-page-evidence-id',
        'source-url',
        'source-version',
        'source-website-claim-id',
        'subject-id',
      ].sort(),
    );
  });

  it('refuses a missing source, a website claim, an inferred basis and an unknown option', async () => {
    const cases: [readonly string[], string][] = [
      [[...base, '--basis', 'SOURCE_STATED'], 'INPUT_INVALID'],
      [
        [...base, '--basis', 'SOURCE_STATED', '--source-website-claim-id', PAGE],
        'SOURCE_STATES_NO_COUNTRY',
      ],
      [
        [...base, '--basis', 'INFERRED', '--source-page-evidence-id', PAGE],
        'BASIS_NOT_SOURCE_STATED',
      ],
      [
        [...base, '--basis', 'SOURCE_STATED', '--source-page-evidence-id', PAGE, '--all'],
        'INPUT_INVALID',
      ],
      [
        [
          ...base,
          '--basis',
          'SOURCE_STATED',
          '--source-page-evidence-id',
          PAGE,
          '--source-url',
          'https://x.example/',
        ],
        'INPUT_INVALID',
      ],
      [
        [...base, '--basis', 'SOURCE_STATED', '--source-url', 'https://x.example/'],
        'INPUT_INVALID',
      ],
    ];
    for (const [argv, code] of cases) {
      const r = await run([...argv, '--json']);
      expect(r.exit, argv.join(' ')).toBe(1);
      expect((JSON.parse(r.out) as { code: string }).code, argv.join(' ')).toBe(code);
    }
  });

  it('prints its usage for help and an unknown subcommand', async () => {
    expect((await run(['--help'])).exit).toBe(0);
    expect((await run(['write'])).exit).toBe(1);
  });
});
