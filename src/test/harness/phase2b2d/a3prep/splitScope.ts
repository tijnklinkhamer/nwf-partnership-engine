import { A3PrepStop } from './contracts.js';
import type { A3Split } from './types.js';

declare const SPLIT_SCOPE_BRAND: unique symbol;

export interface A3SplitScope<S extends A3Split = A3Split> {
  readonly split: S;
  readonly [SPLIT_SCOPE_BRAND]: true;
}

export function createSplitScope<S extends A3Split>(split: S): A3SplitScope<S> {
  return { split } as A3SplitScope<S>;
}

export function assertRecordsMatchScope<S extends A3Split>(
  scope: A3SplitScope<S>,
  records: readonly { readonly split?: A3Split }[],
): void {
  for (const [index, record] of records.entries()) {
    if (record.split === undefined) {
      throw new A3PrepStop(`STOP: split token missing at record ${index}.`);
    }
    if (record.split !== scope.split) {
      throw new A3PrepStop(
        `STOP: cross-split record at ${index}: expected ${scope.split}, received ${record.split}.`,
      );
    }
  }
}

export function assertSingleSplitCollection(
  records: readonly { readonly split?: A3Split }[],
): A3Split {
  if (records.length === 0) throw new A3PrepStop('STOP: empty collection has no split identity.');
  const first = records[0]!.split;
  if (first === undefined) throw new A3PrepStop('STOP: split token missing at record 0.');
  assertRecordsMatchScope(createSplitScope(first), records);
  return first;
}
