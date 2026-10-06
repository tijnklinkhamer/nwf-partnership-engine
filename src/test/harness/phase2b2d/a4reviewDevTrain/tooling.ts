/**
 * PHASE 2B-2D — A4 R51: THE OFFLINE HUMAN REVIEW TOOL.
 *
 * Renders ONE self-contained HTML file for HUMAN reviewers. It classifies
 * nothing and proposes nothing. It:
 *
 *   - embeds the EXACT R50 package text and the EXACT R49 rubric text, each as
 *     one JSON string, and re-checks both SHA-256 values in the browser before
 *     enabling review;
 *   - renders every rubric rule mechanically from the embedded rubric data -
 *     no paraphrase, no second rubric;
 *   - shows each item's frozen evidence as plain text: URLs are selectable
 *     text, never links, so nothing navigates to a live page;
 *   - opens with NO choice preselected, fixes matrix-forced values only after
 *     the human picks a verdict, and records a language deferral as workflow
 *     state, never as NEEDS_REVIEW;
 *   - keeps a NON-CANONICAL local draft (localStorage, keyed by package hash +
 *     rubric hash), exports / imports drafts so another human can continue,
 *     and offers the completed-response JSONL only when all 222 items are
 *     COMPLETED.
 *
 * Offline by construction: no remote script, stylesheet, font, image, frame,
 * form, fetch, XHR, socket or beacon, and a Content-Security-Policy that
 * forbids every connection. `translate="no"` asks the browser not to offer
 * machine translation.
 *
 * The four <script> elements are `prettier-ignore`d so their bytes are
 * exactly what this module produced; the tests extract and execute the core.
 * The UI body is `String.raw`: it must contain no backtick and no `${`.
 */
import { format, resolveConfig } from 'prettier';
import { requireR51PackageBinding, type R51PackageBinding } from './authority.js';
import { refuseR51 } from './refusal.js';
import { REVIEW_CORE_SOURCE } from './session.js';
import { COMPLETED_RESPONSE_FILE_NAME, R51_ARTIFACT_PATHS, R51_SPLIT } from './types.js';

export const TOOL_SCRIPT_IDS = Object.freeze({
  package: 'nwf-embedded-package',
  rubric: 'nwf-embedded-rubric',
  binding: 'nwf-binding',
  core: 'nwf-review-core',
  ui: 'nwf-review-ui',
});

/** The rubric sections the reviewer can open, rendered verbatim from data. */
export const RUBRIC_SECTIONS_SHOWN = Object.freeze([
  'evidenceBoundary',
  'decisionOrder',
  'verdict',
  'unitType',
  'hardNegative',
  'labelValidityMatrix',
] as const);

export const CONTENT_SECURITY_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'";

/** A JSON value safe inside a <script> element: every `<` is escaped. */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const STYLE = `
:root {
  --bg: #fbfbfa; --fg: #1c1c1a; --muted: #62625d; --line: #d9d9d4; --panel: #ffffff;
  --accent: #2b5fa8; --done: #2e7d4f; --defer: #9a6400; --bad: #b3261e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161615; --fg: #ececea; --muted: #a3a39d; --line: #3a3a37; --panel: #1f1f1d;
    --accent: #8fb4ea; --done: #7cc79a; --defer: #e0b25c; --bad: #f2a29b;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
header, footer { padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
footer { border-top: 1px solid var(--line); border-bottom: none; }
h1 { font-size: 18px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 16px 0 8px; }
h3 { font-size: 14px; margin: 12px 0 4px; }
code, .mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; }
.muted { color: var(--muted); }
.bad { color: var(--bad); font-weight: 600; }
.ok { color: var(--done); font-weight: 600; }
.rules { border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; background: var(--panel); }
.layout { display: grid; grid-template-columns: 300px 1fr; min-height: 70vh; }
@media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
nav { border-right: 1px solid var(--line); padding: 8px; overflow: auto; max-height: 85vh; }
nav button { display: block; width: 100%; text-align: left; border: 0; background: none; color: var(--fg); padding: 3px 6px; cursor: pointer; font: 13px ui-monospace, Menlo, monospace; }
nav button.current { outline: 2px solid var(--accent); }
.state-COMPLETED { color: var(--done); }
.state-DEFERRED_FOR_LANGUAGE_COMPETENT_HUMAN { color: var(--defer); }
main { padding: 12px 16px; min-width: 0; }
.evidence { border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; margin: 8px 0; background: var(--panel); }
.maintext { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 55vh; overflow: auto; border: 1px solid var(--line); padding: 8px; background: var(--panel); }
.url { user-select: all; overflow-wrap: anywhere; }
fieldset { border: 1px solid var(--line); border-radius: 6px; margin: 8px 0; }
label { display: block; margin: 2px 0; }
textarea, input[type=text] { width: 100%; font: inherit; background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: 4px; padding: 4px 6px; }
button.action { font: inherit; padding: 4px 10px; margin: 4px 6px 4px 0; cursor: pointer; }
dl.rubric { margin: 0 0 0 8px; }
dl.rubric dt { font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: var(--muted); margin-top: 6px; }
dl.rubric dd { margin: 0 0 0 16px; }
pre.rubric-raw { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
`;

