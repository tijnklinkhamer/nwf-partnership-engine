/**
 * THE SDK-BUNDLED CLAUDE CODE EXECUTABLE RESOLVER (ADR 0010, Amendment A of
 * 2026-09-13 — Phase 2B-2D2C-F1A/F0B).
 *
 * The classifier runtime performs two Claude Code executions per
 * `classify()`: the request-free `auth status --json` preflight and, only
 * when that passes, the Agent SDK inference subprocess. Before this
 * amendment the preflight resolved a bare `claude` through `PATH` — an
 * EXTERNAL installation of whatever version happened to be first on the
 * operator's path (2.1.270 on the F2 machine) — while the SDK spawned the
 * NATIVE BINARY it ships in its own platform package
 * (`@anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude`, Claude Code
 * 2.1.251 for the pinned SDK 0.3.251). Two different executables cannot be
 * one preflight oracle. This module resolves the ONE executable both
 * executions use: the exact native binary of the exact installed SDK.
 *
 * It is DETERMINISTIC and FAILS CLOSED. Given a package root (the directory
 * whose `node_modules/` holds the installed SDK — a variant root under the
 * 2D2C runner, or this repository under the production CLI) it refuses,
 * by named kind:
 *
 *   - `UNSUPPORTED_PLATFORM`      — no native package is published for this
 *                                   platform/arch, or the platform is not
 *                                   one this engine has reviewed;
 *   - `SDK_PACKAGE_UNREADABLE`    — the SDK package or its shipped
 *                                   `manifest.json` is missing/unparseable;
 *   - `NATIVE_PACKAGE_MISSING`    — the optional native package was not
 *                                   installed (e.g. `--omit=optional`);
 *   - `NATIVE_PACKAGE_UNREADABLE` — its `package.json` is missing/unparseable;
 *   - `VERSION_MISMATCH`          — the SDK, the native package, the SDK's
 *                                   declared optional dependency and the
 *                                   manifest's Claude Code version do not
 *                                   all agree;
 *   - `PATH_OUTSIDE_NODE_MODULES` — the binary's real path is not under the
 *                                   package root's `node_modules/`;
 *   - `NOT_A_REGULAR_FILE`        — a symlink, directory or other non-file
 *                                   where a package directory or the binary
 *                                   must be;
 *   - `NOT_EXECUTABLE`            — the binary is not executable by this
 *                                   process;
 *   - `CHECKSUM_MISMATCH`         — the binary's byte length or SHA-256 is
 *                                   not the value the SDK's own manifest
 *                                   records for this platform;
 *   - `AMBIGUOUS_RESOLUTION`      — Node's own resolver, run from the SDK's
 *                                   location exactly as the SDK runs it,
 *                                   would find a DIFFERENT file.
 *
 * On success it returns the executable's real path plus non-sensitive
 * provenance (package names and versions, Claude Code version, platform
 * key, byte length, SHA-256) that a runner may pin and an audit may print.
 * Nothing here spawns a process, opens a socket, reads `process.env`, or
 * reads anything outside `node_modules/`.
 *
 * WHY THE SDK PACKAGE IS NAMED HERE. `agentSdkRunner.ts` remains the ONLY
 * module that IMPORTS the Agent SDK. This module never imports it; it names
 * the package so it can locate the installed copy on disk and verify what
 * the SDK will spawn. `phase2b.firewall.test.ts` pins both facts by exact
 * path.
 */
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants as fsConstants,
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The one approved Agent SDK package (ADR 0009); NAMED here, IMPORTED only by `agentSdkRunner.ts`. */
export const AGENT_SDK_PACKAGE_NAME = '@anthropic-ai/claude-agent-sdk';

/** The SDK's own manifest, shipped inside its package, recording per-platform binary checksums. */
export const AGENT_SDK_MANIFEST_FILE = 'manifest.json';

/**
 * The package root this provider namespace is installed under: four
 * directories above this module, in `src/` and in `dist/` alike. Under the
 * 2D2C runner the provider is loaded from a VARIANT ROOT's `dist/`, so this
 * resolves to that root — never to the runner's own worktree.
 */
export const PROVIDER_PACKAGE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);

export type ClaudeCodeExecutableFailureKind =
  | 'UNSUPPORTED_PLATFORM'
  | 'SDK_PACKAGE_UNREADABLE'
  | 'NATIVE_PACKAGE_MISSING'
  | 'NATIVE_PACKAGE_UNREADABLE'
  | 'VERSION_MISMATCH'
  | 'PATH_OUTSIDE_NODE_MODULES'
  | 'NOT_A_REGULAR_FILE'
  | 'NOT_EXECUTABLE'
  | 'CHECKSUM_MISMATCH'
  | 'AMBIGUOUS_RESOLUTION';

