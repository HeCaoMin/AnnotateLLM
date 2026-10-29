/* Shared data model and lossless Markdown codec. No DOM or network dependencies. */
(() => {
  'use strict';
  const FORMAT = 'dialog-notes', SCHEMA = 1, MAX_BYTES = 2 * 1024 * 1024;
  const colors = ['yellow', 'green', 'blue', 'pink'];
  const colorNames = {yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色'};
  const id = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const clone = value => structuredClone(value);
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const string = (s, max = 100000) => typeof s === 'string' && s.length <= max;
  const validId = s => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(s);
  const bytes = s => new TextEncoder().encode(s).length;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function conversationId(url) {
    try { const u = new URL(url); return u.origin === 'https://chatgpt.com' ? u.pathname.match(/^(?:\/g\/[^/]+)?\/c\/([a-zA-Z0-9_-]+)\/?$/)?.[1] || null : null; } catch { return null; }
  }
  function empty() { return {format: FORMAT, schema: SCHEMA, id: id(), revision: 0, conversations: [], tombstones: []}; }
  function newConversation(cid, title = '未命名对话') {
    return {id: cid, platform: 'chatgpt', title, url: `https://chatgpt.com/c/${cid}`, note: {id: id(), body: '', revision: 0, updatedAt: now()}, annotations: []};
  }
  function validate(lib) {
    assert(lib?.format === FORMAT && lib.schema === SCHEMA, '不支持的文档格式版本，请更新插件；原数据未被修改。');
    assert(validId(lib.id) && Number.isSafeInteger(lib.revision) && lib.revision >= 0, '文档标识或版本无效');
    assert(Array.isArray(lib.conversations) && lib.conversations.length <= 10000 && Array.isArray(lib.tombstones), '文档结构无效');
    const cids = new Set(), ids = new Set();
    for (const c of lib.conversations) {
      assert(validId(c.id) && !cids.has(c.id) && c.platform === 'chatgpt', '对话 ID 重复或无效'); cids.add(c.id);
      assert(string(c.title, 1000) && conversationId(c.url) === c.id, '对话标题或链接无效');
      const checkRecord = r => {
        assert(r && validId(r.id) && !ids.has(r.id), '记录 ID 重复或无效'); ids.add(r.id);
        assert(Number.isSafeInteger(r.revision) && r.revision >= 0 && string(r.updatedAt, 50), '记录版本无效');
      };
      checkRecord(c.note); assert(string(c.note.body), '笔记过长或格式错误');
      assert(Array.isArray(c.annotations) && c.annotations.length <= 10000, '批注列表无效');
      for (const a of c.annotations) {
        checkRecord(a); const q = a.anchor;
        assert(string(a.note) && (a.color === null || colors.includes(a.color)) && (a.note.trim() || a.color), '批注内容为空或颜色无效');
        assert(q && (q.role === 'user' || q.role === 'assistant') && string(q.messageId, 256) && q.messageId.length > 0 && /^[a-f0-9]{64}$/.test(q.fingerprint), '消息锚点无效');
        assert(Number.isSafeInteger(q.start) && Number.isSafeInteger(q.end) && q.start >= 0 && q.end > q.start && q.end - q.start === q.exact?.length, '原文范围无效');
        assert(string(q.exact, 20000) && string(q.prefix, 64) && string(q.suffix, 64), '原文定位内容无效');
      }
      for (let i = 0; i < c.annotations.length; i++) for (let j = 0; j < i; j++) assert(!overlap(c.annotations[i].anchor, c.annotations[j].anchor), '同一文档含有重叠批注，请保留一条后重试');
    }
    assert(lib.tombstones.length <= 100000, '删除记录过多');
    const deleted = new Set();
    for (const t of lib.tombstones) { assert(validId(t.id) && validId(t.conversationId) && string(t.deletedAt, 50) && !deleted.has(t.id) && !ids.has(t.id), '删除记录无效'); deleted.add(t.id); }
    return lib;
  }
  const encode = value => { let s = ''; for (const n of new TextEncoder().encode(JSON.stringify(value))) s += String.fromCharCode(n); return btoa(s); };
  const decode = s => JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))));
  async function digest(s) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), b => b.toString(16).padStart(2, '0')).join(''); }
  async function marker(kind, value) { const payload = encode(value); return `<!-- dn:${kind} ${payload} ${await digest(payload)} -->`; }
  const escapeBody = s => s.replace(/\r\n?/g, '\n').split('\n').map(l => l.startsWith('\\') || l.startsWith('<!-- dn:') ? '\\' + l : l).join('\n');
  const unescapeBody = s => s.split('\n').map(l => l.startsWith('\\\\') || l.startsWith('\\<!-- dn:') ? l.slice(1) : l).join('\n');
  const bodySection = (key, s) => `<!-- dn:body ${key} -->\n${escapeBody(s)}\n<!-- dn:endbody ${key} -->`;
  async function serialize(lib, scope = 'all', language = 'zh') {
    const t = value => globalThis.DNI18N?.t(value, language) ?? value;
    validate(lib);
    const chosen = scope === 'all' ? lib.conversations : lib.conversations.filter(c => c.id === scope);
    const tombstones = lib.tombstones.filter(t => scope === 'all' || t.conversationId === scope);
    const header = {format: FORMAT, schema: SCHEMA, id: lib.id, revision: lib.revision, scope, exportedAt: now(), conversations: chosen.map(c => c.id), tombstones};
    const lines = [t('# AnnotateLLM · Markdown 笔记库'), '', t('> 系统元数据及分区标记：勿编辑、删除或移动，否则可能影响再次导入。请仅编辑标明可编辑的笔记和备注正文。'), '', await marker('library', header)];
    for (const c of chosen) {
      const {annotations, note, ...meta} = c;
      lines.push('', '## ' + c.title.replace(/[\r\n]/g, ' '), '', t('来源：') + c.url, '', t('> 以下系统元数据及分区标记勿编辑。'), await marker('conversation', {...meta, annotations: annotations.map(a => a.id)}));
      const {body, ...nmeta} = note;
      lines.push('', t('### 对话笔记（正文可编辑）'), await marker('note', nmeta), bodySection(note.id, body));
      for (const a of annotations) {
        const {note: text, ...ameta} = a;
        lines.push('', `### ${a.color ? t(colorNames[a.color]) + ' ' + t('高亮') : t('文字备注')} · ${a.anchor.role === 'user' ? t('我的提问') : t('模型回答')}`, '', a.anchor.exact.split('\n').map(l => '> ' + l).join('\n'), '', t('> 以下系统元数据及分区标记勿编辑。'), await marker('annotation', ameta), t('备注正文（可编辑）：'), bodySection(a.id, text));
      }
      lines.push(`<!-- dn:endconversation ${c.id} -->`);
    }
    lines.push('<!-- dn:endlibrary -->', '');
    const result = lines.join('\n'); assert(bytes(result) <= MAX_BYTES, '笔记库超过 2 MiB 安全容量，请先导出并清理部分对话。'); return result;
  }
  async function parse(text) {
    assert(typeof text === 'string' && bytes(text) <= MAX_BYTES, '文件为空或超过 2 MiB 限制');
    const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    let lib, conv, pending, inBody = false, body = [], ended = false;
    let expectedConvs = [], expectedAnnotations = [];
    for (const line of lines) {
      if (inBody) {
        if (line === `<!-- dn:endbody ${pending.id} -->`) {
          const value = unescapeBody(body.join('\n'));
          if (pending.kind === 'note') conv.note = {...pending.meta, body: value}; else conv.annotations.push({...pending.meta, note: value});
          pending = null; inBody = false; body = []; continue;
        }
        assert(!line.startsWith('<!-- dn:'), '正文边界损坏；请勿修改系统分区标记'); body.push(line); continue;
      }
      if (!line.startsWith('<!-- dn:')) continue;
      assert(!ended, '文档结束标记之后出现额外系统内容');
      const m = line.match(/^<!-- dn:(library|conversation|note|annotation) ([A-Za-z0-9+/=]+) ([a-f0-9]{64}) -->$/);
      if (m) {
        assert(!pending, '记录正文缺失'); assert(await digest(m[2]) === m[3], '系统元数据已被修改或损坏');
        let v; try { v = decode(m[2]); } catch { throw new Error('元数据无法解析'); }
        if (m[1] === 'library') {
          assert(!lib && v.format === FORMAT && v.schema === SCHEMA, '不支持的文档格式版本，请更新插件');
          assert(Array.isArray(v.conversations), '对话目录损坏'); expectedConvs = v.conversations;
          lib = {format: v.format, schema: v.schema, id: v.id, revision: v.revision, conversations: [], tombstones: v.tombstones};
        } else if (m[1] === 'conversation') {
          assert(lib && !conv && Array.isArray(v.annotations), '对话分区顺序错误');
          expectedAnnotations = v.annotations; conv = {...v, annotations: [], note: null}; lib.conversations.push(conv);
        } else {
          assert(conv && (m[1] === 'note' ? !conv.note && !conv.annotations.length : !!conv.note), '笔记或批注顺序错误');
          pending = {kind: m[1], id: v.id, meta: v};
        }
      } else if (line.startsWith('<!-- dn:body ')) {
        assert(pending && line === `<!-- dn:body ${pending.id} -->`, '正文开始标记不匹配'); inBody = true;
      } else if (line.startsWith('<!-- dn:endconversation ')) {
        assert(conv && !pending && line === `<!-- dn:endconversation ${conv.id} -->` && conv.note, '对话结束标记损坏');
        assert(same(expectedAnnotations, conv.annotations.map(a => a.id)), '批注目录与内容不一致'); conv = null;
      } else if (line === '<!-- dn:endlibrary -->') {
        assert(lib && !conv && !pending && same(expectedConvs, lib.conversations.map(c => c.id)), '对话目录与内容不一致'); ended = true;
      } else throw new Error('未知或损坏的系统分区标记');
    }
    assert(ended && !inBody, '文件不完整或不是本插件生成的 Markdown 备份'); return validate(lib);
  }
  function overlap(a, b) { return a.messageId === b.messageId && a.fingerprint === b.fingerprint && a.role === b.role && a.start < b.end && b.start < a.end; }
  function contentEqual(a, b, type) {
    return type === 'note' ? a.body === b.body : a.note === b.note && a.color === b.color && same(a.anchor, b.anchor);
  }
  function planImport(local, incoming) {
    validate(local); validate(incoming); const rows = [];
    for (const c of incoming.conversations) {
      const lc = local.conversations.find(x => x.id === c.id);
      for (const [type, records] of [['note', [c.note]], ['annotation', c.annotations]]) for (const r of records) {
        const old = type === 'note' ? lc?.note : lc?.annotations.find(a => a.id === r.id);
        const deleted = local.tombstones.some(t => t.id === r.id);
        const overlaps = type === 'annotation' ? (lc?.annotations || []).filter(a => a.id !== r.id && overlap(a.anchor, r.anchor)).map(a => a.id) : [];
        const status = deleted ? 'deleted' : overlaps.length ? 'overlap' : old ? contentEqual(old, r, type) ? 'same' : 'conflict' : 'new';
        rows.push({key: `${c.id}:${type}:${r.id}`, cid: c.id, title: c.title, type, incoming: r, local: old || null, overlaps, status});
      }
    }
    return rows;
  }
  function mergeImport(local, incoming, choices) {
    const result = clone(local), rows = planImport(local, incoming);
    for (const row of rows) {
      if (row.status === 'same' || choices[row.key] !== 'incoming') continue;
      let c = result.conversations.find(c => c.id === row.cid);
      if (!c) { c = newConversation(row.cid, row.title); result.conversations.push(c); }
      const r = {...clone(row.incoming), revision: (row.local?.revision ?? row.incoming.revision) + 1, updatedAt: now()};
      if (row.type === 'note') c.note = r;
      else {
        for (const a of c.annotations.filter(a => row.overlaps.includes(a.id))) {
          result.tombstones = result.tombstones.filter(t => t.id !== a.id);
          result.tombstones.push({id: a.id, conversationId: c.id, deletedAt: now()});
        }
        c.annotations = c.annotations.filter(a => a.id !== r.id && !row.overlaps.includes(a.id)); c.annotations.push(r);
      }
      result.tombstones = result.tombstones.filter(t => t.id !== r.id);
    }
    // Imported tombstones never silently delete local content.
    result.revision++; return validate(result);
  }
  globalThis.DN = {FORMAT, SCHEMA, MAX_BYTES, colors, colorNames, id, now, clone, assert, string, validId, bytes, same, conversationId, empty, newConversation, validate, digest, serialize, parse, overlap, planImport, mergeImport};
})();
