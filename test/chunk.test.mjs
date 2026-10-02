import { test } from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { chunkSections } from '../src/lib/chunk.mjs';

const md = new MarkdownIt();

test('empty token list yields no chunks', () => {
  assert.deepEqual(chunkSections([]), []);
});

test('a short document with a few headings becomes one merged chunk', () => {
  const tokens = md.parse('# A\ntext\n## B\ntext\n## C\ntext\n', {});
  const chunks = chunkSections(tokens, { targetLines: 200 });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].startTokenIndex, 0);
  assert.equal(chunks[0].endTokenIndex, tokens.length - 1);
});

test('a chunk boundary never falls inside a section', () => {
  const lines = [];
  for (let i = 0; i < 20; i++) {
    lines.push(`## Section ${i}`);
    for (let j = 0; j < 15; j++) lines.push(`Paragraph line ${j} of section ${i}.`);
  }
  const source = lines.join('\n') + '\n';
  const tokens = md.parse(source, {});
  const chunks = chunkSections(tokens, { targetLines: 50 });

  assert.ok(chunks.length > 1, 'expected more than one chunk for a long document');

  // Every heading_open token must be the start of a section that is itself
  // the start of some chunk (i.e. no chunk starts mid-section) OR appears
  // strictly inside a chunk's span, never at a boundary that splits it from
  // its own following paragraphs before the next heading.
  const headingIndices = tokens
    .map((t, i) => (t.type === 'heading_open' ? i : -1))
    .filter((i) => i !== -1);
  for (const chunk of chunks) {
    // The token right after a chunk's end must be a heading_open (start of
    // the next section) or the end of the document — never a stray
    // paragraph that belongs with the content before it.
    const next = chunk.endTokenIndex + 1;
    if (next < tokens.length) {
      assert.ok(headingIndices.includes(next), `chunk boundary at token ${next} must start a new section`);
    }
  }
});

test('covers every token exactly once, in order, with no gaps', () => {
  const lines = [];
  for (let i = 0; i < 10; i++) {
    lines.push(`# H${i}`);
    lines.push(`Body ${i}`);
  }
  const tokens = md.parse(lines.join('\n') + '\n', {});
  const chunks = chunkSections(tokens, { targetLines: 1 });
  let cursor = 0;
  for (const c of chunks) {
    assert.equal(c.startTokenIndex, cursor);
    cursor = c.endTokenIndex + 1;
  }
  assert.equal(cursor, tokens.length);
});
