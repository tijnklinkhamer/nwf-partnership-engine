/**
 * REL L2 / U1 - THE HIGHER-EDUCATION SIGNAL: a FLAG, never a verdict.
 *
 * Source discovery exists to find organisations OUTSIDE the university and
 * Erasmus lists. A nominated URL that looks like a higher-education
 * institution is therefore worth flagging - so an operator can set it aside -
 * but the flag decides nothing: it does not drop the nomination, it does not
 * say the organisation IS an institution, and a student association hosted on
 * a university domain legitimately carries it.
 *
 * Two explainable, reviewable rules, versioned together:
 *   1. ACADEMIC HOST - a hostname label sequence ending in an academic
 *      second-level label (`ac.<tld>`, `edu.<tld>`) or the `edu` TLD;
 *   2. HIGHER-EDUCATION TERM in the title - a short fixed list of words that
 *      name an institution type, matched on token boundaries.
 *
 * Country-blind: the rules are about the HOST and the TEXT, never about a
 * geography.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */

export const HEI_SIGNAL_RULE_VERSION = 'source-discovery-hei-signal-v1';

const ACADEMIC_SECOND_LEVEL_LABELS: ReadonlySet<string> = new Set(['ac', 'edu']);

/** Lower-case, token-bounded terms (Latin scripts) and literal CJK terms. */
const LATIN_HEI_TERMS: readonly string[] = [
  'university',
  'universidad',
  'universiteit',
  'universität',
  'université',
  'hogeschool',
  'polytechnic',
  'politécnico',
  'instituto tecnológico',
];
const CJK_HEI_TERMS: readonly string[] = ['大学', '大學', '短期大学', '高等専門学校'];

export type HeiSignalReason = 'ACADEMIC_HOST' | 'HEI_TERM_IN_TITLE';

export interface HeiSignal {
  readonly flag: boolean;
  readonly reasons: readonly HeiSignalReason[];
  readonly ruleVersion: typeof HEI_SIGNAL_RULE_VERSION;
}

function isAcademicHost(hostname: string): boolean {
  const labels = hostname.toLowerCase().split('.');
  if (labels[labels.length - 1] === 'edu') return true;
  // `x.ac.jp`, `x.edu.mx`: the label immediately left of the TLD.
  return labels.length >= 3 && ACADEMIC_SECOND_LEVEL_LABELS.has(labels[labels.length - 2]!);
}

function titleNamesHei(title: string | null): boolean {
  if (title === null) return false;
  const lower = title.toLowerCase();
  if (CJK_HEI_TERMS.some((t) => lower.includes(t))) return true;
  return LATIN_HEI_TERMS.some((term) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${term}([^\\p{L}\\p{N}]|$)`, 'u').test(lower),
  );
}

export function heiSignalOf(hostname: string, title: string | null): HeiSignal {
  const reasons: HeiSignalReason[] = [];
  if (isAcademicHost(hostname)) reasons.push('ACADEMIC_HOST');
  if (titleNamesHei(title)) reasons.push('HEI_TERM_IN_TITLE');
  return { flag: reasons.length > 0, reasons, ruleVersion: HEI_SIGNAL_RULE_VERSION };
}
