// Builds a nested table-of-contents tree from markdown-it tokens. Pure and
// framework-free so it can be unit-tested without a browser or a real
// markdown-it instance — callers only need to hand it the token array that
// `md.parse(source, env)` already produces.

/** GitHub's own heading-slug algorithm (lowercase, strip punctuation, spaces
 * to hyphens, de-duplicate). We match it so links copied from a GitHub
 * preview of the same file keep working. */
export function slugify(text, seen = new Map()) {
  let slug = String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}_\- ]+/gu, '')
    .replace(/\s+/g, '-');
  if (slug === '') slug = 'section';
  const count = seen.get(slug) ?? 0;
  seen.set(slug, count + 1);
  return count === 0 ? slug : `${slug}-${count}`;
}

/**
 * @param {Array<{type:string, tag?:string, children?:any[], content?:string}>} tokens
 * @returns {{ flat: Array<{level:number, text:string, slug:string}>, tree: any[] }}
 */
export function buildToc(tokens) {
  const flat = [];
  const seen = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type !== 'heading_open') continue;
    const level = Number(tok.tag.slice(1)); // "h2" -> 2
    const inline = tokens[i + 1];
    const text = inline && inline.type === 'inline' ? inline.content : '';
    flat.push({ level, text, slug: slugify(text, seen) });
  }

  // Nest by level into a nav tree: each node gets a `children` array of
  // headings strictly deeper than it, up to the next heading at <= its level.
  const root = [];
  const stack = [{ level: 0, children: root }];
  for (const heading of flat) {
    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }
    const node = { ...heading, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return { flat, tree: root };
}
