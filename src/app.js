// Waraq app shell. Everything here is client-only: no fetch to any backend
// of ours happens anywhere in this file. A file opened in Waraq is read with
// the File System Access API or FileReader, held in memory, and written
// back with the same APIs — it never leaves the device to render or save.
import yaml from 'js-yaml';
import { renderMarkdown, renderTokenRange } from './lib/markdown-render.mjs';
import { chunkSections } from './lib/chunk.mjs';
import { isSupportedFile, isMarkdownFile, acceptAttribute } from './lib/filetypes.mjs';
import { t, detectLang } from './lib/i18n.mjs';
import { buildStandaloneHtml } from './lib/export-html.mjs';
import { createSvgSanitizer } from './lib/sanitize-svg.mjs';

// Security review finding S6: Mermaid's own `securityLevel: 'strict'` (see
// getMermaid() below) is Mermaid's protection, not ours. This is a second,
// independent sanitization pass on the SVG string Mermaid hands back,
// before it is ever assigned to innerHTML — see sanitize-svg.mjs's doc
// comment for why foreignObject/script/event-handlers/javascript: URIs are
// stripped even though Mermaid should already refuse to emit them.
const svgSanitizer = createSvgSanitizer(window);

// Mermaid is ~4MB unminified and most agent-produced Markdown has no
// diagrams in it at all, so it is loaded on first actual use rather than
// bundled into the initial app.js — the common case (plain prose/tables/
// code) stays fast to first paint, and esbuild's code-splitting (see
// scripts/build.mjs) turns this into its own cached chunk after that.
let mermaidPromise = null;
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({ startOnLoad: false, securityLevel: 'strict' });
      return m.default;
    });
  }
  return mermaidPromise;
}

const LARGE_FILE_LINE_THRESHOLD = 3000;
const RENDER_DEBOUNCE_MS = 250;

const el = (id) => document.getElementById(id);
const dom = {
  toolbar: el('waraq-toolbar'),
  editor: el('waraq-editor'),
  previewPane: el('waraq-preview-pane'),
  preview: el('waraq-preview'),
  editorPane: el('waraq-editor-pane'),
  panes: el('waraq-panes'),
  sidebar: el('waraq-sidebar'),
  tocList: el('waraq-toc'),
  welcome: el('waraq-welcome'),
  welcomeOpen: el('waraq-welcome-open'),
  recentList: el('waraq-recent-list'),
  dropOverlay: el('waraq-drop-overlay'),
  filename: el('waraq-filename'),
  status: el('waraq-status'),
  fileInput: el('waraq-file-input'),
  btnOpen: el('waraq-btn-open'),
  btnNew: el('waraq-btn-new'),
  btnSave: el('waraq-btn-save'),
  btnSaveAs: el('waraq-btn-save-as'),
  btnEdit: el('waraq-btn-mode-edit'),
  btnSplit: el('waraq-btn-mode-split'),
  btnPreview: el('waraq-btn-mode-preview'),
  btnToc: el('waraq-btn-toc'),
  btnTheme: el('waraq-btn-theme'),
  btnLang: el('waraq-btn-lang'),
  btnPrint: el('waraq-btn-print'),
  btnExportHtml: el('waraq-btn-export-html'),
  btnInstall: el('waraq-btn-install'),
};

/** @type {{
 *   handle: FileSystemFileHandle|null,
 *   fileName: string,
 *   dirty: boolean,
 *   readOnly: boolean,
 *   viewMode: 'edit'|'split'|'preview',
 *   theme: 'light'|'dark'|'system',
 *   lang: 'en'|'ar',
 *   tokens: any[]|null,
 *   isMarkdown: boolean,
 * }} */
const state = {
  handle: null,
  fileName: '',
  dirty: false,
  readOnly: false,
  viewMode: 'split',
  theme: localStorage.getItem('waraq:theme') || 'system',
  lang: localStorage.getItem('waraq:lang') || detectLang(navigator.language),
  tokens: null,
  isMarkdown: true,
};