/** Non-sensitive provenance of the resolved executable. Safe to pin, print and persist. */
export interface ClaudeCodeExecutableProvenance {
  /** The binary's real, absolute path. Equal to its lexical path (no symlink component). */
  readonly executablePath: string;
  /** The real path of the package root whose `node_modules/` holds it. */
  readonly packageRoot: string;
  readonly sdkPackageName: string;
  readonly sdkVersion: string;
  /** The Claude Code version the SDK declares it bundles (`claudeCodeVersion`), equal to the manifest's `version`. */
  readonly claudeCodeVersion: string;
  readonly nativePackageName: string;
  readonly nativePackageVersion: string;
  /** `<platform>-<arch>[-musl]`, the SDK manifest's own key. */
  readonly platformKey: string;
  readonly binaryFileName: string;
  readonly binaryBytes: number;
  readonly binarySha256: string;
}

export type ClaudeCodeExecutableResolution =
  | { readonly ok: true; readonly provenance: ClaudeCodeExecutableProvenance }
  | {
      readonly ok: false;
      readonly kind: ClaudeCodeExecutableFailureKind;
      /** Bounded, operator-facing. Names paths, packages and versions; never file contents. */
      readonly detail: string;
    };

/** The injectable seam the provider calls once per `classify()`. Production: `resolveProductionClaudeCodeExecutable`. Tests: a fake. */
export type ClaudeCodeExecutableResolver = () => ClaudeCodeExecutableResolution;

export interface ResolveClaudeCodeExecutableInput {
  /** The directory whose `node_modules/` holds the installed SDK. Absolute. */
  readonly packageRoot: string;
  /** Test seams; production reads the running process. */
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
  readonly musl?: boolean;
}

/** The platforms the SDK publishes a native package for, and this engine has reviewed. */
const SUPPORTED_ARCHES: ReadonlySet<string> = new Set(['x64', 'arm64']);

/** Mirrors the SDK's own runtime libc detection: a Linux process whose report carries no glibc version runs on musl. */
function runningOnMusl(): boolean {
  const report =
    typeof process.report?.getReport === 'function' ? process.report.getReport() : null;
  const header = (report as { header?: { glibcVersionRuntime?: unknown } } | null)?.header;
  return report !== null && header?.glibcVersionRuntime === undefined;
}

