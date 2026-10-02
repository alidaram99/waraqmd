import { test } from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { buildToc, slugify } from '../src/lib/toc.mjs';

const md = new MarkdownIt();

test('slugify matches GitHub-style slugs', () => {
  const seen = new Map();
  assert.equal(slugify('Hello World!', seen), 'hello-world');
  assert.equal(slugify('A/B Testing', seen), 'ab-testing');
});

test('slugify de-duplicates repeated headings like GitHub does', () => {
  const seen = new Map();
  assert.equal(slugify('Notes', seen), 'notes');
  assert.equal(slugify('Notes', seen), 'notes-1');
  assert.equal(slugify('Notes', seen), 'notes-2');
});

test('slugify keeps Arabic letters intact rather than stripping them to empty', () => {
  const seen = new Map();
  const slug = slugify('مقدمة', seen);
  assert.equal(slug, 'مقدمة');
});

test('buildToc extracts a flat heading list in document order', () => {
  const tokens = md.parse('# Title\n\n## Section A\n\ntext\n\n## Section B\n', {});
  const { flat } = buildToc(tokens);
  assert.deepEqual(
    flat.map((h) => [h.level, h.text]),
    [[1, 'Title'], [2, 'Section A'], [2, 'Section B']],
  );
});

test('buildToc nests deeper headings under the nearest shallower one', () => {
  const tokens = md.parse('# A\n## A.1\n### A.1.a\n## A.2\n# B\n', {});
  const { tree } = buildToc(tokens);
  assert.equal(tree.length, 2); // A, B
  assert.equal(tree[0].text, 'A');
  assert.equal(tree[0].children.length, 2); // A.1, A.2
  assert.equal(tree[0].children[0].children.length, 1); // A.1.a
  assert.equal(tree[0].children[0].children[0].text, 'A.1.a');
  assert.equal(tree[1].text, 'B');
  assert.equal(tree[1].children.length, 0);
});

test('a document that jumps from h1 straight to h3 does not throw', () => {
  const tokens = md.parse('# A\n### Deep\n', {});
  const { tree } = buildToc(tokens);
  assert.equal(tree[0].children[0].text, 'Deep');
});

test('a document with no headings yields an empty TOC, not an error', () => {
  const tokens = md.parse('Just a paragraph.\n', {});
  const { flat, tree } = buildToc(tokens);
  assert.deepEqual(flat, []);
  assert.deepEqual(tree, []);
});