// ---------------------------------------------------------------- i18n/theme

function applyChrome() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dataset.theme = state.theme === 'system' ? '' : state.theme;
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.getAttribute('data-i18n'), state.lang);
  }
  for (const node of document.querySelectorAll('[data-i18n-title]')) {
    node.title = t(node.getAttribute('data-i18n-title'), state.lang);
  }
  dom.btnTheme.textContent = { light: '☀️', dark: '🌙', system: '🖥️' }[state.theme];
  dom.btnLang.textContent = state.lang === 'ar' ? 'EN' : 'AR';
}

dom.btnTheme.addEventListener('click', () => {
  state.theme = { system: 'light', light: 'dark', dark: 'system' }[state.theme];
  localStorage.setItem('waraq:theme', state.theme);
  applyChrome();
});
dom.btnLang.addEventListener('click', () => {
  state.lang = state.lang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('waraq:lang', state.lang);
  applyChrome();
});

// --------------------------------------------------------------- view modes

function setViewMode(mode) {
  state.viewMode = mode;
  dom.editorPane.classList.toggle('hidden', mode === 'preview');
  dom.previewPane.classList.toggle('hidden', mode === 'edit');
  dom.panes.classList.toggle('split', mode === 'split');
  for (const [btn, m] of [[dom.btnEdit, 'edit'], [dom.btnSplit, 'split'], [dom.btnPreview, 'preview']]) {
    btn.setAttribute('aria-pressed', String(m === mode));
  }
}
dom.btnEdit.addEventListener('click', () => setViewMode('edit'));
dom.btnSplit.addEventListener('click', () => setViewMode('split'));
dom.btnPreview.addEventListener('click', () => setViewMode('preview'));
dom.btnToc.addEventListener('click', () => dom.sidebar.classList.toggle('hidden'));

// ----------------------------------------------------------------- render

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, RENDER_DEBOUNCE_MS);
}

function frontMatterHtml(raw) {
  if (!raw) return '';
  let obj;
  try {
    obj = yaml.load(raw);
  } catch {
    return '';
  }
  if (!obj || typeof obj !== 'object') return '';
  const rows = Object.entries(obj)
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(Array.isArray(v) ? v.join(', ') : String(v))}</td></tr>`)
    .join('');
  return `<details class="waraq-frontmatter"><summary>${t('frontMatter', state.lang)}</summary><table>${rows}</table></details>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function mountMermaid(root) {
  const nodes = [...root.querySelectorAll('[data-mermaid-pending]')];
  if (nodes.length === 0) return;
  const mermaid = await getMermaid();
  for (const node of nodes) {
    const source = node.textContent;
    const id = `waraq-mermaid-${Math.random().toString(36).slice(2)}`;
    try {
      const { svg } = await mermaid.render(id, source);
      const wrap = document.createElement('div');
      wrap.className = 'waraq-mermaid-rendered';
      wrap.innerHTML = svgSanitizer.sanitize(svg);
      node.replaceWith(wrap);
    } catch (err) {
      const pre = document.createElement('pre');
      pre.className = 'waraq-mermaid-error';
      pre.textContent = `Mermaid diagram error: ${err && err.message ? err.message : err}`;
      node.replaceWith(pre);
    }
  }
}

const mountedChunks = new Set();
let chunkObserver = null;