function platformKeyOf(
  input: ResolveClaudeCodeExecutableInput,
):
  | { readonly ok: true; readonly key: string; readonly binaryFileName: string }
  | { readonly ok: false; readonly detail: string } {
  const platform = input.platform ?? process.platform;
  const arch = input.arch ?? process.arch;
  if (!SUPPORTED_ARCHES.has(arch)) {
    return { ok: false, detail: `architecture ${JSON.stringify(arch)} has no native package.` };
  }
  if (platform === 'darwin') return { ok: true, key: `darwin-${arch}`, binaryFileName: 'claude' };
  if (platform === 'win32') return { ok: true, key: `win32-${arch}`, binaryFileName: 'claude.exe' };
  if (platform === 'linux') {
    const musl = input.musl ?? runningOnMusl();
    return { ok: true, key: `linux-${arch}${musl ? '-musl' : ''}`, binaryFileName: 'claude' };
  }
  return { ok: false, detail: `platform ${JSON.stringify(platform)} has no native package.` };
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isRealDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function normalisedKey(path: string): string {
  const resolved = resolve(path);
  return resolved.endsWith(sep) && resolved.length > 1 ? resolved.slice(0, -1) : resolved;
}

const refuse = (
  kind: ClaudeCodeExecutableFailureKind,
  detail: string,
): ClaudeCodeExecutableResolution => ({ ok: false, kind, detail: `refused: ${detail}` });

/**
 * Resolves and verifies the SDK-bundled native Claude Code executable under
 * `packageRoot/node_modules`. Every check is listed in the module comment,
 * in this order. Pure aside from filesystem reads under `node_modules/`.
 */
export function resolveBundledClaudeCodeExecutable(
  input: ResolveClaudeCodeExecutableInput,
): ClaudeCodeExecutableResolution {
  if (!isAbsolute(input.packageRoot)) {
    return refuse('PATH_OUTSIDE_NODE_MODULES', 'the package root must be an absolute path.');
  }
  const platform = platformKeyOf(input);
  if (!platform.ok) return refuse('UNSUPPORTED_PLATFORM', platform.detail);
  const nativePackageName = `${AGENT_SDK_PACKAGE_NAME}-${platform.key}`;

  let packageRoot: string;
  try {
    packageRoot = realpathSync.native(input.packageRoot);
  } catch {
    return refuse('PATH_OUTSIDE_NODE_MODULES', 'the package root does not exist.');
  }
  const nodeModules = join(packageRoot, 'node_modules');
  const nodeModulesKey = normalisedKey(nodeModules);

  // 1. The SDK package itself: a real directory, a readable package.json,
  //    the expected name, a version, a declared Claude Code version, and an
  //    optional dependency on EXACTLY this platform's native package at the
  //    SAME version.
  const sdkDir = join(nodeModules, ...AGENT_SDK_PACKAGE_NAME.split('/'));
  if (!isRealDirectory(sdkDir)) {
    return refuse(
      'SDK_PACKAGE_UNREADABLE',
      `${AGENT_SDK_PACKAGE_NAME} is not an installed directory under ${nodeModules}.`,
    );
  }
  const sdkPackage = readJson(join(sdkDir, 'package.json'));
  if (sdkPackage === null || sdkPackage['name'] !== AGENT_SDK_PACKAGE_NAME) {
    return refuse(
      'SDK_PACKAGE_UNREADABLE',
      `${AGENT_SDK_PACKAGE_NAME}/package.json is unreadable.`,
    );
  }
  const sdkVersion = sdkPackage['version'];
  const claudeCodeVersion = sdkPackage['claudeCodeVersion'];
  const optional = sdkPackage['optionalDependencies'];
  if (typeof sdkVersion !== 'string' || typeof claudeCodeVersion !== 'string') {
    return refuse(
      'SDK_PACKAGE_UNREADABLE',
      `${AGENT_SDK_PACKAGE_NAME}/package.json declares no version or no claudeCodeVersion.`,
    );
  }
  const declaredNative =
    optional !== null && typeof optional === 'object'
      ? (optional as Record<string, unknown>)[nativePackageName]
      : undefined;
  if (declaredNative !== sdkVersion) {
    return refuse(
      'VERSION_MISMATCH',
      `${AGENT_SDK_PACKAGE_NAME} version ${sdkVersion} declares ${nativePackageName} at ` +
        `${JSON.stringify(declaredNative ?? null)}, not at its own version.`,
    );
  }

  // 2. The SDK's shipped manifest: the Claude Code version it bundles and
  //    this platform's binary name, byte length and SHA-256.
  const manifest = readJson(join(sdkDir, AGENT_SDK_MANIFEST_FILE));
  if (manifest === null) {
    return refuse(
      'SDK_PACKAGE_UNREADABLE',
      `${AGENT_SDK_PACKAGE_NAME}/${AGENT_SDK_MANIFEST_FILE} is unreadable.`,
    );
  }
  if (manifest['version'] !== claudeCodeVersion) {
    return refuse(
      'VERSION_MISMATCH',
      `the SDK manifest records Claude Code ${JSON.stringify(manifest['version'] ?? null)} but ` +
        `package.json declares claudeCodeVersion ${claudeCodeVersion}.`,
    );
  }
  const platforms = manifest['platforms'];
  const entry =
    platforms !== null && typeof platforms === 'object'
      ? ((platforms as Record<string, unknown>)[platform.key] as
          Record<string, unknown> | undefined)
      : undefined;
  if (
    entry === undefined ||
    entry === null ||
    typeof entry !== 'object' ||
    entry['binary'] !== platform.binaryFileName ||
    typeof entry['checksum'] !== 'string' ||
    !/^[0-9a-f]{64}$/.test(entry['checksum']) ||
    typeof entry['size'] !== 'number' ||
    !Number.isSafeInteger(entry['size']) ||
    entry['size'] <= 0
  ) {
    return refuse(
      'SDK_PACKAGE_UNREADABLE',
      `the SDK manifest carries no usable entry for ${platform.key}.`,
    );
  }
  const expectedSha256 = entry['checksum'];
  const expectedBytes = entry['size'];

  // 3. The native package: installed as a real directory, the expected name,
  //    the SDK's version, and published for this platform and architecture.
  const nativeDir = join(nodeModules, ...nativePackageName.split('/'));
  if (!isRealDirectory(nativeDir)) {
    return refuse(
      'NATIVE_PACKAGE_MISSING',
      `${nativePackageName} is not installed under ${nodeModules} (optional native package absent).`,
    );
  }
  const nativePackage = readJson(join(nativeDir, 'package.json'));
  if (nativePackage === null || nativePackage['name'] !== nativePackageName) {
    return refuse('NATIVE_PACKAGE_UNREADABLE', `${nativePackageName}/package.json is unreadable.`);
  }
  const nativeVersion = nativePackage['version'];
  if (nativeVersion !== sdkVersion) {
    return refuse(
      'VERSION_MISMATCH',
      `${nativePackageName} is ${JSON.stringify(nativeVersion ?? null)} but the SDK is ${sdkVersion}.`,
    );
  }
  const os = nativePackage['os'];
  const cpu = nativePackage['cpu'];
  const platformName = input.platform ?? process.platform;
  const archName = input.arch ?? process.arch;
  if (
    !Array.isArray(os) ||
    !os.includes(platformName) ||
    !Array.isArray(cpu) ||
    !cpu.includes(archName)
  ) {
    return refuse(
      'VERSION_MISMATCH',
      `${nativePackageName} is not published for ${platformName}/${archName}.`,
    );
  }

  // 4. The binary: a regular file (never a symlink), really under
  //    node_modules, executable, of the manifest's exact length and hash.
  const executablePath = join(nativeDir, platform.binaryFileName);
  let stat;
  try {
    stat = lstatSync(executablePath);
  } catch {
    return refuse(
      'NATIVE_PACKAGE_MISSING',
      `${nativePackageName}/${platform.binaryFileName} does not exist.`,
    );
  }
  if (!stat.isFile()) {
    return refuse(
      'NOT_A_REGULAR_FILE',
      `${nativePackageName}/${platform.binaryFileName} is not a regular file` +
        `${stat.isSymbolicLink() ? ' (symbolic link)' : ''}.`,
    );
  }
  let realExecutablePath: string;
  try {
    realExecutablePath = realpathSync.native(executablePath);
  } catch {
    return refuse('NOT_A_REGULAR_FILE', `${executablePath} could not be resolved.`);
  }
  if (
    normalisedKey(realExecutablePath) !== normalisedKey(executablePath) ||
    !normalisedKey(realExecutablePath).startsWith(nodeModulesKey + sep)
  ) {
    return refuse(
      'PATH_OUTSIDE_NODE_MODULES',
      `${executablePath} resolves to ${realExecutablePath}, outside ${nodeModules}.`,
    );
  }
  try {
    accessSync(executablePath, fsConstants.X_OK);
  } catch {
    return refuse('NOT_EXECUTABLE', `${executablePath} is not executable by this process.`);
  }
  if (stat.size !== expectedBytes) {
    return refuse(
      'CHECKSUM_MISMATCH',
      `${executablePath} is ${stat.size} bytes; the SDK manifest records ${expectedBytes}.`,
    );
  }
  const binarySha256 = createHash('sha256').update(readFileSync(executablePath)).digest('hex');
  if (binarySha256 !== expectedSha256) {
    return refuse(
      'CHECKSUM_MISMATCH',
      `${executablePath} hashes to ${binarySha256}; the SDK manifest records ${expectedSha256}.`,
    );
  }

  // 5. Ambiguity: Node's resolver, run from the SDK's own location exactly
  //    as the SDK runs it, must find this same file — not a hoisted, nested
  //    or linked copy elsewhere.
  let sdkResolved: string;
  try {
    sdkResolved = realpathSync.native(
      createRequire(join(sdkDir, 'package.json')).resolve(
        `${nativePackageName}/${platform.binaryFileName}`,
      ),
    );
  } catch {
    return refuse(
      'AMBIGUOUS_RESOLUTION',
      `Node's resolver from ${sdkDir} cannot resolve ${nativePackageName}/${platform.binaryFileName}.`,
    );
  }
  if (normalisedKey(sdkResolved) !== normalisedKey(realExecutablePath)) {
    return refuse(
      'AMBIGUOUS_RESOLUTION',
      `Node's resolver from ${sdkDir} finds ${sdkResolved}, not ${realExecutablePath}.`,
    );
  }

  return {
    ok: true,
    provenance: {
      executablePath: realExecutablePath,
      packageRoot,
      sdkPackageName: AGENT_SDK_PACKAGE_NAME,
      sdkVersion,
      claudeCodeVersion,
      nativePackageName,
      nativePackageVersion: nativeVersion,
      platformKey: platform.key,
      binaryFileName: platform.binaryFileName,
      binaryBytes: stat.size,
      binarySha256,
    },
  };
}

/** The production resolver: the SDK installed under THIS provider namespace's own package root. */
export function resolveProductionClaudeCodeExecutable(): ClaudeCodeExecutableResolution {
  return resolveBundledClaudeCodeExecutable({ packageRoot: PROVIDER_PACKAGE_ROOT });
}
