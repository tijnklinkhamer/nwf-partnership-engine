/**
 * REL HARVEST H2 FIREWALL - the subject classifier handoff is ASSEMBLY ONLY:
 * read-only, keyed by subject identity, and structurally unable to reach the
 * classifier's call, prompt, provider or persistence path.
 *
 * Ported from the duplicate relf1 line (`ba922e7`, REL-F1-R2 Wave 2 item c,
 * and its `relF1SubjectClassifierHandoff` firewall), every assertion kept,
 * plus this lineage's own boundaries: the change set over
 * H2_BASE_COMMIT..H2_TERMINAL_COMMIT, no classify/ file edited, and REL L2's
 * `sourceDiscovery` <-> `classify` separation extended to this module in both
 * directions - `sourceDiscovery` still cannot reach `classify`, not even
 * through the handoff.
 */
import { describe, expect, it } from 'vitest';

import {
  codeOf,
  phaseRange,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

/** The H1 commit: this slice's parent. */
const H2_BASE_COMMIT = 'b3e8f4212c9f8d819b5e786d69fb4aac2cdd2fb1';

/** Pinned by the REL harvest pin commit to this slice's own commit (closed range). */
const H2_TERMINAL_COMMIT: string | null = '198fca6558b85c002a28d3485054369a7a2932b3';

const MODULE_DIR = 'src/orgunits/subjectClassifierHandoff/';
const MODULE = `${MODULE_DIR}assemble.ts`;
const NS_SOURCE_DISCOVERY = 'src/orgunits/sourceDiscovery/';
/** WW E-SD: the one sourceDiscovery file that may reach classify/ (its eight auth modules only). */
const SOURCE_DISCOVERY_AUTH_SITE = 'src/orgunits/sourceDiscovery/agentQuery.ts';

const AUTHORISED_CHANGESET = [
  `A\t${MODULE}`,
  'A\tsrc/test/firewall/relHarvestH2SubjectClassifierHandoff.firewall.test.ts',
  'A\tsrc/test/integration/relHarvestSubjectClassifierHandoff.test.ts',
].sort();

const h2 = phaseRange(H2_BASE_COMMIT, H2_TERMINAL_COMMIT);

const importsOf = (source: string) =>
  [...new Set([...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!))].sort();

const reaches = (code: string, segment: string): boolean =>
  specifiers(code).some((s) => new RegExp(`(^|/)${segment}(/|$)`).test(s)) ||
  new RegExp(`orgunits/${segment}`).test(code);

describe.skipIf(!h2.available)('REL harvest H2: the change set over its own range', () => {
  it('is exactly the named files: one module and its tests, no existing file edited', () => {
    expect(h2.changeset()).toEqual(AUTHORISED_CHANGESET);
  });
});

describe('REL harvest H2: subject classifier handoff assembly', () => {
  it('is exactly one module', () => {
    expect(productionFiles().filter((f) => f.startsWith(MODULE_DIR))).toEqual([MODULE]);
  });

  it('imports only the classifier PURE helpers, the extraction bounds and node:crypto', () => {
    expect(importsOf(readCurrent(MODULE))).toEqual([
      '../classify/canonical.js',
      '../classify/constants.js',
      '../classify/dedupe.js',
      '../classify/loaders.js',
      '../classify/runStatus.js',
      '../classify/types.js',
      '../web/extract.js',
      'node:crypto',
      'pg',
    ]);
    // Never the call path: no provider, prompt, orchestrator, persistence, schema or SDK.
    expect(specifiers(codeOf(readCurrent(MODULE))).join('\n')).not.toMatch(
      /classify\/(provider|prompt|orchestrate|persist|outputSchema|validate|assemble|operator)|claude-agent-sdk|@anthropic-ai/,
    );
    expect(readCurrent(MODULE)).toMatch(
      /import type \{ ClassifierDocument, ClassifierSignal \} from '\.\.\/classify\/types\.js';/,
    );
  });

  it('issues SELECTs only, and names no ECHE key, organisation or country', () => {
    const code = codeOf(readCurrent(MODULE));
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|GRANT)\b/);
    // Identifiers and SQL only: the blocker names below are single-quoted labels.
    const unquoted = code.replace(/'[^'\n]*'/g, "''");
    expect(unquoted).not.toMatch(/eche_?row_?key|echeRowKey|organisation_?id|organisationId/i);
    expect(unquoted).not.toMatch(/countryCode|country_code/);
    expect(code).not.toMatch(
      /process\.env|\bfetch\s*\(|node:(net|tls|http|https|dns|fs|child_process)/,
    );
  });

  it('declares the call path BLOCKED, naming each frozen artefact it would change', () => {
    const code = codeOf(readCurrent(MODULE));
    expect(code).toContain("SUBJECT_CLASSIFIER_CALL_STATUS = 'BLOCKED_PENDING_OWNER_AMENDMENT'");
    for (const blocker of [
      'CLASSIFY_TYPES_BATCH_CONTEXT_REQUIRES_ECHE_ROW_KEY_AND_COUNTRY_AND_CLAIM_OR_PROMOTION_ROOT',
      'CLASSIFY_PROMPT_V7_2_DESCRIBES_BATCH_CONTEXT_AS_ECHE_ROW_KEY_AND_ECHE_COUNTRY',
      'MIGRATION_0009_CLASSIFIER_CALLS_ECHE_ROW_KEY_NOT_NULL_AND_ROOT_KEY_CLAIM_OR_PROMOTION_ONLY',
      'CLASSIFY_LOADERS_ROOT_KIND_AND_ORGANISATION_BINDING_REFUSE_SUBJECT_ROOTS',
      'ADR_0025_D8_CLASSIFIER_CANNOT_TAKE_SUBJECT_EVIDENCE',
    ]) {
      expect(code).toContain(`'${blocker}'`);
    }
  });

  it('nothing in production reaches it - not the classifier, the CLI, the orchestrator or any other module', () => {
    const importers = productionFiles()
      .filter((f) => !f.startsWith(MODULE_DIR))
      .filter((f) => readCurrent(f).includes('subjectClassifierHandoff'));
    // R3P3-A (exact-path widening, ADR 0031, OWNER decision 2026-10-29): the
    // OWNER amendment this module waits for. The handoff itself is unchanged
    // and still cannot call anything; the subject-rooted classify command
    // assembles through it (as the research role) and `subjectClassify/run.ts`
    // runs the calls over its batches under migration 0030. Nothing else -
    // not classify/, the orchestrator or sourceDiscovery - reaches it.
    const R3P3A_IMPORTERS = [
      'src/cli/commands/subjectClassify.ts',
      'src/orgunits/subjectClassify/run.ts',
    ];
    expect(importers).toEqual(R3P3A_IMPORTERS);
    for (const file of R3P3A_IMPORTERS) {
      expect(
        specifiers(codeOf(readCurrent(file))).filter((s) => s.includes('subjectClassifierHandoff')),
        file,
      ).toEqual([
        file.startsWith('src/cli/')
          ? '../../orgunits/subjectClassifierHandoff/assemble.js'
          : '../subjectClassifierHandoff/assemble.js',
      ]);
    }
  });

  it('the classifier prompt still describes an ECHE-keyed context (the blocker is real)', () => {
    expect(readCurrent('src/orgunits/classify/prompt.ts')).toContain('ECHE row key');
    expect(readCurrent('src/orgunits/classify/types.ts')).toMatch(/readonly echeRowKey: string;/);
  });
});

