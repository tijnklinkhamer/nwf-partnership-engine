/**
 * WW E-X FIREWALL - automatic C1 evidence extraction and the v2
 * qualification-input export stay PURE, deterministic, classifier-free,
 * contact-free, score-free and permission-free.
 *
 * Pins (working tree, by path and content - never by commit):
 *   - `src/orgunits/c1Extraction/` is exactly six files, each importing
 *     exactly what it is reviewed to; none opens a socket, a database, a
 *     file, the environment, the clock or randomness, and none reads a
 *     country, a locale or a declared page language;
 *   - neither it nor `src/orgunits/qualificationInputV2/` imports the
 *     classifier, the gateway, the orchestrator, source discovery or
 *     acquisition; the only `web/` import is the redactor, and the only
 *     other repository import (WW H-EX) is the ONE registrable-domain
 *     implementation, `website/parse.js`, for the bare-host quote check;
 *   - only the v2 export (and tests) import `c1Extraction`; the v2 loader
 *     issues no SQL of its own;
 *   - no contact-, name- or handle-shaped property is declared, and no
 *     score / rank / threshold name exists in either module;
 *   - a proposal can only be SELF_ASSERTED or THIRD_PARTY_ASSERTED (no
 *     INFERENCE path exists), quotes pass the redaction fixed point - and,
 *     since WW E-XFX, the full-sentence contact-shape guard - before they
 *     are emitted, and the v2 document grants nothing: its permissions
 *     ARE v1's PERMISSIONS (every capability NONE, contact NOT_GRANTED).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '../../orgunits/qualificationInput/contract.js';
import {
  LIMITATIONS_V2,
  QUALIFICATION_INPUT_EXPORT_CONTRACT_V2,
} from '../../orgunits/qualificationInputV2/contract.js';
import {
  REPO_ROOT,
  codeOf,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

const C1 = 'src/orgunits/c1Extraction/';
const V2 = 'src/orgunits/qualificationInputV2/';
const C1_FILES = ['dates.ts', 'extract.ts', 'lexicon.ts', 'rules.ts', 'text.ts', 'vocabulary.ts'];
const V2_FILES = ['build.ts', 'contract.ts', 'load.ts'];
const all = () => [...C1_FILES.map((f) => C1 + f), ...V2_FILES.map((f) => V2 + f)];
const code = (path: string) => codeOf(readCurrent(path));
/** Code with every string literal emptied: identifiers and property names only (rule prose is data). */
const identifiers = (path: string) =>
  code(path).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");

const IMPURE =
  /process\.|\bfetch\s*\(|from 'pg'|Date\.now|new Date\(\s*\)|Math\.random|crypto\.random|randomUUID|readFile|writeFile|node:(fs|net|tls|http|https|dns|child_process)/;

describe('WW E-X: c1Extraction is a closed, pure module', () => {
  it('is exactly six files', () => {
    expect(readdirSync(join(REPO_ROOT, C1)).sort()).toEqual(C1_FILES);
    expect(readdirSync(join(REPO_ROOT, V2)).sort()).toEqual(V2_FILES);
  });

  it('each file imports exactly what it is reviewed to', () => {
    const expected: Record<string, string[]> = {
      'dates.ts': [],
      'extract.ts': [
        'node:crypto',
        // WW H-EX (P2-6): the single tldts-backed registrable-domain helper, never a second one.
        '../../website/parse.js',
        '../web/redact.js',
        './dates.js',
        './lexicon.js',
        './rules.js',
        './text.js',
        './vocabulary.js',
      ],
      'lexicon.ts': ['./vocabulary.js'],
      'rules.ts': ['./lexicon.js', './vocabulary.js'],
      'text.ts': ['../signals/scriptAware.js', './lexicon.js'],
      'vocabulary.ts': ['zod'],
    };
    for (const [file, specs] of Object.entries(expected)) {
      expect([...new Set(specifiers(code(C1 + file)))].sort(), file).toEqual([...specs].sort());
    }
  });

  it('opens no socket, database, file, environment, clock or randomness', () => {
    for (const file of C1_FILES.map((f) => C1 + f)) {
      expect(code(file), file).not.toMatch(IMPURE);
      expect(code(file), file).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE)\b\s/);
    }
  });

  it('never reads a country, a locale or a declared page language', () => {
    for (const file of C1_FILES.map((f) => C1 + f)) {
      expect(identifiers(file), file).not.toMatch(
        /\b(country|countryCode|locale|declaredLang|declared_lang|targetLanguage)\b/,
      );
    }
  });
});