function renderLazyChunks(tokens, chunks) {
  dom.preview.innerHTML = `<p class="waraq-status" data-i18n="largeFileNotice">${t('largeFileNotice', state.lang)}</p>`;
  mountedChunks.clear();
  if (chunkObserver) chunkObserver.disconnect();

  const container = document.createElement('div');
  dom.preview.appendChild(container);

  const placeholders = chunks.map((chunk, i) => {
    const div = document.createElement('div');
    div.className = 'waraq-chunk-placeholder';
    div.dataset.chunkIndex = String(i);
    div.textContent = '…';
    container.appendChild(div);
    return div;
  });

  function mount(i) {
    if (mountedChunks.has(i)) return;
    mountedChunks.add(i);
    const chunk = chunks[i];
    const html = renderTokenRange(tokens, chunk.startTokenIndex, chunk.endTokenIndex);
    const div = placeholders[i];
    div.outerHTML = `<div data-chunk-mounted="${i}">${html}</div>`;
    const mountedEl = container.querySelector(`[data-chunk-mounted="${i}"]`);
    if (mountedEl) mountMermaid(mountedEl);
  }

  chunkObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) mount(Number(entry.target.dataset.chunkIndex));
      }
    },
    { root: dom.preview, rootMargin: '600px 0px 600px 0px' },
  );
  for (const p of placeholders) chunkObserver.observe(p);
  mount(0); // first chunk visible immediately, no round trip to the observer

  // Exposed for the TOC: force-mount every chunk up to and including `i`.
  dom.preview._waraqMountUpTo = (i) => {
    for (let k = 0; k <= i; k++) mount(k);
  };
  dom.preview._waraqChunkForLine = (line) => {
    for (let i = 0; i < chunks.length; i++) if (line <= chunks[i].endLine) return i;
    return chunks.length - 1;
  };
}

