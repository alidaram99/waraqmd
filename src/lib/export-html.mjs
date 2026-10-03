// Builds a single, dependency-free standalone HTML file from an already
// rendered preview — the "export HTML" feature. Pure string assembly so it
// is unit-testable without a browser; app.js supplies the already-rendered
// innerHTML and the CSS text it wants inlined (so the exported file has no
// external requests at all, matching the "files never leave the device"
// promise — nothing is uploaded to produce this export).

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ title: string, bodyHtml: string, css: string, lang?: string }} opts
 */
export function buildStandaloneHtml({ title, bodyHtml, css, lang = 'en' }) {
  const safeTitle = escapeHtml(title || 'Untitled');
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- S6 fix: this file has no legitimate script, so script is fully disallowed,
     not merely restricted to same-origin (there is no origin for a saved
     local file to be "same" as). object-src/base-uri closed for the same
     reason Waraq's own app page closes them. style-src keeps 'unsafe-inline'
     only because the inlined CSS below reproduces KaTeX/Mermaid's own
     per-element inline style="..." output, exactly as in the live app. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${safeTitle}</title>
<style>${css}</style>
</head>
<body>
<article class="waraq-preview" dir="auto">
${bodyHtml}
</article>
</body>
</html>
`;
}