const UI_BODY = String.raw`
(function () {
  'use strict';
  var core = NwfReviewCore;
  function el(id) {
    return document.getElementById(id);
  }
  function make(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }
  function embedded(id) {
    return JSON.parse(el(id).textContent);
  }

  var binding = embedded('nwf-binding');
  var packageText = embedded('nwf-embedded-package').packageJsonl;
  var rubricText = embedded('nwf-embedded-rubric').rubricJson;
  var records = packageText.slice(0, -1).split('\n').map(function (line) {
    return JSON.parse(line);
  });
  var rubric = JSON.parse(rubricText);
  var reviewBinding = {
    packageHash: binding.packageHash,
    rubricVersion: binding.rubricVersion,
    rubricSha256: binding.rubricSha256,
    goldIds: records.map(function (r) {
      return r.goldId;
    })
  };
  var storageKey = core.storageKey(reviewBinding);
  var state = { draft: null, actorKey: null, index: 0, filter: 'ALL', integrity: 'PENDING' };

  function message(text, isBad) {
    var box = el('messages');
    clear(box);
    box.appendChild(make('p', text, isBad ? 'bad' : 'ok'));
  }

  // ----- integrity of the embedded bytes ---------------------------------
  function hex(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return out;
  }
  function verifyIntegrity(done) {
    var structural =
      records.length === binding.itemCount &&
      rubric.rubricVersion === binding.rubricVersion &&
      records.every(function (r) {
        return r.rubricSha256 === binding.rubricSha256 && r.rubricVersion === binding.rubricVersion;
      });
    if (!structural) {
      state.integrity = 'FAILED';
      return done();
    }
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder === 'undefined') {
      state.integrity = 'UNVERIFIABLE_IN_THIS_BROWSER';
      return done();
    }
    var enc = new TextEncoder();
    Promise.all([
      window.crypto.subtle.digest('SHA-256', enc.encode(packageText)),
      window.crypto.subtle.digest('SHA-256', enc.encode(rubricText))
    ]).then(
      function (digests) {
        var ok = hex(digests[0]) === binding.packageFileSha256 && hex(digests[1]) === binding.rubricSha256;
        state.integrity = ok ? 'VERIFIED' : 'FAILED';
        done();
      },
      function () {
        state.integrity = 'UNVERIFIABLE_IN_THIS_BROWSER';
        done();
      }
    );
  }

  // ----- local draft -----------------------------------------------------
  function save() {
    try {
      window.localStorage.setItem(storageKey, core.serialiseDraft(state.draft));
    } catch (error) {
      message('The local draft could not be saved in this browser. Export a draft file to keep your work.', true);
    }
  }
  function loadDraft() {
    var stored = null;
    try {
      stored = window.localStorage.getItem(storageKey);
    } catch (error) {
      stored = null;
    }
    if (stored) {
      var parsed = core.parseDraft(stored, reviewBinding);
      if (parsed.ok) return parsed.draft;
      try {
        window.localStorage.setItem(storageKey + ':unreadable', stored);
      } catch (error) {
        // nothing further can be kept
      }
      message('The stored local draft was unreadable and was set aside: ' + parsed.message, true);
    }
    return core.createDraft(reviewBinding).draft;
  }

  // ----- rubric (rendered mechanically from the embedded frozen rubric) --
  function renderValue(value) {
    if (Array.isArray(value)) {
      var list = make('ul');
      value.forEach(function (entry) {
        var li = make('li');
        li.appendChild(renderValue(entry));
        list.appendChild(li);
      });
      return list;
    }
    if (value !== null && typeof value === 'object') {
      var dl = make('dl', null, 'rubric');
      Object.keys(value).forEach(function (key) {
        dl.appendChild(make('dt', key));
        var dd = make('dd');
        dd.appendChild(renderValue(value[key]));
        dl.appendChild(dd);
      });
      return dl;
    }
    return make('span', typeof value === 'string' ? value : JSON.stringify(value));
  }
  function renderRubric() {
    var box = el('rubric-sections');
    clear(box);
    binding.rubricSectionsShown.forEach(function (key) {
      var details = make('details');
      details.appendChild(make('summary', key));
      details.appendChild(renderValue(rubric[key]));
      box.appendChild(details);
    });
    var raw = make('details');
    raw.appendChild(make('summary', 'the complete frozen rubric file, verbatim'));
    raw.appendChild(make('pre', rubricText, 'rubric-raw'));
    box.appendChild(raw);
  }

  // ----- progress and navigation ----------------------------------------
  function stateOf(i) {
    return state.draft.items[i].state;
  }
  function renderProgress() {
    var p = core.progress(state.draft);
    el('progress').textContent =
      'completed ' + p.completed + ' / ' + p.total +
      ' · unreviewed ' + p.unreviewed +
      ' · deferred for a language-competent human ' + p.deferredForLanguage;
    el('final-export').disabled = !(p.completed === p.total && state.integrity !== 'FAILED');
  }
  function renderNav() {
    var nav = el('item-list');
    clear(nav);
    records.forEach(function (record, i) {
      var s = stateOf(i);
      if (state.filter !== 'ALL' && state.filter !== s) return;
      var mark = s === 'COMPLETED' ? '[x] ' : s === core.DEFER ? '[~] ' : '[ ] ';
      var button = make('button', mark + (i + 1) + '  ' + record.goldId, 'state-' + s + (i === state.index ? ' current' : ''));
      button.type = 'button';
      button.addEventListener('click', function () {
        state.index = i;
        renderAll();
      });
      nav.appendChild(button);
    });
  }

  // ----- one item --------------------------------------------------------
  function row(parent, label, value, className) {
    var p = make('p');
    p.appendChild(make('strong', label + ': '));
    p.appendChild(make('span', value, className));
    parent.appendChild(p);
  }
  function renderEvidence(record, box) {
    record.sourcePresentations.forEach(function (presentation, k) {
      var section = make('section', null, 'evidence');
      section.appendChild(make('h3', 'Source presentation ' + (k + 1) + ' of ' + record.sourcePresentations.length));
      row(section, 'Requested URL (text only, not a link; do not open it)', presentation.requestedUrl, 'url mono');
      row(section, 'Title', presentation.title === null ? '(none captured)' : presentation.title);
      row(section, 'Declared language', presentation.declaredLang === null ? '(none declared)' : presentation.declaredLang);
      row(section, 'Main text truncated at capture', presentation.mainTextTruncated ? 'YES' : 'no');
      row(section, 'Extraction', presentation.extractionMethod + ' / ' + presentation.extractionRuleVersion, 'mono');
      section.appendChild(make('strong', 'Headings:'));
      if (presentation.headings.length === 0) {
        section.appendChild(make('p', '(none captured)', 'muted'));
      } else {
        var list = make('ul');
        presentation.headings.forEach(function (heading) {
          list.appendChild(make('li', 'h' + heading.level + ': ' + heading.text));
        });
        section.appendChild(list);
      }
      box.appendChild(section);
    });
    box.appendChild(make('h3', 'Main text'));
    if (record.mainText.length === 0) {
      box.appendChild(
        make('p', 'The frozen main text of this item is empty. Apply the same rubric to the frozen title, headings and URL above.', 'muted')
      );
    } else {
      box.appendChild(make('div', record.mainText, 'maintext'));
    }
  }

  function radio(name, value, text) {
    var label = make('label');
    var input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = false;
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + text));
    return label;
  }
  function chosen(name) {
    var inputs = document.getElementsByName(name);
    for (var i = 0; i < inputs.length; i += 1) if (inputs[i].checked) return inputs[i].value;
    return null;
  }

  function renderForm(record, item, box) {
    if (state.actorKey === null) {
      box.appendChild(make('p', 'Begin a session with your opaque actor key to review.', 'muted'));
      return;
    }
    if (state.integrity === 'FAILED') {
      box.appendChild(make('p', 'Review is disabled: the embedded package or rubric does not match its bound hash.', 'bad'));
      return;
    }
    if (item.state === 'COMPLETED') {
      var r = item.response;
      var done = make('div', null, 'rules');
      done.appendChild(make('p', 'COMPLETED by actor ' + r.reviewerActorKey, 'ok'));
      row(done, 'verdict', r.verdict, 'mono');
      row(done, 'unit_type', r.unit_type === null ? 'null' : r.unit_type, 'mono');
      row(done, 'hard_negative', String(r.hard_negative), 'mono');
      row(done, 'reviewNote', r.reviewNote === null ? 'null' : r.reviewNote);
      if (r.reviewerActorKey === state.actorKey) {
        var withdraw = make('button', 'Withdraw my label to correct it', 'action');
        withdraw.type = 'button';
        withdraw.addEventListener('click', function () {
          apply(core.withdrawOwnLabel(state.draft, record.goldId, state.actorKey), 'Your label was withdrawn; the item is unreviewed again.');
        });
        done.appendChild(withdraw);
      } else {
        done.appendChild(make('p', 'Another actor completed this item. DEV_TRAIN is single review: no second label may be added.', 'muted'));
      }
      box.appendChild(done);
      return;
    }
    if (item.state === core.DEFER) {
      box.appendChild(
        make('p', 'Deferred for a language-competent human by: ' + item.deferredBy.join(', ') + '. This is workflow, not a label. If you can read this page directly, you may review it.', 'muted')
      );
    }
    var form = make('div');
    var verdictSet = make('fieldset');
    verdictSet.appendChild(make('legend', '1. verdict (your decision)'));
    core.VERDICTS.forEach(function (v) {
      verdictSet.appendChild(radio('verdict', v, v));
    });
    form.appendChild(verdictSet);
    var unitBox = make('div');
    var hardBox = make('div');
    form.appendChild(unitBox);
    form.appendChild(hardBox);
    var note = make('textarea');
    note.id = 'review-note';
    note.rows = 3;
    note.maxLength = binding.reviewNoteMaxChars;
    var noteLabel = make('label', 'reviewNote (optional)');
    form.appendChild(noteLabel);
    form.appendChild(note);

    verdictSet.addEventListener('change', function () {
      var rules = core.fieldRulesAfterVerdict(chosen('verdict'));
      clear(unitBox);
      clear(hardBox);
      if (rules === null) return;
      if (rules.unitTypeOpenToHuman) {
        var unitSet = make('fieldset');
        unitSet.appendChild(make('legend', '2. unit_type (your decision)'));
        rules.unitTypeValues.forEach(function (u) {
          unitSet.appendChild(radio('unit_type', u, u));
        });
        unitBox.appendChild(unitSet);
      } else {
        unitBox.appendChild(make('p', 'unit_type: null (fixed by the rubric validity matrix for this verdict)', 'muted mono'));
      }
      if (rules.hardNegativeOpenToHuman) {
        var hardSet = make('fieldset');
        hardSet.appendChild(make('legend', '3. hard_negative (your decision)'));
        hardSet.appendChild(radio('hard_negative', 'true', 'true'));
        hardSet.appendChild(radio('hard_negative', 'false', 'false'));
        hardBox.appendChild(hardSet);
      } else {
        hardBox.appendChild(make('p', 'hard_negative: false (fixed by the rubric validity matrix for this verdict)', 'muted mono'));
      }
    });

    var saveButton = make('button', 'Save my label for this item', 'action');
    saveButton.type = 'button';
    saveButton.addEventListener('click', function () {
      var verdict = chosen('verdict');
      var rules = core.fieldRulesAfterVerdict(verdict);
      if (rules === null) return message('Choose a verdict first.', true);
      var hard = rules.hardNegativeFixedFalse ? false : chosen('hard_negative');
      var text = note.value;
      apply(
        core.completeItem(state.draft, record.goldId, state.actorKey, {
          verdict: verdict,
          unit_type: rules.unitTypeFixedNull ? null : chosen('unit_type'),
          hard_negative: hard === 'true' ? true : hard === 'false' ? false : hard,
          reviewNote: text.trim().length === 0 ? null : text
        }),
        'Saved to the local draft.'
      );
    });
    form.appendChild(saveButton);

    var deferMine = item.state === core.DEFER && item.deferredBy.indexOf(state.actorKey) !== -1;
    if (!deferMine) {
      var deferButton = make('button', 'I cannot read this language well enough: leave it unlabelled for a language-competent human', 'action');
      deferButton.type = 'button';
      deferButton.addEventListener('click', function () {
        apply(core.deferItemForLanguage(state.draft, record.goldId, state.actorKey), 'Left unlabelled for a language-competent human. This is not NEEDS_REVIEW.');
      });
      form.appendChild(deferButton);
    }
    if (item.state === core.DEFER) {
      var clearButton = make('button', 'Clear the language deferral', 'action');
      clearButton.type = 'button';
      clearButton.addEventListener('click', function () {
        apply(core.clearDeferral(state.draft, record.goldId), 'Deferral cleared; the item is unreviewed.');
      });
      form.appendChild(clearButton);
    }
    box.appendChild(form);
  }

  function renderItem() {
    var box = el('item');
    clear(box);
    var record = records[state.index];
    var item = state.draft.items[state.index];
    box.appendChild(make('h2', 'Item ' + (state.index + 1) + ' of ' + records.length));
    row(box, 'goldId', record.goldId, 'mono');
    row(box, 'workflow state', item.state, 'mono state-' + item.state);
    renderEvidence(record, box);
    box.appendChild(make('h2', 'Your review'));
    renderForm(record, item, box);
  }

  function renderAll() {
    renderProgress();
    renderNav();
    renderItem();
  }

  function apply(result, okText) {
    if (!result.ok) return message('Refused (' + result.refusal + '): ' + result.message, true);
    state.draft = result.draft;
    save();
    message(okText, false);
    renderAll();
  }

  // ----- files (local only: Blob downloads and file inputs) ---------------
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var link = document.createElement('a');
    link.download = name;
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 1000);
  }

  function wire() {
    el('begin').addEventListener('click', function () {
      var key = el('actor-key').value;
      if (!core.isValidActorKey(key)) {
        return message('An actor key is 3-64 characters of a-z, 0-9, "_" or "-", starting with a letter or digit. Never a name, email or handle.', true);
      }
      state.actorKey = key;
      el('actor-current').textContent = key;
      message('Session started as ' + key + '.', false);
      renderAll();
    });
    el('filter').addEventListener('change', function () {
      state.filter = el('filter').value;
      renderNav();
    });
    el('prev').addEventListener('click', function () {
      if (state.index > 0) state.index -= 1;
      renderAll();
    });
    el('next').addEventListener('click', function () {
      if (state.index < records.length - 1) state.index += 1;
      renderAll();
    });
    el('next-open').addEventListener('click', function () {
      for (var step = 1; step <= records.length; step += 1) {
        var i = (state.index + step) % records.length;
        if (stateOf(i) !== 'COMPLETED') {
          state.index = i;
          return renderAll();
        }
      }
      message('Every item is completed.', false);
    });
    el('export-draft').addEventListener('click', function () {
      download(binding.draftFileName, core.serialiseDraft(state.draft), 'application/json');
    });
    el('import-draft').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed = core.parseDraft(String(reader.result), reviewBinding);
        if (!parsed.ok) return message('Draft refused (' + parsed.refusal + '): ' + parsed.message, true);
        apply(core.mergeDrafts(state.draft, parsed.draft), 'Draft merged. No completed item was duplicated.');
      };
      reader.readAsText(file);
      event.target.value = '';
    });
    el('final-export').addEventListener('click', function () {
      var result = core.finalExportJsonl(state.draft, reviewBinding);
      if (!result.ok) return message('Final export refused (' + result.refusal + '): ' + result.message, true);
      download(binding.completedResponseFileName, result.text, 'application/x-ndjson');
    });
  }

  el('bound-package').textContent = binding.packageHash;
  el('bound-rubric').textContent = binding.rubricSha256;
  state.draft = loadDraft();
  renderRubric();
  wire();
  renderAll();
  verifyIntegrity(function () {
    var box = el('integrity');
    box.textContent =
      state.integrity === 'VERIFIED'
        ? 'embedded package and rubric bytes VERIFIED against their bound SHA-256'
        : state.integrity === 'FAILED'
          ? 'INTEGRITY FAILURE: do not review with this file'
          : 'this browser cannot recompute SHA-256 here; the repository tests verify the embedded bytes';
    box.className = state.integrity === 'FAILED' ? 'bad' : state.integrity === 'VERIFIED' ? 'ok' : 'muted';
    renderAll();
  });
})();
`;

