// Single source of truth for "which files does Waraq open" — used by the
// drag-drop handler, the <input accept> attribute, the PWA manifest's
// file_handlers, and the open-file-picker filter. Keeping one table means the
// manifest can never silently drift from what the app actually accepts.

export const SUPPORTED_TYPES = [
  { ext: '.md', mime: 'text/markdown' },
  { ext: '.markdown', mime: 'text/markdown' },
  { ext: '.mdown', mime: 'text/markdown' },
  { ext: '.mkd', mime: 'text/markdown' },
  { ext: '.mdx', mime: 'text/markdown' },
  { ext: '.txt', mime: 'text/plain' },
  { ext: '.json', mime: 'application/json' },
  { ext: '.yaml', mime: 'text/yaml' },
  { ext: '.yml', mime: 'text/yaml' },
  { ext: '.log', mime: 'text/plain' },
];

const EXT_SET = new Set(SUPPORTED_TYPES.map((t) => t.ext));

/** @param {string} name a file name or path */
export function isSupportedFile(name) {
  if (typeof name !== 'string') return false;
  const dot = name.lastIndexOf('.');
  if (dot === -1) return false;
  return EXT_SET.has(name.slice(dot).toLowerCase());
}

/** The `accept` map shape `file_handlers` and `<input accept>` both want. */
export function acceptMap() {
  /** @type {Record<string, string[]>} */
  const byMime = {};
  for (const { ext, mime } of SUPPORTED_TYPES) {
    (byMime[mime] ??= []).push(ext);
  }
  return byMime;
}

/** Comma list for the plain HTML `accept` attribute. */
export function acceptAttribute() {
  return SUPPORTED_TYPES.map((t) => t.ext).join(',');
}

/**
 * Markdown-family extensions get the full renderer (Mermaid/KaTeX/TOC/etc).
 * Everything else supported is shown as plain monospace text so an agent's
 * stray .json/.log is still readable, without pretending it is Markdown.
 */
const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdown', '.mkd', '.mdx']);
export function isMarkdownFile(name) {
  if (typeof name !== 'string') return false;
  const dot = name.lastIndexOf('.');
  if (dot === -1) return false;
  return MARKDOWN_EXT.has(name.slice(dot).toLowerCase());
}
