# Verification

What was actually run, on 2026-10-03, and what it showed — not a claim of
"it works," a record of the checks.

## Unit tests

```
npm test
→ tests 45, pass 45, fail 0
```

Covers: front-matter splitting (fences, CRLF, no-fence edge cases), TOC
slug generation and nesting (including Arabic headings), large-file chunk
boundaries (never split mid-section, full coverage, no gaps), i18n string
completeness (every key has both `en` and `ar`), standalone-HTML export
escaping, and the markdown render pipeline: GFM tables, task lists,
strikethrough, inline/block KaTeX math, the Mermaid placeholder hand-off,
non-mermaid syntax highlighting, **raw HTML is escaped, never executed**,
`dir="auto"` on every paragraph/heading/list-item/table-cell, heading-id ⇄
TOC-slug consistency (including when chunks render out of document order).

## Live browser verification

Run via `node scripts/verify-render.mjs` — a real browser (system Microsoft
Edge, driven by `playwright-core`, no Chromium download needed), serving the
actual built `docs/` output over local HTTP, opening
[`test/fixtures/sample.md`](./test/fixtures/sample.md) (mixed Arabic/English
prose, a task list, a GFM table, inline and block KaTeX math, a Mermaid
flowchart with one Arabic edge label, and a fenced JS code block) through
the real `<input>` file-open path.

Result:

```json
{
  "hasKatex": true,
  "hasMermaidSvg": true,
  "hasMermaidError": false,
  "hasTaskList": true,
  "hasTable": true,
  "arabicDir": "auto",
  "englishDir": "auto",
  "filename": "sample.md",
  "frontMatterShown": true,
  "bodyDir": "ltr"
}
VERIFY OK
```

Screenshots taken during this run (not committed — regenerate with the
command above; `docs/verify-screenshot*.png` is git-ignored):

- Split view: the Arabic paragraph (`مقدمة بالعربية` section) renders
  right-aligned next to the English paragraph rendering left-aligned, in the
  same document, with no manual direction toggle — confirming per-paragraph
  `dir="auto"` actually works as intended, not just that the attribute is
  present in the HTML.
- Preview, scrolled: KaTeX inline (`$E=mc^2$`) and block
  (`$$\int_0^1 x^2\,dx = \tfrac13$$`) math render as typeset equations, not
  literal dollar signs. The Mermaid flowchart renders as a real SVG diagram
  with shapes and arrows.

**One real limitation found by this run, not assumed in advance:** the
Mermaid diagram's Arabic edge label (`نعم`, "yes") rendered as an unshaped
glyph rather than correctly joined Arabic script. This is recorded in
RESEARCH.md and README.md as a known limitation of Mermaid's own SVG text
layer — English-only diagram labels are recommended for now. Prose, table
cells, list items and headings all rendered Arabic correctly in the same
test.

## v0.1.1 — security review finding S6 (Mermaid SVG XSS / no CSP)

What was actually run, on 2026-10-03, to verify the S6 fix (DOMPurify
sanitization of Mermaid's SVG before `innerHTML`, plus a Content-Security-
Policy on the app page and on exported HTML). See
`docs/reviews/four-products-security-review.md`'s Resolution note for the
finding itself.

### Unit tests with real attack payloads

```
node --test test/sanitize-svg.test.mjs
→ 9/9 pass
```

Each test feeds `src/lib/sanitize-svg.mjs` a real malicious SVG string and
asserts the dangerous part is gone: an embedded `<script>`, a `foreignObject`
containing `<script>`/`onerror`, `onload`/`onerror`/`onclick` attributes on
plain SVG elements, an `<animate onbegin="...">` (a known SVG-specific
script-execution bypass class, distinct from plain event-handler attributes),
a `javascript:` URI and a `data:text/html` URI used as a link `href`, and
`<iframe>`/`<object>`/`<embed>` tags. Two further tests confirm sanitizing
does **not** break legitimate output: an ordinary Mermaid-shaped SVG (including
its `<style>` block, which Mermaid's theming depends on) survives intact, and
Arabic text content in a label survives intact.

Full suite after this change: `npm test` → **55/55 pass** (was 45 before S6;
+9 sanitizer tests, +1 export-HTML CSP test).

### Live browser: malicious Markdown/Mermaid sample, real CSP, real bundle

Run via `node scripts/verify-xss.mjs` — the same real-browser setup as
`verify-render.mjs`, opening
[`test/fixtures/s6-malicious.md`](./test/fixtures/s6-malicious.md) through
the real file-open UI. That fixture contains, in one file: raw
`<img onerror>` and `<script>` directly in the Markdown body; a Mermaid
`click A "javascript:...​"` directive (a real, historically known Mermaid
exploit class); a Mermaid node label containing an `<img onerror>`; and a
plain legitimate diagram.

```
Payload check (should all be empty/undefined): {}
Legitimate diagram still rendered: true (3 svg, 0 errors)
CSP backstop — external script blocked: true violations recorded: [{"directive":"script-src-elem","blockedURI":"https://example.invalid/evil.js"}]
VERIFY OK — all S6 payloads neutralized, CSP enforced, legitimate content unaffected.
```

Four things this specific run checks, each independently:

1. None of the four injected `window.__pwned_*` markers got set — no payload executed.
2. The raw `<script>` tag never reached the rendered preview HTML at all (confirms `markdown-render.mjs`'s existing `html:false` escaping independently of the new sanitizer).
3. The legitimate 4th diagram still rendered as real SVG — the sanitizer is not over-blocking.
4. **The CSP is a real, enforced backstop, not just a meta tag that happens to be present**: after the app loaded, the script injected `<script src="https://example.invalid/evil.js">` directly via `page.evaluate` (bypassing Waraq's own code entirely) and confirmed (a) the script never ran, and (b) a real `securitypolicyviolation` DOM event fired naming the blocked URI and the violated directive. The CSP's own `script-src` was also asserted to contain no `'unsafe-inline'`.

### A real bug this testing caught and fixed (not S6, found while re-verifying offline mode per the task's own checklist)

The first version of the CSP/sanitizer change passed every check above but
**broke offline mode**: `src/sw-source.js`'s runtime cache write for
non-precached assets was a bare un-awaited promise inside the fetch handler,
not wrapped in `event.waitUntil()`, so it could be silently killed before
finishing — and separately, Mermaid only dynamically imports the specific
per-diagram-type module(s) a document actually uses (plus some shared
registry code), so "cache opportunistically on first online use" left real
gaps for any chunk not yet triggered online. Fixed by (1) wrapping the cache
write in `event.waitUntil()`, and (2) having the service worker's `install`
step background-precache **every** built chunk (`Promise.allSettled`, each
file fetched/cached independently so one flaky fetch can't fail the whole
install), not only the handful known to be needed for first paint. Re-verified
with a fresh install and zero prior online file-open — offline render worked
immediately (136 cached entries, KaTeX + Mermaid both rendered offline).

## What was not verified

- Real Windows "Open with" / Android "Share to" end-to-end behavior on an
  actual installed PWA — the File Handling and Web Share Target APIs are
  exercised in code (`src/app.js`, `src/sw-source.js`) and are standard,
  documented browser capabilities, but installing the deployed app on a
  real Windows/Android device and performing the OS-level file-open/share
  flow was not done as part of this build. This is stated as unverified,
  not claimed as tested.
- iOS/Safari and Firefox are confirmed, from the published specs, to lack
  File Handling API support — not from testing a device, from the absence
  of the API in those engines' documentation.
