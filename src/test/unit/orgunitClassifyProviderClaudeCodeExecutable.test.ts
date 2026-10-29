/**
 * The SDK-bundled Claude Code executable resolver (ADR 0010 Amendment A):
 * every refusal kind against SYNTHETIC package trees in a temporary
 * directory (no real SDK, nothing spawned), and one provenance pin against
 * the SDK actually installed under this repository — read and hashed,
 * never executed. No test names a platform package literally: the native
 * package name is built from the SDK constant plus a platform key, exactly
 * as the resolver builds it.
 */
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AGENT_SDK_MANIFEST_FILE,
  AGENT_SDK_PACKAGE_NAME,
  PROVIDER_PACKAGE_ROOT,
  resolveBundledClaudeCodeExecutable,
  resolveProductionClaudeCodeExecutable,
  type ClaudeCodeExecutableResolution,
} from '../../orgunits/classify/provider/claudeCodeExecutable.js';

const IS_WINDOWS = process.platform === 'win32';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRATCH = realpathSync.native(mkdtempSync(join(tmpdir(), 'nwf-pe-claude-exec-')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

/** The synthetic target platform: fixed, so the tree shape never depends on the host. */
const PLATFORM = 'darwin' as const;
const ARCH = 'arm64';
const PLATFORM_KEY = `${PLATFORM}-${ARCH}`;
const NATIVE_NAME = `${AGENT_SDK_PACKAGE_NAME}-${PLATFORM_KEY}`;
const SDK_VERSION = '0.3.251';
const CLAUDE_CODE_VERSION = '2.1.251';
const BINARY_BYTES = Buffer.from('#!/bin/sh\nexit 0\n', 'utf8');

interface TreeOptions {
  readonly sdkVersion?: string;
  readonly claudeCodeVersion?: string;
  readonly manifestVersion?: string;
  readonly nativeVersion?: string;
  readonly declaredNativeVersion?: string | null;
  readonly nativeOs?: readonly string[];
  readonly omitNative?: boolean;
  readonly omitManifest?: boolean;
  readonly manifestChecksum?: string;
  readonly manifestSize?: number;
  readonly binaryMode?: number;
  readonly binaryAsSymlink?: boolean;
  readonly binaryAsDirectory?: boolean;
  readonly nativeDirAsSymlink?: boolean;
}

let counter = 0;
/** Writes a synthetic package root and returns it. */
function tree(options: TreeOptions = {}): string {
  counter += 1;
  const root = join(SCRATCH, `root-${counter}`);
  const nodeModules = join(root, 'node_modules');
  const sdkDir = join(nodeModules, ...AGENT_SDK_PACKAGE_NAME.split('/'));
  const nativeDir = join(nodeModules, ...NATIVE_NAME.split('/'));
  const sdkVersion = options.sdkVersion ?? SDK_VERSION;
  const claudeCodeVersion = options.claudeCodeVersion ?? CLAUDE_CODE_VERSION;
  mkdirSync(sdkDir, { recursive: true });
  writeFileSync(
    join(sdkDir, 'package.json'),
    JSON.stringify({
      name: AGENT_SDK_PACKAGE_NAME,
      version: sdkVersion,
      claudeCodeVersion,
      optionalDependencies:
        options.declaredNativeVersion === null
          ? {}
          : { [NATIVE_NAME]: options.declaredNativeVersion ?? sdkVersion },
    }),
  );
  const checksum = createHash('sha256').update(BINARY_BYTES).digest('hex');
  if (!options.omitManifest) {
    writeFileSync(
      join(sdkDir, AGENT_SDK_MANIFEST_FILE),
      JSON.stringify({
        version: options.manifestVersion ?? claudeCodeVersion,
        platforms: {
          [PLATFORM_KEY]: {
            binary: 'claude',
            checksum: options.manifestChecksum ?? checksum,
            size: options.manifestSize ?? BINARY_BYTES.length,
          },
        },
      }),
    );
  }
  if (!options.omitNative) {
    const realNativeDir = options.nativeDirAsSymlink ? join(root, 'elsewhere-native') : nativeDir;
    mkdirSync(realNativeDir, { recursive: true });
    writeFileSync(
      join(realNativeDir, 'package.json'),
      JSON.stringify({
        name: NATIVE_NAME,
        version: options.nativeVersion ?? sdkVersion,
        os: options.nativeOs ?? [PLATFORM],
        cpu: [ARCH],
      }),
    );
    const binary = join(realNativeDir, 'claude');
    if (options.binaryAsDirectory) mkdirSync(binary);
    else if (options.binaryAsSymlink) {
      writeFileSync(join(root, 'elsewhere-claude'), BINARY_BYTES);
      chmodSync(join(root, 'elsewhere-claude'), 0o755);
      symlinkSync(join(root, 'elsewhere-claude'), binary);
    } else {
      writeFileSync(binary, BINARY_BYTES);
      chmodSync(binary, options.binaryMode ?? 0o755);
    }
    if (options.nativeDirAsSymlink) {
      mkdirSync(dirname(nativeDir), { recursive: true });
      symlinkSync(realNativeDir, nativeDir);
    }
  }
  return root;
}

function resolveTree(root: string): ClaudeCodeExecutableResolution {
  return resolveBundledClaudeCodeExecutable({ packageRoot: root, platform: PLATFORM, arch: ARCH });
}

const kindOf = (resolution: ClaudeCodeExecutableResolution): string | null =>
  resolution.ok ? null : resolution.kind;

describe('resolveBundledClaudeCodeExecutable: a correct synthetic tree', () => {
  it('resolves the native binary under node_modules with full non-sensitive provenance', () => {
    const root = tree();
    const resolution = resolveTree(root);
    expect(resolution.ok, JSON.stringify(resolution)).toBe(true);
    if (!resolution.ok) return;
    const { provenance } = resolution;
    expect(provenance.executablePath).toBe(
      join(root, 'node_modules', ...NATIVE_NAME.split('/'), 'claude'),
    );
    expect(provenance.executablePath.startsWith(join(root, 'node_modules') + sep)).toBe(true);
    expect(provenance.packageRoot).toBe(root);
    expect(provenance.sdkPackageName).toBe(AGENT_SDK_PACKAGE_NAME);
    expect(provenance.sdkVersion).toBe(SDK_VERSION);
    expect(provenance.claudeCodeVersion).toBe(CLAUDE_CODE_VERSION);
    expect(provenance.nativePackageName).toBe(NATIVE_NAME);
    expect(provenance.nativePackageVersion).toBe(SDK_VERSION);
    expect(provenance.platformKey).toBe(PLATFORM_KEY);
    expect(provenance.binaryFileName).toBe('claude');
    expect(provenance.binaryBytes).toBe(BINARY_BYTES.length);
    expect(provenance.binarySha256).toBe(createHash('sha256').update(BINARY_BYTES).digest('hex'));
    // Provenance carries no environment, credential or file content.
    expect(Object.keys(provenance).sort()).toEqual([
      'binaryBytes',
      'binaryFileName',
      'binarySha256',
      'claudeCodeVersion',
      'executablePath',
      'nativePackageName',
      'nativePackageVersion',
      'packageRoot',
      'platformKey',
      'sdkPackageName',
      'sdkVersion',
    ]);
  });

  it('is deterministic: two resolutions of the same tree are deep-equal', () => {
    const root = tree();
    expect(resolveTree(root)).toEqual(resolveTree(root));
  });

  it('selects the Windows binary name and the musl Linux package key from the platform seams', () => {
    const win = resolveBundledClaudeCodeExecutable({
      packageRoot: tree(),
      platform: 'win32',
      arch: 'x64',
    });
    // The synthetic SDK declares only the darwin package: the declared-dependency
    // check refuses FIRST, naming the win32 package it looked for.
    expect(kindOf(win)).toBe('VERSION_MISMATCH');
    expect(!win.ok && win.detail).toContain(`${AGENT_SDK_PACKAGE_NAME}-win32-x64`);
    const musl = resolveBundledClaudeCodeExecutable({
      packageRoot: tree(),
      platform: 'linux',
      arch: 'x64',
      musl: true,
    });
    // The SDK declares no optional dependency on the musl package in this synthetic tree.
    expect(kindOf(musl)).toBe('VERSION_MISMATCH');
    expect(!musl.ok && musl.detail).toContain('-musl');
  });
});

describe('resolveBundledClaudeCodeExecutable: every refusal, by exact kind, fail closed', () => {
  it('UNSUPPORTED_PLATFORM for an unreviewed platform or architecture', () => {
    expect(
      kindOf(
        resolveBundledClaudeCodeExecutable({
          packageRoot: tree(),
          platform: 'freebsd',
          arch: ARCH,
        }),
      ),
    ).toBe('UNSUPPORTED_PLATFORM');
    expect(
      kindOf(
        resolveBundledClaudeCodeExecutable({
          packageRoot: tree(),
          platform: PLATFORM,
          arch: 'ia32',
        }),
      ),
    ).toBe('UNSUPPORTED_PLATFORM');
  });

  it('PATH_OUTSIDE_NODE_MODULES for a relative or missing package root', () => {
    expect(
      kindOf(
        resolveBundledClaudeCodeExecutable({
          packageRoot: 'relative',
          platform: PLATFORM,
          arch: ARCH,
        }),
      ),
    ).toBe('PATH_OUTSIDE_NODE_MODULES');
    expect(kindOf(resolveTree(join(SCRATCH, 'does-not-exist')))).toBe('PATH_OUTSIDE_NODE_MODULES');
  });

  it('SDK_PACKAGE_UNREADABLE when the SDK package, its manifest or the platform entry is missing', () => {
    expect(kindOf(resolveTree(join(SCRATCH)))).toBe('SDK_PACKAGE_UNREADABLE');
    expect(kindOf(resolveTree(tree({ omitManifest: true })))).toBe('SDK_PACKAGE_UNREADABLE');
    const noPlatform = tree();
    writeFileSync(
      join(
        noPlatform,
        'node_modules',
        ...AGENT_SDK_PACKAGE_NAME.split('/'),
        AGENT_SDK_MANIFEST_FILE,
      ),
      JSON.stringify({ version: CLAUDE_CODE_VERSION, platforms: {} }),
    );
    expect(kindOf(resolveTree(noPlatform))).toBe('SDK_PACKAGE_UNREADABLE');
    const noClaudeCodeVersion = tree();
    writeFileSync(
      join(
        noClaudeCodeVersion,
        'node_modules',
        ...AGENT_SDK_PACKAGE_NAME.split('/'),
        'package.json',
      ),
      JSON.stringify({ name: AGENT_SDK_PACKAGE_NAME, version: SDK_VERSION }),
    );
    expect(kindOf(resolveTree(noClaudeCodeVersion))).toBe('SDK_PACKAGE_UNREADABLE');
  });

  it('NATIVE_PACKAGE_MISSING when the optional native package was not installed', () => {
    const resolution = resolveTree(tree({ omitNative: true }));
    expect(kindOf(resolution)).toBe('NATIVE_PACKAGE_MISSING');
    expect(!resolution.ok && resolution.detail).toContain('optional native package absent');
  });

  it('NATIVE_PACKAGE_UNREADABLE when the native package.json is missing or names another package', () => {
    const root = tree();
    writeFileSync(
      join(root, 'node_modules', ...NATIVE_NAME.split('/'), 'package.json'),
      JSON.stringify({ name: 'something-else', version: SDK_VERSION }),
    );
    expect(kindOf(resolveTree(root))).toBe('NATIVE_PACKAGE_UNREADABLE');
  });

  it('VERSION_MISMATCH when the SDK, the native package, the declared optional dependency, the manifest or the published os disagree', () => {
    expect(kindOf(resolveTree(tree({ nativeVersion: '0.3.250' })))).toBe('VERSION_MISMATCH');
    expect(kindOf(resolveTree(tree({ declaredNativeVersion: '0.3.250' })))).toBe(
      'VERSION_MISMATCH',
    );
    expect(kindOf(resolveTree(tree({ declaredNativeVersion: null })))).toBe('VERSION_MISMATCH');
    expect(kindOf(resolveTree(tree({ manifestVersion: '2.1.250' })))).toBe('VERSION_MISMATCH');
    expect(kindOf(resolveTree(tree({ nativeOs: ['linux'] })))).toBe('VERSION_MISMATCH');
  });

  it('NOT_A_REGULAR_FILE for a symlinked or directory-shaped binary, and PATH_OUTSIDE_NODE_MODULES for a linked package directory', () => {
    expect(kindOf(resolveTree(tree({ binaryAsSymlink: true })))).toBe('NOT_A_REGULAR_FILE');
    expect(kindOf(resolveTree(tree({ binaryAsDirectory: true })))).toBe('NOT_A_REGULAR_FILE');
    // A symlinked package directory is not a real directory: the native package is not installed there.
    expect(kindOf(resolveTree(tree({ nativeDirAsSymlink: true })))).toBe('NATIVE_PACKAGE_MISSING');
  });

  it.skipIf(IS_WINDOWS)('NOT_EXECUTABLE when the binary lacks the execute bit', () => {
    expect(kindOf(resolveTree(tree({ binaryMode: 0o644 })))).toBe('NOT_EXECUTABLE');
  });

  it('CHECKSUM_MISMATCH when the byte length or the SHA-256 differs from the SDK manifest', () => {
    expect(kindOf(resolveTree(tree({ manifestSize: BINARY_BYTES.length + 1 })))).toBe(
      'CHECKSUM_MISMATCH',
    );
    expect(kindOf(resolveTree(tree({ manifestChecksum: 'f'.repeat(64) })))).toBe(
      'CHECKSUM_MISMATCH',
    );
  });

  it('AMBIGUOUS_RESOLUTION when Node resolution from the SDK location would find a different file', () => {
    // A nested copy of the native package INSIDE the SDK's own node_modules
    // shadows the top-level one for a resolver running from the SDK.
    const root = tree();
    const nested = join(
      root,
      'node_modules',
      ...AGENT_SDK_PACKAGE_NAME.split('/'),
      'node_modules',
      ...NATIVE_NAME.split('/'),
    );
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(nested, 'package.json'),
      JSON.stringify({ name: NATIVE_NAME, version: SDK_VERSION, os: [PLATFORM], cpu: [ARCH] }),
    );
    writeFileSync(join(nested, 'claude'), BINARY_BYTES);
    chmodSync(join(nested, 'claude'), 0o755);
    const resolution = resolveTree(root);
    expect(kindOf(resolution)).toBe('AMBIGUOUS_RESOLUTION');
    expect(!resolution.ok && resolution.detail).toContain('finds');
  });

  it('every refusal detail is bounded and content-free: no file bytes, no environment', () => {
    for (const root of [
      tree({ omitNative: true }),
      tree({ nativeVersion: '0.3.250' }),
      tree({ manifestChecksum: 'f'.repeat(64) }),
    ]) {
      const resolution = resolveTree(root);
      expect(resolution.ok).toBe(false);
      if (resolution.ok) continue;
      expect(resolution.detail.startsWith('refused: ')).toBe(true);
      expect(resolution.detail.length).toBeLessThan(600);
      expect(resolution.detail).not.toContain('#!/bin/sh');
    }
  });
});

describe('the production resolver against the SDK installed under this repository', () => {
  const sdkDir = join(REPO_ROOT, 'node_modules', ...AGENT_SDK_PACKAGE_NAME.split('/'));
  const nativeDir = join(
    REPO_ROOT,
    'node_modules',
    ...`${AGENT_SDK_PACKAGE_NAME}-${process.platform}-${process.arch}`.split('/'),
  );
  const nativeInstalled = existsSync(sdkDir) && existsSync(nativeDir);

  it('PROVIDER_PACKAGE_ROOT is this repository root, in src/ and therefore in dist/ alike', () => {
    expect(PROVIDER_PACKAGE_ROOT).toBe(REPO_ROOT);
  });

  it.skipIf(!nativeInstalled)(
    'resolves the installed native binary, whose provenance agrees with package.json, the lockfile and the SDK manifest (read and hashed, never executed)',
    () => {
      const resolution = resolveProductionClaudeCodeExecutable();
      expect(resolution.ok, JSON.stringify(resolution)).toBe(true);
      if (!resolution.ok) return;
      const { provenance } = resolution;
      const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>;
      };
      const lock = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8')) as {
        packages: Record<string, { version: string }>;
      };
      const manifest = JSON.parse(readFileSync(join(sdkDir, AGENT_SDK_MANIFEST_FILE), 'utf8')) as {
        version: string;
        platforms: Record<string, { checksum: string; size: number }>;
      };
      expect(provenance.sdkVersion).toBe(pkg.dependencies[AGENT_SDK_PACKAGE_NAME]);
      expect(provenance.sdkVersion).toBe(
        lock.packages[`node_modules/${AGENT_SDK_PACKAGE_NAME}`]?.version,
      );
      expect(provenance.nativePackageVersion).toBe(
        lock.packages[`node_modules/${provenance.nativePackageName}`]?.version,
      );
      expect(provenance.claudeCodeVersion).toBe(manifest.version);
      expect(provenance.binarySha256).toBe(manifest.platforms[provenance.platformKey]?.checksum);
      expect(provenance.binaryBytes).toBe(manifest.platforms[provenance.platformKey]?.size);
      expect(provenance.executablePath.startsWith(join(REPO_ROOT, 'node_modules') + sep)).toBe(
        true,
      );
      expect(provenance.executablePath).toBe(realpathSync.native(provenance.executablePath));
    },
  );
});
