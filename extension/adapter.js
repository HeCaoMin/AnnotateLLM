/* Only this module knows ChatGPT's DOM. Fail closed when message identity changes. */
(() => {
  const C = globalThis.DN;
  const selector = '[data-message-author-role="assistant"], [data-message-author-role="user"]';
  // Account-specific ChatGPT rollout, documented in oracle#517. Keep the full
  // unit key, including its role/index; a turn can contain multiple messages.
  const unitSelector = '[data-content-search-unit-key$=":assistant"], [data-content-search-unit-key$=":user"]';
  function rendered(node) {
    if (node.closest('[hidden],[aria-hidden="true"]')) return false;
    const range = document.createRange(); range.selectNodeContents(node);
    // display:contents has no element box even when its descendant text renders.
    return [...range.getClientRects()].some(r => r.width > 0 && r.height > 0);
  }
  function messageBody(node) {
    const blocks = [...node.querySelectorAll('.markdown, .whitespace-pre-wrap')];
    const outer = blocks.filter(b => !blocks.some(other => other !== b && other.contains(b)));
    // Rich answers may interleave several Markdown blocks with cards. The first
    // block is not the complete answer. Keep the old scope for single-block text.
    return outer.length === 1 ? outer[0] : node;
  }
  function messages() {
    const legacy = [...document.querySelectorAll(selector)];
    const units = [...document.querySelectorAll(unitSelector)].filter(n => !legacy.some(old => n.contains(old) || old.contains(n)) && !n.parentElement?.closest(unitSelector));
    return [...legacy.map(n => ({
      node: n, body: messageBody(n),
      id: n.getAttribute('data-message-id') || n.closest('[data-message-id]')?.getAttribute('data-message-id') || '',
      role: n.getAttribute('data-message-author-role'), layout: 'legacy'
    })), ...units.map(n => ({
      node: n, body: n,
      id: 'unit:' + n.getAttribute('data-content-search-unit-key'),
      role: n.getAttribute('data-content-search-unit-key').endsWith(':user') ? 'user' : 'assistant', layout: 'search-unit'
    }))].filter(m => rendered(m.body)).sort((a,b) => a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  }
  function diagnose(range) {
    const describe = node => {
      const css = getComputedStyle(node);
      const knownRole = value => ['user','assistant','system'].includes(value) ? value : null;
      return {tag: node.tagName.toLowerCase(), legacyRole: knownRole(node.getAttribute('data-message-author-role')),
        conversationRole: knownRole(node.getAttribute('data-conversation-role')),
        hasMessageId: node.hasAttribute('data-message-id'), hasTurnKey: node.hasAttribute('data-turn-key'),
        hasSearchUnitKey: node.hasAttribute('data-content-search-unit-key'),
        unitRole: knownRole(node.getAttribute('data-content-search-unit-key')?.split(':').at(-1)),
        markdown: node.classList.contains('markdown'), display: css.display, visibility: css.visibility,
        elementBoxes: node.getClientRects().length, renderedContents: rendered(node)};
    };
    const chain = node => {
      const out=[]; let el=node?.nodeType===Node.ELEMENT_NODE ? node : node?.parentElement;
      while(el && out.length<20) {out.push(describe(el));el=el.parentElement;} return out;
    };
    const all=messages();
    return {format: 1, legacyMarkers: document.querySelectorAll(selector).length, newUnitMarkers: document.querySelectorAll(unitSelector).length,
      turnMarkers: document.querySelectorAll('[data-turn-key]').length,
      recognizedLegacy: all.filter(m=>m.layout==='legacy').length, recognizedNew: all.filter(m=>m.layout==='search-unit').length,
      selectionPresent: !!range, startAncestors: chain(range?.startContainer), endAncestors: chain(range?.endContainer)};
  }
  function textMap(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode: n => n.parentElement?.closest('button,svg,script,style,textarea,[contenteditable="true"],[aria-hidden="true"],.katex,.MathJax') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
    let node, text = ''; const nodes = [];
    while ((node = walker.nextNode())) { nodes.push({node, start: text.length, end: text.length + node.length}); text += node.data; }
    return {text, nodes};
  }
  function rangeFor(map, start, end) {
    const a = map.nodes.find(n => n.end > start), b = map.nodes.find(n => n.end >= end && n.start < end);
    if (!a || !b) return null; const r = document.createRange(); r.setStart(a.node, start - a.start); r.setEnd(b.node, end - b.start); return r;
  }
  function offset(map, container, offset) {
    if (container.nodeType === Node.TEXT_NODE) { const n = map.nodes.find(n => n.node === container); return n ? n.start + offset : null; }
    const boundary = document.createRange(); boundary.setStart(container, offset); boundary.collapse(true);
    let result = 0;
    for (const n of map.nodes) {
      const r = document.createRange(); r.selectNodeContents(n.node);
      if (r.compareBoundaryPoints(Range.END_TO_START, boundary) <= 0) result = n.end;
      else if (r.compareBoundaryPoints(Range.START_TO_START, boundary) >= 0) return n.start;
    }
    return result;
  }
  function streaming(message) {
    if (message.node.closest('[data-is-streaming="true"]') || message.node.querySelector('.result-streaming, [data-is-streaming="true"]') || message.node.closest('[data-turn-key]')?.querySelector('.result-streaming, [data-is-streaming="true"]')) return true;
    const all = messages(); return message.role === 'assistant' && all.at(-1)?.node === message.node && !!document.querySelector('[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="停止生成"]');
  }
  async function capture(selection) {
    C.assert(selection?.rangeCount && !selection.isCollapsed, '请先选择文字');
    const range = selection.getRangeAt(0).cloneRange();
    const all = messages(), message = all.find(m => m.body.contains(range.startContainer) && m.body.contains(range.endContainer));
    C.assert(message, all.some(m => m.node.contains(range.startContainer)) ? '请在同一条消息内选择文字' : '暂时无法识别此处的消息正文，请查看诊断。'); C.assert(!streaming(message), '请等待这条回答生成结束');
    C.assert(message.id, '此消息缺少稳定标识，暂时无法可靠保存批注。请刷新页面后重试。');
    C.assert(all.filter(m => m.id === message.id && m.role === message.role).length === 1, '当前消息标识重复，请等待页面加载完成后重试。');
    const map = textMap(message.body), start = offset(map, range.startContainer, range.startOffset), end = offset(map, range.endContainer, range.endOffset);
    C.assert(start !== null && end !== null && end > start && end - start <= 20000, '选区不支持或超过 20,000 字符');
    const exact = map.text.slice(start, end); C.assert(exact.trim(), '请选择非空文字');
    // Excluded nodes (formulas/buttons) must not silently change the selected text.
    C.assert(range.toString() === exact, '选区包含公式或特殊元素，请只选择普通文字');
    return {messageId: message.id, role: message.role, fingerprint: await C.digest(map.text), start, end, exact, prefix: map.text.slice(Math.max(0, start - 64), start), suffix: map.text.slice(end, end + 64)};
  }
  async function locateAll(records) {
    const all = messages(); const cached = await Promise.all(all.map(async m => { const map = textMap(m.body); return {...m, map, fingerprint: await C.digest(map.text)}; }));
    const result = new Map();
    for (const a of records) {
      const q = a.anchor;
      let candidates = cached.filter(m => m.role === q.role && (q.messageId ? m.id === q.messageId : m.fingerprint === q.fingerprint));
      if (!candidates.length) { result.set(a.id, {status: '等待原文加载'}); continue; }
      candidates = candidates.filter(m => m.fingerprint === q.fingerprint && m.map.text.slice(q.start, q.end) === q.exact && m.map.text.slice(Math.max(0, q.start - q.prefix.length), q.start) === q.prefix && m.map.text.slice(q.end, q.end + q.suffix.length) === q.suffix);
      if (candidates.length !== 1) { result.set(a.id, {status: '需要重新关联'}); continue; }
      const m = candidates[0], range = rangeFor(m.map, q.start, q.end);
      result.set(a.id, range ? {status: '已关联', range, node: m.node, order: all.findIndex(x => x.node === m.node) * 10000000 + q.start} : {status: '需要重新关联'});
    }
    return result;
  }
  globalThis.DNAdapter = {messages, textMap, capture, locateAll, rangeFor, diagnose, conversationId: () => C.conversationId(location.href), title: () => document.title.replace(/\s*[-–|]\s*ChatGPT\s*$/, '').slice(0, 1000)};
})();
