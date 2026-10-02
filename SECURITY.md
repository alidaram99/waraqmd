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
  Mermaid's own HTML-in-labels and click-interaction features.
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
