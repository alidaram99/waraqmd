#!/usr/bin/env node
// Builds the static site in docs/ from src/. GitHub Pages serves docs/
// directly — nothing in this script talks to a network or a user's files;
// it only reads this repo and writes build output.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { acceptMap } from '../src/lib/filetypes.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'src');
const DOCS = path.join(ROOT, 'docs');
const APP_DIR = path.join(DOCS, 'app');
const ASSETS = path.join(APP_DIR, 'assets');

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function gitShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'dev';
  }
}

async function buildJs() {
  // `splitting` + `outdir` (rather than a single `outfile`) is what lets the
  // dynamic `import('mermaid')` in app.js become its own chunk, fetched only
  // the first time a document actually contains a mermaid fence — see the
  // comment above `getMermaid()` in src/app.js.
  await esbuild.build({
    entryPoints: [path.join(SRC, 'app.js')],
    bundle: true,
    splitting: true,
    format: 'esm',
    target: ['chrome110', 'edge110', 'firefox110', 'safari16'],
    minify: true,
    sourcemap: false,
    outdir: ASSETS,
    chunkNames: 'chunk-[hash]',
    logLevel: 'info',
  });
}

async function buildCss() {
  await esbuild.build({
    entryPoints: [path.join(SRC, 'styles.css')],
    bundle: true,
    minify: true,
    outfile: path.join(ASSETS, 'app.css'),
  });
}

function copyKatexAssets() {
  const katexDist = path.join(ROOT, 'node_modules', 'katex', 'dist');
  cpSync(path.join(katexDist, 'katex.min.css'), path.join(ASSETS, 'katex.min.css'));
  mkdirSync(path.join(ASSETS, 'fonts'), { recursive: true });
  for (const f of readdirSync(path.join(katexDist, 'fonts'))) {
    if (f.endsWith('.woff2')) cpSync(path.join(katexDist, 'fonts', f), path.join(ASSETS, 'fonts', f));
  }
}

function writeManifest() {
  const accept = acceptMap();
  const manifest = {
    id: '/waraqmd/app/',
    name: 'Waraq — Markdown reader & editor',
    short_name: 'Waraq',
    description: 'Offline Markdown reader and editor with Mermaid, math, tables and automatic Arabic/English direction.',
    start_url: '/waraqmd/app/',
    scope: '/waraqmd/app/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    background_color: '#ffffff',
    theme_color: '#2563eb',
    orientation: 'any',
    dir: 'auto',
    categories: ['productivity', 'utilities'],
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    file_handlers: [
      {
        action: '/waraqmd/app/',
        accept,
        launch_type: 'single-client',
      },
    ],
    share_target: {
      action: '/waraqmd/app/share-target/',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        files: [{ name: 'files', accept: Object.keys(accept).concat(Object.values(accept).flat()) }],
      },
    },
    launch_handler: { client_mode: 'focus-existing' },
  };
  writeFileSync(path.join(APP_DIR, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
}

function writeServiceWorker() {
  // Precache only what every first visit needs (the entry bundle, styles,
  // KaTeX, icons, the shell page). Mermaid's ~100 per-diagram-type chunks
  // (see getMermaid() in app.js) are deliberately left out — they are
  // fetched and cached at runtime (see the fetch handler above) the first
  // time a document actually uses one, so a plain-text document never pays
  // to download diagram renderers it will never run.
  const fontFiles = readdirSync(path.join(ASSETS, 'fonts'));
  const precache = [
    './',
    './index.html',
    './manifest.webmanifest',
    './assets/app.js',
    './assets/app.css',
    './assets/katex.min.css',
    ...fontFiles.map((f) => `./assets/fonts/${f}`),
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/maskable-512.png',
  ];
  let sw = readFileSync(path.join(SRC, 'sw-source.js'), 'utf8');
  const version = `${pkg.version}-${gitShortSha()}`;
  sw = sw.replace('__CACHE_VERSION__', version);
  sw = sw.replace('/* __PRECACHE_URLS__ */ []', JSON.stringify(precache));
  writeFileSync(path.join(APP_DIR, 'sw.js'), sw);
}

function main() {
  rmSync(ASSETS, { recursive: true, force: true });
  mkdirSync(ASSETS, { recursive: true });
  mkdirSync(path.join(APP_DIR, 'icons'), { recursive: true });

  return Promise.all([buildJs(), buildCss()])
    .then(() => {
      copyKatexAssets();
      writeManifest();
      writeServiceWorker();
      console.log('Build complete ->', DOCS);
    });
}

main();
