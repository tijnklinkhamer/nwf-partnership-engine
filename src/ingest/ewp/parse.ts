/**
 * EWP Registry catalogue parser.
 *
 * STREAMING, not DOM. The live catalogue is ~46 MB of XML; a DOM would cost
 * several hundred megabytes and buy nothing, because every fact this phase
 * needs can be extracted in one forward pass. `saxes` is fed in chunks and the
 * only state retained is the HEI/host currently being built plus the finished
 * entries. Element identity is taken from the resolved NAMESPACE URI and local
 * name, never from the prefix spelling: the live document redeclares prefixes
 * locally and reuses the same local name across API major versions, so
 * prefix-matching would be wrong.
 *
 * FAIL CLOSED, but only where continuing would make the evidence AMBIGUOUS.
 * These raise:
 *   - the root element must be the registry <catalogue>
 *   - <hei> must carry a non-empty id
 *   - <other-id> must carry a non-empty type
 *   - <hei-id> inside <institutions-covered> must be non-empty
 *   - <institutions> must appear exactly once and must not be empty
 *   - an API entry must not declare the same endpoint element twice
 *
 * These do NOT raise, because the evidence stays unambiguous: a host covering
 * no institutions, an HEI with no PIC, an unrecognised other-id type, an
 * unrecognised API namespace. They are preserved and reported. A new identifier
 * type must never be dropped merely because this parser has not seen it before.
 *
 * One case sits between the two and is reported as an anomaly instead of either
 * raising or vanishing: an <other-id> published with an EMPTY value. The live
 * catalogue contains four (a self-closing <other-id type="euc"/>). An empty
 * identifier carries no information, but it is not ambiguous either, so
 * rejecting all 3472 institutions over it would be the wrong trade.
 */
import { StringDecoder } from 'node:string_decoder';
import { SaxesParser, type SaxesTagNS } from 'saxes';
import {
  EWP_COMMON_NS,
  EWP_REGISTRY_NS,
  EwpMalformedEntryError,
  EwpSchemaDriftError,
} from './schema.js';

/** One <name> as published: the value plus its xml:lang, when it has one. */
export interface EwpName {
  lang: string | null;
  value: string;
}

/** One <other-id>, exactly as published. Normalisation happens elsewhere. */
export interface EwpOtherId {
  type: string;
  value: string;
}

/**
 * Something the source published that is not usable evidence but is also not
 * ambiguous, so it is recorded and reported rather than either persisted or
 * silently dropped.
 */
export interface EwpParseAnomaly {
  kind: 'empty_other_id_value';
  heiId: string;
  detail: string;
}

/** One <hei> from the <institutions> block. */
export interface EwpHeiEntry {
  /** Zero-based position within <institutions>. */
  documentIndex: number;
  /** The SCHAC-style id attribute. AN IDENTIFIER, NOT A WEBSITE. */
  heiId: string;
  names: EwpName[];
  otherIds: EwpOtherId[];
}

/** One manifest entry inside a host's <apis-implemented>. */
export interface EwpApiEntry {
  namespaceUri: string;
  localName: string;
  version: string | null;
  /** Endpoint children keyed by local name ("url", "get-url", ...). */
  endpoints: Record<string, string>;
}

/** One <host>. */
export interface EwpHostEntry {
  documentIndex: number;
  adminProvider: string | null;
  apis: EwpApiEntry[];
  coveredHeiIds: string[];
}

export interface ParsedEwpCatalogue {
  hosts: EwpHostEntry[];
  heis: EwpHeiEntry[];
  /** Non-fatal source-quality findings. Always reported, never persisted. */
  anomalies: EwpParseAnomaly[];
}

/**
 * An API entry child element holding an endpoint URL.
 *
 * Observed across the live catalogue: url, get-url, index-url, stats-url,
 * update-url, catalogue-url. Matching on the suffix rather than an allow-list
 * means a new endpoint kind is captured as evidence instead of silently
 * dropped. Non-endpoint children (max-* limits, http-security, and the
 * admin-email contact address) are deliberately not collected.
 */
function isEndpointElement(localName: string): boolean {
  return localName === 'url' || localName.endsWith('-url');
}

/** How much of the document is quoted back in a schema-drift message. */
const DRIFT_PREVIEW_CHARS = 400;

interface ElementFrame {
  uri: string;
  local: string;
}

class CatalogueBuilder {
  readonly hosts: EwpHostEntry[] = [];
  readonly heis: EwpHeiEntry[] = [];
  readonly anomalies: EwpParseAnomaly[] = [];

  private readonly stack: ElementFrame[] = [];
  private text = '';
  private sawRoot = false;
  private institutionsSeen = 0;
  private inInstitutions = false;

  private host: EwpHostEntry | null = null;
  private api: EwpApiEntry | null = null;
  private hei: EwpHeiEntry | null = null;
  private pendingOtherIdType: string | null = null;
  private pendingNameLang: string | null = null;

