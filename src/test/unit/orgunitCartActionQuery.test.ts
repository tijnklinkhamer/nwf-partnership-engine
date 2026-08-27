import { describe, expect, it } from 'vitest';
import { hasCartActionQueryParam } from '../../orgunits/signals/packs/universal.js';

describe('hasCartActionQueryParam (2026-08-27 shadow validation Pass B, cart-action anchor drop)', () => {
  it('detects WooCommerce add-to-cart links regardless of the surrounding path', () => {
    expect(hasCartActionQueryParam('https://irtess.fr/boutique/produit/42/?add-to-cart=42')).toBe(
      true,
    );
    expect(hasCartActionQueryParam('https://example.edu/?add-to-cart=7&quantity=2')).toBe(true);
  });

  it('is case/key-exact: an unrelated query key is never flagged', () => {
    expect(hasCartActionQueryParam('https://example.edu/page?id=42')).toBe(false);
    expect(hasCartActionQueryParam('https://example.edu/page?added-to-cart=1')).toBe(false);
  });

  it('near-neighbour protection: an ordinary page path containing the word "cart" nowhere in its query is unaffected', () => {
    // NEG_SHOPPING_CART (score.ts, urlPath-only) still scores this path
    // negatively where relevant - this predicate is a distinct, narrower,
    // query-only admission gate, not a replacement for it.
    expect(hasCartActionQueryParam('https://example.edu/student-services/')).toBe(false);
    expect(hasCartActionQueryParam('https://example.edu/panier/')).toBe(false);
  });

  it('returns false for an unparsable URL rather than throwing', () => {
    expect(hasCartActionQueryParam('not a url')).toBe(false);
  });
});
