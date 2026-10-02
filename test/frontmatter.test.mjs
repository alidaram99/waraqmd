import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitFrontMatter } from '../src/lib/frontmatter.mjs';

test('no front matter: body is unchanged, raw is null', () => {
  const r = splitFrontMatter('# Hello\n\nBody text.\n');
  assert.equal(r.hasFrontMatter, false);
  assert.equal(r.raw, null);
  assert.equal(r.body, '# Hello\n\nBody text.\n');
});

test('splits a standard --- fenced front matter block', () => {
  const r = splitFrontMatter('---\ntitle: Hi\ntags: [a, b]\n---\n\n# Body\n');
  assert.equal(r.hasFrontMatter, true);
  assert.equal(r.raw, 'title: Hi\ntags: [a, b]');
  assert.equal(r.body, '# Body\n');
});

test('supports a ... closing fence', () => {
  const r = splitFrontMatter('---\nx: 1\n...\nBody\n');
  assert.equal(r.hasFrontMatter, true);
  assert.equal(r.raw, 'x: 1');
  assert.equal(r.body, 'Body\n');
});

test('handles CRLF line endings', () => {
  const r = splitFrontMatter('---\r\nx: 1\r\n---\r\nBody\r\n');
  assert.equal(r.hasFrontMatter, true);
  assert.equal(r.raw, 'x: 1');
});

test('a --- with no closing fence is not front matter (e.g. a thematic break at the top)', () => {
  const r = splitFrontMatter('---\nnot front matter, just a long document\nwith no closing fence\n');
  assert.equal(r.hasFrontMatter, false);
  assert.equal(r.body.startsWith('---'), true);
});

test('empty input does not throw', () => {
  const r = splitFrontMatter('');
  assert.equal(r.hasFrontMatter, false);
  assert.equal(r.body, '');
});

test('non-string input returns empty body instead of throwing', () => {
  const r = splitFrontMatter(undefined);
  assert.equal(r.hasFrontMatter, false);
  assert.equal(r.body, '');
});
