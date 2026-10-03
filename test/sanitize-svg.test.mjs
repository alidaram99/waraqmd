import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createSvgSanitizer } from '../src/lib/sanitize-svg.mjs';

const { sanitize } = createSvgSanitizer(new JSDOM('').window);

test('strips a <script> tag embedded directly in the SVG', () => {
  const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><script>window.__pwned=1</script><rect width="10" height="10"/></svg>`;
  const clean = sanitize(dirty);
  assert.ok(!clean.includes('<script'), clean);
  assert.ok(!clean.includes('__pwned'), clean);
});

test('strips foreignObject with embedded HTML/script — the classic SVG XSS vector', () => {
  const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><script>window.__pwned=1</script><img src=x onerror="window.__pwned=2"></body></foreignObject></svg>`;
  const clean = sanitize(dirty);
  assert.ok(!clean.includes('foreignObject'), clean);
  assert.ok(!clean.includes('<script'), clean);
  assert.ok(!clean.includes('onerror'), clean);
  assert.ok(!clean.includes('__pwned'), clean);
});

test('strips onload/onerror/onclick event-handler attributes on ordinary SVG elements', () => {
  const dirty = `<svg xmlns="http://www.w3.org/2000/svg" onload="window.__pwned=1"><image href="x" onerror="window.__pwned=2"/><rect onclick="window.__pwned=3" width="1" height="1"/></svg>`;
  const clean = sanitize(dirty);
  for (const handler of ['onload', 'onerror', 'onclick']) {
    assert.ok(!clean.includes(handler), `${handler} survived: ${clean}`);
  }
});

test('strips an animate element using onbegin/onend to run script (a known SVG bypass class)', () => {
  const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"><animate attributeName="x" onbegin="window.__pwned=1" to="1" /></rect></svg>`;
  const clean = sanitize(dirty);
  assert.ok(!clean.includes('onbegin'), clean);
});

test('strips a javascript: URI used as a link href inside the SVG', () => {
  const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:window.__pwned=1"><text>click</text></a></svg>`;
  const clean = sanitize(dirty);
  assert.ok(!/javascript:/i.test(clean), clean);
});

test('strips a data:text/html URI (which would otherwise execute script if navigated to)', () => {
  const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html,&lt;script&gt;window.__pwned=1&lt;/script&gt;"><text>click</text></a></svg>`;
  const clean = sanitize(dirty);
  assert.ok(!/data:text\/html/i.test(clean), clean);
});

test('strips iframe/object/embed tags even if Mermaid would never normally emit them', () => {
  const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><iframe src="javascript:window.__pwned=1"></iframe><object data="javascript:window.__pwned=2"></object></svg>`;
  const clean = sanitize(dirty);
  assert.ok(!clean.includes('<iframe'), clean);
  assert.ok(!clean.includes('<object'), clean);
});

test('keeps ordinary, safe Mermaid-shaped output intact — sanitizing must not break real diagrams', () => {
  const safe = `<svg xmlns="http://www.w3.org/2000/svg" id="m1" class="mermaid"><style>.node rect{fill:#eee;stroke:#333;}</style><g class="nodes"><g class="node" id="A"><rect width="80" height="40" rx="5"/><text x="40" y="24">Start</text></g></g><path class="edgePath" d="M10,10 L50,50" marker-end="url(#arrow)"/></svg>`;
  const clean = sanitize(safe);
  assert.ok(clean.includes('<rect'), clean);
  assert.ok(clean.includes('<text'), clean);
  assert.ok(clean.includes('Start'));
  assert.ok(clean.includes('<style'), 'style block (diagram theming) should survive — Mermaid relies on it');
  assert.ok(clean.includes('<path'), clean);
});

test('keeps Arabic text content in diagram labels intact', () => {
  const safe = `<svg xmlns="http://www.w3.org/2000/svg"><text>نعم</text></svg>`;
  const clean = sanitize(safe);
  assert.ok(clean.includes('نعم'), clean);
});
