/**
 * REL HARVEST H6 FIREWALL - subject research hands its off-domain link-outs
 * to REL L2's sink, bound to its own run, and still never fetches them.
 *
 * NEW work, not harvested. Over H6_BASE_COMMIT..H6_TERMINAL_COMMIT (the
 * working tree while the terminal is open) it pins:
 *   - the change set is the orchestrator's subject entry, `subjectRun/
 *     execute.ts`, the one L2 firewall widening, the end-to-end test's
 *     simplification, its own integration test and this file - the root
 *     runner, the gateway, `sourceDiscovery/`, the CLI and every migration
 *     are untouched;
 *   - `runSubjectDiscovery` changed by exactly an optional per-run sink
 *     factory, applied only to the run it starts;
 *   - Lane L1's `subjectRun/` boundary, restated over the CURRENT
 *     `execute.ts`: the reviewed imports plus exactly `../sourceDiscovery/
 *     linkOut.js`, no socket, no gateway or root-runner call, one SELECT,
 *     no write of its own, no environment read, the brand check first and
 *     one `runSubjectDiscovery` call;
 *   - the capture is created only inside the factory, from the caller's
 *     capability pool - never the research pool by default - and no CLI file
 *     supplies one.
 */
import { describe, expect, it } from 'vitest';

import {
  codeOf,
  phaseRange,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

/** The H5 commit: this slice's parent. */
const H6_BASE_COMMIT = '4cebd324f24cf50097306b39976da8e2685807e8';

/** Pinned by the REL harvest pin commit to this slice's own commit (closed range). */
const H6_TERMINAL_COMMIT: string | null = 'a8260189fa7f339b03465772d9dd3b7f8a366634';

const EXECUTE = 'src/orgunits/subjectRun/execute.ts';
const ORCHESTRATE = 'src/orgunits/orchestrator/orchestrate.ts';
const L2_FIREWALL = 'src/test/firewall/relL2SourceDiscovery.firewall.test.ts';
const E2E = 'src/test/integration/relEnginePipelineE2E.test.ts';

/**
 * SHA-256 of JSON {removed, added} of each existing test file's `git diff
 * --unified=0` lines. Reviewed as:
 *   L2 firewall - "reached by production code only from its CLI command"
 *                 widened by ONE exact path (subjectRun/execute.ts), plus a new
 *                 assertion that it imports only linkOut.js from the
 *                 namespace; no forbidden pattern removed
 *   E2E         - the manual run-id lookup and hand-built sink replaced by
 *                 `linkOutPool`, plus two assertions on the returned summary
 */
const ACKNOWLEDGED_EDITS: Readonly<Record<string, string>> = {
  [L2_FIREWALL]: '7afad02ba3e56c4113680fcb3f623e3d5e4ef2fc5f5ab1c1211faf5fb199b589',
  [E2E]: 'e2de454a516f64970c71be8d71956a4322a8288b19f0732639e544dcfeac7b61',
};

const AUTHORISED_CHANGESET = [
  `M\t${ORCHESTRATE}`,
  `M\t${EXECUTE}`,
  ...Object.keys(ACKNOWLEDGED_EDITS).map((f) => `M\t${f}`),
  'A\tsrc/test/firewall/relHarvestH6SubjectLinkOutSink.firewall.test.ts',
  'A\tsrc/test/integration/relHarvestSubjectLinkOuts.test.ts',
].sort();

const h6 = phaseRange(H6_BASE_COMMIT, H6_TERMINAL_COMMIT);

describe.skipIf(!h6.available)('REL harvest H6: the change set over its own range', () => {
  it('is exactly the named files', () => {
    expect(h6.changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('edits each existing test file by exactly its reviewed acknowledgement', () => {
    for (const [path, digest] of Object.entries(ACKNOWLEDGED_EDITS)) {
      expect(h6.editDigest(path), path).toBe(digest);
    }
  });

  it('removes no forbidden pattern from the L2 firewall', () => {
    const { removed } = h6.diffLines(L2_FIREWALL);
    expect(removed).toEqual(['    expect(importers).toEqual([CLI_COMMAND]);']);
  });

  it('changes runSubjectDiscovery by exactly an optional per-run sink factory', () => {
    const { removed, added } = h6.diffLines(ORCHESTRATE);
    expect(removed).toEqual([
      "import { runRootAcquisition, type RootRunnerDeps, type RootSummary } from './rootRunner.js';",
      '    summary = await runRootAcquisition(pool, runId, ref, deps);',
    ]);
    expect(added.filter((l) => !/^\s*(\/\*\*|\*)/.test(l))).toEqual([
      'import {',
      '  runRootAcquisition,',
      '  type OffDomainAnchorSink,',
      '  type RootRunnerDeps,',
      '  type RootSummary,',
      "} from './rootRunner.js';",
      '  offDomainAnchorSinkForRun?: (runId: string) => OffDomainAnchorSink;',
      '  const rootDeps: RootRunnerDeps =',
      '    input.offDomainAnchorSinkForRun === undefined',
      '      ? deps',
      '      : { ...deps, offDomainAnchorSink: input.offDomainAnchorSinkForRun(runId) };',
      '    summary = await runRootAcquisition(pool, runId, ref, rootDeps);',
    ]);
  });
});

describe('REL harvest H6: subjectRun stays narrow; the sink is wired, never fetched', () => {
  const execute = () => codeOf(readCurrent(EXECUTE));

  it('subjectRun is still two files, imported in production only by its CLI command', () => {
    expect(productionFiles().filter((f) => f.startsWith('src/orgunits/subjectRun/'))).toEqual([
      'src/orgunits/subjectRun/admission.ts',
      EXECUTE,
    ]);
    const importers = productionFiles()
      .filter((f) => !f.startsWith('src/orgunits/subjectRun/'))
      .filter((f) => /orgunits\/subjectRun\//.test(codeOf(readCurrent(f))));
    expect(importers).toEqual(['src/cli/commands/orgunitsSubjects.ts']);
  });

  it("imports L1's reviewed modules plus exactly L2's link-out sink", () => {
    expect([...new Set(specifiers(execute()))].sort()).toEqual(
      [
        '../orchestrator/orchestrate.js',
        '../orchestrator/rootRunner.js',
        '../sourceDiscovery/linkOut.js',
        '../web/authority.js',
        './admission.js',
        'pg',
      ].sort(),
    );
    expect(execute()).toMatch(
      /import \{\s*createLinkOutNominationSink,\s*type LinkOutCapture,\s*type LinkOutSummary,\s*\} from '\.\.\/sourceDiscovery\/linkOut\.js';/,
    );
  });

  it("keeps L1's boundary: no socket, no gateway or root-runner call, no model, no classify", () => {
    const code = execute();
    expect(code).not.toMatch(
      /\bfetch\s*\(|node:(net|tls|http|https|dns|fs|child_process)|executeWebAttempt|authoriseAndFetchPage|runRootAcquisition|robots\.txt|claude-agent-sdk|anthropic|apollo/i,
    );
    expect(code).not.toMatch(
      /subjectAdmission\/|subjectResearchEvidence|cand:|contact|consent|outreach|qualif/i,
    );
    expect(code).not.toMatch(/process\.env|\bimport\s*\(/);
    expect(specifiers(code).some((s) => /(^|\/)classify(\/|$)/.test(s))).toBe(false);
    expect(code).not.toMatch(/startRun|startSubjectRun|completeRun/);
  });

  it('writes nothing of its own: one SELECT, no other statement', () => {
    const code = execute();
    expect(code).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|LOCK)\b\s/);
    expect([...code.matchAll(/`(\s*SELECT[\s\S]*?)`/g)]).toHaveLength(1);
  });

  it('checks the brand first, then the subject, then starts exactly one run', () => {
    const code = execute();
    expect([...code.matchAll(/runSubjectDiscovery\(/g)]).toHaveLength(1);
    expect(code).toMatch(
      /if \(!VerifiedSubjectAdmission\.isVerified\(admission\)\) \{\s*throw new SubjectExecutionRefusal\('ADMISSION_CAPABILITY_UNVERIFIED'\);\s*\}\s*const planned = await planSubjectDiscovery\(pool, admission\.admissionId, deps\);\s*if \(planned\.subjectAdmission\?\.subjectId !== admission\.subjectId\) \{\s*throw new SubjectExecutionRefusal\('ADMISSION_SUBJECT_MISMATCH'\);\s*\}/,
    );
    const mismatch = code.indexOf("'ADMISSION_SUBJECT_MISMATCH'");
    expect(code.indexOf('createLinkOutNominationSink(')).toBeGreaterThan(mismatch);
    expect(code.indexOf('runSubjectDiscovery(')).toBeGreaterThan(mismatch);
  });

  it("creates the capture only inside the per-run factory, from the caller's capability pool", () => {
    const code = execute();
    expect([...code.matchAll(/createLinkOutNominationSink\(/g)]).toHaveLength(1);
    expect(code).toMatch(
      /offDomainAnchorSinkForRun: \(runId: string\) => \{\s*capture = createLinkOutNominationSink\(linkOutPool, runId\);\s*return capture\.sink;\s*\}/,
    );
    expect(code).toMatch(/const linkOutPool = input\.linkOutPool;/);
    expect(code).toMatch(/linkOutPool === undefined\s*\?\s*\{\}/);
    // Never the research pool by default.
    expect(code).not.toMatch(/createLinkOutNominationSink\(pool\b/);
  });

  it('no CLI file supplies a link-out pool, and the root runner and L2 namespace are untouched here', () => {
    for (const file of productionFiles().filter((f) => f.startsWith('src/cli/'))) {
      expect(readCurrent(file), file).not.toMatch(/linkOut/);
    }
    if (h6.available) {
      expect(
        h6
          .changeset()
          .filter((l) =>
            /\t(src\/orgunits\/(orchestrator\/rootRunner|orchestrator\/frontier)\.ts|src\/orgunits\/(sourceDiscovery|web|classify)\/|src\/cli\/|migrations\/)/.test(
              l,
            ),
          ),
      ).toEqual([]);
    }
  });
});
