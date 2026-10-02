// The one rendering pipeline shared by the live preview, the print view and
// the "export standalone HTML" feature. Deliberately dependency-light and
// DOM-free: everything in here runs the same way in Node (for the unit
// tests below) and inside the browser bundle.
//
// Two safety/architecture decisions worth being explicit about, because they
// are easy to get quietly wrong in a tool whose whole pitch is "open
// whatever file lands on your device":
//
// 1. `html: false`. Raw HTML in the source is shown as literal escaped text,
//    never executed. Waraq is meant to become the OS-level default opener
//    for .md files from *any* source — downloads, phone shares, another
//    agent's output. A file is not a trusted input just because its
//    extension is .md, so embedded <script>/<iframe>/<style> never run.
// 2. Mermaid and KaTeX rendering happen *after* this module returns HTML,
//    in the browser only (see app.js). This module only emits the
//    placeholder markup; it never talks to the DOM, which is what keeps it
//    testable in plain Node.

import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
// highlight.js's default export bundles all ~190 languages (~1MB+ even
// minified). Agent output and everyday notes only ever need a couple dozen
// of those, so we pull in `lib/core` (no languages) and register a curated
// list by hand — a large but finite saving applied once, at module load,
// not per render.
import hljs from 'highlight.js/lib/core';
import hjBash from 'highlight.js/lib/languages/bash';
import hjC from 'highlight.js/lib/languages/c';
import hjCpp from 'highlight.js/lib/languages/cpp';
import hjCss from 'highlight.js/lib/languages/css';
import hjDiff from 'highlight.js/lib/languages/diff';
import hjDockerfile from 'highlight.js/lib/languages/dockerfile';
import hjGo from 'highlight.js/lib/languages/go';
import hjGraphql from 'highlight.js/lib/languages/graphql';
import hjIni from 'highlight.js/lib/languages/ini';
import hjJava from 'highlight.js/lib/languages/java';
import hjJson from 'highlight.js/lib/languages/json';
import hjJs from 'highlight.js/lib/languages/javascript';
import hjTs from 'highlight.js/lib/languages/typescript';
import hjMarkdown from 'highlight.js/lib/languages/markdown';
import hjPhp from 'highlight.js/lib/languages/php';
import hjPython from 'highlight.js/lib/languages/python';
import hjRuby from 'highlight.js/lib/languages/ruby';
import hjRust from 'highlight.js/lib/languages/rust';
import hjShell from 'highlight.js/lib/languages/shell';
import hjSql from 'highlight.js/lib/languages/sql';
import hjXml from 'highlight.js/lib/languages/xml';
import hjYaml from 'highlight.js/lib/languages/yaml';
import { splitFrontMatter } from './frontmatter.mjs';
import { buildToc } from './toc.mjs';

for (const [name, lang] of Object.entries({
  bash: hjBash, c: hjC, cpp: hjCpp, css: hjCss, diff: hjDiff, dockerfile: hjDockerfile,
  go: hjGo, graphql: hjGraphql, ini: hjIni, java: hjJava, json: hjJson,
  javascript: hjJs, typescript: hjTs, markdown: hjMarkdown, php: hjPhp,
  python: hjPython, ruby: hjRuby, rust: hjRust, shell: hjShell, sql: hjSql,
  xml: hjXml, yaml: hjYaml,
})) {
  hljs.registerLanguage(name, lang);
}

// Block-level tags that should get automatic per-element bidi direction.
// This delegates the actually-hard part — deciding, for a run of mixed
// Arabic/English/number text, which way it reads — to the browser's native
// Unicode Bidirectional Algorithm via the HTML `dir="auto"` attribute,
// rather than a hand-rolled heuristic. `dir="auto"` picks direction from the
// *first strong-directional character* of each element independently, which
// is exactly "per-paragraph" (and, here, per-list-item/per-cell) direction.
const AUTO_DIR_RULES = [
  'paragraph_open',
  'heading_open',
  'blockquote_open',
  'list_item_open',
  'th_open',
  'td_open',
];

