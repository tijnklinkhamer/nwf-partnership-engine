import { describe, expect, it } from 'vitest';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';

describe('the frozen classifier system prompt', () => {
  it('is versioned exactly orgunit-classifier-prompt-v1', () => {
    expect(ORGUNIT_CLASSIFIER_PROMPT_VERSION).toBe('orgunit-classifier-prompt-v1');
  });

  it('is a non-empty plain string with no template placeholders', () => {
    expect(typeof ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toBe('string');
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.length).toBeGreaterThan(500);
    // No `${...}` interpolation and no `{{...}}`-style mustache placeholder -
    // one universal prompt, never per-call templated (design §11).
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).not.toMatch(/\$\{/);
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).not.toMatch(/\{\{/);
  });

  it('states the task verbatim, per design §11', () => {
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain('You are a document classifier.');
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain(
      'Prefer UNKNOWN and NEEDS_REVIEW over unsupported certainty.',
    );
  });

  it('names every taxonomy member', () => {
    for (const member of [
      'UNIT_PAGE',
      'NOT_A_UNIT',
      'NEEDS_REVIEW',
      'INTERNATIONAL_MOBILITY_OFFICE',
      'LANGUAGE_CENTRE',
      'LANGUAGE_DEPARTMENT',
      'OTHER_UNIT',
      'DEGREE_PROGRAMME_PAGE',
      'NEWS_OR_EVENT_PAGE',
      'RESEARCH_PAGE',
      'NAVIGATION_OR_LANDING_PAGE',
      'SERVICE_TOOL_PAGE',
      'GENERIC_INSTITUTIONAL_PAGE',
      'OTHER_NON_UNIT',
    ]) {
      expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, `prompt does not name ${member}`).toContain(member);
    }
  });

  it('names every relevance axis', () => {
    for (const axis of [
      'serves_incoming_international_students',
      'serves_outgoing_mobility_students',
      'provides_language_learning_or_support',
    ]) {
      expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, `prompt does not name ${axis}`).toContain(axis);
    }
  });

  it('states the untrusted-data / no-instruction-following rule', () => {
    const lower = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('data');
    expect(lower).toContain('not instructions');
    expect(lower).toMatch(/ignore previous instructions/);
    expect(lower).toContain('never browse');
  });

  it('states the evidence-citation and no-invention rules', () => {
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT).toContain('evidence_spans');
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.toLowerCase()).toContain('literal');
    expect(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.toLowerCase()).toContain('never invented');
  });

  it('does not name any provider, model or organisation identity', () => {
    const lower = ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.toLowerCase();
    expect(lower).not.toContain('anthropic');
    expect(lower).not.toContain('claude');
    expect(lower).not.toContain('openai');
  });
});
