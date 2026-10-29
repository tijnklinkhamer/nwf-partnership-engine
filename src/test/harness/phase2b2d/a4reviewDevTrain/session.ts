/**
 * PHASE 2B-2D — A4 R51: THE LOCAL REVIEW-SESSION CORE.
 *
 * ONE SOURCE, TWO USES
 *
 *   `REVIEW_CORE_SOURCE` is plain browser JavaScript. `tooling.ts` embeds it
 *   byte-for-byte in the offline HTML tool, and the tests execute it - the
 *   exact embedded bytes - in a bare `node:vm` context with no globals beyond
 *   the language itself. So the workflow the tests prove is the workflow the
 *   human runs: there is no second implementation to drift.
 *
 * WHAT THE CORE DOES
 *
 *   It holds a NON-CANONICAL local draft: every package goldId is UNREVIEWED,
 *   DEFERRED_FOR_LANGUAGE_COMPETENT_HUMAN or COMPLETED. It records a human's
 *   completed response only after checking the R49 validity matrix, refuses a
 *   second label from a different actor on an already-completed item, merges
 *   drafts without ever duplicating a completed item, and produces the
 *   completed-response JSONL ONLY when all items are COMPLETED.
 *
 * WHAT THE CORE NEVER DOES
 *
 *   It never reads page content, never chooses or proposes a verdict, a unit
 *   type or a hard-negative value, never fills a value the human did not
 *   choose (the UI fixes the matrix-forced values only after the human picks a
 *   verdict), never repairs an illegal combination, and never turns a
 *   language deferral into NEEDS_REVIEW.
 *
 * The body is `String.raw`, so it must contain no backtick and no `${`.
 */
import { createContext, runInContext } from 'node:vm';
import {
  RUBRIC_UNIT_TYPES,
  RUBRIC_VALIDITY_MATRIX,
  RUBRIC_VERDICTS,
} from '../a4handoffR4/rubric.js';
import {
  COMPLETED_RESPONSE_KEYS,
  DRAFT_KIND,
  DRAFT_SCHEMA,
  LANGUAGE_DEFER_STATE,
  LOCAL_STORAGE_KEY_PREFIX,
  R51_ACTOR_KEY_PATTERN_SOURCE,
  WORKFLOW_STATES,
} from './types.js';

/** The longest optional review note the tool accepts. A bound, not a hint. */
export const REVIEW_NOTE_MAX_CHARS = 2000;

const CONSTANTS = [
  ['DRAFT_KIND', DRAFT_KIND],
  ['DRAFT_SCHEMA', DRAFT_SCHEMA],
  ['DEFER', LANGUAGE_DEFER_STATE],
  ['STATES', WORKFLOW_STATES],
  ['STORAGE_PREFIX', LOCAL_STORAGE_KEY_PREFIX],
  ['ACTOR_PATTERN_SOURCE', R51_ACTOR_KEY_PATTERN_SOURCE],
  ['RESPONSE_KEYS', COMPLETED_RESPONSE_KEYS],
  ['VERDICTS', RUBRIC_VERDICTS],
  ['UNIT_TYPES', RUBRIC_UNIT_TYPES],
  ['MATRIX', RUBRIC_VALIDITY_MATRIX],
  ['NOTE_MAX', REVIEW_NOTE_MAX_CHARS],
] as const;

const CORE_HEADER = CONSTANTS.map(
  ([name, value]) => '  var ' + name + ' = ' + JSON.stringify(value) + ';',
).join('\n');