function highlightCode(code, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      /* fall through to escaped default below */
    }
  }
  return escapeHtml(code);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

let cachedMd = null;
function getMarkdownIt() {
  if (cachedMd) return cachedMd;

  const md = new MarkdownIt({
    html: false, // see module doc comment — never execute embedded HTML
    linkify: true,
    typographer: false, // don't rewrite quotes/dashes in code-heavy or Arabic text
    breaks: false,
    highlight: highlightCode,
  });

  md.use(taskLists, { enabled: true, label: true });
  md.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: { throwOnError: false, strict: 'ignore' },
  });

  // Mermaid: intercept ```mermaid fences before highlight.js ever sees them,
  // and emit a plain placeholder the browser-side app.js finishes with
  // mermaid.run(). Falls through to the normal fence renderer for every
  // other language.
  const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules) ?? null;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || '').trim().toLowerCase();
    if (info === 'mermaid') {
      return `<pre class="waraq-mermaid-source" data-mermaid-pending="1">${escapeHtml(token.content)}</pre>\n`;
    }
    return defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  // Per-element automatic bidi direction (see AUTO_DIR_RULES doc comment).
  // heading_open additionally reads its slug straight off the token object
  // (see `tagHeadingSlugs` below) instead of from a cursor that counts
  // headings as they render. A cursor would break the moment chunked
  // rendering (see `renderTokenRange`, used for large-file lazy mounting)
  // renders sections out of document order — e.g. the reader jumps via the
  // TOC to section 9 before section 2 has ever been mounted. Tagging the
  // token itself has no such ordering requirement.
  for (const ruleName of AUTO_DIR_RULES) {
    const original = md.renderer.rules[ruleName];
    md.renderer.rules[ruleName] = (tokens, idx, options, env, self) => {
      tokens[idx].attrSet('dir', 'auto');
      if (ruleName === 'heading_open' && tokens[idx]._waraqSlug) {
        tokens[idx].attrSet('id', tokens[idx]._waraqSlug);
      }
      if (original) return original(tokens, idx, options, env, self);
      return self.renderToken(tokens, idx, options);
    };
  }

  cachedMd = md;
  return cachedMd;
}

/** Stamps each heading_open token with the slug the TOC sidebar computed
 * for it, in document order, by walking the same tokens buildToc() just
 * walked. The slug then travels with the token object itself (slice()
 * copies references, not clones), so rendering a subset of tokens — any
 * subset, in any order — still produces the right heading ids. */
function tagHeadingSlugs(tokens, tocFlat) {
  let i = 0;
  for (const tok of tokens) {
    if (tok.type === 'heading_open') tok._waraqSlug = tocFlat[i++]?.slug;
  }
}

/**
 * @param {string} rawSource full file contents, front matter and all
 * @returns {{
 *   html: string,
 *   frontMatterRaw: string|null,
 *   toc: ReturnType<typeof buildToc>,
 *   tokens: any[],
 * }}
 */
export function renderMarkdown(rawSource) {
  const { hasFrontMatter, raw: frontMatterRaw, body } = splitFrontMatter(rawSource ?? '');
  const md = getMarkdownIt();
  const tokens = md.parse(body, {});

  const toc = buildToc(tokens);
  tagHeadingSlugs(tokens, toc.flat);

  const html = md.renderer.render(tokens, md.options, {});
  return { html, frontMatterRaw: hasFrontMatter ? frontMatterRaw : null, toc, tokens };
}

/**
 * Renders just `tokens[startIndex..endIndex]` (inclusive) — used by app.js
 * to lazily mount one chunk (see chunk.mjs) of a large document at a time.
 * `tokens` must already have gone through `renderMarkdown`'s tagging (i.e.
 * be the same `tokens` array `renderMarkdown` returned), so headings still
 * resolve to the right id no matter which slice renders first.
 */
export function renderTokenRange(tokens, startIndex, endIndex) {
  const md = getMarkdownIt();
  const slice = tokens.slice(startIndex, endIndex + 1);
  return md.renderer.render(slice, md.options, {});
}

export { AUTO_DIR_RULES };
