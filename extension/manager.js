const C = DN, U = DNUI, {h, button, api} = U;
const app = document.getElementById('app');
let lib, selectedId = new URLSearchParams(location.search).get('conversation'), modal = null, importText = '', previewRevision = null;
let pendingConversation = selectedId;
const status = h('div', {class: 'status', role: 'status'}), content = h('div', {class: 'workspace'});
const report = e => { status.textContent = e.message || String(e); status.className = 'status error'; };
const ok = text => { status.textContent = text; status.className = 'status'; };
const doExport = async cid => { try { U.download(await api({type: 'export', cid}), cid ? `AnnotateLLM-${cid}.md` : 'AnnotateLLM-全部对话.md'); ok(''); } catch(e) { report(e); } };
const file = h('input', {type: 'file', accept: '.md,text/markdown,text/plain', hidden: ''});
file.addEventListener('change', async () => {
  const chosen = file.files[0]; file.value = ''; if (!chosen) return;
  try { C.assert(chosen.size <= C.MAX_BYTES, '文件超过 2 MiB 限制'); importText = await chosen.text(); await showImport(); } catch(e) { report(e); }
});
const header = h('header', {class: 'app-head'}, h('div', {}, h('div', {class: 'eyebrow'}, 'AnnotateLLM / LOCAL LIBRARY'), h('h1', {}, '给对话留下自己的思考。')), h('div', {class: 'row'}, button('导入 Markdown', () => file.click()), button('导出全部', () => doExport(), {class: 'primary'})));
const footer = h('footer', {class: 'app-footer row'}, h('a', {href: 'privacy.html', target: '_blank'}, '隐私说明'), h('span', {}, `v${chrome.runtime.getManifest().version}`), button('导出上一份恢复快照', async () => { try { U.download(await api({type: 'snapshot'}), 'AnnotateLLM-恢复快照.md'); } catch(e) { report(e); } }), button('清空笔记库', async () => { if (!confirm(DNI18N.t('清空所有对话笔记和批注？请先导出备份。'))) return; try { await api({type: 'clear'}); selectedId = null; await load(); } catch(e) { report(e); } }, {class: 'danger'}));
app.append(header, status, content, footer, file);
async function load() {
  lib = await api({type: 'read'}); const stats = await api({type: 'stats'});
  if(C.validId(pendingConversation)&&!lib.conversations.some(c=>c.id===pendingConversation))lib.conversations.push(C.newConversation(pendingConversation));
  pendingConversation = null;
  if (!lib.conversations.some(c => c.id === selectedId)) selectedId = lib.conversations[0]?.id || null;
  ok(`${lib.conversations.length} 个对话 · ${lib.conversations.reduce((n,c) => n + c.annotations.length, 0)} 条批注 · 本地存储 ${(stats.bytes / 1024).toFixed(1)} KiB（包含恢复快照）`); renderLibrary();
}
function renderLibrary() {
  const sidebar = h('aside', {class: 'library-nav'}), detail = h('section', {class: 'library-detail'});
  const search = h('input', {type: 'search', placeholder: '搜索对话与笔记', 'aria-label': '搜索对话'}), items = h('div'); sidebar.append(search, items);
  function list() {
    items.replaceChildren();
    for (const c of lib.conversations.filter(c => `${c.title}\n${c.note.body}\n${c.annotations.map(a => a.note + a.anchor.exact).join('\n')}`.toLowerCase().includes(search.value.toLowerCase()))) {
      items.append(button('', () => { selectedId = c.id; renderLibrary(); }, {class: 'conversation-link', 'aria-current': c.id === selectedId ? 'true' : 'false'}));
      items.lastChild.append(h('strong', {'data-user-content':''}, c.title), h('span', {class: 'muted'}, `${c.annotations.length} 条批注 · ${c.note.body ? '有笔记' : '未写笔记'}`));
    }
  }
  search.addEventListener('input', list); list();
  const c = lib.conversations.find(c => c.id === selectedId);
  if (!c) detail.append(h('div', {class: 'empty'}, h('h2', {}, '笔记库还是空的'), h('p', {}, '在插件入口启用后，打开 ChatGPT 对话，选中文字即可开始。也可以导入已有 Markdown 备份。')));
  else {
    detail.append(h('div', {class: 'row spread'}, h('h2', {'data-user-content':''}, c.title), h('div', {class: 'row'}, h('a', {href: c.url, target: '_blank', rel: 'noopener noreferrer'}, '打开原对话 ↗'), button('导出此对话', () => doExport(c.id)), button('删除对话', async () => { if (!confirm(DNI18N.t('删除这个对话的全部本地笔记和批注？'))) return; try { await api({type: 'deleteConversation', cid: c.id}); await load(); } catch(e) { report(e); } }, {class: 'danger'}))));
    detail.append(h('div', {class: 'note-card',id:'note',tabindex:'-1'}, h('div', {class: 'row spread'}, h('h3', {}, '对话笔记'), button('编辑 Markdown', () => edit(c))), DNMarkdown.render(c.note.body)));
    detail.append(h('h3', {}, `文字批注 · ${c.annotations.length}`));
    for (const a of c.annotations) {
      detail.append(h('article', {class: 'record'}, h('div', {class: `excerpt ${a.color || ''} ${a.note.trim() ? 'noted' : ''}`}, a.anchor.exact), a.note.trim() ? DNMarkdown.render(a.note) : h('p', {class: 'muted'}, '仅高亮'), h('div', {class: 'row spread'}, h('span', {class: 'muted'}, `${a.anchor.role === 'user' ? '我的提问' : '模型回答'} · ${a.updatedAt}`), h('div', {class: 'row'}, button('编辑', () => edit(c, a)), button('删除', async () => {
        try { await api({type: 'deleteAnnotation', cid: c.id, id: a.id, expectedRevision: a.revision}); await load(); status.replaceChildren('已删除批注。', button('撤销', async () => { try { await api({type: 'saveAnnotation', cid: c.id, record: a, expectedRevision: 0, undo: true}); await load(); } catch(e) { report(e); } })); } catch(e) { report(e); }
      }, {class: 'danger'})))));
    }
  }
  content.replaceChildren(sidebar, detail);
  if(location.hash==='#note'){detail.querySelector('#note')?.scrollIntoView({block:'center'});detail.querySelector('#note')?.focus({preventScroll:true});history.replaceState({},'',location.pathname+location.search);}
}
function edit(c, a) {
  if (modal) return;
  let revision = a ? a.revision : c.note.revision;
  modal = U.editor(document.body, {title: a ? '文字备注' : '对话笔记', quote: a?.anchor.exact, body: a ? a.note : c.note.body, color: a?.color, annotation: !!a,
    close: () => { modal = null; }, save: async (body, color) => {
      const saved = a ? await api({type: 'saveAnnotation', cid: c.id, record: {...a, note: body, color}, expectedRevision: revision}) : await api({type: 'saveNote', cid: c.id, body, expectedRevision: revision});
      revision = saved.revision;
      await load();
    }
  });
}
async function showImport() {
  const preview = await api({type: 'previewImport', text: importText}); previewRevision = preview.revision;
  const choices = {}, counts = preview.rows.reduce((a,r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
  const rows = h('div', {class: 'import-rows'}), error = h('p', {class: 'error', role: 'status'});
  const labels = {new: '新增', same: '未变化', conflict: '内容冲突', overlap: '原文范围重叠', deleted: '本地已删除'};
  for (const row of preview.rows) {
    choices[row.key] = row.status === 'new' ? 'incoming' : 'local';
    const select = h('select', {'aria-label': `${row.title} ${labels[row.status]} 的处理方式`}, h('option', {value: 'local'}, row.status === 'new' ? '跳过' : '保留本地'), h('option', {value: 'incoming'}, row.status === 'overlap' ? '采用导入（替换重叠记录）' : row.status === 'deleted' ? '恢复这条记录' : '采用导入')); select.value = choices[row.key];
    select.disabled = row.status === 'same'; select.addEventListener('change', () => { choices[row.key] = select.value; });
    const describe = r => !r ? h('p',{},'（无本地记录）') : row.type === 'note' ? h('pre',{},r.body) : h('div',{},h('p',{},'原文：'),h('pre',{},r.anchor.exact),h('p',{},'高亮：',h('span',{},C.colorNames[r.color]||'无')),h('p',{},'备注：'),h('pre',{},r.note));
    const details = h('details', {}, h('summary', {}, '查看本地 / 导入内容'), h('div', {class: 'diff-columns'}, h('div', {}, h('h3', {}, '本地'), describe(row.local)), h('div', {}, h('h3', {}, '导入'), describe(row.incoming))));
    rows.append(h('article', {class: 'record'}, h('div', {class: 'row spread'}, h('strong', {}, `${row.title} · ${row.type === 'note' ? '对话笔记' : '批注'} · ${labels[row.status]}`), select), details));
  }
  let busy = false;
  const backdrop = h('div', {class: 'modal-backdrop'}, h('section', {class: 'modal import-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '导入预览'}, h('h2', {}, '导入预览'), h('p', {class: 'muted'}, `新增 ${counts.new || 0} · 未变化 ${counts.same || 0} · 冲突 / 已删除 ${(counts.conflict || 0) + (counts.overlap || 0) + (counts.deleted || 0)}。文件中缺少的记录不会删除本地内容。`), rows, error, h('div', {class: 'modal-footer'}, button('取消', () => { if (!busy) backdrop.remove(); }), button('确认合并导入', async e => {
    if (busy) return; busy = true; const b = e.currentTarget; b.disabled = true;
    try { await api({type: 'import', text: importText, expectedRevision: previewRevision, choices}); backdrop.remove(); await load(); ok('导入完成，未覆盖未选中的本地记录。'); }
    catch(e) { error.textContent = DNI18N.t(e.message) + DNI18N.t(' 如数据已变化，请取消后重新导入预览。'); } finally { busy = false; b.disabled = false; }
  }, {class: 'primary'})))); document.body.append(backdrop);
}
addEventListener('beforeunload', e => { if (modal?.dirty()) { e.preventDefault(); e.returnValue = ''; } });
const port = chrome.runtime.connect({name: 'manager'});
port.onMessage.addListener(() => { if (!modal && !document.querySelector('.import-modal')) load().catch(report); });
load().catch(report);
