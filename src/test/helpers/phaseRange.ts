/**
 * REL harvest - the phase-isolation primitives every REL harvest firewall
 * uses, on the pattern the L1 and L2 firewalls restate inline: a phase owns
 * ONE commit range, BASE..TERMINAL (the working tree while TERMINAL is open,
 * i.e. null), and pins its change set and the exact lines it edits.
 *
 * Read-only: `git` plumbing and file reads, nothing else.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

export function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

export function commitExists(commit: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'cat-file', '-e', `${commit}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/** Comments stripped, so prose never trips a code assertion. */
export function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export const sha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

/** Working-tree source: boundary checks protect what exists NOW. */
export const readCurrent = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

/** Every production `.ts` file under `src/`, excluding `src/test/`. */
export function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(rel);
      } else if (rel.endsWith('.ts')) out.push(rel);
    }
  };
  walk('src');
  return out.sort();
}

/** Static, dynamic and re-export module specifiers. */
export const specifiers = (code: string): string[] =>
  [...code.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)'([^']+)'/g)].map(
    (m) => m[1]!,
  );

export interface PhaseRange {
  readonly available: boolean;
  /** `git diff --name-status` lines over the range, plus untracked files while open. */
  changeset(): string[];
  /** The removed and added lines of one path over the range. */
  diffLines(path: string): { removed: string[]; added: string[] };
  /** SHA-256 of JSON {removed, added}: the reviewed-edit digest form. */
  editDigest(path: string): string;
  /** The file as the range's terminal holds it. */
  sourceOf(path: string): string;
}

export function phaseRange(base: string, terminal: string | null): PhaseRange {
  const available = commitExists(base) && (terminal === null || commitExists(terminal));
  const range = (): string[] => (terminal === null ? [base] : [base, terminal]);
  const diffLines = (path: string) => {
    const diff = git('diff', '--unified=0', ...range(), '--', path).split('\n');
    return {
      removed: diff.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1)),
      added: diff.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)),
    };
  };
  return {
    available,
    changeset() {
      const tracked = git('diff', '--name-status', '--find-renames', ...range());
      const untracked =
        terminal === null
          ? git('ls-files', '--others', '--exclude-standard')
              .split('\n')
              .filter((l) => l.length > 0 && l !== 'node_modules')
              .map((l) => `A\t${l}`)
              .join('\n')
          : '';
      return [
        ...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0)),
      ].sort();
    },
    diffLines,
    editDigest: (path) => sha256(JSON.stringify(diffLines(path))),
    sourceOf: (path) =>
      terminal === null ? readCurrent(path) : git('show', `${terminal}:${path}`),
  };
}
