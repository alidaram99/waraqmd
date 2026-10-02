import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedFile, isMarkdownFile, acceptMap, acceptAttribute } from '../src/lib/filetypes.mjs';

test('accepts every documented markdown-family extension, case-insensitively', () => {
  for (const ext of ['.md', '.MD', '.markdown', '.mdx', '.mdown', '.mkd']) {
    assert.equal(isSupportedFile(`report${ext}`), true, ext);
    assert.equal(isMarkdownFile(`report${ext}`), true, ext);
  }
});

test('accepts plain-text companion types but does not treat them as markdown', () => {
  for (const ext of ['.txt', '.json', '.yaml', '.yml', '.log']) {
    assert.equal(isSupportedFile(`data${ext}`), true, ext);
    assert.equal(isMarkdownFile(`data${ext}`), false, ext);
  }
});

test('rejects unrelated and unsafe extensions', () => {
  for (const name of ['app.exe', 'image.png', 'archive.zip', 'noextension']) {
    assert.equal(isSupportedFile(name), false, name);
  }
});

test('acceptMap groups extensions under their MIME type with no duplicates lost', () => {
  const map = acceptMap();
  assert.ok(map['text/markdown'].includes('.md'));
  assert.ok(map['text/markdown'].includes('.mdx'));
  assert.ok(map['text/plain'].includes('.txt'));
  assert.ok(map['text/plain'].includes('.log'));
});

test('acceptAttribute lists every supported extension for <input accept>', () => {
  const attr = acceptAttribute();
  for (const ext of ['.md', '.markdown', '.mdx', '.txt', '.json', '.yaml', '.yml', '.log']) {
    assert.ok(attr.includes(ext), ext);
  }
});