const BODY = `
<header>
  <h1>DEV_TRAIN human single review (A4, offline)</h1>
  <p class="muted">Package <code id="bound-package"></code> · rubric <code id="bound-rubric"></code></p>
  <p id="integrity" class="muted">checking embedded bytes…</p>
  <p id="progress"></p>
</header>
<section class="rules" aria-label="Review rules">
  <strong>Rules for every reviewer (owner decisions; read before starting):</strong>
  <ul>
    <li>Each item receives exactly ONE human label. You may review some items and another human others; never label an item someone else completed.</li>
    <li>Use ONLY the frozen evidence shown here and your own language knowledge. Do NOT use ChatGPT, Claude, Gemini or any model, machine translation, browser auto-translation, Google Translate, search, the live website or any historical label.</li>
    <li>If you cannot read an item's language well enough to apply the rubric directly, do NOT label it and do NOT choose NEEDS_REVIEW: use the language-deferral button so a language-competent human can complete it.</li>
    <li>NEEDS_REVIEW keeps its rubric meaning only: the frozen evidence itself is insufficient, conflicting or ambiguous.</li>
    <li>Your local draft and draft files are NOT canonical. Only the final export, available when every item is completed, is the handoff.</li>
  </ul>
  <p>
    <label for="actor-key">Opaque actor key (3-64 of a-z 0-9 _ -; never a name, email or handle)</label>
    <input id="actor-key" type="text" autocomplete="off" spellcheck="false" />
    <button id="begin" class="action" type="button">Begin session</button>
    <span class="muted">current actor: <code id="actor-current">none</code></span>
  </p>
  <details>
    <summary>Frozen rubric (rendered from the embedded rubric data)</summary>
    <div id="rubric-sections"></div>
  </details>
</section>
<div id="messages" aria-live="polite"></div>
<div class="layout">
  <nav aria-label="Items">
    <label for="filter">Show</label>
    <select id="filter">
      <option value="ALL">all items</option>
      <option value="UNREVIEWED">unreviewed</option>
      <option value="DEFERRED_FOR_LANGUAGE_COMPETENT_HUMAN">deferred for language</option>
      <option value="COMPLETED">completed</option>
    </select>
    <div id="item-list"></div>
  </nav>
  <main>
    <button id="prev" class="action" type="button">Previous</button>
    <button id="next" class="action" type="button">Next</button>
    <button id="next-open" class="action" type="button">Next item not yet completed</button>
    <div id="item"></div>
  </main>
</div>
<footer>
  <button id="export-draft" class="action" type="button">Export draft (non-canonical)</button>
  <label class="action">Import and merge a draft <input id="import-draft" type="file" accept=".json,application/json" /></label>
  <button id="final-export" class="action" type="button" disabled>Final export (all items completed)</button>
</footer>
`;

