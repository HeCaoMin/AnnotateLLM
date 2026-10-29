import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/core.js';
import '../extension/vault.js';
const C = globalThis.DN;
async function sample() {
  const lib = C.empty(), c = C.newConversation('conversation-a', '中文标题 / emoji 📝');
  c.note.body = '# 我的笔记\n\n**保留 Markdown**\n```html\n<!-- dn:body fake -->\n```\n\\leading\n<!-- comment -->\n尾部\n';
  c.annotations.push({id: C.id(), color:'yellow', note: '备注\n\n第二段', revision:1, updatedAt:C.now(), anchor:{messageId:'msg-a',role:'assistant',fingerprint:await C.digest('hello world hello'),start:12,end:17,exact:'hello',prefix:'hello world ',suffix:''}});
  lib.conversations.push(c, C.newConversation('conversation-b', '另一个对话')); lib.revision=4; return lib;
}
test('Markdown round trip keeps all notes, annotations, literal boundaries, Unicode and trailing newline', async () => {
  const lib=await sample(), text=await C.serialize(lib); assert.match(text,/勿编辑/); assert.match(text,/我的笔记/);
  assert.deepEqual(await C.parse(text),lib);
  assert.deepEqual(await C.parse('\uFEFF'+text.replaceAll('\n','\r\n')),lib);
});
test('external editing changes only editable body; metadata checksum still valid', async () => {
  const lib=await sample(), text=(await C.serialize(lib)).replace('第二段','外部编辑后的第二段');
  const restored=await C.parse(text); assert.equal(restored.conversations[0].annotations[0].note,'备注\n\n外部编辑后的第二段'); assert.deepEqual(restored.conversations[0].annotations[0].anchor,lib.conversations[0].annotations[0].anchor);
});
test('tampered metadata, missing record boundary and removed sections are rejected', async () => {
  const lib=await sample(), text=await C.serialize(lib);
  await assert.rejects(C.parse(text.replace(/(dn:library )[A-Za-z]/,'$1X')),/元数据/);
  await assert.rejects(C.parse(text.replace(/<!-- dn:endbody [^\n]+ -->/,'')),/边界|标记|完整/);
  await assert.rejects(C.parse(text.replace(/<!-- dn:endlibrary -->/,'')),/不完整/);
  await assert.rejects(C.parse('# 普通 Markdown'),/不完整/);
});
test('unknown schema and duplicate IDs fail closed', async () => {
  const lib=await sample(); lib.schema=2; assert.throws(()=>C.validate(lib),/版本/); lib.schema=1;
  lib.conversations[1].note.id=lib.conversations[0].note.id; assert.throws(()=>C.validate(lib),/重复/);
});
test('export one conversation, merge with existing library without deleting unrelated content', async () => {
  const lib=await sample(), incoming=await C.parse(await C.serialize(lib,'conversation-a'));
  assert.equal(incoming.conversations.length,1);
  const base=C.empty(); base.conversations.push(C.newConversation('unrelated','不能删除')); base.conversations[0].note.body='不在备份内';
  const choices=Object.fromEntries(C.planImport(base,incoming).map(r=>[r.key,'incoming']));
  const merged=C.mergeImport(base,incoming,choices); assert.equal(merged.conversations.length,2); assert.equal(merged.conversations[0].note.body,'不在备份内');
  assert.ok(C.planImport(merged,incoming).every(r=>r.status==='same'));
});
test('same ID conflict requires explicit incoming choice', async () => {
  const local=await sample(), incoming=C.clone(local); incoming.conversations[0].note.body='外部新内容';
  const row=C.planImport(local,incoming).find(r=>r.status==='conflict'); assert.ok(row);
  assert.equal(C.mergeImport(local,incoming,{}).conversations[0].note.body,local.conversations[0].note.body);
  assert.equal(C.mergeImport(local,incoming,{[row.key]:'incoming'}).conversations[0].note.body,'外部新内容');
});
test('deleted records are not resurrected by old backups without a choice', async () => {
  const incoming=await sample(), local=C.clone(incoming), a=local.conversations[0].annotations.pop(); local.tombstones.push({id:a.id,conversationId:'conversation-a',deletedAt:C.now()});
  const row=C.planImport(local,incoming).find(r=>r.status==='deleted'); assert.ok(row);
  assert.equal(C.mergeImport(local,incoming,{}).conversations[0].annotations.length,0);
  assert.equal(C.mergeImport(local,incoming,{[row.key]:'incoming'}).conversations[0].annotations.length,1);
});
test('overlapping imported records prompt conflict and replace only with explicit choice', async () => {
  const local=await sample(), incoming=C.clone(local); incoming.conversations[0].annotations[0].id=C.id();
  const row=C.planImport(local,incoming).find(r=>r.status==='overlap'); assert.ok(row);
  const merged=C.mergeImport(local,incoming,{[row.key]:'incoming'}); assert.equal(merged.conversations[0].annotations.length,1); assert.equal(merged.conversations[0].annotations[0].id,row.incoming.id); assert.equal(merged.tombstones.length,1);
});
function memoryStorage() {
  const values={}; return {values, fail:null, async get(keys){const result={};for(const k of typeof keys==='string'?[keys]:keys)if(k in values)result[k]=structuredClone(values[k]);return result;},async set(v){if(this.fail&&this.fail(v))throw Error('simulated storage failure');Object.assign(values,structuredClone(v));}};
}
test('serialized concurrent writes keep changes from different tabs', async () => {
  const s=memoryStorage(), vault=new DNVault(s);
  await Promise.all(['a','b','c'].map(cid=>vault.mutate(async lib=>{lib.conversations.push(C.newConversation(cid));lib.revision++;return lib;})));
  const {lib}=await vault.readQueued(); assert.equal(lib.conversations.length,3); assert.equal(lib.revision,3);
});
test('failed pointer switch retains previously active document and later writes still work', async () => {
  const s=memoryStorage(), vault=new DNVault(s);
  await vault.mutate(lib=>{lib.conversations.push(C.newConversation('a'));lib.revision++;return lib;});
  s.fail=v=>'active' in v;
  await assert.rejects(vault.mutate(lib=>{lib.conversations.push(C.newConversation('b'));return lib;}),/failure/);
  assert.equal((await vault.readQueued()).lib.conversations.length,1);
  s.fail=null; await vault.mutate(lib=>{lib.conversations.push(C.newConversation('c'));return lib;}); assert.equal((await vault.readQueued()).lib.conversations.length,2);
});
test('unknown newer persisted schema is never replaced on read failure', async () => {
  const s=memoryStorage(); s.values.active=0;s.values.slot0='# newer format'; const vault=new DNVault(s);
  await assert.rejects(vault.mutate(lib=>C.empty()));assert.equal(s.values.slot0,'# newer format');
});
test('URL scope excludes other hosts, share pages, temporary chats and misleading suffixes',()=>{
  assert.equal(C.conversationId('https://chatgpt.com/c/abc?x=1'),'abc'); assert.equal(C.conversationId('https://chatgpt.com/g/g-demo/c/abc'),'abc');
  for(const url of ['https://claude.ai/c/abc','https://chatgpt.com.evil.test/c/abc','https://chatgpt.com/share/abc','https://chatgpt.com/','http://chatgpt.com/c/abc'])assert.equal(C.conversationId(url),null);
});
test('100 conversations / 1000 annotations benchmark and lossless restore',async t=>{
  const lib=C.empty(), first=(await sample()).conversations[0].annotations[0];
  for(let i=0;i<100;i++){const c=C.newConversation('bench-'+i,'对话 '+i);c.note.body='独立笔记'.repeat(100);for(let j=0;j<10;j++)c.annotations.push({...C.clone(first),id:C.id(),note:'测试备注'.repeat(30),anchor:{...first.anchor,messageId:'m-'+j}});lib.conversations.push(c);}
  const start=performance.now(), text=await C.serialize(lib), saved=performance.now(), restored=await C.parse(text), finished=performance.now();
  assert.deepEqual(restored,lib); t.diagnostic(JSON.stringify({bytes:C.bytes(text),serializeMs:Math.round(saved-start),parseMs:Math.round(finished-saved)}));
});