  /** Depth of the <apis-implemented> element, so its direct children are known. */
  private apisImplementedDepth = -1;

  private registryPath(): string | null {
    // Only elements that are entirely inside the registry namespace form a
    // meaningful structural path. Anything else (an API manifest entry, an
    // ewp:* element) is handled by its own namespace-aware branch.
    const parts: string[] = [];
    for (const frame of this.stack) {
      if (frame.uri !== EWP_REGISTRY_NS) return null;
      parts.push(frame.local);
    }
    return parts.join('/');
  }

  openTag(node: SaxesTagNS): void {
    const uri = node.uri ?? '';
    const local = node.local;

    if (!this.sawRoot) {
      this.sawRoot = true;
      if (uri !== EWP_REGISTRY_NS || local !== 'catalogue') {
        throw new EwpSchemaDriftError(
          `Root element is <${node.name}> in namespace "${uri}", but an EWP ` +
            `Registry catalogue must have a <catalogue> root in "${EWP_REGISTRY_NS}". ` +
            `Nothing was ingested.`,
        );
      }
    }

    this.stack.push({ uri, local });
    this.text = '';
    const path = this.registryPath();

    if (path === 'catalogue/host') {
      this.host = {
        documentIndex: this.hosts.length,
        adminProvider: null,
        apis: [],
        coveredHeiIds: [],
      };
      return;
    }

    if (path === 'catalogue/host/apis-implemented') {
      this.apisImplementedDepth = this.stack.length;
      return;
    }

    // A manifest entry: the direct child of <apis-implemented>, in whatever
    // namespace the implementing API declares.
    if (this.host !== null && this.stack.length === this.apisImplementedDepth + 1) {
      this.api = {
        namespaceUri: uri,
        localName: local,
        version: node.attributes['version']?.value ?? null,
        endpoints: {},
      };
      this.host.apis.push(this.api);
      return;
    }

    if (path === 'catalogue/institutions') {
      this.institutionsSeen += 1;
      if (this.institutionsSeen > 1) {
        throw new EwpSchemaDriftError(
          `The catalogue contains more than one <institutions> block. Refusing to ` +
            `guess which one is authoritative. Nothing was ingested.`,
        );
      }
      this.inInstitutions = true;
      return;
    }

    if (path === 'catalogue/institutions/hei') {
      const heiId = (node.attributes['id']?.value ?? '').trim();
      if (heiId === '') {
        throw new EwpMalformedEntryError(
          `A <hei> element has a missing or empty id attribute. An HEI without an ` +
            `identifier is not usable evidence and is not repaired.`,
          `hei at index ${this.heis.length}`,
        );
      }
      this.hei = { documentIndex: this.heis.length, heiId, names: [], otherIds: [] };
      this.heis.push(this.hei);
      return;
    }

    if (path === 'catalogue/institutions/hei/other-id') {
      const type = (node.attributes['type']?.value ?? '').trim();
      if (type === '') {
        throw new EwpMalformedEntryError(
          `An <other-id> element has a missing or empty type attribute. An ` +
            `identifier of unknown kind cannot be interpreted and is not guessed.`,
          `hei "${this.hei?.heiId ?? '(unknown)'}"`,
        );
      }
      this.pendingOtherIdType = type;
      return;
    }

    if (path === 'catalogue/institutions/hei/name') {
      // xml:lang is in the reserved XML namespace, so it is read by qualified
      // name rather than by the bare local name.
      this.pendingNameLang =
        node.attributes['xml:lang']?.value ?? node.attributes['lang']?.value ?? null;
      return;
    }
  }

  onText(chunk: string): void {
    this.text += chunk;
  }

