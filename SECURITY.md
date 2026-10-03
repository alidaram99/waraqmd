# Security

Waraq has no server component, no account system, and no telemetry. A file
opened in Waraq is read and (optionally) written back using the browser's
own File System Access API or a plain file picker/download — it is never
sent to any server operated by this project, including when you install the
app or export a file.

## What the app deliberately refuses to do

- **Embedded raw HTML in a Markdown source is never executed.** The render
  pipeline (`src/lib/markdown-render.mjs`) runs markdown-it with `html:
  false`; a `<script>`, `<iframe>` or `<style>` tag in a file is shown as
  literal escaped text. This matters specifically because Waraq is meant to
  become the default opener for `.md` files from *any* source — a download,
  a phone share, another agent's output — and a `.md` extension is not by
  itself a reason to trust a file's contents.
- **Mermaid diagrams run with `securityLevel: 'strict'`**, which disables
  Mermaid's own HTML-in-labels and click-interaction features — and, as of
  v0.1.1, the resulting SVG string is **independently sanitized with
  DOMPurify** (`src/lib/sanitize-svg.mjs`, SVG profile, `foreignObject` /
  `script` / `iframe` / `object` / `embed` explicitly forbidden) before it
  is ever assigned to `innerHTML`, rather than trusting Mermaid's own
  sanitizer alone. This was security review finding S6 — see
  `docs/reviews/four-products-security-review.md`'s Resolution note in the
  main monorepo for the full writeup, and `test/sanitize-svg.test.mjs` /
  `scripts/verify-xss.mjs` for the regression tests (9 unit tests with real
  attack payloads, plus a live-browser run against a malicious Markdown
  fixture that also confirms the legitimate diagram still renders).
- **The app page ships a Content-Security-Policy** (`docs/app/index.html`):
  `script-src 'self'` with no `'unsafe-inline'` exception (the app has zero
  inline scripts and zero inline event-handler attributes), `object-src
  'none'`, `base-uri 'none'`. `style-src` keeps `'unsafe-inline'`
  deliberately — KaTeX and Mermaid both position output almost entirely via
  generated-per-render inline `style="..."` attributes, so precomputed
  hashes are not practical there; this is a narrower, documented trade-off
  (CSS alone cannot execute script) rather than a blanket exception.
  Exported standalone HTML (`src/lib/export-html.mjs`) ships its own CSP
  with `script-src 'none'` — a saved file has no legitimate script at all.
- **No outbound network requests are made to render or save a file.** The
  only network activity after the first load is the browser fetching its
  own cached app assets (service worker) and, once built, the first-use
  download of Mermaid's renderer chunk — never the file you opened.

## File System Access permissions

Opening a file via the picker or drag-and-drop may grant a
`FileSystemFileHandle`; Waraq requests `readwrite` permission on that
specific handle only, scoped by the browser to that one file, and the
permission can be revoked at any time from the browser's own site settings.
Waraq stores handles for "recent files" in the browser's local IndexedDB —
never anywhere off-device.

## share_target (Android)

A file shared to the installed app is intercepted by the service worker,
held in a local Cache Storage entry, and read once by the app on next load,
then deleted from that cache. This never touches a network request of ours;
the service worker answers the share entirely on-device.

## Reporting a problem

Open an issue at <https://github.com/alidaram99/waraqmd/issues>.
