# Research — a default Markdown reader/editor (Product D)

Scope: who else opens `.md` files today, where each one actually fails for
(a) agent-generated output, (b) Arabic/mixed-direction text, (c) phones, and
(d) "I just double-clicked a file and got Notepad." Sources are cited inline;
general "best markdown editor 2026" blog posts (most of the top search
results for this topic) are AI-generated SEO content with no byline or
testing methodology, so claims below lean on vendor docs, GitHub repos and
MDN/Chrome/web.dev platform docs instead, and say so where a claim could only
be checked against a blog.

## Competitors and where they actually fail

| Tool | Price | Agent-output fit | Arabic/RTL | Phone | OS default |
|---|---|---|---|---|---|
| **Typora** | $14.99 one-time, desktop only | Good preview, plugin-based Mermaid | No native per-paragraph bidi found | None | Not installable as a file handler |
| **Obsidian** | Free (Sync/Publish paid) | Good, heavy (Electron, vault-based) | Native per-line "Auto" direction *since v1.6* — the best of the desktop apps — but still needs a [community plugin](https://github.com/esm7/obsidian-rtl) for *per-note* persisted direction via front matter | None | Not an installable PWA/file handler; it's a full app you must already have open |
| **MarkText** | Free, OSS | Decent GFM | Not found in docs | None | No |
| **Zettlr** | Free, OSS (academic/Pandoc focus) | Citation-heavy, not agent-output-shaped | Not found in docs | None | No |
| **iA Writer** | Paid, Mac/iOS/Windows/Android | Clean, minimal diagram support | Not documented | Yes (native apps) but each platform is a separate paid app, not one PWA | No |
| **StackEdit / Dillinger / HackMD** | Free, web | Cloud-sync-first (Drive/Dropbox/GitHub); not built to just open a local file and save back | Not primary design goal | Browser tab, not installable as *the* file handler | No |
| **VS Code (+ Markdown Preview)** | Free | Great for developers already in VS Code; Mermaid needs an extension | No automatic per-paragraph bidi | No | No — and you must already have VS Code open |
| **GitHub mobile app** | Free | Renders `.md` *inside a repo view*, not an arbitrary local/shared file | Follows GitHub.com's renderer | Yes, but not a general file opener | No |
| **Markor (Android)** | Free, OSS, 4.72★/5.7k ratings ([AppBrain](https://www.appbrain.com/app/markor-markdown-editor-todo/net.gsantner.markor)) | No Mermaid; GFM support is basic; task lists yes | Not documented; UI is plain, dated | Yes — the closest thing Android has to a default `.md` app today | Android only, no desktop/PWA counterpart |

**The actual gap isn't "nobody renders Markdown well"** — several of the above do. It's that **no single tool is (1) a PWA installable as the OS-level file handler, (2) on both desktop and phone, (3) with genuinely automatic per-paragraph Arabic/English direction, and (4) free.** Obsidian comes closest on direction quality but is a heavy vault-based app you open, not a lightweight default opener a phone or Windows registers for `.md`.

## (a) Agent-output shape: huge files, Mermaid, math, task lists, front matter, tables, code

Agent output specifically stresses: very long single files (a full research report or log), fenced Mermaid diagrams, inline/block math, GFM task lists, YAML front matter, and large tables. Typora/Obsidian/MarkText handle most of this with plugins or built-ins; Markor renders none of Mermaid or KaTeX ([confirmed by its own feature comparisons](https://www.merge-json-files.com/blog/best-markdown-editor-for-android), though one SEO aggregator claims the opposite — treated as unreliable and not cited for this fact). Nothing in the table above lazily renders a huge file section-by-section; most just render everything at once.

## (b) Arabic / mixed-direction text

Obsidian's native "Auto" direction (since 1.6.0, [per its own changelog discussion](https://forum.obsidian.md/t/introduce-a-property-yaml-for-manually-managing-rtl-ltr-behavior-on-a-per-document-basis/84203)) decides direction **per line** from content — genuinely good, and the best existing baseline. The gap it still leaves: a persisted *per-note* direction still needs a community plugin, and Obsidian itself is not installable as a lightweight default `.md` opener. Most other desktop tools have no documented per-paragraph bidi at all.

Waraq's approach: don't hand-roll bidi detection (a famously easy thing to get subtly wrong). Set the HTML `dir="auto"` attribute on every rendered paragraph, heading, list item and table cell, and let the browser's own Unicode Bidirectional Algorithm decide direction from each element's first strong character — verified in `test/markdown-render.test.mjs` and with a live Arabic+English+numbers sample (see `VERIFY.md`). Code blocks are deliberately kept LTR always, since code is not naturally bidi text.

**One honest limitation found during our own verification, not from a competitor's docs:** Mermaid's SVG diagram labels do not reliably shape Arabic script (an edge label rendered as a narrow unshaped glyph in our own test diagram — a known constraint of Mermaid's text layer, not of Waraq's bidi handling). Diagram labels should stay in English/Latin script for now; prose, tables, lists and headings are unaffected.

## (c) Phones have no good default `.md` app

Markor is the only real Android-native option and has no Mermaid/KaTeX. iOS has essentially nothing lightweight and free. The W3C/Chrome **File Handling API** lets an installed PWA register as a file handler — and, per [Chrome's own docs](https://developer.chrome.com/docs/capabilities/web-apis/file-handling), this now works for installed PWAs on **Android (as a WebAPK) and ChromeOS, in addition to desktop Chrome/Edge** — not only desktop, which is what makes "one PWA, real default-app behavior on both laptop and phone" achievable today. It does **not** work in Safari/iOS or Firefox (no File Handling API support) — stated plainly in README rather than implied.

## (d) The OS default is nothing

Windows opens `.md` in Notepad (which, as of 2026, can show *some* formatting but is not an editor/renderer and has no Mermaid/KaTeX/TOC — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5788351/md-file-type)). There is no built-in macOS or Linux default either. This is the literal "default app" gap the owner asked about.

## Brand

Candidate names were checked against the npm registry and a GitHub repository-name search (exact match) on 2026-10-02. `waraq` (ورق, "paper" — a word understood across Arabic dialects, and the basis of `waraqa`, "a sheet of paper") had 164 unrelated GitHub hits as a substring, so the final name is **`waraqmd`**: 0 GitHub repositories by that exact name, 404 (unregistered) on the npm registry. No further trademark/domain clearance was done — same caveat every product this round has carried.

## What Waraq ships as paid-later (free now)

Per the owner's ask ("free or nearly free, with features worth paying for" — payment rail deferred): publish/share a read-only link to a rendered document, multi-device sync of recent files/settings, more themes, and an optional "summarize with your own API key" feature (the user's key, called directly from their own browser — Waraq never proxies or stores it). None of this is built in v0.1.0; it is left for a later round once there is a real signal anyone wants it, consistent with this team's "don't sell a feature nobody asked to pay for" norm from round 8.
