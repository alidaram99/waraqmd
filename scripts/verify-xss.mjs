#!/usr/bin/env node
// S6 regression verification: drives the real built app (real browser, real
// CSP header from the actual HTML, real bundled DOMPurify) through the real
// file-open UI with test/fixtures/s6-malicious.md, then checks that none of
// the payloads executed. Separately proves the CSP itself is an effective
// backstop by attempting to inject an external <script> after the app has
// loaded and confirming the browser reports a securitypolicyviolation and
// the script never actually runs. Not part of `npm test` (needs a real
// browser binary); this is the "headless browser, malicious samples"
// verification for security review finding S6.
import { chromium } from 'playwright-core';
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOCS = path.join(ROOT, 'docs');
const PORT = 8746;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath.startsWith('/waraqmd/')) urlPath = urlPath.slice('/waraqmd'.length);
      let filePath = path.join(DOCS, urlPath);
      if (urlPath.endsWith('/') || !path.extname(filePath)) filePath = path.join(filePath, 'index.html');
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

  const cspViolations = [];
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto(`http://localhost:${PORT}/waraqmd/app/`, { waitUntil: 'networkidle' });

  // Confirm the CSP header is actually present (a meta-tag CSP that never
  // loaded would make every check below pass for the wrong reason).
  const cspContent = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return meta ? meta.getAttribute('content') : null;
  });
  if (!cspContent || !/script-src 'self'/.test(cspContent)) {
    throw new Error(`CSP meta tag missing or unexpected: ${cspContent}`);
  }
  if (/script-src[^;]*'unsafe-inline'/.test(cspContent)) {
    throw new Error(`script-src must not include 'unsafe-inline': ${cspContent}`);
  }

  // Listen for CSP violation reports from this point on, in the page itself.
  await page.evaluate(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push({ directive: e.violatedDirective, blockedURI: e.blockedURI });
    });
  });

  // --- Part 1: open the malicious fixture through the real UI ---
  const fixture = path.join(ROOT, 'test', 'fixtures', 's6-malicious.md');
  await page.setInputFiles('#waraq-file-input', fixture);
  await page.waitForTimeout(2000); // debounce + mermaid chunk fetch + render + sanitize

  const payloadResult = await page.evaluate(() => ({
    pwned_html_img: window.__pwned_html_img,
    pwned_html_script: window.__pwned_html_script,
    pwned_click: window.__pwned_click,
    pwned_label: window.__pwned_label,
    previewHtml: document.getElementById('waraq-preview').innerHTML,
    mermaidErrorCount: document.querySelectorAll('.waraq-mermaid-error').length,
    mermaidSvgCount: document.querySelectorAll('.waraq-mermaid-rendered svg').length,
  }));

  const pwned = Object.entries(payloadResult).filter(([k, v]) => k.startsWith('pwned_') && v !== undefined);

  // --- Part 2: confirm the legitimate (4th) diagram still rendered ---
  const legitimateDiagramOk = payloadResult.mermaidSvgCount >= 1;

  // --- Part 3: prove the CSP is a real backstop, not just a meta tag ---
  const cspBackstop = await page.evaluate(async () => {
    window.__externalScriptRan = false;
    const s = document.createElement('script');
    s.src = 'https://example.invalid/evil.js';
    s.onerror = () => {}; // network block or CSP block both fire error; we check the violation event instead
    document.head.appendChild(s);
    await new Promise((r) => setTimeout(r, 300));
    return { externalScriptRan: window.__externalScriptRan, violations: window.__cspViolations };
  });

  await browser.close();
  server.close();

  console.log('Payload check (should all be empty/undefined):', JSON.stringify(Object.fromEntries(pwned)));
  console.log('Legitimate diagram still rendered:', legitimateDiagramOk, `(${payloadResult.mermaidSvgCount} svg, ${payloadResult.mermaidErrorCount} errors)`);
  console.log('CSP backstop — external script blocked:', !cspBackstop.externalScriptRan, 'violations recorded:', JSON.stringify(cspBackstop.violations));
  console.log('Console errors during the run:', consoleErrors.length ? consoleErrors : '(none)');

  const failures = [];
  if (pwned.length > 0) failures.push(`payload(s) executed: ${pwned.map(([k]) => k).join(', ')}`);
  if (payloadResult.previewHtml.includes('<script')) failures.push('raw <script> tag survived into the rendered preview HTML');
  if (!legitimateDiagramOk) failures.push('the legitimate 4th diagram did not render — sanitizer is over-blocking');
  if (cspBackstop.externalScriptRan) failures.push('external script actually ran — CSP did not block it');
  if (cspBackstop.violations.length === 0) failures.push('no securitypolicyviolation event fired for the external-script injection — CSP is not being enforced');

  if (failures.length) {
    console.error('VERIFY FAILED:', failures);
    process.exitCode = 1;
  } else {
    console.log('VERIFY OK — all S6 payloads neutralized, CSP enforced, legitimate content unaffected.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