const CORE_BODY = String.raw`
  var ACTOR_PATTERN = new RegExp(ACTOR_PATTERN_SOURCE);

  function refused(code, message) {
    return { ok: false, refusal: code, message: message };
  }
  function done(draft) {
    return { ok: true, draft: draft };
  }
  function has(list, value) {
    return list.indexOf(value) !== -1;
  }
  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function isValidActorKey(value) {
    return typeof value === 'string' && ACTOR_PATTERN.test(value);
  }
  function matrixRowFor(verdict) {
    for (var i = 0; i < MATRIX.length; i += 1) {
      if (MATRIX[i].verdict === verdict) return MATRIX[i];
    }
    return null;
  }

  // Which fields stay open to the HUMAN once the HUMAN has chosen a verdict.
  // Mechanical, from the frozen R49 matrix only. It never looks at an item.
  function fieldRulesAfterVerdict(verdict) {
    var row = matrixRowFor(verdict);
    if (row === null) return null;
    return {
      unitTypeOpenToHuman: row.unitType === 'ONE_OF_FOUR_VALUES',
      unitTypeValues: row.unitType === 'ONE_OF_FOUR_VALUES' ? UNIT_TYPES.slice() : [],
      unitTypeFixedNull: row.unitType === 'NULL_ONLY',
      hardNegativeOpenToHuman: row.hardNegative === 'TRUE_OR_FALSE',
      hardNegativeFixedFalse: row.hardNegative === 'FALSE_ONLY'
    };
  }

  function responseProblems(response) {
    var problems = [];
    if (response === null || typeof response !== 'object' || Array.isArray(response)) {
      return ['the response is not an object'];
    }
    if (!isValidActorKey(response.reviewerActorKey)) {
      problems.push('reviewerActorKey is not an opaque actor key');
    }
    var row = matrixRowFor(response.verdict);
    if (row === null) problems.push('verdict is not a rubric value');
    var unitType = response.unit_type;
    if (unitType !== null && !has(UNIT_TYPES, unitType)) problems.push('unit_type is not a rubric value');
    if (typeof response.hard_negative !== 'boolean') problems.push('hard_negative is not a boolean');
    if (row !== null) {
      if (row.unitType === 'ONE_OF_FOUR_VALUES' && unitType === null) {
        problems.push(row.verdict + ' requires a unit_type');
      }
      if (row.unitType === 'NULL_ONLY' && unitType !== null) {
        problems.push(row.verdict + ' requires unit_type null');
      }
      if (row.hardNegative === 'FALSE_ONLY' && response.hard_negative === true) {
        problems.push(row.verdict + ' requires hard_negative false');
      }
    }
    var note = response.reviewNote;
    if (note !== null) {
      if (typeof note !== 'string' || note.trim().length === 0) {
        problems.push('reviewNote is not null or non-empty text');
      } else if (note.length > NOTE_MAX) {
        problems.push('reviewNote is longer than ' + NOTE_MAX + ' characters');
      }
    }
    return problems;
  }

  function bindingProblems(binding) {
    if (binding === null || typeof binding !== 'object') return ['the binding is not an object'];
    var problems = [];
    if (!/^[0-9a-f]{64}$/.test(binding.packageHash)) problems.push('packageHash is malformed');
    if (!/^[0-9a-f]{64}$/.test(binding.rubricSha256)) problems.push('rubricSha256 is malformed');
    if (typeof binding.rubricVersion !== 'string') problems.push('rubricVersion is missing');
    if (!Array.isArray(binding.goldIds) || binding.goldIds.length === 0) {
      problems.push('goldIds are missing');
    } else {
      for (var i = 0; i < binding.goldIds.length; i += 1) {
        if (!/^g[0-9a-f]{16}$/.test(binding.goldIds[i])) problems.push('goldId ' + i + ' is malformed');
        if (i > 0 && !(binding.goldIds[i - 1] < binding.goldIds[i])) {
          problems.push('goldIds are not strictly ascending at position ' + i);
        }
      }
    }
    return problems;
  }

  function storageKey(binding) {
    return STORAGE_PREFIX + ':' + binding.packageHash + ':' + binding.rubricSha256;
  }

  function createDraft(binding) {
    var problems = bindingProblems(binding);
    if (problems.length > 0) return refused('BINDING_INVALID', problems.join('; '));
    return done({
      kind: DRAFT_KIND,
      draftSchema: DRAFT_SCHEMA,
      canonical: false,
      packageHash: binding.packageHash,
      rubricVersion: binding.rubricVersion,
      rubricSha256: binding.rubricSha256,
      itemCount: binding.goldIds.length,
      items: binding.goldIds.map(function (goldId) {
        return { goldId: goldId, state: 'UNREVIEWED' };
      })
    });
  }

  function positionOf(draft, goldId) {
    for (var i = 0; i < draft.items.length; i += 1) {
      if (draft.items[i].goldId === goldId) return i;
    }
    return -1;
  }

  function completeItem(draft, goldId, actorKey, choice) {
    var at = positionOf(draft, goldId);
    if (at === -1) return refused('UNKNOWN_ITEM', 'the item is not in this package');
    if (!isValidActorKey(actorKey)) return refused('ACTOR_KEY_INVALID', 'the actor key is not an opaque actor key');
    if (choice === null || typeof choice !== 'object') return refused('RESPONSE_INVALID', 'no choice was given');
    var response = {
      reviewerActorKey: actorKey,
      verdict: choice.verdict === undefined ? null : choice.verdict,
      unit_type: choice.unit_type === undefined ? null : choice.unit_type,
      hard_negative: choice.hard_negative === undefined ? null : choice.hard_negative,
      reviewNote: choice.reviewNote === undefined ? null : choice.reviewNote
    };
    var problems = responseProblems(response);
    if (problems.length > 0) return refused('RESPONSE_INVALID', problems.join('; '));
    var current = draft.items[at];
    if (current.state === 'COMPLETED' && current.response.reviewerActorKey !== actorKey) {
      return refused(
        'SECOND_LABEL_REFUSED',
        'item ' + (at + 1) + ' already carries a completed label from another actor; DEV_TRAIN is single review'
      );
    }
    var next = copy(draft);
    next.items[at] = { goldId: goldId, state: 'COMPLETED', response: response };
    return done(next);
  }

  function deferItemForLanguage(draft, goldId, actorKey) {
    var at = positionOf(draft, goldId);
    if (at === -1) return refused('UNKNOWN_ITEM', 'the item is not in this package');
    if (!isValidActorKey(actorKey)) return refused('ACTOR_KEY_INVALID', 'the actor key is not an opaque actor key');
    var current = draft.items[at];
    if (current.state === 'COMPLETED') {
      return refused('ALREADY_COMPLETED', 'item ' + (at + 1) + ' is already completed; it cannot be deferred');
    }
    var by = current.state === DEFER ? current.deferredBy.slice() : [];
    if (!has(by, actorKey)) by.push(actorKey);
    by.sort();
    var next = copy(draft);
    next.items[at] = { goldId: goldId, state: DEFER, deferredBy: by };
    return done(next);
  }

  function clearDeferral(draft, goldId) {
    var at = positionOf(draft, goldId);
    if (at === -1) return refused('UNKNOWN_ITEM', 'the item is not in this package');
    if (draft.items[at].state !== DEFER) return refused('NOT_DEFERRED', 'item ' + (at + 1) + ' is not deferred');
    var next = copy(draft);
    next.items[at] = { goldId: goldId, state: 'UNREVIEWED' };
    return done(next);
  }

  function withdrawOwnLabel(draft, goldId, actorKey) {
    var at = positionOf(draft, goldId);
    if (at === -1) return refused('UNKNOWN_ITEM', 'the item is not in this package');
    var current = draft.items[at];
    if (current.state !== 'COMPLETED') return refused('NOT_COMPLETED', 'item ' + (at + 1) + ' is not completed');
    if (current.response.reviewerActorKey !== actorKey) {
      return refused('NOT_OWN_LABEL', 'item ' + (at + 1) + ' was completed by another actor');
    }
    var next = copy(draft);
    next.items[at] = { goldId: goldId, state: 'UNREVIEWED' };
    return done(next);
  }

  function progress(draft) {
    var counts = { total: draft.items.length, completed: 0, unreviewed: 0, deferredForLanguage: 0 };
    for (var i = 0; i < draft.items.length; i += 1) {
      var state = draft.items[i].state;
      if (state === 'COMPLETED') counts.completed += 1;
      else if (state === DEFER) counts.deferredForLanguage += 1;
      else counts.unreviewed += 1;
    }
    return counts;
  }

  function draftProblems(draft, binding) {
    if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) return ['the draft is not an object'];
    var problems = [];
    if (draft.kind !== DRAFT_KIND) problems.push('the file is not a ' + DRAFT_KIND);
    if (draft.draftSchema !== DRAFT_SCHEMA) problems.push('the draft schema differs');
    if (draft.canonical !== false) problems.push('a draft must declare canonical false');
    if (draft.packageHash !== binding.packageHash) problems.push('the draft is bound to a different package');
    if (draft.rubricSha256 !== binding.rubricSha256 || draft.rubricVersion !== binding.rubricVersion) {
      problems.push('the draft is bound to a different rubric');
    }
    if (!Array.isArray(draft.items) || draft.items.length !== binding.goldIds.length || draft.itemCount !== binding.goldIds.length) {
      problems.push('the draft does not hold exactly the package items');
      return problems;
    }
    for (var i = 0; i < draft.items.length; i += 1) {
      var item = draft.items[i];
      var where = 'item ' + (i + 1);
      if (item === null || typeof item !== 'object' || item.goldId !== binding.goldIds[i]) {
        problems.push(where + ' is not the package item at that position');
        continue;
      }
      var keys = Object.keys(item).sort().join(',');
      if (item.state === 'UNREVIEWED') {
        if (keys !== 'goldId,state') problems.push(where + ' carries fields an unreviewed item cannot');
      } else if (item.state === DEFER) {
        if (keys !== 'deferredBy,goldId,state' || !Array.isArray(item.deferredBy) || item.deferredBy.length === 0) {
          problems.push(where + ' is a malformed deferral');
        } else {
          for (var d = 0; d < item.deferredBy.length; d += 1) {
            if (!isValidActorKey(item.deferredBy[d])) problems.push(where + ' names a malformed deferring actor');
          }
        }
      } else if (item.state === 'COMPLETED') {
        if (keys !== 'goldId,response,state') {
          problems.push(where + ' is a malformed completion');
        } else {
          var responseKeys = item.response && typeof item.response === 'object' ? Object.keys(item.response).sort().join(',') : '';
          if (responseKeys !== 'hard_negative,reviewNote,reviewerActorKey,unit_type,verdict') {
            problems.push(where + ' carries a response with the wrong fields');
          } else {
            var rp = responseProblems(item.response);
            for (var p = 0; p < rp.length; p += 1) problems.push(where + ': ' + rp[p]);
          }
        }
      } else {
        problems.push(where + ' has an unknown workflow state');
      }
    }
    return problems;
  }

  function serialiseDraft(draft) {
    return JSON.stringify(draft, null, 2) + '\n';
  }

  function parseDraft(text, binding) {
    var draft;
    try {
      draft = JSON.parse(text);
    } catch (error) {
      return refused('DRAFT_INVALID', 'the draft file is not JSON');
    }
    var problems = draftProblems(draft, binding);
    if (problems.length > 0) return refused('DRAFT_INVALID', problems.join('; '));
    return done(draft);
  }

  function sameResponse(a, b) {
    return (
      a.reviewerActorKey === b.reviewerActorKey &&
      a.verdict === b.verdict &&
      a.unit_type === b.unit_type &&
      a.hard_negative === b.hard_negative &&
      a.reviewNote === b.reviewNote
    );
  }

  // Combine two drafts of the SAME package and rubric. A completed item is
  // carried once; two DIFFERENT completions of one item refuse the whole
  // merge, because DEV_TRAIN admits exactly one label per item.
  function mergeDrafts(local, incoming) {
    if (local.packageHash !== incoming.packageHash || local.rubricSha256 !== incoming.rubricSha256 || local.items.length !== incoming.items.length) {
      return refused('DRAFT_BINDING_DIFFERS', 'the drafts are bound to different packages or rubrics');
    }
    var next = copy(local);
    var conflicts = [];
    for (var i = 0; i < local.items.length; i += 1) {
      var a = local.items[i];
      var b = incoming.items[i];
      if (a.goldId !== b.goldId) return refused('DRAFT_BINDING_DIFFERS', 'the drafts hold different items');
      if (a.state === 'COMPLETED' && b.state === 'COMPLETED') {
        if (!sameResponse(a.response, b.response)) conflicts.push(i + 1);
      } else if (b.state === 'COMPLETED') {
        next.items[i] = copy(b);
      } else if (a.state !== 'COMPLETED' && (a.state === DEFER || b.state === DEFER)) {
        var by = (a.state === DEFER ? a.deferredBy : []).slice();
        var more = b.state === DEFER ? b.deferredBy : [];
        for (var k = 0; k < more.length; k += 1) if (!has(by, more[k])) by.push(more[k]);
        by.sort();
        next.items[i] = { goldId: a.goldId, state: DEFER, deferredBy: by };
      }
    }
    if (conflicts.length > 0) {
      return refused(
        'SECOND_LABEL_REFUSED',
        'items ' + conflicts.join(', ') + ' carry two different completed labels; DEV_TRAIN is single review'
      );
    }
    return done(next);
  }

  // The completed-response JSONL: one row per item, package order, exactly
  // the response keys, no workflow state, no page content. Only when every
  // item is COMPLETED.
  function finalExportJsonl(draft, binding) {
    var problems = draftProblems(draft, binding);
    if (problems.length > 0) return refused('DRAFT_INVALID', problems.join('; '));
    var counts = progress(draft);
    if (counts.completed !== counts.total) {
      return refused(
        'NOT_COMPLETE',
        counts.unreviewed + ' unreviewed and ' + counts.deferredForLanguage + ' language-deferred items remain'
      );
    }
    var lines = draft.items.map(function (item) {
      var row = {
        goldId: item.goldId,
        rubricVersion: draft.rubricVersion,
        rubricSha256: draft.rubricSha256,
        reviewerActorKey: item.response.reviewerActorKey,
        verdict: item.response.verdict,
        unit_type: item.response.unit_type,
        hard_negative: item.response.hard_negative,
        reviewNote: item.response.reviewNote
      };
      var ordered = {};
      for (var k = 0; k < RESPONSE_KEYS.length; k += 1) ordered[RESPONSE_KEYS[k]] = row[RESPONSE_KEYS[k]];
      return JSON.stringify(ordered);
    });
    return { ok: true, text: lines.join('\n') + '\n' };
  }

  return Object.freeze({
    DRAFT_KIND: DRAFT_KIND,
    DEFER: DEFER,
    VERDICTS: VERDICTS.slice(),
    UNIT_TYPES: UNIT_TYPES.slice(),
    isValidActorKey: isValidActorKey,
    fieldRulesAfterVerdict: fieldRulesAfterVerdict,
    storageKey: storageKey,
    createDraft: createDraft,
    completeItem: completeItem,
    deferItemForLanguage: deferItemForLanguage,
    clearDeferral: clearDeferral,
    withdrawOwnLabel: withdrawOwnLabel,
    progress: progress,
    serialiseDraft: serialiseDraft,
    parseDraft: parseDraft,
    mergeDrafts: mergeDrafts,
    finalExportJsonl: finalExportJsonl
  });
`;

