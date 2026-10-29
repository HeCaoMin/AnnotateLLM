(() => {
  const h = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v); else if (k === 'text') n.textContent = v; else if (v !== undefined && v !== null) n.setAttribute(k, v); }
    n.append(...children.filter(x => x !== null && x !== undefined)); return n;
  };
  const button = (text, click, attrs = {}) => h('button', {type: 'button', ...attrs, onClick: click}, text);
  const api = async message => { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw new Error(r?.error || '扩展已更新，请刷新页面后继续'); return r.data; };
  const download = (text, filename) => {
    const url = URL.createObjectURL(new Blob([text], {type: 'text/markdown;charset=utf-8'}));
    const a = h('a', {href: url, download: DNI18N.t(filename)}); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  function notebook() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7');
    for (const d of ['M6 3h13v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M8 3v18', 'M11 8h5M11 12h5M11 16h3']) { const p = document.createElementNS(svg.namespaceURI, 'path'); p.setAttribute('d', d); svg.append(p); } return svg;
  }
  globalThis.DNUI = {h, button, api, download, notebook};
})();
