import assert from 'node:assert/strict';

export async function runFollowupChecks({page,shadow,until,clickText,fillRich,dragText,rpc,context,record}) {
  const cid='keyboard-v021';
  await page.goto('https://chatgpt.com/c/'+cid);
  await until(()=>shadow(r=>!r.querySelector('.fab').hidden),'keyboard fixture ready');
  // Model a page-wide shortcut which sees the retargeted shadow host as non-editable.
  // Capture on window deliberately runs before all editor/document bubble handlers.
  await page.evaluate(()=>{
    globalThis.shortcutCalls=0;
    window.addEventListener('keydown',e=>{
      if(e.key==='/'&&!e.target.isContentEditable&&!e.target.matches('input,textarea')){
        globalThis.shortcutCalls++;document.querySelector('textarea').focus();e.preventDefault();
      }
    },true);
  });
  await dragText('.markdown p:first-child',0,9);await until(()=>shadow(r=>!r.querySelector('.toolbar').hidden),'annotation selection');await clickText('备注');
  async function checkInput(selector){
    await shadow((r,s)=>r.querySelector(s).focus(),selector);
    const text='alpha / beta @ # _ [] () : ;';await page.keyboard.type(text);
    assert.equal(await page.locator('textarea').inputValue(),'','symbols never enter page composer');
    assert.equal(await shadow((r,s)=>r.querySelector(s).textContent,selector),text);
    assert.equal(await shadow((r,s)=>r.activeElement===r.querySelector(s),selector),true,'editor keeps focus');
    await page.keyboard.press('Control+a');await page.keyboard.press('Control+b');
    assert.equal(await shadow((r,s)=>!!r.querySelector(s+' strong'),selector),true,'format shortcut works');
    await page.keyboard.press('ArrowRight');
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.imeSetComposition',{text:'中文符号，。',selectionStart:6,selectionEnd:6});
    await cdp.send('Input.insertText',{text:'中文符号，。'});await cdp.detach();
    assert.ok(await shadow((r,s)=>r.querySelector(s).textContent.includes('中文符号，。'),selector),'IME composition stays in editor');
    assert.equal(await page.locator('textarea').inputValue(),'');
  }
  await checkInput('.floating-editor .rich-text');await page.keyboard.press('Control+s');
  await until(async()=>(await rpc({type:'read',cid})).annotations[0]?.note.includes('中文符号'),'annotation keyboard save');
  await shadow(r=>r.querySelector('.fab').click());await clickText('对话笔记');await checkInput('.sticky-note .rich-text');
  await page.keyboard.press('Control+s');await until(()=>shadow(r=>r.querySelector('.sticky-note [role=status]').textContent==='已保存'),'sticky keyboard save');
  assert.equal(await page.evaluate(()=>globalThis.shortcutCalls),0);
  // The website shortcut must still work when focus is outside the extension.
  await page.locator('h1').click();await page.keyboard.type('/');assert.equal(await page.evaluate(()=>globalThis.shortcutCalls),1);
  assert.equal(await page.locator('textarea').evaluate(n=>document.activeElement===n),true);
  record('annotation and sticky editors isolate symbol shortcuts, preserve IME/format/save, and leave website shortcuts working');
  assert.equal(await shadow(r=>r.querySelector('.panel').textContent.includes('已关联')||r.querySelector('.panel').textContent.includes('模型回答')),false);
  assert.equal(await shadow(r=>[...r.querySelectorAll('.panel button')].some(b=>b.textContent==='关联')),false);
  record('annotation list omits role/association labels and associate action');
  await fillRich('最小化前的最新笔记','.sticky-note .rich-text');
  await shadow(r=>r.querySelector('.sticky-note [aria-label="最小化"]').click());
  await until(()=>shadow(r=>!r.querySelector('.sticky-note')),'note minimized');
  await until(async()=>(await rpc({type:'read',cid})).note.body.includes('最新笔记'),'minimize saves latest note');
  await page.reload();await until(()=>shadow(r=>!r.querySelector('.fab').hidden),'reload after minimize');
  assert.equal(await shadow(r=>!!r.querySelector('.sticky-note')),false,'minimized note stays closed on reload');
  await shadow(r=>r.querySelector('.fab').click());await clickText('对话笔记');
  await until(()=>shadow(r=>r.querySelector('.sticky-note .rich-text')?.textContent.includes('最新笔记')),'reopen note');
  record('sticky minimize saves, closes presentation, stays minimized on reload and reopens with content');
}