/** The exact core bytes the HTML embeds and the tests execute. */
export const REVIEW_CORE_SOURCE: string =
  'var NwfReviewCore = (function () {\n' +
  "  'use strict';\n" +
  CORE_HEADER +
  '\n' +
  CORE_BODY +
  '})();\n';

export interface ReviewBinding {
  readonly packageHash: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly goldIds: readonly string[];
}

export interface ReviewChoice {
  readonly verdict?: unknown;
  readonly unit_type?: unknown;
  readonly hard_negative?: unknown;
  readonly reviewNote?: unknown;
}

export type DraftItem =
  | { readonly goldId: string; readonly state: 'UNREVIEWED' }
  | {
      readonly goldId: string;
      readonly state: typeof LANGUAGE_DEFER_STATE;
      readonly deferredBy: readonly string[];
    }
  | {
      readonly goldId: string;
      readonly state: 'COMPLETED';
      readonly response: {
        readonly reviewerActorKey: string;
        readonly verdict: string;
        readonly unit_type: string | null;
        readonly hard_negative: boolean;
        readonly reviewNote: string | null;
      };
    };

export interface ReviewDraft {
  readonly kind: typeof DRAFT_KIND;
  readonly draftSchema: typeof DRAFT_SCHEMA;
  readonly canonical: false;
  readonly packageHash: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly itemCount: number;
  readonly items: readonly DraftItem[];
}

