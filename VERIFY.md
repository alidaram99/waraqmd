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
