importScripts('locales.js', 'privacy-locales.js', 'i18n.js', 'core.js', 'vault.js');
const C = globalThis.DN, vault = new DNVault(chrome.storage.local), ports = new Set();
const ready = chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
const trusted = sender => sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
async function scope(message, sender) {
  C.assert(sender.id === chrome.runtime.id && !sender.tab?.incognito, '不允许的请求来源');
  if (trusted(sender)) return;
  C.assert(sender.frameId === 0 && sender.tab?.id !== undefined && sender.origin === 'https://chatgpt.com', '不允许的页面来源');
  // MessageSender.url can remain the original document URL after pushState.
  // Read the browser-owned current tab URL, never trust a page-supplied URL.
  const tab = await chrome.tabs.get(sender.tab.id);
  C.assert(C.conversationId(tab.url) === message.cid && message.cid, '请在当前有效 ChatGPT 对话中操作');
  C.assert(['read', 'saveNote', 'saveAnnotation', 'deleteAnnotation', 'prefs'].includes(message.type), '页面没有此操作权限');
}
function notify() { for (const p of ports) { try { p.postMessage({type: 'changed'}); } catch { ports.delete(p); } } }
chrome.runtime.onConnect.addListener(port => {
  if (port.sender?.id !== chrome.runtime.id || port.sender?.tab?.incognito) return;
  if (!trusted(port.sender) && !port.sender?.url?.startsWith('https://chatgpt.com/')) return;
  ports.add(port); port.onDisconnect.addListener(() => ports.delete(port));
});
async function execute(m, sender) {
  await ready;
  C.assert(m && typeof m.type === 'string', '请求格式错误');
  if (m.type === 'status') {
    C.assert(sender.id === chrome.runtime.id && (trusted(sender) || sender.url?.startsWith('https://chatgpt.com/')), '不允许的请求');
    const {prefs = {}} = await chrome.storage.local.get('prefs'); return {enabled: !!prefs.enabled, color: prefs.color || 'yellow', position: prefs.position, language: prefs.language || 'zh'};
  }
  if (m.type === 'openManager') {
    C.assert(sender.id === chrome.runtime.id, '不允许的请求');
    if(m.cid){await scope({...m,type:'read'},sender);C.assert(C.validId(m.cid),'无效对话');await chrome.tabs.create({url:chrome.runtime.getURL('manager.html')+'?conversation='+encodeURIComponent(m.cid)+'#note'});}
    else await chrome.runtime.openOptionsPage();return true;
  }
  await scope(m, sender);
  const admin = trusted(sender), prefs = (await chrome.storage.local.get('prefs')).prefs || {};
  C.assert(admin || prefs.enabled, '请先在插件入口启用本地批注');
  if (m.type === 'prefs') {
    const patch = {};
    if(admin && m.language !== undefined){C.assert(['zh','en','ko'].includes(m.language),'Unsupported language');patch.language=m.language;}
    if (C.colors.includes(m.color)) patch.color = m.color;
    if (m.position && ['left', 'right','free'].includes(m.position.side) && Number.isFinite(m.position.y) && (m.position.side!=='free'||Number.isFinite(m.position.x))) patch.position = {side: m.position.side,x:Math.max(0,Math.min(1,m.position.x||0)), y: Math.max(0, Math.min(1, m.position.y))};
    if (admin && typeof m.enabled === 'boolean') patch.enabled = m.enabled;
    await chrome.storage.local.set({prefs: {...prefs, ...patch}}); notify(); return true;
  }
  if (m.type === 'read') {
    const {lib} = await vault.readQueued();
    return admin && !m.cid ? lib : lib.conversations.find(c => c.id === m.cid) || C.newConversation(m.cid);
  }
  if (m.type === 'stats') return {bytes: await chrome.storage.local.getBytesInUse(), limit: C.MAX_BYTES};
  if (m.type === 'export') return C.serialize((await vault.readQueued()).lib, m.cid || 'all', prefs.language);
  if (m.type === 'snapshot') {
    const s = await chrome.storage.local.get(['active', 'slot0', 'slot1']);
    C.assert(s.active !== undefined || s.slot0 || s.slot1, '尚无恢复快照，请先保存笔记。');
    C.assert(s.active === 0 || s.active === 1, '保存指针异常，请保留本地数据并联系支持。');
    const raw = s['slot' + (s.active === 0 ? 1 : 0)];
    C.assert(raw, '尚无上一份恢复快照；第一次成功保存后可以导出当前文档。'); return raw;
  }
  if (m.type === 'previewImport') {
    const incoming = await C.parse(m.text), {lib} = await vault.readQueued();
    return {revision: lib.revision, rows: C.planImport(lib, incoming)};
  }
  if (m.type === 'import') {
    const incoming = await C.parse(m.text);
    await vault.mutate(lib => { C.assert(lib.revision === m.expectedRevision, '预览后数据已变化，请重新预览再导入。'); return C.mergeImport(lib, incoming, m.choices || {}); });
    notify(); return true;
  }
  if (m.type === 'clear' || m.type === 'deleteConversation') {
    await vault.mutate(lib => {
      const doomed = lib.conversations.filter(c => m.type === 'clear' || c.id === m.cid);
      for (const c of doomed) for (const r of [c.note, ...c.annotations]) {
        lib.tombstones = lib.tombstones.filter(t => t.id !== r.id);
        lib.tombstones.push({id: r.id, conversationId: c.id, deletedAt: C.now()});
      }
      lib.conversations = lib.conversations.filter(c => !doomed.includes(c)); lib.revision++; return lib;
    }); notify(); return true;
  }
  C.assert(['saveNote', 'saveAnnotation', 'deleteAnnotation'].includes(m.type), '未知操作');
  let result;
  await vault.mutate(lib => {
    C.assert(C.validId(m.cid), '无效对话');
    let conv = lib.conversations.find(c => c.id === m.cid);
    if (!conv) { conv = C.newConversation(m.cid); lib.conversations.push(conv); }
    if (C.string(m.title, 1000) && m.title.trim()) conv.title = m.title;
    if (m.type === 'saveNote') {
      C.assert(conv.note.revision === m.expectedRevision, '笔记已在其他标签页修改。请复制当前草稿后重新加载，避免覆盖。');
      C.assert(C.string(m.body), '笔记最多支持 100,000 字符');
      conv.note = {...conv.note, body: m.body.replace(/\r\n?/g, '\n'), revision: conv.note.revision + 1, updatedAt: C.now()}; result = conv.note;
    } else {
      const recordId = m.type === 'saveAnnotation' ? m.record?.id : m.id;
      const old = conv.annotations.find(a => a.id === recordId);
      C.assert((old?.revision || 0) === m.expectedRevision, '批注已变化，请重新打开后编辑。');
      if (m.type === 'deleteAnnotation') {
        C.assert(old, '批注已删除'); conv.annotations = conv.annotations.filter(a => a.id !== old.id);
        lib.tombstones = lib.tombstones.filter(t => t.id !== old.id); lib.tombstones.push({id: old.id, conversationId: conv.id, deletedAt: C.now()}); result = old;
      } else {
        C.assert(m.record && (!lib.tombstones.some(t => t.id === recordId) || m.undo === true), '批注已删除，请重新选择文字。');
        const r = {id: m.record.id, anchor: C.clone(m.record.anchor), color: m.record.color, note: m.record.note, revision: (old?.revision || 0) + 1, updatedAt: C.now()};
        C.assert(!conv.annotations.some(a => a.id !== r.id && C.overlap(a.anchor, r.anchor)), '该范围与已有批注重叠，请编辑已有记录。');
        conv.annotations = conv.annotations.filter(a => a.id !== r.id); conv.annotations.push(r);
        lib.tombstones = lib.tombstones.filter(t => t.id !== r.id); result = r;
      }
    }
    lib.revision++; return lib;
  }); notify(); return result;
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  execute(m, sender).then(data => reply({ok: true, data}), error => reply({ok: false, error: error.message || '操作失败，原数据仍保留'})); return true;
});