describe('REL harvest H2: the L2 sourceDiscovery <-> classify separation holds through the handoff', () => {
  it('the detector fires (mutation oracle)', () => {
    expect(
      reaches(
        "import { a } from '../subjectClassifierHandoff/assemble.js';",
        'subjectClassifierHandoff',
      ),
    ).toBe(true);
    expect(reaches("const m = await import('../sourceDiscovery/run.js');", 'sourceDiscovery')).toBe(
      true,
    );
    expect(
      reaches("import { a } from './subjectClassifierHandoffish.js';", 'subjectClassifierHandoff'),
    ).toBe(false);
  });

  it('the handoff reaches no sourceDiscovery, subject-run, orchestrator or gateway module', () => {
    const code = codeOf(readCurrent(MODULE));
    for (const segment of ['sourceDiscovery', 'subjectRun', 'orchestrator', 'subjectAdmission']) {
      expect(reaches(code, segment), segment).toBe(false);
    }
    expect(specifiers(code).filter((s) => s.startsWith('../web/'))).toEqual(['../web/extract.js']);
  });

  it('no sourceDiscovery file reaches the handoff (and so cannot reach classify through it)', () => {
    const ns = productionFiles().filter((f) => f.startsWith(NS_SOURCE_DISCOVERY));
    expect(ns.length).toBeGreaterThan(10);
    for (const file of ns) {
      const code = codeOf(readCurrent(file));
      expect(reaches(code, 'subjectClassifierHandoff'), file).toBe(false);
      // WW E-SD (ADR 0027 D3 / ADR 0028) widened this by ONE exact path:
      // agentQuery.ts reaches classify/ for exactly the eight ADR 0010
      // authentication modules, never the handoff, a prompt, a schema, a
      // runner or a provider (pinned in wwSourceDiscoveryLive.firewall.test.ts).
      if (file === SOURCE_DISCOVERY_AUTH_SITE) {
        expect(
          specifiers(code)
            .filter((s) => /(^|\/)classify\//.test(s))
            .every((s) =>
              /^\.\.\/classify\/provider\/(profile|profileHygiene|preflight|authConflicts|authStatus|authStatusRunner|environment|claudeCodeExecutable)\.js$/.test(
                s,
              ),
            ),
          file,
        ).toBe(true);
        continue;
      }
      expect(reaches(code, 'classify'), file).toBe(false);
    }
  });

  it('no classify/ file reaches the handoff or sourceDiscovery', () => {
    for (const file of productionFiles().filter((f) => f.startsWith('src/orgunits/classify/'))) {
      const code = codeOf(readCurrent(file));
      expect(reaches(code, 'subjectClassifierHandoff'), file).toBe(false);
      expect(reaches(code, 'sourceDiscovery'), file).toBe(false);
    }
  });
});
