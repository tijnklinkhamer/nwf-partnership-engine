/**
 * TRACK B, B2.1 - STRUCTURAL ADMISSIBILITY OF STORED VALUES.
 *
 * Mirrors migration 0013's `discovery_identity_url_admissible` and
 * `discovery_identity_text_admissible` exactly - same character classes
 * (ASCII-only, as PostgreSQL's C locale reads them), same bounds, same
 * refused hosts - and the integration test runs both over the same inputs.
 *
 * ADMISSIBLE IS NOT TRUE. A URL that passes is well-formed and free of
 * credentials, query strings, mailbox shapes and social-platform hosts; it is
 * not fetched, not resolved, and not shown to belong to anyone. PURE.
 */

/**
 * Social-platform and messaging hosts. A profile there may be a PERSONAL
 * account, so B2.1 stores none - neither as a website claim nor as a source.
 * Admitting one is a separate OWNER decision.
 */
export const SOCIAL_PLATFORM_HOSTS = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'fb.me',
  'messenger.com',
  'linkedin.com',
  'lnkd.in',
  'twitter.com',
  'x.com',
  't.co',
  'tiktok.com',
  'snapchat.com',
  'whatsapp.com',
  'wa.me',
  't.me',
  'telegram.me',
  'telegram.org',
  'discord.com',
  'discord.gg',
  'youtube.com',
  'youtu.be',
  'linktr.ee',
  'threads.net',
  'bsky.app',
  'vk.com',
] as const;

const URL_SHAPE = /^https?:\/\/[a-z0-9.-]+(\/[^ \t\n\v\f\r?#@]*)?$/;
const HOST_SHAPE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const URL_MAX_CHARS = 2048;

/** C-locale `[[:cntrl:]]`: U+0000-U+001F and U+007F only. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit <= 0x1f || unit === 0x7f) return true;
  }
  return false;
}
/** Nine or more digits joined only by space . ( ) + / - : the shape of a telephone number. */
const TELEPHONE_SHAPE = /[0-9]([ .()+/-]{0,2}[0-9]){8}/;

/** Length in code points, as PostgreSQL's `length()` counts it. */
export function codePointLength(value: string): number {
  return [...value].length;
}

function hostOf(url: string): string {
  return /^https?:\/\/([^/]+)/.exec(url)?.[1] ?? '';
}

function isSocialPlatformHost(host: string): boolean {
  return SOCIAL_PLATFORM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** True exactly when `discovery_identity_url_admissible(candidate)` is true. */
export function isAdmissiblePublicUrl(candidate: string): boolean {
  if (codePointLength(candidate) > URL_MAX_CHARS) return false;
  if (!URL_SHAPE.test(candidate)) return false;
  if (/%40/i.test(candidate)) return false;
  const host = hostOf(candidate);
  return HOST_SHAPE.test(host) && !isSocialPlatformHost(host);
}

/** True exactly when `discovery_identity_text_admissible(candidate)` is true. */
export function isAdmissibleFreeText(candidate: string): boolean {
  return (
    !hasControlCharacter(candidate) && !candidate.includes('@') && !TELEPHONE_SHAPE.test(candidate)
  );
}

/** A name as migration 0013 admits one: 1-300 code points, no edge spaces, admissible text. */
export function isAdmissibleName(candidate: string): boolean {
  const length = codePointLength(candidate);
  return (
    length >= 1 &&
    length <= 300 &&
    !candidate.startsWith(' ') &&
    !candidate.endsWith(' ') &&
    isAdmissibleFreeText(candidate)
  );
}

/** Bounded free text (a registration note, a review reason). */
export function isAdmissibleNote(candidate: string, maxChars: number): boolean {
  const length = codePointLength(candidate);
  return length >= 1 && length <= maxChars && isAdmissibleFreeText(candidate);
}