describe('WW E-X: no classifier, no network path, one importer', () => {
  it('neither module reaches the classifier, the gateway, discovery or acquisition', () => {
    for (const file of all()) {
      for (const s of specifiers(code(file))) {
        expect(s, file).not.toMatch(
          /classify|orchestrator|sourceDiscovery|acquisition|subjectRun|\/web\/(gateway|robots|pageEvidence)|node:(dns|net|tls|http|https)/,
        );
        if (/\/web\//.test(s)) expect(s, file).toBe('../web/redact.js');
      }
    }
  });

  it('only the v2 export imports c1Extraction', () => {
    const importers = productionFiles().filter(
      (f) => !f.startsWith(C1) && specifiers(code(f)).some((s) => /c1Extraction/.test(s)),
    );
    expect(importers).toEqual([`${V2}build.ts`, `${V2}contract.ts`]);
  });

  it('the v2 build is pure and the v2 loader issues no SQL of its own', () => {
    expect(code(`${V2}build.ts`)).not.toMatch(IMPURE);
    expect(code(`${V2}contract.ts`)).not.toMatch(IMPURE);
    expect(code(`${V2}build.ts`)).not.toMatch(/new Date\b/);
    const load = code(`${V2}load.ts`);
    expect([...new Set(specifiers(load))].sort()).toEqual(
      ['../qualificationInput/load.js', './build.js', './contract.js', 'pg'].sort(),
    );
    expect(load).toMatch(/^import type pg from 'pg';$/m);
    expect(load).not.toMatch(/`[^`]*\b(SELECT|INSERT|UPDATE|DELETE|BEGIN)\b/);
    expect(load).not.toMatch(/client\.query|pool\.query/);
  });
});

