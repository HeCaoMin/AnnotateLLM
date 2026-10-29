(() => {
  'use strict';
  if (globalThis.__dialogNotesLoaded) return; globalThis.__dialogNotesLoaded = true;
  const C = DN, A = DNAdapter, U = DNUI, {h, button} = U;
  const host = h('div', {id: 'dialog-notes-root'}); host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none';
  const root = host.attachShadow({mode: 'closed'}); root.append(h('style', {}, globalThis.DNStyles)); document.documentElement.append(host);
  DNProtectInput(root); DNI18N.observe(root);
  let cid = '', conv = null, loadingConversation = null, enabled = false, panelOpen = false, filter = 'all', query = '', color = 'yellow', position;
  let locations = new Map(), selected = null, pinned = null, hovered = null, editing = null, editorContext = null, generation = 0, refreshTimer, geometryQueued = false, mouse = {x: 0, y: 0}, hideTimer;
  const drafts = new Map(), noteDrafts = new Map(), openNotes = new Set();
  let sticky = null, stickyContext = null, panelPositioned = false, panelDragCleanup, hoverTarget = null, hoverCloseTimer, toolbarSource = 'selection', pinOffset = 0, changingHighlight = false;
  const colorFilters = new Set();
  try {for(const id of JSON.parse(sessionStorage.getItem('dn-open-notes')||'[]'))if(C.validId(id))openNotes.add(id);}catch{}
  let selectionRun = 0, selectionTimer, selecting = false, handledRange = null, selectedBounds = null;
  let lastDiagnosis = null;
  const marks = h('div'), toolbar = h('div', {class: 'toolbar', hidden: ''}), card = h('div', {class: 'card', hidden: ''}), panel = h('section', {class: 'panel', hidden: '', 'aria-label': '当前对话批注'});
  const badge = h('span', {class: 'badge'}, '0'); const fab = button('', () => { if (dragged) return; panelOpen = !panelOpen; panelPositioned = false; renderPanel(); }, {class: 'fab', title: '打开 AnnotateLLM', 'aria-label': '打开 AnnotateLLM'}); fab.append(U.notebook(), badge);
  root.append(marks, fab, panel, toolbar, card);
  function toast(text, action, label = '撤销') { root.querySelector('.toast')?.remove(); const node = h('div', {class: 'toast', role: 'status'}, text); if (action) node.append(button(label, () => { node.remove(); action(); })); root.append(node); setTimeout(() => node.remove(), 7000); }
  const fail = e => toast(e.message || String(e));
  function showDiagnosis() {
    root.querySelector('.diagnostic-backdrop')?.remove();
    const data = lastDiagnosis || A.diagnose(currentRange());
    const report = DNI18N.t('# AnnotateLLM · 页面结构诊断\n\n版本：') + chrome.runtime.getManifest().version + DNI18N.t('\n\n仅含结构计数、固定标记和布局属性；不含聊天文字、网址、消息 ID 或笔记。\n\n```json\n') + JSON.stringify(data, null, 2) + '\n```\n';
    const overlay = h('div', {class: 'modal-backdrop diagnostic-backdrop'});
    const text = h('textarea', {readonly: '', 'aria-label': '页面结构诊断'}); text.value = report;
    overlay.append(h('section', {class: 'modal', role: 'dialog', 'aria-label': '页面结构诊断'}, h('h2', {}, '页面结构诊断'), h('p', {}, '仅含页面结构，不含聊天文字、网址、消息 ID 或笔记。可下载后发来排查。'), text, h('div', {class: 'row'}, button('下载诊断 Markdown', () => U.download(report, 'AnnotateLLM-页面诊断.md')), button('关闭', () => overlay.remove()))));
    root.append(overlay);
  }
  const req = (type, extra = {}) => U.api({type, cid, ...extra});
  function theme() { host.classList.toggle('dark', document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark' || getComputedStyle(document.documentElement).colorScheme === 'dark'); }
  function placeFab() {
    const x = position?.side === 'left' ? 12 : position?.side === 'right' ? innerWidth-62 : Number.isFinite(position?.x) ? position.x*(innerWidth-50) : innerWidth-74;
    U.place(fab,x,position ? position.y*(innerHeight-50) : innerHeight-210);
  }
  function safePosition(n, x, y) { n.style.left = Math.max(10, Math.min(innerWidth - n.offsetWidth - 10, x)) + 'px'; n.style.top = Math.max(10, Math.min(innerHeight - n.offsetHeight - 10, y)) + 'px'; }
  function hideToolbar() { ++selectionRun; clearTimeout(selectionTimer); toolbar.hidden = true; }
  function clearMarks() { marks.replaceChildren(); for (const c of [...C.colors, 'focus']) CSS.highlights?.delete('dn-' + c); locations.clear(); pinned = null; hovered = null; card.hidden = true; handledRange = null; hideToolbar(); }
  async function refresh() {
    const run = ++generation;
    try {
      const state = await U.api({type: 'status'}); if (run !== generation) return;
      enabled = state.enabled; color = state.color; position = state.position; theme(); placeFab();
      const current = A.conversationId() || '';
      if (current !== cid) {
        suspendNote();
        if (editing) { if (editing.dirty()) { drafts.set(editorContext.key, editing.snapshot()); toast('已保留上一对话的编辑草稿，返回该对话后可继续编辑。'); } editing.remove(); editing = null; }
        cid = current; conv = null; selected = null; panelPositioned = false; clearMarks();
      }
      fab.hidden = !enabled; panel.hidden = !enabled || !panelOpen;
      if (!enabled) { suspendNote(); if (editing) { if (editing.dirty()) drafts.set(editorContext.key, editing.snapshot()); editing.remove(); editing = null; editorContext = null; } clearMarks(); return; }
      if (!cid) { conv = null; clearMarks(); renderPanel(); return; }
      const loading = {cid: current, promise: req('read')}; loadingConversation = loading;
      const fresh = await loading.promise; if (run !== generation || cid !== current) return;
      conv = fresh;
      if (!sticky && openNotes.has(cid)) editNote(false);
      if (sticky && !sticky.dirty() && !sticky.busy() && stickyContext.revision !== conv.note.revision) { sticky.setBody(conv.note.body); stickyContext.revision = conv.note.revision; }
      const found = await A.locateAll(conv.annotations); if (run !== generation) return; locations = found;
      for (const c of C.colors) { const ranges = conv.annotations.filter(a => a.color === c).map(a => found.get(a.id)?.range).filter(Boolean); if (CSS.highlights) CSS.highlights.set('dn-' + c, new Highlight(...ranges)); }
      if (pinned && !conv.annotations.some(a => a.id === pinned && a.note.trim())) { pinned = null; hovered = null; card.hidden = true; }
      if (pinned) showCard(pinned, true);
      drawGeometry(); renderPanel();
    } catch (e) { if (run === generation) { clearMarks(); toast(e.message); } }
  }
  function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 180); }
  function drawGeometry() {
    marks.replaceChildren(); if (!conv || !enabled) return;
    const occupied = [];
    for (const a of conv.annotations) {
      if (!a.note.trim()) continue; const located = locations.get(a.id); if (!located?.range) continue;
      const rects = [...located.range.getClientRects()].filter(r => r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth);
      for (const r of rects) { const line = h('div', {class: 'underline'}); line.style.cssText = `left:${r.left}px;top:${r.bottom - 1}px;width:${r.width}px`; marks.append(line); }
      const r = rects.at(-1); if (!r) continue;
      let x = Math.min(innerWidth - 24, r.right + 2), y = Math.max(2, r.top - 12);
      while (occupied.some(p => Math.abs(p.x - x) < 22 && Math.abs(p.y - y) < 22) && y < innerHeight - 44) y += 22;
      occupied.push({x, y});
      const marker = button('✎', () => {
        if (pinned === a.id) { pinned = null; hovered = null; card.hidden = true; } else showCard(a.id, true);
      }, {class: 'marker', 'data-record': a.id, title: '查看备注 · 单击固定 / 取消固定', 'aria-label': '查看备注', 'aria-pressed': String(pinned === a.id)});
      marker.style.cssText = `left:${x}px;top:${y}px`;
      marker.addEventListener('mouseenter', () => { if (!pinned) showCard(a.id, false); }); marker.addEventListener('focus', () => { if (!pinned) showCard(a.id, false); });
      marker.addEventListener('mouseleave', delayClose); marks.append(marker);
    }
    if (pinned || hovered) positionCard(pinned || hovered);
  }
  function scheduleGeometry() { if (!geometryQueued) { geometryQueued = true; requestAnimationFrame(() => { geometryQueued = false; drawGeometry(); }); } }
  function positionCard(id) {
    const range = locations.get(id)?.range, r = range?.getBoundingClientRect();
    const visible = range && [...range.getClientRects()].some(b=>b.bottom>0&&b.top<innerHeight&&b.right>0&&b.left<innerWidth);
    card.hidden = !visible; if (!visible) return;
    card.style.left = Math.max(8,Math.min(innerWidth-card.offsetWidth-8,r.right+12))+'px';
    // Keep the vertical offset relative to the original text, even near edges.
    card.style.top = (r.top + (pinned===id ? pinOffset : 0))+'px';
  }
  function delayClose() { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!pinned && !card.matches(':hover')) { hovered = null; card.hidden = true; } }, 220); }
  function showCard(id, pin) {
    clearTimeout(hideTimer); if (pinned && !pin && pinned !== id) return;
    const a = conv?.annotations.find(a => a.id === id); if (!a?.note.trim()) return;
    if (pin && pinned !== id) { pinned = id; pinOffset = 0; } hovered = id; card.hidden = false;
    for (const marker of marks.querySelectorAll('.marker')) marker.setAttribute('aria-pressed', String(marker.dataset.record === pinned));
    const pinButton=U.iconButton('pin',pinned===id?'取消固定':'固定备注',()=>{if(pinned===id){pinned=null;showCard(id,false);delayClose();}else showCard(id,true);},{'aria-pressed':String(pinned===id),class:'pin-button'});
    const edit=button('',()=>editAnnotation(a));edit.append(U.icon('pen'),'编辑');
    card.replaceChildren(h('div',{class:'row spread'},h('span',{class:'muted'},pinned===id?'已固定':'文字备注'),pinButton),DNMarkdown.render(a.note),h('div',{class:'row'},edit)); positionCard(id);
  }
  card.addEventListener('mouseenter', () => clearTimeout(hideTimer)); card.addEventListener('mouseleave', delayClose);
  function locate(a) {
    const hit = locations.get(a.id); if (!hit?.range) { toast('原文尚未加载或已变化。请滚动加载历史消息；已保存的摘录和备注仍保留。'); return; }
    const rect = hit.range.getBoundingClientRect(); const target = hit.range.startContainer.parentElement;
    target.scrollIntoView({block: 'center', behavior: 'smooth'});
    if (CSS.highlights) { CSS.highlights.set('dn-focus', new Highlight(hit.range)); setTimeout(() => CSS.highlights.delete('dn-focus'), 1400); }
    if (a.note.trim()) showCard(a.id, true);
  }
  function renderPanel() {
    const restoreSearch = root.activeElement?.matches('input[type=search]'); const selectionStart = restoreSearch ? root.activeElement.selectionStart : null;
    panel.hidden = !panelOpen || !enabled; badge.textContent = String(conv?.annotations.length || 0); if (panel.hidden) return;
    const title = conv?.title && conv.title !== '未命名对话' ? conv.title : A.title() || '当前对话';
    const body = h('div', {class: 'panel-body'});
    const head = h('header', {class: 'panel-head'}, h('div', {class: 'row spread'}, h('div', {}, h('div', {class: 'eyebrow'}, 'AnnotateLLM / 0.2'), h('h2', {'data-user-content':''}, title)), button('−', () => { panelOpen = false; panel.hidden = true; }, {'aria-label': '最小化'})));
    const tabs = h('div', {class: 'tabs'}, button(`批注 ${conv?.annotations.length || 0}`, () => renderPanel(), {role:'tab','aria-selected':'true'}), button('对话笔记', () => editNote()));
    if (!cid) body.append(h('div', {class: 'empty'}, '打开一个已保存的 ChatGPT 对话后，即可添加批注和笔记。临时对话及分享页暂不支持。'));
    else {
      const search = h('input', {type: 'search', placeholder: '搜索摘录与备注', 'aria-label': '搜索批注'}); search.value = query;
      const select = h('select', {'aria-label': '批注筛选'}, h('option', {value: 'all'}, '全部'), h('option', {value: 'note'}, '仅批注'), h('option', {value: 'highlight'}, '仅高亮')); select.value = filter;
      const list = h('div');
      const renderList = () => {
        list.replaceChildren(); const records = (conv?.annotations || []).filter(a => (filter === 'all' || (filter === 'note' ? a.note.trim() : !a.note.trim())) && (!colorFilters.size || colorFilters.has(a.color)) && `${a.anchor.exact}\n${a.note}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => (locations.get(a.id)?.order ?? Infinity) - (locations.get(b.id)?.order ?? Infinity));
        for (const a of records) {
          const excerpt = h('span', {class: `excerpt ${a.color || ''} ${a.note.trim() ? 'noted' : ''}`}, a.anchor.exact.slice(0, 300));
          const link = button('', () => locate(a), {class: 'quote-button'}); link.append(excerpt);
          link.addEventListener('mouseenter', () => showCard(a.id, false)); link.addEventListener('mouseleave', delayClose);
          const actions = h('div', {class: 'record-actions'}, button('编辑', () => editAnnotation(a)), button('删除', () => remove(a), {class: 'danger'}));
          list.append(h('article', {class: 'record'}, link, h('div', {class: 'record-meta'}, actions)));
        }
        if (!records.length) list.append(h('div', {class: 'empty'}, query ? '没有匹配的批注' : '选中对话中的文字，开始高亮或备注。'));
      };
      const colors=h('div',{class:'color-filters',role:'group','aria-label':'按高亮颜色筛选'});
      for(const c of C.colors){const b=button('',()=>{if(colorFilters.has(c))colorFilters.delete(c);else colorFilters.add(c);b.setAttribute('aria-pressed',String(colorFilters.has(c)));renderList();},{'aria-label':`筛选${C.colorNames[c]}`,'aria-pressed':String(colorFilters.has(c)),class:'color-filter'});b.append(h('span',{class:`color-dot ${c}`}));colors.append(b);}
      search.addEventListener('input', () => { query = search.value; renderList(); }); select.addEventListener('change', () => { filter = select.value; renderList(); }); body.append(search,h('div',{class:'filter-row'},select,colors),list); renderList();
    }
    const foot = h('footer', {class: 'panel-foot row'},button('导出', async()=>{try{await sticky?.flush();await U.api({type:'openManager',cid});}catch(e){fail(e);}}));
    panelDragCleanup?.();
    panel.replaceChildren(head, tabs, body, foot);
    panelDragCleanup=U.draggable(panel,head);
    if(!panelPositioned){const f=fab.getBoundingClientRect();U.place(panel,f.left>innerWidth/2?f.left-panel.offsetWidth-12:f.right+12,f.top);panelPositioned=true;}
    if (restoreSearch) { const input = panel.querySelector('input[type=search]'); input?.focus(); input?.setSelectionRange(selectionStart, selectionStart); }
  }
  function beginEditor(context, options) {
    if (editing) { toast('请先保存或关闭正在编辑的内容'); return; }
    editorContext = context; const draft = drafts.get(context.key);
    editing = U.editor(root, {...options, ...(draft || {}), unsaved: !!draft, close: () => { drafts.delete(context.key); editing = null; editorContext = null; }});
  }
  function suspendNote(){
    if(!sticky)return;
    if(sticky.dirty())noteDrafts.set(stickyContext.cid,{body:sticky.snapshot().body,revision:stickyContext.revision});
    sticky.remove();sticky=null;stickyContext=null;
  }
  function editNote(focus=true) {
    if (!conv) return;if(sticky){if(focus)sticky.focus();return;}
    const conversation=cid,title=A.title(),draft=noteDrafts.get(cid),context={cid:conversation,revision:draft?.revision??conv.note.revision};
    openNotes.add(cid);stickyContext=context;
    try{sessionStorage.setItem('dn-open-notes',JSON.stringify([...openNotes]));}catch{}
    const f=fab.getBoundingClientRect();
    sticky=U.editor(root,{title:'对话笔记',persistent:true,unsaved:!!draft,body:draft?.body??conv.note.body,x:f.left>innerWidth/2?f.left-460:f.right+12,y:f.top,minimize:()=>{
      openNotes.delete(conversation);
      try{sessionStorage.setItem('dn-open-notes',JSON.stringify([...openNotes]));}catch{}
      if(stickyContext===context){sticky=null;stickyContext=null;}
    },save:async body=>{
      const saved=await U.api({type:'saveNote',cid:conversation,title,body,expectedRevision:context.revision});context.revision=saved.revision;
      const pending=noteDrafts.get(conversation);if(pending&&pending.body!==body)pending.revision=saved.revision;else noteDrafts.delete(conversation);
    }});
    if(draft)toast('已恢复尚未保存的笔记草稿，请点击保存。');
  }
  function editAnnotation(a) {
    const record = C.clone(a), conversation = cid, title = A.title(); toolbar.hidden = true;card.hidden=true;
    beginEditor({key: `${conversation}:${a.id}`}, {title: '文字备注', quote: a.anchor.exact, body: a.note, color: a.color, annotation: true, save: async (body, chosenColor) => {
      C.assert(body.trim() || chosenColor, '请填写备注或选择高亮颜色；删除请使用删除按钮。'); record.note = body; record.color = chosenColor;
      const saved = await U.api({type: 'saveAnnotation', cid: conversation, title, record, expectedRevision: record.revision || 0}); record.revision = saved.revision; await refresh();
    }});
  }
  async function remove(a) {
    const conversation = cid;
    try { await req('deleteAnnotation', {id: a.id, expectedRevision: a.revision}); toast('已删除批注', async () => { try { await U.api({type: 'saveAnnotation', cid: conversation, record: a, expectedRevision: 0, undo: true}); } catch(e) { fail(e); } }); await refresh(); } catch(e) { fail(e); }
  }
  function selectedRecord() {
    return conv?.annotations.find(a => selected && C.overlap(a.anchor, selected) && a.anchor.start <= selected.start && a.anchor.end >= selected.end);
  }
  async function addHighlight(chosenColor) {
    if(changingHighlight)return;changingHighlight=true;
    try {
      const existing = selectedRecord(), cancel = chosenColor===undefined && !!existing?.color;
      if(cancel&&!existing.note.trim())await req('deleteAnnotation',{id:existing.id,expectedRevision:existing.revision});
      else {const next=cancel?null:(chosenColor||color),record=existing?{...existing,color:next}:{id:C.id(),anchor:selected,color:next,note:'',revision:0};await req('saveAnnotation',{record,expectedRevision:record.revision||0,title:A.title()});}
      if(!cancel){color=chosenColor||color;await req('prefs',{color});}
      hoverTarget=null;hideToolbar();getSelection().removeAllRanges();await refresh();
    } catch(e) { fail(e); } finally{changingHighlight=false;}
  }
  function showToolbar() {
    toolbar.replaceChildren(); toolbar.hidden = false;
    {
      const existing=selectedRecord(),active=!!existing?.color;
      const main=button('',()=>addHighlight(),{class:'highlight-main','aria-label':active?'取消高亮':'高亮','aria-pressed':String(active),title:active?'取消此条高亮（保留备注）':'高亮'});
      main.append(h('span',{class:`color-dot ${existing?.color||color}`}),h('span',{},'高亮'));if(active)main.append(U.icon('check'));
      const palette=h('div',{class:'toolbar-palette',hidden:'',role:'group','aria-label':'高亮颜色'});
      for(const c of C.colors)palette.append(button('',()=>addHighlight(c),{class:`swatch ${c}`,'aria-label':C.colorNames[c],'aria-pressed':String(existing?.color===c)}));
      const arrow=U.iconButton('chevron','选择高亮颜色',()=>{palette.hidden=!palette.hidden;arrow.setAttribute('aria-expanded',String(!palette.hidden));positionToolbar();},{class:'highlight-arrow','aria-expanded':'false'});
      const split=h('div',{class:'highlight-split'+(active?' is-highlighted':'')},main,h('span',{class:'split-divider','aria-hidden':'true'}),arrow);
      const note=button('',()=>editAnnotation(selectedRecord()||{id:C.id(),anchor:selected,color:null,note:'',revision:0}),{'aria-label':'备注'});note.append(U.icon('pen'),'备注');
      toolbar.append(h('div',{class:'toolbar-row'},split,note),palette);
    }
    positionToolbar();
  }
  function positionToolbar() {
    const b = selectedBounds;
    // ChatGPT's selection action appears above the text. Place ours below it.
    safePosition(toolbar, b?.left ?? mouse.x, b ? (b.bottom + 8 + toolbar.offsetHeight < innerHeight - 10 ? b.bottom + 8 : b.top - toolbar.offsetHeight - 42) : mouse.y + 12);
  }
  toolbar.addEventListener('mousedown', e => e.preventDefault());
  function sameRange(a, b) { return a && b && a.startContainer === b.startContainer && a.startOffset === b.startOffset && a.endContainer === b.endContainer && a.endOffset === b.endOffset; }
  function currentRange() { const s = getSelection(); return s?.rangeCount && !s.isCollapsed ? s.getRangeAt(0).cloneRange() : null; }
  async function captureSelection() {
    if (!enabled || !cid || editing || selecting) return;
    const s = getSelection(), range = currentRange();
    if (!range) { handledRange = null; hideToolbar(); return; }
    if (sameRange(range, handledRange)) return;
    hideToolbar(); handledRange = range.cloneRange();
    const before = cid, run = selectionRun;
    try {
      // The button may already be visible while the initial library read is still
      // pending. Preserve this selection and await that read instead of dropping it.
      const value = await A.capture(s);
      if (!conv || conv.id !== before) {
        const fresh = await (loadingConversation?.cid === before ? loadingConversation.promise : req('read'));
        if (before !== cid || before !== A.conversationId() || !enabled) return;
        conv = fresh;
      }
      if (run !== selectionRun || before !== cid || before !== A.conversationId() || !enabled || editing || !sameRange(range, currentRange())) return;
      toolbarSource='selection';hoverTarget=null;selected = value; selectedBounds = range.getBoundingClientRect(); showToolbar();
    } catch(e) {
      const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
      const messageText = A.messages().some(m => m.node.contains(range.startContainer));
      const unknownBody = element?.closest('main') && !element.closest('button,input,textarea,[contenteditable="true"],[role="textbox"]');
      if (run === selectionRun && sameRange(range, currentRange()) && (messageText || unknownBody)) {
        lastDiagnosis = A.diagnose(range); toast(e.message, showDiagnosis, '查看诊断');
      }
    }
  }
  // Capture before site handlers can stop bubbling or replace the selection.
  // Do not cancel the event: the site's own selection action remains available.
  document.addEventListener('pointerdown', e => { if (!e.composedPath().includes(host)) { selecting = true; handledRange = null; hideToolbar(); } }, true);
  document.addEventListener('pointerup', () => { selecting = false; }, true);
  document.addEventListener('pointercancel', () => { selecting = false; hideToolbar(); }, true);
  document.addEventListener('mouseup', e => {
    if (e.composedPath().includes(host) || e.button !== 0) return;
    selecting = false; clearTimeout(selectionTimer); mouse = {x: e.clientX, y: e.clientY}; captureSelection();
  }, true);
  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    if (!currentRange()) { handledRange = null; hideToolbar(); return; }
    if (!selecting && !editing) selectionTimer = setTimeout(captureSelection, 100);
  });
  let hoverTimer;
  function delayToolbarClose(){clearTimeout(hoverCloseTimer);hoverCloseTimer=setTimeout(()=>{if(toolbarSource==='hover'&&!toolbar.matches(':hover')){hoverTarget=null;hideToolbar();}},300);}
  toolbar.addEventListener('mouseenter',()=>clearTimeout(hoverCloseTimer));
  toolbar.addEventListener('mouseleave',delayToolbarClose);
  document.addEventListener('mousemove', e => {
    if (!enabled || !conv || editing || selecting || e.composedPath().includes(host)) return;
    mouse = {x: e.clientX, y: e.clientY};
    const hit = conv.annotations.find(a => [...(locations.get(a.id)?.range?.getClientRects() || [])].some(r => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom));
    clearTimeout(hoverTimer);
    if (hit) {
      clearTimeout(hideTimer);clearTimeout(hoverCloseTimer);
      hoverTimer=setTimeout(()=>{
        if(currentRange()||selecting||editing)return;
        if(hoverTarget!==hit.id||toolbar.hidden){hoverTarget=hit.id;toolbarSource='hover';selected=C.clone(hit.anchor);selectedBounds=locations.get(hit.id)?.range?.getBoundingClientRect();showToolbar();}
        if(hit.note.trim()&&!pinned&&hovered!==hit.id)showCard(hit.id,false);
      },160);
    } else {delayClose();delayToolbarClose();}
  }, {passive: true});
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !editing) { pinned = null; hovered = null; card.hidden = true; handledRange = currentRange(); hideToolbar(); } }, true);
  addEventListener('beforeunload', e => { if (editing?.dirty() || sticky?.dirty() || drafts.size || noteDrafts.size) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('scroll', e => { if(e.composedPath().includes(host))return;hoverTarget=null;hideToolbar();scheduleGeometry(); }, {capture: true, passive: true}); addEventListener('resize', () => { hideToolbar(); placeFab();if(!panel.hidden){const r=panel.getBoundingClientRect();U.place(panel,r.left,r.top);}for(const ed of [editing,sticky])if(ed){const r=ed.element.getBoundingClientRect();U.place(ed.element,r.left,r.top);}scheduleGeometry(); });
  let start, dragged = false;
  fab.addEventListener('pointerdown', e => {const r=fab.getBoundingClientRect(); start = {x: e.clientX, y: e.clientY,left:r.left,top:r.top}; dragged = false; fab.setPointerCapture(e.pointerId); });
  fab.addEventListener('pointermove', e => { if (!start) return; if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) dragged = true; if (dragged) {position={side:'free',x:Math.max(0,Math.min(1,(start.left+e.clientX-start.x)/(innerWidth-50))),y:Math.max(0,Math.min(1,(start.top+e.clientY-start.y)/(innerHeight-50)))};placeFab();} });
  fab.addEventListener('pointerup', e => {start=null;if(dragged){position.side=e.clientX<innerWidth*.15?'left':e.clientX>innerWidth*.85?'right':'free';placeFab();if(cid)req('prefs',{position}).catch(fail);}setTimeout(()=>{dragged=false;},100);});
  fab.addEventListener('pointercancel',()=>{start=null;dragged=false;});
  const observer = new MutationObserver(changes => { if (changes.some(m => !host.contains(m.target))) scheduleRefresh(); });
  observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-message-author-role','data-message-id','data-content-search-unit-key','data-is-streaming']});
  new MutationObserver(theme).observe(document.documentElement, {attributes: true, attributeFilter: ['class','data-theme','style']});
  let lastUrl = location.href; setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; clearMarks(); scheduleRefresh(); } }, 500);
  function connect() { try { const port = chrome.runtime.connect({name: 'dialog-notes'}); port.onMessage.addListener(scheduleRefresh); port.onDisconnect.addListener(() => setTimeout(connect, 2000)); } catch {} }
  chrome.runtime.onMessage.addListener(m => { if (m.type === 'diagnose' && enabled) showDiagnosis(); });
  connect(); refresh();
})();
