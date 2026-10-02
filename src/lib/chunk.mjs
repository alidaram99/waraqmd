// Splits a parsed document into render chunks at heading boundaries, so a
// huge agent-generated log or report can be mounted into the DOM a section
// at a time (via IntersectionObserver in app.js) instead of forcing one
// giant layout/paint on open. A chunk boundary only ever falls on a heading,
// never mid-section, so chunking never changes how any single section looks.
//
// Pure and token-shape-only: it needs nothing but markdown-it's own
// `heading_open` tokens (each carrying a `.map = [startLine, endLine]`) plus
// the index of the final token, so it is unit-testable without a real
// markdown-it instance or a browser.

/**
 * @param {Array<{type:string, map?: [number, number]|null}>} tokens
 * @param {{ targetLines?: number }} [opts]
 * @returns {Array<{ startTokenIndex: number, endTokenIndex: number, startLine: number, endLine: number }>}
 */
export function chunkSections(tokens, { targetLines = 200 } = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  const lastLine = tokens.reduce((max, t) => (t.map ? Math.max(max, t.map[1]) : max), 0);

  // Section boundaries: token index + source line of every top-level heading,
  // plus an implicit boundary at token 0 (the "preamble" before any heading,
  // if the document opens with prose rather than a heading).
  const boundaries = [{ tokenIndex: 0, line: 0 }];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open' && tokens[i].map) {
      boundaries.push({ tokenIndex: i, line: tokens[i].map[0] });
    }
  }
  // Drop the synthetic 0-boundary if a heading already starts at token 0.
  if (boundaries.length > 1 && boundaries[1].tokenIndex === 0) boundaries.shift();

  const sections = boundaries.map((b, i) => ({
    startTokenIndex: b.tokenIndex,
    endTokenIndex: i + 1 < boundaries.length ? boundaries[i + 1].tokenIndex - 1 : tokens.length - 1,
    startLine: b.line,
    endLine: i + 1 < boundaries.length ? boundaries[i + 1].line : lastLine,
  }));

  // Merge consecutive small sections into chunks of roughly `targetLines`,
  // but never split a single section across two chunks.
  const chunks = [];
  let current = null;
  for (const section of sections) {
    const sectionLines = Math.max(1, section.endLine - section.startLine);
    if (!current) {
      current = { ...section };
    } else if (current.endLine - current.startLine < targetLines) {
      current.endTokenIndex = section.endTokenIndex;
      current.endLine = section.endLine;
    } else {
      chunks.push(current);
      current = { ...section };
    }
    void sectionLines;
  }
  if (current) chunks.push(current);
  return chunks;
}
