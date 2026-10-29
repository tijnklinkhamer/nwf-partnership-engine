// PHASE 2B-2D2C-F1 test fixture: a SYNTHETIC variant root's built
// `claudeMaxAgentProvider.js`. A scripted provider: it reads its scenario
// from `<root>/fake-provider-scenario.json`, records every request it
// receives to `<root>/fake-provider-calls.json`, invokes the injected
// runner/auth seams the scripted number of times so the loader's counting
// decorators are observable, and returns the scripted result. No network.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));

export class ClaudeMaxAgentProvider {
  #options;
  constructor(options) {
    this.#options = options;
  }
  // F1A/F0B shape parity: ONE executable resolution feeds both seams below.
  #claudeCodeExecutable() {
    return { ok: true, provenance: { executablePath: join(ROOT, 'node_modules', 'synthetic', 'claude') } };
  }
  async classify(request) {
    const scenario = JSON.parse(readFileSync(join(ROOT, 'fake-provider-scenario.json'), 'utf8'));
    const env = this.#options.env ? this.#options.env() : {};
    const executable = this.#claudeCodeExecutable();
    const executablePath = executable.provenance.executablePath;
    writeFileSync(
      join(ROOT, 'fake-provider-calls.json'),
      JSON.stringify({
        systemPromptLength: request.systemPrompt.length,
        serializedBatchLength: request.serializedBatch.length,
        modelId: request.modelId,
        runConfig: request.runConfig,
        repoRoot: this.#options.repoRoot,
        envNames: Object.keys(env).sort(),
      }),
    );
    for (let i = 0; i < (scenario.authStatusInvocations ?? 1); i += 1) {
      try {
        await this.#options.authStatusRunner.run({ executablePath, env: {}, cwd: ROOT });
      } catch {
        // The synthetic seam throws by design; the call still counts.
      }
    }
    for (let i = 0; i < (scenario.runnerAttempts ?? 1); i += 1) {
      try {
        const invocation = { prompt: '', options: { claudeCodeExecutablePath: executablePath } };
        await this.#options.runner.run(invocation, { deadlineMs: 1 });
      } catch {
        // Likewise.
      }
    }
    if (scenario.diagnostics && this.#options.onAttemptDiagnostics) {
      this.#options.onAttemptDiagnostics(scenario.diagnostics);
    }
    if (scenario.throw) throw new Error(scenario.throw);
    return scenario.result;
  }
}
