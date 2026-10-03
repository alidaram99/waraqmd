# Waraq (ورق)

A free, offline-first Markdown reader and editor — installable as your
device's default app for opening `.md` files, on both desktop and phone.

**[Open the app](https://alidaram99.github.io/waraqmd/app/)** · **[Set it as your default .md app](https://alidaram99.github.io/waraqmd/#default)** · [Research](./RESEARCH.md) · [Verification](./VERIFY.md)

## Why

Windows opens `.md` in Notepad. There is no default on macOS or Linux. Phones
have essentially nothing. The tools that *do* render Markdown well (Typora,
Obsidian, VS Code) are either paid, heavy, desktop-only, or not installable
as an OS-level file handler. See [RESEARCH.md](./RESEARCH.md) for the full
competitor comparison and sourcing.

## What it does

- Opens `.md`, `.markdown`, `.mdx`, `.txt`, `.json`, `.yaml`, `.yml`, `.log` —
  via a file picker, drag-and-drop, paste, or (once installed) as the
  registered "Open with" app on **Windows, Android and ChromeOS** (the
  [File Handling API](https://developer.chrome.com/docs/capabilities/web-apis/file-handling)
  is Chromium-only; Safari/iOS and Firefox do not support it, and Waraq says
  so rather than pretending otherwise).
- Renders GitHub-flavored tables, task lists, strikethrough, fenced code with
  syntax highlighting, **Mermaid** diagrams and **KaTeX** math.
- Gives **every paragraph, heading, list item and table cell its own
  automatic text direction** via the HTML `dir="auto"` attribute — i.e. the
  browser's native Unicode bidi algorithm, not a hand-rolled heuristic — so
  Arabic and English can sit in the same document, even the same line.
- Renders YAML front matter as a collapsible metadata card instead of a
  stray code block.
- Lazily mounts large documents section-by-section as you scroll, instead of
  rendering (and freezing on) the whole thing at once.
- Edits and **saves back to the same file** on Chromium browsers via the
  File System Access API; falls back to a plain download elsewhere.
- Works **fully offline** after the first visit (service worker); nothing
  you open is ever uploaded anywhere — there is no server component at all.
- Arabic and English UI, light/dark/system theme, print/export-to-PDF, and
  export to a single standalone HTML file.

## Known limitations (stated plainly, not buried)

- File-handler "default app" registration only works in Chromium browsers
  (Chrome/Edge) on Windows, ChromeOS and Android (installed WebAPK) — not
  Safari/iOS or Firefox, because those engines don't implement the File
  Handling API yet.
- Mermaid diagram **labels** in Arabic script may not shape correctly — a
  constraint of Mermaid's own SVG text layer, found during our own
  verification (see VERIFY.md), not of Waraq's bidi handling. Prose, tables,
  lists and headings are unaffected.
- `v0.1.0` has no paid tier. RESEARCH.md sketches what a later one might add
  (share links, sync, more themes, bring-your-own-key AI summarize) — none
  of that is built yet.
- Recent-files persistence depends on the File System Access API (handles
  stored in IndexedDB); browsers without it (Firefox, Safari) can still open
  and edit files, just without a "recent files" list across reloads.

## Security posture

Embedded raw HTML in a Markdown source is **always shown as escaped text,
never executed** (`html: false` in the renderer) — deliberately, because
this app is meant to become the default opener for files from any source
(downloads, phone shares, another agent's output), and a `.md` extension is
not a trust signal. See [`src/lib/markdown-render.mjs`](./src/lib/markdown-render.mjs)
for the exact rule and its test coverage.

As of v0.1.1, Mermaid's rendered SVG is **independently sanitized with
DOMPurify** before it touches `innerHTML` — not trusting Mermaid's own
`securityLevel: 'strict'` alone — and the app ships a **Content-Security-
Policy** (`script-src 'self'`, no `'unsafe-inline'`; `object-src`/`base-uri
'none'`); exported standalone HTML gets its own CSP with `script-src
'none'`. This closes security review finding S6; see
[SECURITY.md](./SECURITY.md) and [VERIFY.md](./VERIFY.md) for the fix and
its regression tests (including a live-browser run against real malicious
Mermaid/Markdown payloads).

## Development

```sh
npm install
npm test            # 55 unit tests, pure logic only — no browser required
npm run build        # generates docs/app/{assets,manifest.webmanifest,sw.js}
npm run icons         # regenerates docs/app/icons/*.png (needs Python + Pillow)
node scripts/verify-render.mjs   # drives a real browser against the build: Arabic/Mermaid/KaTeX
node scripts/verify-xss.mjs       # same, but with malicious Markdown/Mermaid payloads (security review S6)
```

`docs/app/assets/`, `manifest.webmanifest` and `sw.js` are build output
(git-ignored) — CI rebuilds them fresh before every Pages deploy, so they
never need to be committed or kept in sync by hand.

## Architecture

- `src/lib/*.mjs` — pure, DOM-free, unit-tested logic: front-matter
  splitting, the markdown-it + KaTeX + task-lists + Mermaid-placeholder
  render pipeline, table-of-contents building, large-file chunking,
  i18n strings, and the standalone-HTML exporter. These run identically in
  Node (tests) and in the browser bundle.
- `src/app.js` — the only DOM-touching file: wires the editor/preview panes,
  file I/O (File System Access API, drag-drop, paste, launchQueue,
  share_target), themes, language, recent files (IndexedDB), and lazily
  `import()`s Mermaid only when a document actually contains a diagram (it
  is the single largest dependency at ~4MB unminified; most Markdown has no
  diagrams in it).
- `src/sw-source.js` → built into `docs/app/sw.js` — precaches the app
  shell, runtime-caches everything else it fetches (so a Mermaid chunk
  fetched once works offline after that), and answers Android's
  `share_target` POST by stashing the shared file in a Cache entry the app
  reads on next load.

## License

MIT — see [LICENSE](./LICENSE).