describe('WW E-X: no contact field, no score, no relabelled mode', () => {
  it('declares no contact-, name- or handle-shaped property', () => {
    for (const file of all()) {
      expect(identifiers(file), file).not.toMatch(
        /\b(email|mailbox|phone|telephone|contact(?!Permission)\w*|person\w*|displayName|legalName|nameText|handle|username|profileUrl)\s*[:?]/i,
      );
      expect(code(file), file).not.toMatch(/mailto|name_text/);
    }
  });

  it('names no score, rank or threshold', () => {
    for (const file of all()) {
      expect(identifiers(file), file).not.toMatch(
        /\b(score|scores|scored|scoring|rank|ranks|ranked|ranking|threshold|thresholds)\b|[a-z](Score|Rank|Threshold)|\b(score|rank|threshold)[A-Z_]/i,
      );
    }
  });

  it('a proposal is SELF_ASSERTED or THIRD_PARTY_ASSERTED only - no INFERENCE path exists', () => {
    for (const file of all()) {
      expect(code(file), file).not.toMatch(
        /\b(INFERENCE|ATTESTED_OBSERVATION|PARTNER_CONFIRMED)\b/,
      );
      expect(code(file), file).not.toMatch(/HUMAN_RESEARCHER'|'CLASSIFIER'|'LANGUAGE_MODEL'/);
    }
    expect(code(`${V2}contract.ts`)).toMatch(
      /readonly assertionMode: 'SELF_ASSERTED' \| 'THIRD_PARTY_ASSERTED';/,
    );
    // Every claim the extraction adds is the Engine's own observation.
    const build = code(`${V2}build.ts`);
    expect(build.match(/producedBy: '(\w+)'/g)).toEqual(["producedBy: 'NWF_SYSTEM'"]);
    expect(build.match(/mode: '(\w+)'/g)).toEqual(["mode: 'OBSERVED'"]);
  });

  it('quotes must be a redaction fixed point, free of placeholders, before they are emitted', () => {
    const extract = code(`${C1}extract.ts`);
    expect(extract).toMatch(/const REDACTION_TOKEN = \/\\\[\(EMAIL\|PHONE\)\\\]\/;/);
    expect(extract).toMatch(/const RESERVED_MARKER = \/\(cand\|chn\|opp\):\/i;/);
    // WW E-XFX (P1-1, P2-9): the guard is STRENGTHENED, never relaxed. It reads the FULL
    // sentence before the quote cap, and still requires the redaction fixed point and no
    // placeholder - plus no handle, URL, telephone shape, eight-digit run, obfuscated
    // address or contact cue - and social-account quotes are withheld by default.
    expect(extract).toMatch(/const \{ quote, truncated, full \} = quoteOf\(/);
    // WW H-EX (P2-6): the guard takes whether the proposal is ABOUT a social account, so a
    // released (inert SHAPE_CHECKED) account proposal may name its own platform - nothing else.
    expect(extract).toMatch(/const shaped = isContactShapedQuote\(full, socialSubject\);/);
    expect(extract).toMatch(/if \(social \|\| shaped \|\| RESERVED_MARKER\.test\(full\)\) \{/);
    const guard =
      /export function isContactShapedQuote\(\s*full: string,\s*platformIsSubject = false,?\s*\): boolean \{[\s\S]*?\n\}/.exec(
        extract,
      )?.[0];
    expect(guard).toBeDefined();
    for (const check of [
      'redactContactData(full) !== full ||',
      'REDACTION_TOKEN.test(folded) ||',
      'HANDLE_SHAPE.test(folded) ||',
      'URL_SHAPE.test(folded) ||',
      'TELEPHONE_SHAPE.test(folded) ||',
      'DIGIT_RUN.test(folded) ||',
      'OBFUSCATED_ADDRESS.test(folded) ||',
      // WW H-EX (P2-6): strengthened, never relaxed.
      'SEPARATED_DIGITS.test(folded) ||',
      'OBFUSCATED_ADDRESS_V3.test(folded) ||',
      'SERVICE_NUMBER.test(folded) ||',
      'EXTENSION.test(folded) ||',
      'BARE_HANDLE.test(folded) ||',
      'namesBareHost(folded) ||',
      '(!platformIsSubject && matchesIn(unit, PLATFORM_NAMES).length > 0) ||',
      'matchesIn(unit, ROLE_CUES).length > 0 ||',
      'matchesIn(unit, CONTACT_CUES).length > 0',
    ]) {
      expect(guard, check).toContain(check);
    }
    // TELEPHONE_SHAPE is acquisition/canonical.ts's pattern, restated byte for byte.
    const canonical = code('src/orgunits/acquisition/canonical.ts');
    const shapeOf = (text: string) => /const TELEPHONE_SHAPE = (\/.+\/);/.exec(text)?.[1];
    expect(shapeOf(extract)).toBeDefined();
    expect(shapeOf(extract)).toBe(shapeOf(canonical));
    expect(extract).toMatch(/options\.socialAccountQuotes !== 'SHAPE_CHECKED'/);
  });
});

describe('WW E-X: the v2 export grants nothing', () => {
  it('its permissions ARE the v1 literal refusals', () => {
    expect(code(`${V2}build.ts`)).toMatch(/^\s+permissions: PERMISSIONS,$/m);
    expect(PERMISSIONS.contactPermission).toBe('NOT_GRANTED');
    expect(
      Object.entries(PERMISSIONS)
        .filter(([k]) => k !== 'contactPermission')
        .every(([, v]) => v === 'NONE'),
    ).toBe(true);
  });

  it('names its contract and states its page-text limit truthfully', () => {
    expect(QUALIFICATION_INPUT_EXPORT_CONTRACT_V2).toBe('nwf-pe.qualification-input-export.v2');
    expect(LIMITATIONS_V2.pageText).toBe(
      'NO_PAGE_TEXT_IS_EXPORTED_EXCEPT_ONE_SHORT_REDACTED_QUOTE_PER_PROPOSAL',
    );
    expect(LIMITATIONS_V2.piiFields).toBe('NONE_BY_CONSTRUCTION');
  });
});
