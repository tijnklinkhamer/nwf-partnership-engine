/**
 * TRACK B, B2.1 - THE PROTECTED STRUCTURAL-PARENT CONSTRAINT, AS A PURE
 * EVALUATOR.
 *
 * Answers ONE question about one subject: does its STRUCTURAL parentage
 * (PART_OF, followed transitively) reach an ECHE source row the CALLER says is
 * protected? Three answers, in precedence order:
 *
 *   RESEARCH_BLOCKING                - a chain of CONFIRMED PART_OF reviews
 *                                      reaches a protected row. Future research
 *                                      on this subject must be refused.
 *   UNRESOLVED                       - a protected row is reachable only through
 *                                      an unreviewed or disputed PART_OF; or the
 *                                      structure is cyclic; or a subject on the
 *                                      chain is of a kind that must have a parent
 *                                      and none is recorded; or the input is
 *                                      malformed. Unknown is never permission.
 *   NO_KNOWN_STRUCTURAL_PARENT_BLOCK - none of the above. Not permission either.
 *
 * NONE OF THESE IS RESEARCH AUTHORITY. `grantsResearchAuthority` is the
 * literal `false` on every result, by type. B2.1 creates no research
 * permission; whatever later consumes this constraint adds a refusal, never an
 * admission.
 *
 * NOT COHORT MEMBERSHIP. A blocked subject is blocked because of its PARENT;
 * it is not thereby a member of any historical evaluation cohort, and this
 * module neither reads nor writes cohort state. The protected keys are an
 * argument - B2.1 never loads the B3.0 registry, and the reasons here are
 * deliberately distinct from B3.0's refusal vocabulary.
 *
 * ONLY PART_OF IS FOLLOWED. AFFILIATED_WITH, LOCAL_CHAPTER_OF, OPERATES_AT,
 * HOSTED_BY and SERVES_AUDIENCE_AT a protected institution do not make a
 * subject part of it. A REJECTED PART_OF is not followed. PURE.
 */
import {
  adjacency,
  kindEvidenceOf,
  reaches,
  validateIdentityGraph,
  type RelationshipAssessment,
} from './validate.js';
import {
  DISCOVERY_IDENTITY_RULE_VERSION,
  PARENT_IMPLYING_KINDS,
  STRUCTURAL_PREDICATE,
  type IdentityGraphInput,
} from './vocabulary.js';

export type StructuralParentReason =
  | 'PROTECTED_STRUCTURAL_PARENT'
  | 'PROTECTED_STRUCTURAL_PARENT_UNCONFIRMED'
  | 'STRUCTURAL_CYCLE'
  | 'STRUCTURAL_PARENT_UNKNOWN'
  | 'SUBJECT_UNKNOWN'
  | 'INPUT_STRUCTURALLY_INVALID'
  | 'NO_PROTECTED_STRUCTURAL_PARENT_KNOWN';

export interface StructuralParentConstraint {
  readonly ruleVersion: typeof DISCOVERY_IDENTITY_RULE_VERSION;
  readonly subjectId: string;
  readonly constraint: 'RESEARCH_BLOCKING' | 'UNRESOLVED' | 'NO_KNOWN_STRUCTURAL_PARENT_BLOCK';
  readonly reason: StructuralParentReason;
  /** Always false. No result of this module authorises anything. */
  readonly grantsResearchAuthority: false;
}

const ECHE_ROW_KEY = /^[ 0-9A-Z-]+\|[0-9]+$/;

function result(
  subjectId: string,
  constraint: StructuralParentConstraint['constraint'],
  reason: StructuralParentReason,
): StructuralParentConstraint {
  return {
    ruleVersion: DISCOVERY_IDENTITY_RULE_VERSION,
    subjectId,
    constraint,
    reason,
    grantsResearchAuthority: false,
  };
}

/** Every node reachable from `start` over `parents`, `start` included. */
function closure(parents: ReadonlyMap<string, readonly string[]>, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of parents.get(node) ?? []) stack.push(next);
  }
  return seen;
}

/**
 * Evaluates the structural-parent constraint for one subject. Deterministic,
 * and fails closed: anything it cannot establish is UNRESOLVED.
 */
export function evaluateStructuralParentConstraint(
  input: IdentityGraphInput,
  subjectId: string,
  protectedEcheRowKeys: readonly string[],
): StructuralParentConstraint {
  if (
    !Array.isArray(protectedEcheRowKeys) ||
    protectedEcheRowKeys.some((k) => typeof k !== 'string' || !ECHE_ROW_KEY.test(k))
  ) {
    return result(subjectId, 'UNRESOLVED', 'INPUT_STRUCTURALLY_INVALID');
  }
  const validation = validateIdentityGraph(input);
  if (!validation.structurallyValid) {
    return result(subjectId, 'UNRESOLVED', 'INPUT_STRUCTURALLY_INVALID');
  }
  const assessments = new Map(validation.subjects.map((s) => [s.subjectId, s]));
  if (!assessments.has(subjectId)) return result(subjectId, 'UNRESOLVED', 'SUBJECT_UNKNOWN');

  const protectedTargets = new Set(protectedEcheRowKeys.map((k) => `eche:${k}`));
  const structural: RelationshipAssessment[] = validation.relationships.filter(
    (r) => r.predicate === STRUCTURAL_PREDICATE && r.review !== 'REJECTED',
  );
  const liveParents = adjacency(structural);
  const confirmedParents = adjacency(structural.filter((r) => r.review === 'CONFIRMED'));
  const start = `subject:${subjectId}`;

  const confirmedReach = closure(confirmedParents, start);
  if ([...confirmedReach].some((node) => protectedTargets.has(node))) {
    return result(subjectId, 'RESEARCH_BLOCKING', 'PROTECTED_STRUCTURAL_PARENT');
  }

  const liveReach = closure(liveParents, start);
  if ([...liveReach].some((node) => protectedTargets.has(node))) {
    return result(subjectId, 'UNRESOLVED', 'PROTECTED_STRUCTURAL_PARENT_UNCONFIRMED');
  }

  const reachedSubjects = [...liveReach].filter((node) => node.startsWith('subject:')).sort();
  for (const node of reachedSubjects) {
    if ((liveParents.get(node) ?? []).some((parent) => reaches(liveParents, parent, node))) {
      return result(subjectId, 'UNRESOLVED', 'STRUCTURAL_CYCLE');
    }
  }

  for (const node of reachedSubjects) {
    const assessment = assessments.get(node.slice('subject:'.length));
    if (assessment === undefined) continue;
    const needsParent = kindEvidenceOf(assessment).some(
      (kind) => kind === 'UNCERTAIN' || PARENT_IMPLYING_KINDS.includes(kind),
    );
    if (needsParent && (liveParents.get(node) ?? []).length === 0) {
      return result(subjectId, 'UNRESOLVED', 'STRUCTURAL_PARENT_UNKNOWN');
    }
  }

  return result(
    subjectId,
    'NO_KNOWN_STRUCTURAL_PARENT_BLOCK',
    'NO_PROTECTED_STRUCTURAL_PARENT_KNOWN',
  );
}
