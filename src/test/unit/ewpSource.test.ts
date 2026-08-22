/**
 * EWP source resolution.
 *
 * Origin validation and artifact identity only. Nothing here touches the
 * network: the two functions that fetch are deliberately not exercised, because
 * CI must never depend on the live registry being up.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertOfficialEwpUrl, resolveFromFile, sourceLocation } from '../../ingest/ewp/source.js';
import {
  EWP_CATALOGUE_URL,
  EWP_SOURCE_REUSE_BASIS,
  EwpSourceResolutionError,
} from '../../ingest/ewp/schema.js';

function tempFile(name: string, contents: string | Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'nwf-ewp-'));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

describe('assertOfficialEwpUrl', () => {
  it('accepts the official catalogue URL', () => {
    expect(assertOfficialEwpUrl(EWP_CATALOGUE_URL).hostname).toBe(
      'registry.erasmuswithoutpaper.eu',
    );
  });

  it('rejects a look-alike host', () => {
    expect(() =>
      assertOfficialEwpUrl('https://registry.erasmuswithoutpaper.eu.evil.example/catalogue-v1.xml'),
    ).toThrow(EwpSourceResolutionError);
  });

  it('rejects a subdomain of the official host', () => {
    expect(() =>
      assertOfficialEwpUrl('https://mirror.registry.erasmuswithoutpaper.eu/catalogue-v1.xml'),
    ).toThrow(EwpSourceResolutionError);
  });

  it('rejects plain http', () => {
    expect(() =>
      assertOfficialEwpUrl('http://registry.erasmuswithoutpaper.eu/catalogue-v1.xml'),
    ).toThrow(/must be https/);
  });

  it('rejects a non-xml path', () => {
    expect(() =>
      assertOfficialEwpUrl('https://registry.erasmuswithoutpaper.eu/catalogue-v1.json'),
    ).toThrow(/\.xml/);
  });

  it('rejects an unparseable value', () => {
    expect(() => assertOfficialEwpUrl('not a url')).toThrow(EwpSourceResolutionError);
  });
});

describe('resolveFromFile', () => {
  it('hashes the exact bytes and records the path, not a URL', () => {
    const contents = '<?xml version="1.0"?><catalogue/>';
    const path = tempFile('catalogue.xml', contents);
    const resolved = resolveFromFile(path);

    expect(resolved.kind).toBe('operator_file');
    expect(resolved.fileUrl).toBeNull();
    expect(resolved.filePath).toBe(path);
    expect(resolved.sha256).toBe(createHash('sha256').update(contents).digest('hex'));
  });

  it('tolerates a UTF-8 BOM before the root element', () => {
    const path = tempFile('bom.xml', Buffer.from('﻿<catalogue/>', 'utf8'));
    expect(() => resolveFromFile(path)).not.toThrow();
  });

  it('rejects a file that does not begin an XML document', () => {
    const path = tempFile('notxml.txt', 'this is not xml');
    expect(() => resolveFromFile(path)).toThrow(/does not begin an XML document/);
  });

  it('rejects an HTML error page saved as the catalogue', () => {
    // A captive portal or proxy error page is still "<"-prefixed, so this is
    // caught by the parser rather than here - what matters is that an obviously
    // non-XML body never reaches the parser at all.
    const path = tempFile('empty.xml', '');
    expect(() => resolveFromFile(path)).toThrow(EwpSourceResolutionError);
  });
});

describe('sourceLocation', () => {
  it('returns the local path for an operator file', () => {
    const path = tempFile('catalogue.xml', '<catalogue/>');
    expect(sourceLocation(resolveFromFile(path))).toBe(path);
  });
});

describe('reuse-basis wording', () => {
  it('makes no MIT or open-data claim about the catalogue contents', () => {
    // The EWP specification repositories are MIT licensed. That says nothing
    // about the licence of the live catalogue DATA, and this string must not
    // pretend otherwise.
    expect(EWP_SOURCE_REUSE_BASIS).not.toMatch(/\bMIT[- ]licen[cs]ed\b/i);
    expect(EWP_SOURCE_REUSE_BASIS).not.toMatch(/\bopen data\b/i);
    expect(EWP_SOURCE_REUSE_BASIS).not.toMatch(/\bCC[ -]BY\b/i);
    expect(EWP_SOURCE_REUSE_BASIS).not.toMatch(/\bpublic domain\b/i);
    expect(EWP_SOURCE_REUSE_BASIS).toMatch(/NO dataset-licensing claim/);
  });
});

describe('no hidden fallback artifact', () => {
  it('the source module names exactly one official URL and caches nothing', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/ingest/ewp/source.ts', 'utf8');
    // A "last known good" artifact path or a second hardcoded catalogue URL
    // would defeat fail-closed resolution.
    expect(source).not.toMatch(/lastKnownGood|LAST_KNOWN_GOOD|fallbackUrl|cachedArtifact/i);
    const urls = source.match(/https:\/\/registry\.erasmuswithoutpaper\.eu[^\s'"`]*/g) ?? [];
    expect(urls).toEqual([]);
  });
});
