import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOCS = path.join(ROOT, 'docs');

function readHtml(relPath) {
  return readFileSync(path.join(DOCS, relPath), 'utf8');
}

function extract(html) {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
  const robots = /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] ?? '';
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? '';
  const hreflangs = [...html.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"/g)].map((m) => ({ lang: m[1], href: m[2] }));
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return { title, description, robots, canonical, hreflangs, ldBlocks };
}

// Pages this guard applies to: the real indexable pages, not the noindexed app shell (checked
// separately below — see "the /app/ shell is intentionally noindexed").
const INDEXABLE_PAGES = ['index.html', 'ar/index.html'];

test('every indexable page has a title <=60 chars and a description <=160 chars', () => {
  const violations = [];
  for (const page of INDEXABLE_PAGES) {
    const { title, description } = extract(readHtml(page));
    if (!title || title.length > 60) violations.push(`${page}: title is ${title.length} chars (max 60): ${title}`);
    if (!description || description.length > 160) violations.push(`${page}: description is ${description.length} chars (max 160): ${description}`);
  }
  assert.deepEqual(violations, []);
});

test('every indexable page has valid JSON-LD (every block parses)', () => {
  for (const page of INDEXABLE_PAGES) {
    const { ldBlocks } = extract(readHtml(page));
    assert.ok(ldBlocks.length > 0, `${page}: expected at least one JSON-LD block`);
    for (const block of ldBlocks) assert.doesNotThrow(() => JSON.parse(block), `${page}: invalid JSON-LD`);
  }
});

test('the English and Arabic pages hreflang-pair with each other, plus x-default', () => {
  const en = extract(readHtml('index.html'));
  const ar = extract(readHtml('ar/index.html'));
  const enUrl = 'https://alidaram99.github.io/waraqmd/';
  const arUrl = 'https://alidaram99.github.io/waraqmd/ar/';
  assert.equal(en.canonical, enUrl);
  assert.equal(ar.canonical, arUrl);
  assert.deepEqual(new Set(en.hreflangs.map((h) => `${h.lang}:${h.href}`)), new Set([`en:${enUrl}`, `ar:${arUrl}`, `x-default:${enUrl}`]));
  assert.deepEqual(new Set(ar.hreflangs.map((h) => `${h.lang}:${h.href}`)), new Set([`ar:${arUrl}`, `en:${enUrl}`, `x-default:${enUrl}`]));
});

test('the Arabic page is actually RTL and in Arabic, not just a translated string bolted onto the English shell', () => {
  const html = readHtml('ar/index.html');
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /ماركداون/);
});

test('the /app/ shell is intentionally noindexed with a self-canonical (round-10 SEO decision)', () => {
  const { robots, canonical } = extract(readHtml('app/index.html'));
  assert.equal(robots, 'noindex,follow');
  assert.equal(canonical, 'https://alidaram99.github.io/waraqmd/app/');
});

test('sitemap.xml lists only canonical, indexable HTML pages — not the noindexed /app/ shell', () => {
  const sitemap = readHtml('sitemap.xml');
  assert.doesNotMatch(sitemap, /\/app\//, '/app/ is noindexed; it must not be submitted in the sitemap');
  assert.match(sitemap, /<loc>https:\/\/alidaram99\.github\.io\/waraqmd\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/alidaram99\.github\.io\/waraqmd\/ar\/<\/loc>/);
});

test('neither page still claims Android gets OS-level file-association "Open with" (round-10 honesty fix)', () => {
  // The real, sourced claim is: Android gets "Share to Waraq" (Web Share Target), not a
  // file_handlers-based default-app registration — Chrome does not implement file_handlers
  // on Android. This guards against the inaccurate claim creeping back in.
  for (const page of INDEXABLE_PAGES) {
    const html = readHtml(page);
    assert.doesNotMatch(
      html,
      /Chrome registers installed PWAs as file handlers on Android/i,
      `${page}: contains the retracted claim that Chrome registers file handlers on Android`,
    );
  }
});