export interface RenderReviewToolInput {
  readonly binding: R51PackageBinding;
}

/** The exact HTML bytes of the offline tool, formatted by the repo's prettier. */
export async function renderReviewToolHtml(
  input: RenderReviewToolInput,
  options: { readonly repoRoot: string },
): Promise<string> {
  const binding = requireR51PackageBinding(input.binding);
  return renderToolFromParts(
    {
      packageText: binding.packageText,
      packageHash: binding.packageHash,
      packageFileSha256: binding.packageFileSha256,
      rubricText: binding.rubricText,
      rubricVersion: binding.rubricVersion,
      rubricSha256: binding.rubricSha256,
      itemCount: binding.goldIds.length,
    },
    options,
  );
}

/**
 * The renderer behind `renderReviewToolHtml`. Exported so a test can render a
 * SYNTHETIC tool over invented items and drive it; it writes nothing and its
 * output is never an R51 artifact.
 */
export async function renderToolFromParts(
  parts: {
    readonly packageText: string;
    readonly packageHash: string;
    readonly packageFileSha256: string;
    readonly rubricText: string;
    readonly rubricVersion: string;
    readonly rubricSha256: string;
    readonly itemCount: number;
  },
  options: { readonly repoRoot: string },
): Promise<string> {
  if (UI_BODY.includes('`') || UI_BODY.includes('$' + '{')) {
    refuseR51('R51_TOOL_INPUT_INVALID', 'the UI body contains a template-literal character');
  }
  const bindingBlock = {
    split: R51_SPLIT,
    packageHash: parts.packageHash,
    packageFileSha256: parts.packageFileSha256,
    rubricVersion: parts.rubricVersion,
    rubricSha256: parts.rubricSha256,
    itemCount: parts.itemCount,
    rubricSectionsShown: [...RUBRIC_SECTIONS_SHOWN],
    reviewNoteMaxChars: 2000,
    completedResponseFileName: COMPLETED_RESPONSE_FILE_NAME,
    draftFileName: 'PHASE_2B_2D_A4_DEV_TRAIN_SINGLE_REVIEW_DRAFT_NON_CANONICAL.json',
  };
  const script = (id: string, body: string, json: boolean): string =>
    `<!-- prettier-ignore -->\n<script${json ? ' type="application/json"' : ''} id="${id}">${body}</script>\n`;
  const html =
    '<!doctype html>\n' +
    '<html lang="en" translate="no" class="notranslate">\n<head>\n' +
    '<meta charset="utf-8" />\n' +
    `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />\n` +
    '<meta name="google" content="notranslate" />\n' +
    '<meta name="robots" content="noindex, nofollow" />\n' +
    '<meta name="referrer" content="no-referrer" />\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    '<title>DEV_TRAIN single review</title>\n' +
    `<style>${STYLE}</style>\n` +
    '</head>\n<body>\n' +
    BODY +
    script(TOOL_SCRIPT_IDS.package, scriptSafeJson({ packageJsonl: parts.packageText }), true) +
    script(TOOL_SCRIPT_IDS.rubric, scriptSafeJson({ rubricJson: parts.rubricText }), true) +
    script(TOOL_SCRIPT_IDS.binding, scriptSafeJson(bindingBlock), true) +
    script(TOOL_SCRIPT_IDS.core, '\n' + REVIEW_CORE_SOURCE, false) +
    script(TOOL_SCRIPT_IDS.ui, UI_BODY, false) +
    '</body>\n</html>\n';
  const config = await resolveConfig(`${options.repoRoot}/${R51_ARTIFACT_PATHS.reviewTool}`);
  return format(html, {
    ...(config ?? {}),
    filepath: R51_ARTIFACT_PATHS.reviewTool,
    parser: 'html',
  });
}

/** The text content of one embedded <script id=...> of a rendered tool. */
export function extractToolScript(html: string, id: string): string {
  const open = `<script`;
  const marker = ` id="${id}">`;
  const start = html.indexOf(marker);
  if (start === -1 || html.lastIndexOf(open, start) === -1) {
    refuseR51('R51_TOOL_INPUT_INVALID', `the tool has no script ${id}`);
  }
  const bodyStart = start + marker.length;
  const end = html.indexOf('</script>', bodyStart);
  if (end === -1) refuseR51('R51_TOOL_INPUT_INVALID', `script ${id} is not closed`);
  return html.slice(bodyStart, end);
}

/** A JSON authority / census record exactly as committed: the repo's prettier. */
export async function renderJsonArtifact(
  record: Record<string, unknown>,
  path: string,
  options: { readonly repoRoot: string },
): Promise<string> {
  const config = await resolveConfig(`${options.repoRoot}/${path}`);
  return format(JSON.stringify(record), { ...(config ?? {}), filepath: path, parser: 'json' });
}
