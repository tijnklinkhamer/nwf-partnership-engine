/**
 * PHASE 2B-2D2C-F4A — TOKEN-LEVEL `goldId` ROUTING, WITHOUT DESERIALIZING
 * THE RECORD.
 *
 * THIS MODULE EXISTS BECAUSE `JSON.parse(line)` IS FORBIDDEN HERE.
 * The mixed adjudication file interleaves DEVELOPMENT and HOLDOUT records
 * and carries no `split` field, so a row's membership can only be decided
 * from its `goldId`. `JSON.parse` would materialise the WHOLE record first —
 * `url`, `title`, `organisationName`, `rationale`, `ambiguity` and the entire
 * `proposed` label — and for a HOLDOUT row that is precisely the thing that
 * must never happen. Deciding membership has to come BEFORE deserialization,
 * not after it.
 *
 * So this walks the raw bytes as tokens. It materialises exactly two things:
 * the structural KEY NAMES it must compare (schema field names, not content —
 * and it compares them as bytes, so even those are never decoded), and the
 * `goldId` VALUE itself. Every other value is SKIPPED by advancing an index
 * past it: strings by scanning to their unescaped closing quote, objects and
 * arrays by nesting depth, literals and numbers by scanning to the next
 * delimiter. No skipped value is ever decoded, copied, counted or returned.
 *
 * It also STOPS at `goldId`. Once the id is in hand the rest of the line is
 * never examined at all, malformed or not — which is what makes "a HOLDOUT
 * row's semantic fields were not read" a structural property rather than a
 * promise.
 *
 * Errors carry a BYTE OFFSET and never a fragment of the line: an error
 * message is an output channel like any other.
 *
 * PURE. No filesystem, no network, no database, no clock, no randomness, and
 * no `JSON.parse` — the firewall asserts that last one by name.
 */

/** `g` + 16 lowercase hex, exactly as `GoldIdSchema` spells it. */
const GOLD_ID_PATTERN = /^g[0-9a-f]{16}$/;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COLON = 0x3a;
const COMMA = 0x2c;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;

const GOLD_ID_KEY = Buffer.from('goldId', 'ascii');

export class GoldIdRoutingError extends Error {
  override readonly name = 'GoldIdRoutingError';
  constructor(
    reason: string,
    readonly byteOffset: number,
  ) {
    super(`${reason} at byte offset ${byteOffset}`);
  }
}

function isWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

function skipWhitespace(line: Buffer, from: number): number {
  let index = from;
  while (index < line.length && isWhitespace(line[index] as number)) index += 1;
  return index;
}

/**
 * `from` points at the opening quote. Returns the content range and the index
 * just past the closing quote. Nothing is decoded or copied.
 */
function scanString(line: Buffer, from: number): { start: number; end: number; next: number } {
  if (line[from] !== QUOTE) throw new GoldIdRoutingError('expected a string', from);
  let index = from + 1;
  while (index < line.length) {
    const byte = line[index] as number;
    if (byte === BACKSLASH) {
      index += 2;
      continue;
    }
    if (byte === QUOTE) return { start: from + 1, end: index, next: index + 1 };
    index += 1;
  }
  throw new GoldIdRoutingError('unterminated string', from);
}

/** Advances past ONE value without materialising it. Returns the next index. */
function skipValue(line: Buffer, from: number): number {
  const first = line[from];
  if (first === undefined) throw new GoldIdRoutingError('expected a value', from);
  if (first === QUOTE) return scanString(line, from).next;
  if (first === OPEN_BRACE || first === OPEN_BRACKET) {
    let depth = 0;
    let index = from;
    while (index < line.length) {
      const byte = line[index] as number;
      if (byte === QUOTE) {
        index = scanString(line, index).next;
        continue;
      }
      if (byte === OPEN_BRACE || byte === OPEN_BRACKET) depth += 1;
      else if (byte === CLOSE_BRACE || byte === CLOSE_BRACKET) {
        depth -= 1;
        if (depth === 0) return index + 1;
      }
      index += 1;
    }
    throw new GoldIdRoutingError('unterminated object or array', from);
  }
  // A number, `true`, `false` or `null`: run to the next structural delimiter.
  let index = from;
  while (index < line.length) {
    const byte = line[index] as number;
    if (byte === COMMA || byte === CLOSE_BRACE || byte === CLOSE_BRACKET || isWhitespace(byte)) {
      break;
    }
    index += 1;
  }
  if (index === from) throw new GoldIdRoutingError('expected a value', from);
  return index;
}

/**
 * Returns the record's top-level `goldId`, or `null` when the record has no
 * top-level `goldId` at all.
 *
 * Only keys at DEPTH 1 are considered: a nested `"goldId"` inside `proposed`
 * or inside a rationale string can never be mistaken for the routing key.
 */
export function routeGoldId(line: Buffer): string | null {
  let index = skipWhitespace(line, 0);
  if (line[index] !== OPEN_BRACE) throw new GoldIdRoutingError('expected an object', index);
  index = skipWhitespace(line, index + 1);
  if (line[index] === CLOSE_BRACE) return null;
  for (;;) {
    const key = scanString(line, index);
    const isGoldIdKey =
      key.end - key.start === GOLD_ID_KEY.length &&
      line.compare(GOLD_ID_KEY, 0, GOLD_ID_KEY.length, key.start, key.end) === 0;
    index = skipWhitespace(line, key.next);
    if (line[index] !== COLON) throw new GoldIdRoutingError('expected a colon', index);
    index = skipWhitespace(line, index + 1);
    if (isGoldIdKey) {
      if (line[index] !== QUOTE) throw new GoldIdRoutingError('goldId is not a string', index);
      const value = scanString(line, index);
      const goldId = line.toString('utf8', value.start, value.end);
      if (!GOLD_ID_PATTERN.test(goldId)) {
        throw new GoldIdRoutingError('goldId is not a well-formed gold id', index);
      }
      return goldId;
    }
    index = skipValue(line, index);
    index = skipWhitespace(line, index);
    if (line[index] === COMMA) {
      index = skipWhitespace(line, index + 1);
      continue;
    }
    if (line[index] === CLOSE_BRACE) return null;
    throw new GoldIdRoutingError('expected a comma or a closing brace', index);
  }
}
