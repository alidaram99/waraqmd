// Sanitizes a Mermaid-rendered SVG string before it is ever assigned to
// `innerHTML`. This is the fix for security review finding S6: Mermaid's
// `securityLevel: 'strict'` reduces *Mermaid's own* script-injection surface
// (it disables `click` callbacks and raw HTML labels), but it is Mermaid's
// own protection, not ours — a bug or bypass in Mermaid's sanitizer, or a
// future Mermaid version that weakens it, would otherwise become script
// execution the moment the resulting SVG string hits `innerHTML`. This
// module is deliberately a second, independent layer that does not trust
// Mermaid's claim at all.
//
// DOMPurify needs a `window` to attach to; the caller supplies one (the
// real browser `window` in app.js, a jsdom `window` in tests) via
// `createSvgSanitizer`, rather than this module assuming an environment.
import createDOMPurify from 'dompurify';

// `foreignObject` is explicitly forbidden even though DOMPurify's SVG
// profile may already handle it, because `foreignObject` is the one SVG
// element that can embed arbitrary HTML (including <script>, <iframe>,
// event handlers) inside an otherwise-SVG context — it is exactly the kind
// of bypass this second layer exists to not have to trust upstream on.
// `script` is forbidden for the obvious reason. `style` is *allowed*
// because Mermaid's own theming genuinely depends on an embedded
// `<style>` block for node/edge colors — DOMPurify still strips
// `javascript:`/expression-style content from it.
export const SVG_SANITIZE_CONFIG = Object.freeze({
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ['foreignObject', 'script', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['onbegin', 'onend', 'onrepeat', 'onload', 'onerror', 'onclick', 'onmouseover', 'onfocus'],
  ALLOW_DATA_ATTR: false,
});

/**
 * @param {Window} window a real `window` (browser) or a jsdom `window` (tests)
 * @returns {{ sanitize: (dirtySvg: string) => string }}
 */
export function createSvgSanitizer(window) {
  const purify = createDOMPurify(window);
  return {
    sanitize(dirtySvg) {
      return purify.sanitize(dirtySvg, SVG_SANITIZE_CONFIG);
    },
  };
}
