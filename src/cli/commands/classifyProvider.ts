/**
 * PRODUCTION CLASSIFIER PROVIDER WIRING for `nwf-pe orgunits classify
 * --execute` — and nothing else. Loaded only by a dynamic import on the
 * execute path (`classify.ts`), after every operator gate has passed, so a
 * dry run never loads it.
 *
 * Exactly the landed Max-only runtime (ADR 0009 / ADR 0010): the
 * `ClaudeMaxAgentProvider` with its two REQUIRED production runners. The
 * Claude Code executable is the provider's own default — the SDK-bundled
 * binary verified by `claudeCodeExecutable.ts`, never one found on `PATH`.
 * The provider's own full preflight (profile hygiene, executable
 * verification, request-free auth status, scratch isolation) stays inside
 * the provider and is not duplicated here. There is no API-key provider, no
 * credential read and no fallback provider anywhere in this repository.
 */
import { ClaudeMaxAgentProvider } from '../../orgunits/classify/provider/claudeMaxAgentProvider.js';
import { createProductionAgentSdkRunner } from '../../orgunits/classify/provider/agentSdkRunner.js';
import { createProductionAuthStatusRunner } from '../../orgunits/classify/provider/authStatusRunner.js';
import type { ClassifierProvider } from '../../orgunits/classify/providerContract.js';

export function createProductionClassifierProvider(): ClassifierProvider {
  return new ClaudeMaxAgentProvider({
    runner: createProductionAgentSdkRunner(),
    authStatusRunner: createProductionAuthStatusRunner(),
  });
}