export type CoreResult =
  | { readonly ok: true; readonly draft: ReviewDraft }
  | { readonly ok: false; readonly refusal: string; readonly message: string };

export interface ReviewCore {
  readonly DRAFT_KIND: string;
  readonly DEFER: string;
  readonly VERDICTS: readonly string[];
  readonly UNIT_TYPES: readonly string[];
  isValidActorKey(value: unknown): boolean;
  fieldRulesAfterVerdict(verdict: unknown): {
    unitTypeOpenToHuman: boolean;
    unitTypeValues: string[];
    unitTypeFixedNull: boolean;
    hardNegativeOpenToHuman: boolean;
    hardNegativeFixedFalse: boolean;
  } | null;
  storageKey(binding: ReviewBinding): string;
  createDraft(binding: ReviewBinding): CoreResult;
  completeItem(
    draft: ReviewDraft,
    goldId: string,
    actorKey: unknown,
    choice: ReviewChoice | null,
  ): CoreResult;
  deferItemForLanguage(draft: ReviewDraft, goldId: string, actorKey: unknown): CoreResult;
  clearDeferral(draft: ReviewDraft, goldId: string): CoreResult;
  withdrawOwnLabel(draft: ReviewDraft, goldId: string, actorKey: unknown): CoreResult;
  progress(draft: ReviewDraft): {
    total: number;
    completed: number;
    unreviewed: number;
    deferredForLanguage: number;
  };
  serialiseDraft(draft: ReviewDraft): string;
  parseDraft(text: string, binding: ReviewBinding): CoreResult;
  mergeDrafts(local: ReviewDraft, incoming: ReviewDraft): CoreResult;
  finalExportJsonl(
    draft: ReviewDraft,
    binding: ReviewBinding,
  ):
    | { readonly ok: true; readonly text: string }
    | { readonly ok: false; readonly refusal: string; readonly message: string };
}

/**
 * Executes core bytes in a bare context - no require, no process, no fetch,
 * no timers - and returns the core. Tests pass the bytes they extracted from
 * the committed HTML, so they prove what ships.
 */
export function loadReviewCore(source: string = REVIEW_CORE_SOURCE): ReviewCore {
  const context = createContext(Object.create(null) as object);
  runInContext(source + '\nthis.NwfReviewCore = NwfReviewCore;', context, { timeout: 5000 });
  return (context as { NwfReviewCore: ReviewCore }).NwfReviewCore;
}
