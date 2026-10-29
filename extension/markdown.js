/* Small safe Markdown subset. Rendering exclusively creates DOM nodes; no innerHTML. */
(() => {
  const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
  function inline(text, parent, depth = 0) {
    if (depth > 8) { parent.append(document.createTextNode(text)); return; }
    const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(last, match.index))); const t = match[0];
      if (t.startsWith('`')) parent.append(el('code', t.slice(1, -1)));
      else if (t.startsWith('**')) { const n = el('strong'); inline(t.slice(2, -2), n, depth + 1); parent.append(n); }
      else if (t.startsWith('*')) { const n = el('em'); inline(t.slice(1, -1), n, depth + 1); parent.append(n); }
      else {
        const m = t.match(/^\[([^\]]+)\]\((.+)\)$/); let safe = false;
        try { safe = ['https:', 'http:', 'mailto:'].includes(new URL(m[2]).protocol); } catch {}
        if (safe && text[match.index - 1] !== '!') { const a = el('a', m[1]); a.href = m[2]; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a); }
        else parent.append(document.createTextNode(t));
      }
      last = match.index + t.length;
    }
    parent.append(document.createTextNode(text.slice(last)));
  }
  function render(text) {
    const root = el('div'); root.className = 'md'; const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let code = null, fence = null, list = null;
    for (const line of lines) {
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (code !== null) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length) { const p = el('pre'); p.append(el('code', code.join('\n'))); root.append(p); code = null; fence = null; }
        else code.push(line); continue;
      }
      if (f) { code = []; fence = f[1]; list = null; continue; }
      const li = line.match(/^\s*(?:([-*+])|\d+[.)])\s+(.+)$/);
      if (li) { const type = li[1] ? 'ul' : 'ol'; if (!list || list.tagName.toLowerCase() !== type) { list = el(type); root.append(list); } const n = el('li'); inline(li[2], n); list.append(n); continue; }
      list = null;
      if (!line.trim()) continue;
      const heading = line.match(/^(#{1,6})\s+(.+)$/), quote = line.match(/^>\s?(.*)$/);
      const n = el(heading ? 'h' + Math.min(heading[1].length + 1, 6) : quote ? 'blockquote' : 'p');
      inline(heading ? heading[2] : quote ? quote[1] : line, n); root.append(n);
    }
    if (code !== null) { const p = el('pre'); p.append(el('code', code.join('\n'))); root.append(p); }
    if (!text.trim()) root.append(el('p', '暂无内容')); return root;
  }
  globalThis.DNMarkdown = {render};
})();
