# S6 regression fixture — malicious content, real file-open path

Raw HTML directly in the body (must render as escaped text, never execute):

<img src=x onerror="window.__pwned_html_img=1">
<script>window.__pwned_html_script=1</script>

## Mermaid click-to-JavaScript (a real, historically known Mermaid exploit class)

```mermaid
graph TD
  A[Click me] --> B[Node]
  click A "javascript:window.__pwned_click=1" "tooltip"
```

## Mermaid node label attempting an HTML onerror image

```mermaid
graph TD
  C["<img src=x onerror=window.__pwned_label=1>"]
```

## A normal, legitimate diagram (must still render correctly)

```mermaid
graph TD
  Start --> End
```
