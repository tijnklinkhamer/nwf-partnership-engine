/**
 * The hermetic Agent SDK invocation: every security-critical field asserted
 * INDIVIDUALLY (never a snapshot that could silently admit a new tool).
 */
import { describe, expect, it } from 'vitest';
import type { ClassifierProviderRequest } from '../../orgunits/classify/providerContract.js';
import {
  buildAgentSdkInvocation,
  CLASSIFIER_DEFAULT_MAX_TURNS,
  CLASSIFIER_DISALLOWED_TOOLS,
  denyAllToolUse,
} from '../../orgunits/classify/provider/sdkOptions.js';

const SCHEMA = { type: 'array', items: { type: 'object' } };
const CHILD_ENV = { CLAUDE_CODE_OAUTH_TOKEN: 'test-oauth-secret-do-not-log', PATH: 'C:\\bin' };

function request(overrides: Partial<ClassifierProviderRequest> = {}): ClassifierProviderRequest {
  return {
    systemPrompt: 'FROZEN CLASSIFIER PROMPT TEXT',
    serializedBatch: '{"context":{},"documents":[]}',
    outputJsonSchema: SCHEMA,
    modelId: 'test-model-max',
    runConfig: {},
    ...overrides,
  };
}

function build(overrides: Partial<ClassifierProviderRequest> = {}) {
  return buildAgentSdkInvocation({
    request: request(overrides),
    childEnv: CHILD_ENV,
    scratchCwd: 'C:\\temp\\nwf-pe-classifier-x\\cwd',
  });
}

describe('buildAgentSdkInvocation', () => {
  it('sends the canonical batch serialization as the prompt, verbatim', () => {
    expect(build().prompt).toBe('{"context":{},"documents":[]}');
  });

  it('uses the frozen prompt from the request as a fully custom system prompt (no preset)', () => {
    const { options } = build();
    expect(options.systemPrompt).toBe('FROZEN CLASSIFIER PROMPT TEXT');
    expect(typeof options.systemPrompt).toBe('string');
  });

  it('settingSources is exactly empty', () => {
    expect(build().options.settingSources).toEqual([]);
  });

  it('persistSession is exactly false', () => {
    expect(build().options.persistSession).toBe(false);
  });

  it('tools is exactly empty', () => {
    expect(build().options.tools).toEqual([]);
  });

  it('allowedTools is exactly empty', () => {
    expect(build().options.allowedTools).toEqual([]);
  });

  it('disallowedTools removes every built-in tool by exact bare name', () => {
    const { options } = build();
    expect(options.disallowedTools).toBe(CLASSIFIER_DISALLOWED_TOOLS);
    for (const tool of [
      'Bash',
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'WebFetch',
      'WebSearch',
      'Agent',
      'Task',
      'Skill',
      'NotebookEdit',
      'TodoWrite',
    ]) {
      expect(options.disallowedTools).toContain(tool);
    }
  });

  it('canUseTool denies unconditionally and interrupts', async () => {
    const { options } = build();
    expect(options.canUseTool).toBe(denyAllToolUse);
    const verdict = await options.canUseTool();
    expect(verdict.behavior).toBe('deny');
    expect(verdict.interrupt).toBe(true);
  });

  it('MCP is empty and strict', () => {
    const { options } = build();
    expect(options.mcpServers).toEqual({});
    expect(options.strictMcpConfig).toBe(true);
  });

  it('skills and plugins are exactly empty, and no agents/hooks/additionalDirectories key exists', () => {
    const { options } = build();
    expect(options.skills).toEqual([]);
    expect(options.plugins).toEqual([]);
    expect(Object.keys(options)).not.toContain('agents');
    expect(Object.keys(options)).not.toContain('hooks');
    expect(Object.keys(options)).not.toContain('additionalDirectories');
    expect(Object.keys(options)).not.toContain('fallbackModel');
    expect(Object.keys(options)).not.toContain('resume');
    expect(Object.keys(options)).not.toContain('forkSession');
  });

  it('feeds the landed JSON schema through the strict structured-output facility', () => {
    const { options } = build();
    expect(options.outputFormat.type).toBe('json_schema');
    expect(options.outputFormat.schema).toBe(SCHEMA);
  });

  it('uses the sanitized child env and the scratch cwd', () => {
    const { options } = build();
    expect(options.env).toBe(CHILD_ENV);
    expect(options.cwd).toBe('C:\\temp\\nwf-pe-classifier-x\\cwd');
  });

  it('maxTurns defaults to the small named constant and honours an explicit bound', () => {
    expect(build().options.maxTurns).toBe(CLASSIFIER_DEFAULT_MAX_TURNS);
    expect(CLASSIFIER_DEFAULT_MAX_TURNS).toBe(3);
    expect(build({ runConfig: { maxTurns: 2 } }).options.maxTurns).toBe(2);
  });

  it('thinking defaults to disabled; enabled maps to the adaptive on-mode; effort only when configured', () => {
    expect(build().options.thinking).toEqual({ type: 'disabled' });
    expect(build({ runConfig: { thinking: 'enabled' } }).options.thinking).toEqual({
      type: 'adaptive',
    });
    expect(Object.keys(build().options)).not.toContain('effort');
    expect(build({ runConfig: { effort: 'low' } }).options.effort).toBe('low');
  });

  it('passes the model id through unchanged - no hardcoded production model anywhere', () => {
    expect(build().options.model).toBe('test-model-max');
  });
});
