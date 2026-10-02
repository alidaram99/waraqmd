import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderTokenRange } from '../src/lib/markdown-render.mjs';
import { chunkSections } from '../src/lib/chunk.mjs';

test('splits off front matter and does not render it as a code block', () => {
  const { html, frontMatterRaw } = renderMarkdown('---\ntitle: Report\n---\n\n# Report\n');
  assert.equal(frontMatterRaw, 'title: Report');
  assert.ok(html.includes('<h1'));
  assert.ok(!html.includes('title: Report'));
});

test('renders GFM tables without a plugin — markdown-it ships this by default', () => {
  const { html } = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n');
  assert.ok(html.includes('<table>'));
  assert.ok(/<td[^>]*>1<\/td>/.test(html));
});

test('renders a clickable, GitHub-style task list', () => {
  const { html } = renderMarkdown('- [ ] todo\n- [x] done\n');
  assert.ok(html.includes('checkbox'));
  assert.ok(/checked/.test(html));
});

test('renders strikethrough', () => {
  const { html } = renderMarkdown('~~gone~~\n');
  assert.ok(html.includes('<s>gone</s>'));
});

test('renders inline and block math via KaTeX, not as literal dollar signs', () => {
  const inline = renderMarkdown('The value is $x^2$ here.\n').html;
  assert.ok(inline.includes('katex'));
  assert.ok(!inline.includes('$x^2$'));

  const block = renderMarkdown('$$\n\\int_0^1 x\\,dx\n$$\n').html;
  assert.ok(block.includes('katex'));
});

test('emits a mermaid placeholder instead of a highlighted code block, for app.js to finish', () => {
  const { html } = renderMarkdown('```mermaid\ngraph TD;\nA-->B;\n```\n');
  assert.ok(html.includes('data-mermaid-pending'));
  assert.ok(html.includes('graph TD;'));
  assert.ok(!html.includes('hljs'));
});

test('a non-mermaid fenced code block is still syntax highlighted normally', () => {
  const { html } = renderMarkdown('```js\nconst x = 1;\n```\n');
  assert.ok(html.includes('<pre>'));
  assert.ok(html.includes('<code'));
});

test('never executes embedded raw HTML — it is escaped as text', () => {
  const { html } = renderMarkdown('<script>alert(1)</script>\n\nSome *text*.\n');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('assigns dir="auto" to paragraphs, headings, list items and table cells', () => {
  const { html } = renderMarkdown('# Title\n\nA paragraph.\n\n- item one\n\n| h |\n| - |\n| c |\n');
  // Note: '<th' must not be searched for directly, since it would match
  // the start of '<thead>' instead of an actual <th> cell.
  const opens = ['<h1', '<p', '<li', '<th ', '<td'];
  for (const tag of opens) {
    const i = html.indexOf(tag);
    assert.ok(i !== -1, `${tag} not found`);
    const tagEnd = html.indexOf('>', i);
    assert.ok(html.slice(i, tagEnd).includes('dir="auto"'), `${tag} missing dir=auto`);
  }
});

test('heading ids match the TOC slugs exactly, so anchor links resolve', () => {
  const { html, toc } = renderMarkdown('## Hello World\n\ntext\n');
  assert.equal(toc.flat[0].slug, 'hello-world');
  assert.ok(html.includes('id="hello-world"'));
});

test('mixed Arabic and English headings each still get a stable, non-empty slug', () => {
  const { toc } = renderMarkdown('## مقدمة\n\n## Introduction\n');
  assert.equal(toc.flat.length, 2);
  assert.ok(toc.flat[0].slug.length > 0);
  assert.notEqual(toc.flat[0].slug, toc.flat[1].slug);
});

test('renderTokenRange of every chunk, concatenated, reproduces the full-document render', () => {
  const source = '# A\ntext a\n## B\ntext b\n## C\ntext c\n### D\ntext d\n';
  const { html, tokens } = renderMarkdown(source);
  const chunks = chunkSections(tokens, { targetLines: 2 });
  const stitched = chunks.map((c) => renderTokenRange(tokens, c.startTokenIndex, c.endTokenIndex)).join('');
  assert.equal(stitched, html);
});

test('renderTokenRange resolves heading ids correctly even when chunks render out of document order', () => {
  const { tokens } = renderMarkdown('# First\ntext\n# Second\ntext\n# Third\ntext\n');
  const chunks = chunkSections(tokens, { targetLines: 1 });
  assert.ok(chunks.length >= 2, 'expected the document to actually split into multiple chunks');
  // Render last chunk first, as a lazily-mounted large file would if the
  // reader jumps straight to the end via the TOC.
  const lastFirst = renderTokenRange(tokens, chunks[chunks.length - 1].startTokenIndex, chunks[chunks.length - 1].endTokenIndex);
  assert.ok(lastFirst.includes('id="third"') || lastFirst.includes('id="second"'));
  const firstChunk = renderTokenRange(tokens, chunks[0].startTokenIndex, chunks[0].endTokenIndex);
  assert.ok(firstChunk.includes('id="first"'));
});

test('renderMarkdown is safe to call repeatedly with different documents (no state leaks between calls)', () => {
  const first = renderMarkdown('## One\n## Two\n');
  const second = renderMarkdown('## Only\n');
  assert.equal(first.toc.flat.length, 2);
  assert.equal(second.toc.flat.length, 1);
  assert.ok(second.html.includes('id="only"'));
  assert.ok(!second.html.includes('id="two"'));
});