  closeTag(): void {
    const path = this.registryPath();
    const frame = this.stack[this.stack.length - 1];
    const raw = this.text;
    const trimmed = raw.trim();

    if (this.api !== null && frame !== undefined && isEndpointElement(frame.local)) {
      // Only a direct child of the manifest entry is the entry's own endpoint.
      if (this.stack.length === this.apisImplementedDepth + 2) {
        if (Object.prototype.hasOwnProperty.call(this.api.endpoints, frame.local)) {
          throw new EwpMalformedEntryError(
            `API entry <${this.api.localName}> declares <${frame.local}> more than ` +
              `once. Choosing one would be a guess about which endpoint is current.`,
            `host index ${this.host?.documentIndex ?? -1}, api ${this.api.localName}`,
          );
        }
        this.api.endpoints[frame.local] = trimmed;
      }
    }

    if (
      frame !== undefined &&
      frame.uri === EWP_COMMON_NS &&
      frame.local === 'admin-provider' &&
      this.host !== null &&
      // Only the host's own admin-provider, not one nested inside an API entry.
      this.api === null
    ) {
      this.host.adminProvider = trimmed === '' ? null : trimmed;
    }

    if (path === 'catalogue/host/institutions-covered/hei-id') {
      if (trimmed === '') {
        throw new EwpMalformedEntryError(
          `A <hei-id> reference inside <institutions-covered> is empty.`,
          `host index ${this.host?.documentIndex ?? -1}`,
        );
      }
      this.host?.coveredHeiIds.push(trimmed);
    }

    if (path === 'catalogue/institutions/hei/other-id') {
      const type = this.pendingOtherIdType;
      if (type === null) {
        throw new EwpMalformedEntryError(
          'Internal error: closing an <other-id> that was never opened.',
          `hei "${this.hei?.heiId ?? '(unknown)'}"`,
        );
      }
      if (trimmed === '') {
        // NOT fatal, and NOT silent. The live catalogue publishes a
        // self-closing <other-id type="euc"/> carrying no value at all. An
        // empty identifier is unusable but it is not ambiguous, so rejecting
        // the whole 3472-institution artifact over it would be the wrong trade;
        // it is recorded as an anomaly, reported by the CLI, and not persisted
        // as an identifier - the database forbids an empty id_value.
        this.anomalies.push({
          kind: 'empty_other_id_value',
          heiId: this.hei?.heiId ?? '(unknown)',
          detail: `<other-id type="${type}"> published with no value`,
        });
      } else {
        // The RAW value is preserved, not the trimmed one: two live PIC values
        // differ from their neighbours only by a stray leading or trailing
        // space, and that is a finding about the source worth keeping.
        this.hei?.otherIds.push({ type, value: raw });
      }
      this.pendingOtherIdType = null;
    }

    if (path === 'catalogue/institutions/hei/name') {
      this.hei?.names.push({ lang: this.pendingNameLang, value: raw });
      this.pendingNameLang = null;
    }

    if (path === 'catalogue/institutions/hei') this.hei = null;
    if (path === 'catalogue/institutions') this.inInstitutions = false;

    if (this.host !== null && this.stack.length === this.apisImplementedDepth + 1) {
      this.api = null;
    }
    if (path === 'catalogue/host/apis-implemented') this.apisImplementedDepth = -1;

    if (path === 'catalogue/host') {
      if (this.host !== null) this.hosts.push(this.host);
      this.host = null;
    }

    this.stack.pop();
    this.text = '';
  }

  finish(preview: string): void {
    if (!this.sawRoot) {
      throw new EwpSchemaDriftError(
        'The document is empty: no root element was found. Nothing was ingested.',
      );
    }
    if (this.institutionsSeen === 0) {
      throw new EwpSchemaDriftError(
        `The catalogue contains no <institutions> block, so it carries no HEI ` +
          `evidence at all. This is treated as schema drift rather than as an ` +
          `empty result, because silently recording zero institutions would look ` +
          `like a successful ingest. Nothing was ingested.`,
        preview,
      );
    }
    if (this.heis.length === 0) {
      throw new EwpSchemaDriftError(
        `The catalogue's <institutions> block contains no <hei> entries. ` +
          `Nothing was ingested.`,
        preview,
      );
    }
    // Defensive: a truncated document would leave the builder mid-element.
    if (this.inInstitutions || this.stack.length > 0) {
      throw new EwpSchemaDriftError(
        'The catalogue ended while elements were still open, which means the ' +
          'artifact is truncated. Nothing was ingested.',
      );
    }
  }
}

/**
 * Parses EWP catalogue bytes.
 *
 * The buffer is decoded and fed to the parser in chunks with a StringDecoder so
 * that a multi-byte UTF-8 sequence spanning a chunk boundary is not split.
 */
export function parseEwpCatalogue(bytes: Buffer, chunkSize = 1 << 20): ParsedEwpCatalogue {
  const builder = new CatalogueBuilder();
  const parser = new SaxesParser<object>({ xmlns: true, fileName: 'catalogue-v1.xml' });

  // Collected rather than assigned to a closed-over variable so that the first
  // error survives narrowing and the parse stops at the first one.
  const parseErrors: Error[] = [];
  parser.on('error', (err) => {
    parseErrors.push(err);
  });
  parser.on('opentag', (node) => builder.openTag(node as SaxesTagNS));
  parser.on('text', (chunk) => builder.onText(chunk));
  parser.on('closetag', () => builder.closeTag());

  const decoder = new StringDecoder('utf8');
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const slice = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
    parser.write(decoder.write(slice));
    if (parseErrors.length > 0) break;
  }
  if (parseErrors.length === 0) {
    const tail = decoder.end();
    if (tail !== '') parser.write(tail);
  }
  if (parseErrors.length === 0) parser.close();

  const firstError = parseErrors[0];
  if (firstError !== undefined) {
    throw new EwpSchemaDriftError(
      `The EWP catalogue is not well-formed XML: ${firstError.message}. Nothing was ingested.`,
    );
  }

  builder.finish(bytes.subarray(0, DRIFT_PREVIEW_CHARS).toString('utf8'));

  return { hosts: builder.hosts, heis: builder.heis, anomalies: builder.anomalies };
}
