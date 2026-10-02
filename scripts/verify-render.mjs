#!/usr/bin/env node
// One-off manual verification: serves docs/ locally, drives the built app
// with a real browser (system Edge via playwright-core — no Chromium
// download needed) to open test/fixtures/sample.md, and checks that
// Arabic/English direction, Mermaid and KaTeX actually rendered. Not part
// of `npm test` (it needs a real browser binary on PATH); this is the
// "headless browser screenshot" verification step for the publish task.
import { chromium } from 'playwright-core';
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOCS = path.join(ROOT, 'docs');
const PORT = 8743;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      // Serve under /waraqmd/ to match the manifest's absolute paths.
      if (urlPath.startsWith('/waraqmd/')) urlPath = urlPath.slice('/waraqmd'.length);
      let filePath = path.join(DOCS, urlPath);
      if (urlPath.endsWith('/') || !path.extname(filePath)) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        res.writeHead(404);
        res.end('not found: ' + urlPath);
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function main() {
  const server = await startServer();
  const edgePath = process.env.WARAQ_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const logs = [];
  page.on('console', (msg) => logs.push(`[console:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto(`http://localhost:${PORT}/waraqmd/app/`, { waitUntil: 'networkidle' });

  const fixture = path.join(ROOT, 'test', 'fixtures', 'sample.md');
  await page.setInputFiles('#waraq-file-input', fixture);
  await page.waitForTimeout(1200); // debounce + mermaid chunk fetch + render

  const result = await page.evaluate(() => {
    const preview = document.getElementById('waraq-preview');
    const html = preview.innerHTML;
    const h2s = [...preview.querySelectorAll('h2')];
    const arabicH2 = h2s.find((h) => /مقدمة/.test(h.textContent));
    const englishH2 = h2s.find((h) => /English section/.test(h.textContent));
    return {
      hasKatex: html.includes('katex'),
      hasMermaidSvg: !!preview.querySelector('.waraq-mermaid-rendered svg'),
      hasMermaidError: !!preview.querySelector('.waraq-mermaid-error'),
      hasTaskList: html.includes('task-list-item'),
      hasTable: html.includes('<table>'),
      arabicDir: arabicH2 ? arabicH2.getAttribute('dir') : null,
      englishDir: englishH2 ? englishH2.getAttribute('dir') : null,
      filename: document.getElementById('waraq-filename').textContent,
      frontMatterShown: html.includes('waraq-frontmatter'),
      bodyDir: document.documentElement.dir,
    };
  });

  console.log('Checks:', JSON.stringify(result, null, 2));
  await page.screenshot({ path: path.join(ROOT, 'docs', 'verify-screenshot.png'), fullPage: true });
  console.log('Screenshot saved to docs/verify-screenshot.png');
  if (logs.length) console.log('Browser console:\n' + logs.join('\n'));

  await browser.close();
  server.close();

  const required = ['hasKatex', 'hasMermaidSvg', 'hasTaskList', 'hasTable'];
  const failed = required.filter((k) => !result[k]);
  if (failed.length || result.hasMermaidError) {
    console.error('VERIFY FAILED:', failed, result.hasMermaidError ? '(+ mermaid error)' : '');
    process.exit(1);
  }
  console.log('VERIFY OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
