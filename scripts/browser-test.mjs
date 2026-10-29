// Runs the actual extension in a disposable browser profile against a local,
// intercepted ChatGPT-shaped fixture. Never opens or modifies a real account.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {runInteractionChecks} from './interaction-checks.mjs';
import {runFollowupChecks} from './followup-checks.mjs';
import {runLanguageChecks} from './language-checks.mjs';
const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(process.env.DN_PLAYWRIGHT_PACKAGE || import.meta.url);
const {chromium}=require('playwright');
const executablePath=process.env.DN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const extension=path.join(root,'dist/dialog-notes');
const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
const profilePath=path.join(artifacts,'edge-test-profile-'+Date.now());
const launch=()=>chromium.launchPersistentContext(profilePath,{executablePath,headless:true,viewport:{width:1400,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
let context=await launch();
const checks=[],errors=[];
function record(name){checks.push(name);console.log('PASS',name);}
const fixture=`<!doctype html><html><head><title>理解与记录 - ChatGPT</title><style>body{margin:0;color:#263931;background:#fafbf8;font:17px/1.8 system-ui}nav{padding:20px 36px;border-bottom:1px solid #e0e6de}main{max-width:740px;margin:60px auto;padding-right:40px}.turn{padding:24px 0}h1{font-size:28px}textarea{position:fixed;bottom:20px;left:30%;width:40%;padding:15px;border:1px solid #ddd;border-radius:16px}</style></head><body><nav>ChatGPT <small> / AnnotateLLM · 离线测试页面</small></nav><main><h1>把思考留在对话里</h1><div class="turn" data-message-id="user-one" data-message-author-role="user"><div class="whitespace-pre-wrap">如何把阅读 AI 回答时产生的想法保存下来？</div></div><div class="turn" data-message-id="answer-one" data-message-author-role="assistant"><div class="markdown"><p>值得记住的，不只是答案，还有你自己的思考。</p><p>选择一段文字，给它添加高亮或备注。下次打开这段对话，继续上一次的思路。</p><p>重复短语 hello 与重复短语 hello 必须区分。</p><p><strong>清晰的记录</strong>可以跨越多个文字节点，保持原文的链接和复制行为。</p><pre><code>const note = "keep thinking";</code></pre></div></div></main><textarea placeholder="询问任何问题"></textarea></body></html>`;
await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fixture}));
try {
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:15000});const id=new URL(worker.url()).host;
  const manager=await context.newPage();manager.on('pageerror',e=>errors.push(e.message));await manager.goto(`chrome-extension://${id}/manager.html`);
  const rpc=m=>manager.evaluate(async m=>{const r=await chrome.runtime.sendMessage(m);if(!r.ok)throw Error(r.error);return r.data;},m);
  await rpc({type:'prefs',enabled:true});
  // Reset only this disposable test profile's extension storage.
  await manager.evaluate(async()=>{await chrome.storage.local.clear();await chrome.runtime.sendMessage({type:'prefs',enabled:true});});
  await assert.rejects(rpc({type:'snapshot'}),/尚无/);
  // Deterministically reproduce selecting immediately after the floating button
  // appears, before the first asynchronous library read has completed.
  await worker.evaluate(() => { const original = vault.readQueued.bind(vault); let first = true; vault.readQueued = async () => { if (first) { first = false; await new Promise(r => setTimeout(r, 650)); } return original(); }; });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const session=await context.newCDPSession(page);await session.send('DOM.enable');
  async function shadow(fn,arg){
    const tree=await session.send('DOM.getDocument',{depth:-1,pierce:true});
    const find=n=>{if(n.attributes?.includes('dialog-notes-root'))return n;for(const c of [...(n.children||[]),...(n.shadowRoots||[])]){const r=find(c);if(r)return r;}};
    const host=find(tree.root);assert.ok(host?.shadowRoots?.length,'extension shadow root exists');
    const {object}=await session.send('DOM.resolveNode',{backendNodeId:host.shadowRoots[0].backendNodeId});
    const result=await session.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:`function(arg){return (${fn.toString()})(this,arg);}`,arguments:[{value:arg}],returnByValue:true,awaitPromise:true});
    await session.send('Runtime.releaseObject',{objectId:object.objectId});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception.description);return result.result.value;
  }
  async function until(fn,message){const end=Date.now()+10000;let last;while(Date.now()<end){try{last=await fn();if(last)return;}catch(e){last=e.message;}await new Promise(r=>setTimeout(r,100));}throw Error(message+': '+JSON.stringify(last));}
  const clickText=async text=>shadow((r,text)=>{const b=[...r.querySelectorAll('button')].find(b=>b.textContent.trim()===text&&!b.closest('[hidden]'));if(!b)throw Error('Button missing: '+text);b.click();},text);
  async function fillRich(text,selector='.floating-editor .rich-text'){
    await shadow((r,selector)=>r.querySelector(selector).focus(),selector);await page.keyboard.press('Control+a');
    await shadow((r,{text,selector})=>{const data=new DataTransfer();data.setData('text/plain',text);r.querySelector(selector).dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},{text,selector});
  }
  await page.goto('https://chatgpt.com/c/test-conversation-a');await until(()=>shadow(r=>!r.querySelector('.fab').hidden),'enabled floating button');record('actual extension injects on ChatGPT host');
  await page.evaluate(()=>{const node=document.querySelector('.markdown p').firstChild;const range=document.createRange();range.setStart(node,0);range.setEnd(node,9);const s=getSelection();s.removeAllRanges();s.addRange(range);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:620,clientY:300}));});
  await until(()=>shadow(r=>!r.querySelector('.toolbar').hidden),'selection toolbar during delayed initial read');record('early selection survives delayed initial library load');await clickText('高亮');
  await until(async()=> (await rpc({type:'read',cid:'test-conversation-a'})).annotations.length===1,'highlight saved');record('selected text creates persistent highlight');
  await shadow(r=>r.querySelector('.fab').click());await until(()=>shadow(r=>!!r.querySelector('.record-actions button')),'panel records');
  await clickText('编辑');await fillRich('**关键想法**\n\n<script>alert(1)</script>\n[危险链接](javascript:alert)');await clickText('保存');
  await until(()=>shadow(r=>!!r.querySelector('.marker')),'note marker');await shadow(r=>r.querySelector('.marker').click());
  assert.equal(await shadow(r=>!r.querySelector('.card').hidden),true);assert.equal(await shadow(r=>r.querySelector('.card strong')?.textContent),'关键想法');assert.equal(await shadow(r=>r.querySelectorAll('.card script,.card a[href^="javascript:"]').length),0);
  await shadow(r=>r.querySelector('.marker').click());assert.equal(await shadow(r=>r.querySelector('.card').hidden),true);record('Markdown note renders safely; marker toggles pinned card');
  // Replace the security-test payload with a readable fictional note for public screenshots.
  await clickText('编辑');await fillRich('**关键想法**\n\n记录自己的理解，让每一次阅读都成为下一次思考的起点。');await clickText('保存');
  await clickText('对话笔记');await fillRich('# 我的独立笔记\n\n这份文档属于当前对话。','.sticky-note .rich-text');await clickText('保存');
  await until(async()=>(await rpc({type:'read',cid:'test-conversation-a'})).note.body.includes('独立笔记'),'conversation note');record('independent conversation note saves to library');
  const snapshot=await rpc({type:'snapshot'});const snapshotPreview=await rpc({type:'previewImport',text:snapshot});assert.ok(snapshotPreview.rows.some(r=>r.type==='note'&&r.status==='conflict'));record('previous snapshot is distinct from current document and remains importable');
  await page.reload();await until(()=>shadow(r=>!!r.querySelector('.marker')),'restored marker');record('page reload restores annotation and note marker');
  await shadow(r=>{r.querySelector('.fab').click();r.querySelector('.marker').click();});await page.screenshot({path:path.join(artifacts,'chatgpt-fixture.png'),fullPage:true});
  await page.evaluate(()=>{document.querySelector('.markdown p').textContent='回答重新生成后，原文字已发生变化。';});
  await until(()=>shadow(r=>r.querySelectorAll('.marker').length===0),'changed response must not get stale marker');record('changed message fingerprint fails closed');
  await page.goto('https://chatgpt.com/c/test-conversation-b');await until(()=>shadow(r=>!r.querySelector('.fab').hidden),'second conversation');assert.equal((await rpc({type:'read',cid:'test-conversation-b'})).annotations.length,0);record('different conversation never inherits highlights');
  // Same-document route changes must not rely on reloads or stale sender URLs.
  await page.evaluate(()=>history.pushState({},'', '/c/test-conversation-c'));await page.waitForTimeout(850);
  await page.evaluate(()=>{const node=document.querySelectorAll('.markdown p')[2].firstChild;const start=node.data.lastIndexOf('hello');const r=document.createRange();r.setStart(node,start);r.setEnd(node,start+5);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:620,clientY:440}));});
  await until(()=>shadow(r=>!r.querySelector('.toolbar').hidden),'repeated text selection');await clickText('高亮');
  await until(async()=>(await rpc({type:'read',cid:'test-conversation-c'})).annotations.length===1,'SPA saves to new conversation');
  const repeated=(await rpc({type:'read',cid:'test-conversation-c'})).annotations[0];assert.equal(repeated.anchor.exact,'hello');assert.ok(repeated.anchor.prefix.includes('hello'));record('SPA navigation and second occurrence anchoring');
  // Cross-node selection uses DOM boundaries without wrapping or changing text.
  await page.evaluate(()=>{getSelection().removeAllRanges();const p=document.querySelectorAll('.markdown p')[3],r=document.createRange();r.selectNodeContents(p);getSelection().addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:640,clientY:510}));});
  await until(()=>shadow(r=>!r.querySelector('.toolbar').hidden),'cross-node toolbar');await clickText('高亮');
  await until(async()=>(await rpc({type:'read',cid:'test-conversation-c'})).annotations.length===2,'cross-node highlight');record('selection spans DOM elements without changing original content');
  await page.evaluate(()=>{getSelection().removeAllRanges();document.querySelector('.turn[data-message-author-role=assistant]').setAttribute('data-is-streaming','true');const node=document.querySelector('.markdown p').firstChild,r=document.createRange();r.setStart(node,0);r.setEnd(node,5);getSelection().addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:620,clientY:350}));});
  await until(()=>shadow(r=>r.querySelector('.toast')?.textContent.includes('生成结束')),'streaming rejection');assert.equal((await rpc({type:'read',cid:'test-conversation-c'})).annotations.length,2);record('streaming answer rejects new annotations');
  await rpc({type:'prefs',enabled:false});await until(()=>shadow(r=>r.querySelector('.fab').hidden),'pause');await rpc({type:'prefs',enabled:true});await until(()=>shadow(r=>!r.querySelector('.fab').hidden),'resume');record('pause and resume remove and restore page UI');
  // Preserve the first conversation as the visual preview selection.
  await page.goto('https://chatgpt.com/c/test-conversation-a');await until(()=>shadow(r=>!!r.querySelector('.marker')),'screenshot restore');await shadow(r=>{r.querySelector('.fab').click();r.querySelector('.marker').click();});await page.screenshot({path:path.join(artifacts,'chatgpt-fixture.png'),fullPage:true});
  await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.setViewportSize({width:600,height:780});await page.waitForTimeout(250);await page.screenshot({path:path.join(artifacts,'chatgpt-dark-narrow.png')});
  assert.equal(await shadow(r=>[r.querySelector('.panel'),r.querySelector('.card')].filter(n=>!n.hidden).every(n=>{const b=n.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth+1;})),true);record('dark and narrow viewport keeps panel and card visible');
  // Use real browser mouse input: dispatching mouseup on document alone cannot
  // detect page handlers which stop bubbling before the extension receives it.
  await page.setViewportSize({width:1400,height:1000});
  await page.goto('https://chatgpt.com/c/selection-regressions');await until(()=>shadow(r=>!r.querySelector('.fab').hidden),'selection regression ready');
  await page.evaluate(()=>{
    document.querySelector('main').addEventListener('mouseup',e=>{
      e.stopImmediatePropagation();
      document.querySelector('#official-selection-menu')?.remove();
      if(getSelection().isCollapsed)return;
      const rect=getSelection().getRangeAt(0).getBoundingClientRect(),b=document.createElement('button');
      b.id='official-selection-menu';b.textContent='向 ChatGPT 提问';
      b.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top-35}px;height:30px`;
      document.body.append(b);
    });
  });
  async function dragText(selector,start,end){
    const points=await page.locator(selector).evaluate((p,{start,end})=>{
      const n=p.firstChild,r=document.createRange();r.setStart(n,start);r.setEnd(n,start+1);const a=r.getBoundingClientRect();r.setStart(n,end-1);r.setEnd(n,end);const b=r.getBoundingClientRect();
      return {x1:a.left+1,y1:(a.top+a.bottom)/2,x2:b.right-1,y2:(b.top+b.bottom)/2};
    },{start,end});
    await page.mouse.move(points.x1,points.y1);await page.mouse.down();await page.mouse.move(points.x2,points.y2,{steps:12});await page.mouse.up();
  }
  await dragText('.markdown p:first-child',0,9);
  await until(()=>shadow(r=>!r.querySelector('.toolbar').hidden),'native selection despite stopped mouseup');
  assert.ok(await page.locator('#official-selection-menu').isVisible());
  const official=await page.locator('#official-selection-menu').boundingBox();
  const tool=await shadow(r=>{const b=r.querySelector('.toolbar').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};});
  assert.ok(tool.y>=official.y+official.height||tool.y+tool.height<=official.y||tool.x>=official.x+official.width||tool.x+tool.width<=official.x,'menus do not overlap');
  await page.screenshot({path:path.join(artifacts,'selection-toolbar-regression.png')});
  const highlightButton=await shadow(r=>{const b=r.querySelector('.toolbar button').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});
  await page.mouse.click(highlightButton.x,highlightButton.y);
  await until(async()=>(await rpc({type:'read',cid:'selection-regressions'})).annotations.length===1,'native click saves highlight');
  record('native mouse selection survives stopped bubbling; official menu coexists and toolbar is clickable');
  const addRichBody=()=>{
    const m=document.querySelector('[data-message-author-role=assistant]');
    const widget=document.createElement('div');widget.textContent='卡片区域';m.append(widget);
    const second=document.createElement('div');second.className='markdown';second.innerHTML='<p id="second-body">这里是卡片之后的第二个正文块，可继续添加批注。</p>';m.append(second);
  };
  await page.evaluate(addRichBody);
  await dragText('#second-body',0,8);await until(()=>shadow(r=>!r.querySelector('.toolbar').hidden),'second body selection');await clickText('高亮');
  await until(async()=>(await rpc({type:'read',cid:'selection-regressions'})).annotations.length===2,'second body saved');
  assert.equal((await rpc({type:'read',cid:'selection-regressions'})).annotations[1].anchor.exact,'这里是卡片之后的');
  record('selection in later Markdown block is captured');
  await page.evaluate(()=>{const n=document.querySelector('#second-body').firstChild,r=document.createRange();r.setStart(n,9);r.setEnd(n,15);getSelection().removeAllRanges();getSelection().addRange(r);});
  await until(()=>shadow(r=>!r.querySelector('.toolbar').hidden),'selectionchange fallback');
  await page.keyboard.press('Escape');assert.equal(await shadow(r=>r.querySelector('.toolbar').hidden),true);
  await page.waitForTimeout(250);assert.equal(await shadow(r=>r.querySelector('.toolbar').hidden),true);
  record('selectionchange fallback opens menu and Escape dismisses it');
  await page.evaluate(()=>{const n=document.querySelector('#second-body').firstChild,r=document.createRange();r.setStart(n,15);r.setEnd(n,19);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));getSelection().removeAllRanges();});
  await page.waitForTimeout(250);assert.equal(await shadow(r=>r.querySelector('.toolbar').hidden),true);record('cleared selection cannot reopen a stale async toolbar');
  await page.reload();await page.evaluate(addRichBody);await until(()=>shadow(r=>!r.querySelector('.fab').hidden),'rich body reload ready');
  await until(async()=>{
    const worlds=await session.send('Page.createIsolatedWorld',{frameId:(await session.send('Page.getFrameTree')).frameTree.frame.id,worldName:'annotation-check'});
    const r=await session.send('Runtime.evaluate',{contextId:worlds.executionContextId,expression:'[...CSS.highlights.get("dn-yellow") || []].some(r => r.toString() === "这里是卡片之后的")',returnByValue:true});
    return r.result.value;
  },'later body highlight restored after reload');record('later Markdown block highlight restores after reload');
  await page.evaluate(()=>{const p=document.createElement('p');p.id='unknown-body';p.textContent='未识别的消息容器';document.querySelector('main').append(p);const r=document.createRange();r.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(r);});
  await until(()=>shadow(r=>[...r.querySelectorAll('.toast')].some(n=>n.textContent.includes('无法识别'))),'unsupported structure has visible feedback');record('unknown message structure reports a readable error instead of silently failing');
  await clickText('查看诊断');
  const diagnostic=await shadow(r=>r.querySelector('.diagnostic-backdrop textarea').value);
  assert.ok(diagnostic.includes('startAncestors'));for(const secret of ['未识别的消息容器','selection-regressions','answer-one','理解与记录'])assert.ok(!diagnostic.includes(secret));
  const diagnosticDownload=page.waitForEvent('download');await clickText('下载诊断 Markdown');const downloaded=await diagnosticDownload;assert.equal(downloaded.suggestedFilename(),'AnnotateLLM-页面诊断.md');await downloaded.saveAs(path.join(artifacts,'page-diagnostic.md'));await clickText('关闭');record('diagnostic exports only structural fields without chat text, title, URL or message IDs');
  // Structural markers reported in oracle#517 (2026-09-25), not copied chat content.
  // The rollout removes all legacy role/message/Markdown markers.
  const installNewLayout=()=>{
    document.querySelector('main').innerHTML='<section data-turn-key="turn-example"><div data-content-search-unit-key="turn-example:0:user"><div data-user-message-bubble="true"><p id="new-user">请介绍如何做好阅读记录。</p></div></div><div data-content-search-unit-key="turn-example:2:assistant" style="display:contents"><div data-conversation-role="assistant"><p id="new-answer">新界面也应该可以保存文字批注。</p><p>正文段落和布局与旧版不同。</p></div></div></section>';
  };
  await page.goto('https://chatgpt.com/c/new-layout-regression');await page.evaluate(installNewLayout);
  await until(()=>shadow(r=>!r.querySelector('.fab').hidden),'new layout ready');
  await dragText('#new-answer',0,5);await until(()=>shadow(r=>!r.querySelector('.toolbar').hidden),'reported new-layout assistant selection');await clickText('高亮');
  await until(async()=>(await rpc({type:'read',cid:'new-layout-regression'})).annotations.length===1,'new layout assistant saved');
  const newAssistant=(await rpc({type:'read',cid:'new-layout-regression'})).annotations[0];assert.equal(newAssistant.anchor.role,'assistant');assert.equal(newAssistant.anchor.messageId,'unit:turn-example:2:assistant');record('reported ChatGPT new layout supports assistant selection with display contents');
  await dragText('#new-user',0,4);await until(()=>shadow(r=>!r.querySelector('.toolbar').hidden),'new layout user selection');await clickText('高亮');
  await until(async()=>(await rpc({type:'read',cid:'new-layout-regression'})).annotations.length===2,'new layout user saved');assert.equal((await rpc({type:'read',cid:'new-layout-regression'})).annotations[1].anchor.role,'user');record('new layout keeps user and assistant identities separate');
  await page.reload();await page.evaluate(installNewLayout);await until(()=>shadow(r=>!r.querySelector('.fab').hidden),'new layout reload');await shadow(r=>r.querySelector('.fab').click());
  await until(()=>shadow(()=>CSS.highlights.get('dn-yellow')?.size===2),'new layout annotations restored');record('new layout annotations restore after full page reload');
  await page.evaluate(()=>document.querySelector('[data-content-search-unit-key$=":assistant"]').setAttribute('data-content-search-unit-key','turn-example:3:assistant'));
  await until(()=>shadow(()=>CSS.highlights.get('dn-yellow')?.size===1&&[...CSS.highlights.get('dn-yellow')][0].toString()==='请介绍如'),'changed unit identity not reused');record('changed new-layout identity does not attach old annotation');
  await page.evaluate(()=>{const r=document.createRange();r.setStart(document.querySelector('#new-user').firstChild,0);r.setEnd(document.querySelector('#new-answer').firstChild,3);getSelection().removeAllRanges();getSelection().addRange(r);});
  await until(()=>shadow(r=>[...r.querySelectorAll('.toast')].some(n=>n.textContent.includes('同一条消息'))),'new layout cross-message rejection');assert.equal(await shadow(r=>r.querySelector('.toolbar').hidden),true);record('new-layout cross-role selection is rejected');
  await page.evaluate(()=>{getSelection().removeAllRanges();const unit=document.querySelector('[data-content-search-unit-key$=":assistant"]');const dup=unit.cloneNode(true);dup.querySelector('#new-answer').removeAttribute('id');unit.parentElement.append(dup);});
  await dragText('#new-answer',0,5);await until(()=>shadow(r=>[...r.querySelectorAll('.toast')].some(n=>n.textContent.includes('标识重复'))),'new duplicate identity refusal');record('duplicate new-layout identities fail closed');
  await runInteractionChecks({page,shadow,until,clickText,fillRich,dragText,rpc,context,id,record,artifacts});
  await runFollowupChecks({page,shadow,until,clickText,fillRich,dragText,rpc,context,record});
  await runLanguageChecks({page,shadow,until,clickText,fillRich,rpc,manager,context,id,record,artifacts});
  await page.goto('https://chatgpt.com/c/test-conversation-a');await until(()=>shadow(r=>!!r.querySelector('.marker')),'restore before export');
  const exported=await rpc({type:'export'});await fs.writeFile(path.join(artifacts,'roundtrip.md'),exported);const preview=await rpc({type:'previewImport',text:exported});assert.ok(preview.rows.every(r=>r.status==='same'));record('export and import preview are idempotent');
  await manager.reload();await manager.getByRole('heading',{name:'文字批注 · 1'}).waitFor();await manager.screenshot({path:path.join(artifacts,'library.png'),fullPage:true});
  await manager.locator('input[type=file]').setInputFiles(path.join(artifacts,'roundtrip.md'));await manager.getByRole('heading',{name:'导入预览'}).waitFor();await manager.getByRole('button',{name:'确认合并导入'}).click();await manager.getByRole('heading',{name:'导入预览'}).waitFor({state:'detached'});record('manager imports Markdown through preview UI');
  const before=await rpc({type:'read',cid:'test-conversation-a'});
  const results=await Promise.allSettled([rpc({type:'saveNote',cid:before.id,body:'并发保存 A',expectedRevision:before.note.revision}),rpc({type:'saveNote',cid:before.id,body:'并发保存 B',expectedRevision:before.note.revision})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);record('actual background rejects stale concurrent edits');
  await assert.rejects(rpc({type:'previewImport',text:exported.replace(/<!-- dn:endlibrary -->/,'')}));assert.equal((await rpc({type:'read',cid:before.id})).note.revision,before.note.revision+1);record('malformed import leaves existing browser data unchanged');
  // Restart the service worker without unloading the extension or losing disk state.
  const browserSession=await context.browser().newBrowserCDPSession();const targets=await browserSession.send('Target.getTargets');const sw=targets.targetInfos.find(t=>t.type==='service_worker'&&t.url.includes(id));
  if(sw){await browserSession.send('Target.closeTarget',{targetId:sw.targetId});await page.waitForTimeout(300);assert.equal((await rpc({type:'read',cid:before.id})).annotations.length,1);record('service worker restart reads persisted Markdown');}
  assert.deepEqual(errors,[]);record('no page JavaScript errors');
  const persisted=await rpc({type:'read'});await context.close();context=await launch();
  const restarted=await context.newPage();await restarted.goto(`chrome-extension://${id}/manager.html`);
  const restored=await restarted.evaluate(async()=>{const r=await chrome.runtime.sendMessage({type:'read'});if(!r.ok)throw Error(r.error);return r.data;});
  assert.deepEqual(restored,persisted);record('full browser restart preserves all conversation notes and annotations');
  await fs.writeFile(path.join(artifacts,'browser-test.json'),JSON.stringify({passed:true,browser:await context.browser()?.version()||'Edge persistent context',checks,errors},null,2));
} catch(error) {
  await fs.writeFile(path.join(artifacts,'browser-test.json'),JSON.stringify({passed:false,checks,errors,failure:error.stack},null,2));
  throw error;
} finally {await context.close();}
