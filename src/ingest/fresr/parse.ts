/**
 * Deterministic parsing of the French Ministry register export.
 *
 * THE SCHEMA BELOW IS A CAPABILITY BOUNDARY.
 *
 * It is `.strict()` on purpose. The request already narrows the field list at
 * the server, so a record carrying any other key means the response is not
 * what this adapter was written against - and the safe response to that is to
 * STOP, not to ignore the extra keys. Ignoring them would mean a future
 * upstream change could start delivering a contact column into this process
 * with nothing failing. Failing closed here is what makes
 * "Phase 1D never reads contact fields" a property of the code rather than a
 * promise in a comment.
 *
 * Pure: no network, no database, no clock.
 */
import { z } from 'zod';
import { FRESR_MAX_RECORDS, FRESR_SELECTED_FIELDS, FresrSchemaDriftError } from './schema.js';

/**
 * A nullable published text field.
 *
 * The register represents "no value" as JSON null. `.nullish()` also tolerates
 * the key being omitted entirely, which is a formatting choice rather than a
 * different fact - both mean the register published nothing here.
 */
const publishedText = z.string().nullish();

/**
 * ONE register record, narrowed to the five fields Phase 1D uses.
 *
 * There is deliberately NO field here for a telephone number, an address, a
 * social account or anything else the full dataset publishes. See
 * FRESR_SELECTED_FIELDS for why each of these five earns its place.
 */
const FresrRecordSchema = z
  .object({
    /** The register's stable internal row identifier. */
    etablissement_id_paysage: z.string().min(1),
    /** Institution label, shown so a claim can say which record made it. */
    uo_lib: publishedText,
    /** Official national identifier. 19 records publish several, ";"-separated. */
    uai: publishedText,
    /** THE JOIN KEY. The only field used to attach a claim to an ECHE row. */
    identifiant_pic: publishedText,
    /** The claim itself, exactly as published. */
    url: publishedText,
  })
  .strict();

export type FresrRecord = z.infer<typeof FresrRecordSchema>;

const FresrExportSchema = z.array(FresrRecordSchema);

export interface ParsedFresrExport {
  records: FresrRecord[];
  /** Records carrying a PIC that is usable as a join key (non-blank, all digits). */
  recordsWithPic: number;
  /**
   * Records publishing a non-blank PIC that is NOT plain digits, so it cannot
   * be used as a join key and produces no claim.
   *
   * Measured on the live register: 2, and BOTH are two PIC values crammed into
   * one field, ";"-separated ("900456724;999489941"). Splitting on the
   * separator would be a repair, and worse, a guess: the record publishes one
   * website, and nothing in the source says which of the two identifiers that
   * website belongs to. Counted and reported; never split, never repaired.
   */
  recordsWithNonComparablePic: number;
  /** Records carrying a non-blank url value, before any structural check. */
  recordsWithUrlValue: number;
  /**
   * Records publishing SEVERAL UAI codes in one field, ";"-separated.
   * Counted and reported as an anomaly of the source, never split or repaired -
   * Phase 1D does not join on UAI, so there is nothing to gain from guessing.
   */
  recordsWithMultipleUai: number;
}

/** Blank-to-null with surrounding whitespace removed; interior untouched. */
function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** The register's PIC, trimmed and kept only if it is all digits. */
export function fresrPic(record: FresrRecord): string | null {
  const value = blankToNull(record.identifiant_pic);
  if (value === null) return null;
  // Same rule as the EWP adapter applies: a PIC that is not plain digits gets
  // no comparison value, because guessing the intended digits would fabricate
  // an official identifier.
  return /^[0-9]+$/.test(value) ? value : null;
}

/** Parses the export bytes into validated records, or fails closed. */
export function parseFresrExport(bytes: Buffer): ParsedFresrExport {
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    throw new FresrSchemaDriftError(
      'The French register artifact is not valid JSON. Nothing was ingested.',
      err instanceof Error ? err.message : String(err),
    );
  }

  const parsed = FresrExportSchema.safeParse(json);
  if (!parsed.success) {
    throw new FresrSchemaDriftError(
      `The French register artifact does not match the expected narrow schema. ` +
        `Phase 1D requests exactly these fields: ${FRESR_SELECTED_FIELDS.join(', ')}. ` +
        `An unexpected field is treated as drift and stops the run rather than ` +
        `being ignored, because ignoring it could silently admit data this phase ` +
        `is not approved to read. Nothing was ingested.`,
      z.prettifyError(parsed.error),
    );
  }

  const records = parsed.data;
  if (records.length > FRESR_MAX_RECORDS) {
    throw new FresrSchemaDriftError(
      `The French register artifact holds ${records.length} records, over the ` +
        `${FRESR_MAX_RECORDS} limit for this source. Nothing was ingested.`,
    );
  }

  return {
    records,
    recordsWithPic: records.filter((r) => fresrPic(r) !== null).length,
    recordsWithNonComparablePic: records.filter(
      (r) => blankToNull(r.identifiant_pic) !== null && fresrPic(r) === null,
    ).length,
    recordsWithUrlValue: records.filter((r) => blankToNull(r.url) !== null).length,
    recordsWithMultipleUai: records.filter((r) => (blankToNull(r.uai) ?? '').includes(';')).length,
  };
}