function renderToc(tree) {
  dom.tocList.innerHTML = '';
  if (tree.length === 0) {
    dom.tocList.innerHTML = `<p class="waraq-status">${t('noRecentFiles', state.lang) === '' ? '' : ''}</p>`;
    return;
  }
  const build = (nodes) => {
    const ul = document.createElement('ul');
    for (const node of nodes) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${node.slug}`;
      a.textContent = node.text || '(untitled)';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        jumpToHeading(node.slug);
      });
      li.appendChild(a);
      if (node.children && node.children.length) li.appendChild(build(node.children));
      ul.appendChild(li);
    }
    return ul;
  };
  dom.tocList.appendChild(build(tree));
}

function jumpToHeading(slug) {
  let target = document.getElementById(slug);
  if (!target && dom.preview._waraqChunkForLine) {
    // Not mounted yet (large-file lazy mode) — force-mount everything up to
    // the chunk that contains it, then it exists.
    const toc = state.toc;
    const entry = toc && toc.flat.find((h) => h.slug === slug);
    if (entry && state.tokens) {
      // We don't track heading->line directly here; mount everything before
      // it is simplest and still correct, just not maximally lazy for a
      // jump deep into a huge document.
      const idx = toc.flat.indexOf(entry);
      const approxChunk = dom.preview._waraqChunkForLine(idx === -1 ? 0 : idx * 50);
      dom.preview._waraqMountUpTo(approxChunk + 1);
    }
    target = document.getElementById(slug);
  }
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function render() {
  const text = dom.editor.value;
  const lineCount = text.split('\n').length;
  const { html, toc, tokens, frontMatterRaw } = renderMarkdown(text);
  state.toc = toc;
  state.tokens = tokens;
  renderToc(toc.tree);

  if (lineCount > LARGE_FILE_LINE_THRESHOLD) {
    const chunks = chunkSections(tokens, { targetLines: 200 });
    if (chunks.length > 1) {
      renderLazyChunks(tokens, chunks);
      dom.preview.insertAdjacentHTML('afterbegin', frontMatterHtml(frontMatterRaw));
      return;
    }
  }
  dom.preview.innerHTML = frontMatterHtml(frontMatterRaw) + html;
  mountMermaid(dom.preview);
}

dom.editor.addEventListener('input', () => {
  state.dirty = !state.readOnly;
  updateStatus();
  scheduleRender();
});

function updateStatus() {
  dom.status.dataset.dirty = String(state.dirty);
  dom.status.textContent = state.dirty ? t('unsavedChanges', state.lang) : state.readOnly ? t('readOnlyNotice', state.lang) : '';
  dom.filename.textContent = state.fileName || t('newFile', state.lang);
}

// ------------------------------------------------------------ scroll sync

let syncing = false;
dom.editor.addEventListener('scroll', () => {
  if (syncing || state.viewMode !== 'split') return;
  syncing = true;
  const ratio = dom.editor.scrollTop / Math.max(1, dom.editor.scrollHeight - dom.editor.clientHeight);
  dom.preview.parentElement.scrollTop = ratio * (dom.preview.parentElement.scrollHeight - dom.preview.parentElement.clientHeight);
  requestAnimationFrame(() => (syncing = false));
});

// ------------------------------------------------------------- file i/o

function setDocument({ text, name, handle, readOnly }) {
  state.handle = handle || null;
  state.fileName = name || '';
  state.readOnly = Boolean(readOnly);
  state.dirty = false;
  state.isMarkdown = isMarkdownFile(name || '');
  dom.editor.value = text ?? '';
  dom.welcome.classList.add('hidden');
  updateStatus();
  render();
  if (handle) addRecent(name, handle);
}

async function openHandle(handle) {
  const file = await handle.getFile();
  let readOnly = false;
  if ('requestPermission' in handle) {
    const perm = await handle.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
    readOnly = perm !== 'granted';
  }
  setDocument({ text: await file.text(), name: file.name, handle, readOnly });
}

async function openPlainFile(file) {
  const text = await file.text();
  setDocument({ text, name: file.name, handle: null, readOnly: true });
}

// The welcome screen's own button just forwards to the real Open button —
// wired here (not an inline onclick="...") so the app's CSP can set
// script-src 'self' with no 'unsafe-inline' exception.
dom.welcomeOpen.addEventListener('click', () => dom.btnOpen.click());

dom.btnOpen.addEventListener('click', async () => {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Markdown and text', accept: { 'text/markdown': ['.md', '.markdown', '.mdx'], 'text/plain': ['.txt', '.log'] } }],
      });
      await openHandle(handle);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      // fall through to the <input> fallback below on any other failure
    }
  }
  dom.fileInput.click();
});
dom.fileInput.setAttribute('accept', acceptAttribute());
dom.fileInput.addEventListener('change', () => {
  const file = dom.fileInput.files[0];
  if (file) openPlainFile(file);
  dom.fileInput.value = '';
});

dom.btnNew.addEventListener('click', () => {
  if (state.dirty && !confirm(t('unsavedChanges', state.lang) + '?')) return;
  setDocument({ text: '', name: '', handle: null, readOnly: false });
});

async function saveCurrent() {
  if (state.handle && !state.readOnly) {
    try {
      const writable = await state.handle.createWritable();
      await writable.write(dom.editor.value);
      await writable.close();
      state.dirty = false;
      updateStatus();
      return;
    } catch {
      // fall through to Save As
    }
  }
  await saveAs();
}

async function saveAs() {
  const suggestedName = state.fileName || 'untitled.md';
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(dom.editor.value);
      await writable.close();
      state.handle = handle;
      state.fileName = handle.name;
      state.readOnly = false;
      state.dirty = false;
      updateStatus();
      addRecent(handle.name, handle);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const blob = new Blob([dom.editor.value], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(a.href);
}

dom.btnSave.addEventListener('click', saveCurrent);
dom.btnSaveAs.addEventListener('click', saveAs);

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveCurrent();
  } else if (mod && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    dom.btnOpen.click();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ------------------------------------------------------------- drag & drop

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  dom.dropOverlay.classList.remove('hidden');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dom.dropOverlay.classList.add('hidden');
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dom.dropOverlay.classList.add('hidden');
  const item = e.dataTransfer.items && e.dataTransfer.items[0];
  if (item && typeof item.getAsFileSystemHandle === 'function') {
    const handle = await item.getAsFileSystemHandle();
    if (handle && handle.kind === 'file') return openHandle(handle);
  }
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) openPlainFile(file);
});

// ----------------------------------------------------------------- paste

document.addEventListener('paste', (e) => {
  if (document.activeElement === dom.editor) return; // normal editing paste
  const text = e.clipboardData && e.clipboardData.getData('text/plain');
  if (text) {
    e.preventDefault();
    setDocument({ text, name: '', handle: null, readOnly: false });
  }
});

// ------------------------------------------------------- File Handling API

if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files || launchParams.files.length === 0) return;
    const handle = launchParams.files[0];
    if (!isSupportedFile(handle.name)) return;
    await openHandle(handle);
  });
}

// -------------------------------------------------------- share_target (Android)

async function checkPendingSharedFile() {
  if (!new URLSearchParams(location.search).has('shared')) return;
  history.replaceState(null, '', location.pathname);
  if (!('caches' in window)) return;
  const cache = await caches.open('waraq-share-target');
  const res = await cache.match('/waraqmd/app/pending-shared-file');
  if (!res) return;
  const name = decodeURIComponent(res.headers.get('x-waraq-filename') || 'shared.md');
  const text = await res.text();
  await cache.delete('/waraqmd/app/pending-shared-file');
  setDocument({ text, name, handle: null, readOnly: true });
}

// ---------------------------------------------------------------- recent files

const RECENT_DB = 'waraq';
const RECENT_STORE = 'recent';
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RECENT_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(RECENT_STORE, { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function addRecent(name, handle) {
  if (!name || !('indexedDB' in window)) return;
  try {
    const db = await openDb();
    const tx = db.transaction(RECENT_STORE, 'readwrite');
    tx.objectStore(RECENT_STORE).put({ name, handle, time: Date.now() });
  } catch {
    /* non-fatal: recent files is a convenience, not core functionality */
  }
}
async function listRecent() {
  if (!('indexedDB' in window)) return [];
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const out = [];
      const req = db.transaction(RECENT_STORE, 'readonly').objectStore(RECENT_STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          out.push(cursor.value);
          cursor.continue();
        } else {
          resolve(out.sort((a, b) => b.time - a.time).slice(0, 8));
        }
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
async function renderRecent() {
  const items = await listRecent();
  dom.recentList.innerHTML = '';
  if (items.length === 0) {
    dom.recentList.innerHTML = `<li>${t('noRecentFiles', state.lang)}</li>`;
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = item.name;
    btn.addEventListener('click', () => openHandle(item.handle));
    li.appendChild(btn);
    dom.recentList.appendChild(li);
  }
}

// --------------------------------------------------------------- export

dom.btnPrint.addEventListener('click', () => {
  setViewMode('preview');
  setTimeout(() => window.print(), 50);
});

dom.btnExportHtml.addEventListener('click', async () => {
  const css = await fetch('./assets/app.css').then((r) => r.text()).catch(() => '');
  const html = buildStandaloneHtml({ title: state.fileName || 'Untitled', bodyHtml: dom.preview.innerHTML, css, lang: state.lang });
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.fileName || 'untitled').replace(/\.[^.]+$/, '') + '.html';
  a.click();
  URL.revokeObjectURL(a.href);
});

// ----------------------------------------------------------- install prompt

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  dom.btnInstall.classList.remove('hidden');
});
dom.btnInstall.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  await deferredInstallPrompt.prompt();
  deferredInstallPrompt = null;
  dom.btnInstall.classList.add('hidden');
});
window.addEventListener('appinstalled', () => dom.btnInstall.classList.add('hidden'));

// --------------------------------------------------------------- bootstrap

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch {
    /* offline support degrades gracefully without a service worker */
  }
}

(async function main() {
  applyChrome();
  setViewMode('split');
  registerServiceWorker();
  renderRecent();
  await checkPendingSharedFile();
  if (!state.fileName && dom.editor.value === '') {
    dom.welcome.classList.remove('hidden');
  }
})();
