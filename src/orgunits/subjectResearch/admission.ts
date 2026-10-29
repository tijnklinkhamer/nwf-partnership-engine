/**
 * GLOBAL R6 - THE SUBJECT RESEARCH-ADMISSION CAPABILITY.
 *
 * Admitting a Discovery Subject to research is an OWNER policy that does not
 * exist yet (ADR 0019 s7 and s13, ADR 0020 `SUBJECT_RESEARCH_ADMISSION_POLICY_ABSENT`,
 * ADR 0023 s11). So the admission arrives the way a robots verdict does: as a
 * sealed capability a caller cannot manufacture, verified by BRAND, with NO
 * production constructor at all.
 *
 * The one constructor is a vitest-only SYNTHETIC REHEARSAL seam. It throws
 * outside vitest, and even inside vitest it never makes a plan executable:
 * it lets the planner show what a subject root WOULD be under an admission
 * policy, while every structural execution blocker (no research read of the
 * subject tables, no subject root in the fetch-evidence schema, no wired
 * protection evaluator) stays on the plan as a literal.
 *
 * PURE: no socket, no database, no file, no clock. The only environment read
 * is the vitest marker the existing test seams already use.
 */

export const SUBJECT_RESEARCH_ADMISSION_SCOPES = ['SYNTHETIC_REHEARSAL_ONLY'] as const;
export type SubjectResearchAdmissionScope = (typeof SUBJECT_RESEARCH_ADMISSION_SCOPES)[number];

export class SubjectResearchAdmission {
  /** The runtime brand: unforgeable by a literal, a clone, a cast or reflection. */
  readonly #sealed = true;

  readonly scope: SubjectResearchAdmissionScope;

  private constructor(scope: SubjectResearchAdmissionScope) {
    this.scope = scope;
  }

  /** True only for a value this class actually constructed. */
  static isAdmission(value: unknown): value is SubjectResearchAdmission {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /**
   * A TEST SEAM. Unavailable outside vitest. It admits a subject root to a
   * synthetic rehearsal only; it can never make a plan executable.
   */
  static forVitestSyntheticRehearsal(): SubjectResearchAdmission {
    if (process.env['VITEST'] !== 'true') {
      throw new Error(
        'SubjectResearchAdmission.forVitestSyntheticRehearsal is a TEST SEAM and is unavailable ' +
          'outside vitest. Subject research admission needs an OWNER-approved policy that does ' +
          'not exist yet (ADR 0019 s13, ADR 0023 s11).',
      );
    }
    return new SubjectResearchAdmission('SYNTHETIC_REHEARSAL_ONLY');
  }
}
