// Pure, DOM-free front-matter splitter. Parsing the YAML itself is left to the
// caller (js-yaml in the browser bundle) so this module has zero dependencies
// and is trivial to unit-test.
//
// Recognises a leading `---\n ... \n---` (or `...`) block, CRLF or LF, as the
// only supported front-matter fence (the common Jekyll/Hugo/Obsidian form).
// Anything else (no fence, or a fence that never closes) is treated as a
// document with no front matter — we never guess.

const FENCE = /^---[ \t]*\r?\n/;
const CLOSING_FENCE = /^(?:---|\.\.\.)[ \t]*\r?\n?$/;

/**
 * @param {string} raw full file text
 * @returns {{ hasFrontMatter: boolean, raw: string|null, body: string }}
 */
export function splitFrontMatter(raw) {
  if (typeof raw !== 'string' || !FENCE.test(raw)) {
    return { hasFrontMatter: false, raw: null, body: raw ?? '' };
  }

  const firstNewline = raw.indexOf('\n');
  const rest = raw.slice(firstNewline + 1);
  const lines = rest.split(/\r?\n/);

  let closeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (CLOSING_FENCE.test(lines[i] + '\n')) {
      closeIndex = i;
      break;
    }
  }

  if (closeIndex === -1) {
    // Opening fence with no closing fence: not front matter, just a document
    // that happens to start with "---" (e.g. a markdown thematic break).
    return { hasFrontMatter: false, raw: null, body: raw };
  }

  const yamlLines = lines.slice(0, closeIndex);
  const bodyLines = lines.slice(closeIndex + 1);
  // Drop a single leading blank line after the fence, which is the common
  // style, without eating intentional blank lines the author added.
  if (bodyLines[0] === '') bodyLines.shift();

  return {
    hasFrontMatter: true,
    raw: yamlLines.join('\n'),
    body: bodyLines.join('\n'),
  };
}
