/**
 * Whole-site translation by text node. The site's copy is written in
 * English across hundreds of components; instead of wrapping every string,
 * this walks the rendered DOM and swaps each English text (and a few
 * attributes) for its translation, then keeps watching for React to render
 * more. A text with no entry simply stays English.
 *
 * Entries with `{0}`, `{1}`… placeholders are matched as patterns, so
 * "Step {0} of {1}" also translates "Step 2 of 5".
 */
export type Dictionary = Record<string, string>;

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'SVG', 'CANVAS']);

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function compile(dict: Dictionary) {
  const exact = new Map<string, string>();
  const patterns: { re: RegExp; to: string }[] = [];
  for (const [en, tr] of Object.entries(dict)) {
    if (/\{\d+\}/.test(en)) {
      const re = new RegExp(
        '^' + en.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d+\}/g, '(\\S+(?:\\s\\S+){0,2})') + '$',
        's',
      );
      patterns.push({ re, to: tr });
    } else {
      exact.set(norm(en), tr);
    }
  }
  return { exact, patterns };
}

export function startDomTranslator(dict: Dictionary): () => void {
  const { exact, patterns } = compile(dict);
  const original = new WeakMap<Node, string>();
  const written = new WeakMap<Node, string>();
  const attrOriginal = new WeakMap<Element, Record<string, string>>();
  const attrWritten = new WeakMap<Element, Record<string, string>>();

  const translate = (raw: string): string => {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw)!;
    const core = norm(m[2]);
    if (!core) return raw;
    let out = exact.get(core);
    if (out === undefined) {
      for (const p of patterns) {
        const hit = p.re.exec(core);
        if (hit) {
          out = p.to.replace(/\{(\d+)\}/g, (_, i) => hit[+i + 1] ?? '');
          break;
        }
      }
    }
    return out === undefined ? raw : m[1] + out + m[3];
  };

  const skipped = (el: Element | null): boolean => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      if (SKIP_TAGS.has(n.tagName.toUpperCase()) || n.getAttribute('translate') === 'no' || n.hasAttribute('data-notranslate')) return true;
    }
    return false;
  };

  const doText = (node: Text) => {
    const raw = node.nodeValue ?? '';
    if (written.get(node) === raw) return; // our own write
    if (skipped(node.parentElement)) return;
    original.set(node, raw);
    const tr = translate(raw);
    if (tr !== raw) {
      written.set(node, tr);
      node.nodeValue = tr;
    }
  };

  const doAttrs = (el: Element) => {
    if (skipped(el)) return;
    for (const a of ATTRS) {
      const raw = el.getAttribute(a);
      if (raw == null) continue;
      if (attrWritten.get(el)?.[a] === raw) continue;
      (attrOriginal.get(el) ?? attrOriginal.set(el, {}).get(el)!)[a] = raw;
      const tr = translate(raw);
      if (tr !== raw) {
        (attrWritten.get(el) ?? attrWritten.set(el, {}).get(el)!)[a] = tr;
        el.setAttribute(a, tr);
      }
    }
  };

  const walk = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (skipped(el)) return;
    doAttrs(el);
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
      else doAttrs(n as Element);
    }
  };

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') doText(r.target as Text);
      else if (r.type === 'attributes') doAttrs(r.target as Element);
      else r.addedNodes.forEach(walk);
    }
  });

  walk(document.body);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });

  return () => {
    observer.disconnect();
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = n as Text;
        const o = original.get(t);
        if (o !== undefined && written.get(t) === t.nodeValue) t.nodeValue = o;
      } else {
        const el = n as Element;
        const o = attrOriginal.get(el);
        const w = attrWritten.get(el);
        if (o && w) for (const a of Object.keys(w)) if (el.getAttribute(a) === w[a]) el.setAttribute(a, o[a]);
      }
    }
  };
}
