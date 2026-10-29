/**
 * WW H-RT - WHETHER THE CLAUDE MAX STORED PROFILE THE SEARCH STAGE USES IS
 * PRESENT ON THIS MAC (for `nwf-engine doctor`, read-only).
 *
 * The search stage authenticates only with the OWNER's Claude Max stored
 * login, inside a DEDICATED profile directory (ADR 0010). Which directory is
 * decided by ONE pure resolver in the classifier namespace; this module calls
 * that resolver - the same answer the worker's search stage gets, from the
 * same (PG*-scrubbed) environment the worker is started with - and then asks
 * lstat whether the directory exists. It never lists, opens, reads or copies
 * anything inside it, and it reports a PATH, never a credential.
 */
import { lstatSync } from 'node:fs';

import {
  CLASSIFIER_PROFILE_DIR_VARIABLE,
  resolveClassifierProfileDir,
} from '../orgunits/classify/provider/profile.js';

export type ClassifierProfileFacts =
  | {
      readonly resolved: true;
      /** The variable that can name the directory (reported by name). */
      readonly variable: string;
      /** Whether that variable named it, or the default under home was used. */
      readonly fromVariable: boolean;
      readonly path: string;
      /** A real directory exists at `path` (lstat: a symlink does not count). */
      readonly present: boolean;
    }
  | { readonly resolved: false; readonly variable: string; readonly detail: string };

export function classifierProfileFacts(
  env: Readonly<Record<string, string | undefined>>,
  repoRoot: string,
): ClassifierProfileFacts {
  const result = resolveClassifierProfileDir({ env, repoRoot });
  if (!result.ok) {
    return { resolved: false, variable: CLASSIFIER_PROFILE_DIR_VARIABLE, detail: result.detail };
  }
  let present: boolean;
  try {
    const st = lstatSync(result.profileDir);
    present = st.isDirectory() && !st.isSymbolicLink();
  } catch {
    present = false;
  }
  return {
    resolved: true,
    variable: CLASSIFIER_PROFILE_DIR_VARIABLE,
    fromVariable: env[CLASSIFIER_PROFILE_DIR_VARIABLE] !== undefined,
    path: result.profileDir,
    present,
  };
}
