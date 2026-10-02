import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStandaloneHtml } from '../src/lib/export-html.mjs';

test('produces a self-contained document with the CSS inlined, not linked', () => {
  const out = buildStandaloneHtml({ title: 'My Notes', bodyHtml: '<p>hi</p>', css: 'body{color:red}' });
  assert.ok(out.includes('<style>body{color:red}</style>'));
  assert.ok(!out.includes('<link'));
  assert.ok(out.includes('<p>hi</p>'));
});

test('escapes the title so it cannot break out of <title>', () => {
  const out = buildStandaloneHtml({ title: '</title><script>x</script>', bodyHtml: '', css: '' });
  assert.ok(!out.includes('<script>x</script>'));
  assert.ok(out.includes('&lt;/title&gt;'));
});

test('sets lang and a dir="auto" wrapper on the exported article', () => {
  const out = buildStandaloneHtml({ title: 't', bodyHtml: '<p>م</p>', css: '', lang: 'ar' });
  assert.ok(out.includes('<html lang="ar">'));
  assert.ok(out.includes('dir="auto"'));
});

test('defaults to a safe title and English lang when omitted', () => {
  const out = buildStandaloneHtml({ bodyHtml: '', css: '' });
  assert.ok(out.includes('<title>Untitled</title>'));
  assert.ok(out.includes('<html lang="en">'));
});
