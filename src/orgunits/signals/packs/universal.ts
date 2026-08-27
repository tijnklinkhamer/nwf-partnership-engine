/**
 * UNIVERSAL, COUNTRY- AND LANGUAGE-BLIND RULES.
 *
 * WHAT BELONGS HERE
 *
 *   Structural negatives and the one scope veto whose meaning does not
 *   depend on which language a page is written in: a login path is a login
 *   path in any language; a binary file extension is not a page in any
 *   language. Every rule here applies to BOTH tracks (`SignalTrack` 'A' and
 *   'B'), because none of them is about international/mobility vocabulary
 *   or language-teaching vocabulary specifically - they are about what kind
 *   of PAGE this structurally is.
 *
 * WHAT DOES NOT BELONG HERE
 *
 *   The service-subdomain host refusal (`moodle.`, `glpi.`, `mail.`, ...)
 *   already lives in `src/orgunits/web/hostPolicy.ts` as a NETWORK-SCOPE
 *   guard that runs before any socket exists. This layer begins AFTER a URL
 *   has already passed that gate (CLAUDE.md rule 18 in the brief); duplicating
 *   those labels here would be two implementations of one boundary that could
 *   drift apart.
 *
 * WHY "recherche"/"research" IS A VETO, NOT AN ORDINARY NEGATIVE
 *
 *   The 2026-08-24 holdout's own example: `/recherche/relations-internationales`
 *   can carry a strong positive Track A phrase while sitting under an
 *   academic-research section that is not the international unit itself.
 *   Ordinary subtraction is not enough - a small negative would not stop a
 *   large INHERITED contribution from a strong ancestor section from
 *   surviving. `kind: 'veto'` additionally zeroes any inherited contribution
 *   for the track it applies to (score.ts), on top of its own ordinary
 *   subtraction from that page's own evidence.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import type { SignalRule, SignalTrack } from '../types.js';
import { SIGNAL_WEIGHT } from '../weights.js';

const BOTH_TRACKS: readonly SignalTrack[] = ['A', 'B'];

export const UNIVERSAL_RULES: readonly SignalRule[] = [
  {
    id: 'NEG_LOGIN_AUTH',
    pack: 'universal',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    fields: ['urlPath'],
    phrases: ['login', 'signin', 'sign in', 'authentification', 'connexion'],
    weight: SIGNAL_WEIGHT.STRUCTURAL,
  },
  {
    id: 'NEG_SHOPPING_CART',
    pack: 'universal',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    fields: ['urlPath'],
    phrases: ['cart', 'panier', 'checkout'],
    weight: SIGNAL_WEIGHT.STRUCTURAL,
  },
  {
    id: 'NEG_SEARCH_RESULTS',
    pack: 'universal',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    fields: ['urlPath'],
    phrases: ['search results', 'search'],
    weight: SIGNAL_WEIGHT.STRUCTURAL_LIGHT,
  },
  {
    id: 'NEG_NEWS_ARCHIVE',
    pack: 'universal',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    fields: ['urlPath'],
    phrases: ['news', 'archive', 'archives', 'actualites'],
    weight: SIGNAL_WEIGHT.STRUCTURAL_LIGHT,
  },
  {
    id: 'NEG_UTILITY_SECTION',
    pack: 'universal',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    fields: ['urlPath'],
    phrases: ['sitemap', 'legal', 'privacy', 'mentions legales', 'cookies', 'accessibility'],
    weight: SIGNAL_WEIGHT.STRUCTURAL_LIGHT,
  },
  {
    id: 'NEG_PROGRAMME_SHAPE',
    pack: 'universal',
    kind: 'negative',
    tracks: BOTH_TRACKS,
    // Applies to `title` as well as `urlPath`: the holdout's precision
    // failure was a TITLE-level confusion ("MSc International Marketing"),
    // and this rule must be able to catch it there, not only in the URL.
    fields: ['urlPath', 'title'],
    phrases: [
      'msc',
      'mba',
      'bsc',
      'llm',
      'phd',
      'master of',
      'bachelor of',
      'licence professionnelle',
      'doctorat',
    ],
    weight: SIGNAL_WEIGHT.PROGRAMME_SHAPE,
  },
  {
    id: 'NEG_ACADEMIC_RESEARCH_SCOPE',
    pack: 'universal',
    kind: 'veto',
    tracks: BOTH_TRACKS,
    fields: ['urlPath'],
    phrases: ['recherche', 'research'],
    weight: SIGNAL_WEIGHT.SCOPE_VETO,
  },
];

const BINARY_EXTENSION_PATTERN =
  /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|jpe?g|png|gif|svg|mp4|mp3|csv)$/i;

/**
 * True when the URL's raw (undecoded) pathname ends in a non-page
 * (binary/document) file extension. A SPECIAL STRUCTURAL RULE, not a phrase
 * match: the question is about the URL's own shape, not about vocabulary
 * that could appear in ordinary text.
 */
export function hasBinaryFileExtension(pathname: string): boolean {
  return BINARY_EXTENSION_PATTERN.test(pathname);
}

/**
 * The rule identity/weight/track-applicability for the file-extension check
 * above. Not a `SignalRule` - it has no `phrases` to tokenise - so score.ts
 * applies it via `hasBinaryFileExtension` directly rather than through the
 * ordinary phrase-matching engine.
 */
export const STRUCTURAL_FILE_EXTENSION_RULE = Object.freeze({
  id: 'NEG_BINARY_FILE_EXTENSION',
  pack: 'universal' as const,
  tracks: BOTH_TRACKS,
  weight: SIGNAL_WEIGHT.STRUCTURAL,
});

/**
 * True when the URL's QUERY STRING carries WooCommerce's fixed `add-to-cart`
 * action parameter (`?add-to-cart=<product_id>`, sometimes with a further
 * `quantity` parameter) - a real, unchanging WooCommerce implementation
 * detail, not a guessed convention.
 *
 * `NEG_SHOPPING_CART` above matches ONLY `urlPath` (tree.ts's `rawPathname`,
 * which deliberately excludes the query string - it carries no tree
 * structure). A WooCommerce "add to cart" link on an ordinary product page
 * path such as `/boutique/produit/42/?add-to-cart=42` therefore never
 * matched that rule at all: the 2026-08-27 shadow validation measured
 * IRTESS spending roughly half its 35-page budget on exactly this shape.
 * Each such GET also mutates the site's OWN server-side cart state - a
 * politeness concern independent of relevance. Refused at ADMISSION, before
 * any request, for every discovery method uniformly (anchors, sitemap
 * entries, redirect targets alike - `rootRunner.ts`'s `admissibleUrl` is the
 * one gate all three pass through), not scored: no ruleset change, no new
 * `SignalRule`, no `orgunit-signal-rules-v2`, and a page reached some OTHER
 * way (one whose OWN path happens to contain "cart") is still scored by
 * `NEG_SHOPPING_CART` exactly as before.
 */
export function hasCartActionQueryParam(url: string): boolean {
  try {
    return new URL(url).searchParams.has('add-to-cart');
  } catch {
    return false;
  }
}
