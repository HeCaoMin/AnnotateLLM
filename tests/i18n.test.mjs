import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const sandbox=vm.createContext({});
for(const file of ['locales.js','privacy-locales.js','i18n.js'])vm.runInContext(await fs.readFile(new URL('../extension/'+file,import.meta.url),'utf8'),sandbox);
test('every language entry has English and Korean translations without duplicate keys',()=>{
 const keys=new Set();for(const row of sandbox.DNTranslations){assert.equal(row.length,3);assert.ok(row.every(s=>typeof s==='string'&&s.length));assert.ok(!keys.has(row[0]),row[0]);keys.add(row[0]);}
});
test('translations preserve data placeholders and translate wrapped system errors',()=>{
 const {t}=sandbox.DNI18N;
 assert.equal(t('批注 12','en'),'Annotations 12');
 assert.equal(t('保存失败：笔记最多支持 100,000 字符','en'),'Save failed: Notes support up to 100,000 characters');
 assert.equal(t('3 个对话 · 12 条批注 · 本地存储 10.2 KiB（包含恢复快照）','ko'),'대화 3개 · 주석 12개 · 로컬 저장 용량 10.2 KiB (복구 스냅샷 포함)');
 assert.equal(t('这是一份用户自己的笔记','en'),'这是一份用户自己的笔记');
});
