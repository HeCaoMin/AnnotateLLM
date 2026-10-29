const {h, button, api} = DNUI;
const app = document.getElementById('app');
async function render() {
  await DNI18N.ready;
  const state = await api({type: 'status'});
  const error = h('p', {class: 'error', role: 'status'});
  const toggle = button(state.enabled ? '暂停批注功能' : '同意并启用本地批注', async () => {
    try { await api({type: 'prefs', enabled: !state.enabled}); await render(); } catch(e) { error.textContent = e.message; }
  }, {class: state.enabled ? '' : 'primary'});
  app.replaceChildren(h('div', {class: 'eyebrow'}, `AnnotateLLM / ${chrome.runtime.getManifest().version}`), h('h1', {}, '让好想法留下来。'), h('p', {class: 'intro'}, 'ChatGPT 对话高亮、文字备注与 Markdown 笔记。'), h('p', {class: 'muted'}, '启用后，仅在 chatgpt.com 对话中读取用于批注的文字。摘录、备注、定位信息和笔记保存在此浏览器，不上传、不自动同步。卸载会清除本地数据，请导出备份。'), h('div', {class: 'stack'}, toggle, button('打开笔记库 / 导入导出', () => chrome.runtime.openOptionsPage())), h('a', {href: 'privacy.html', target: '_blank'}, '隐私说明'), error);
  const menu=h('div',{class:'language-menu',hidden:'',role:'menu','aria-label':'language'});
  for(const [code,label] of [['zh','中文'],['en','English'],['ko','한국어']])menu.append(button(label,async()=>{
    try{await api({type:'prefs',language:code});DNI18N.set(code);menu.hidden=true;globe.setAttribute('aria-expanded','false');for(const b of menu.children)b.setAttribute('aria-checked',String(b.dataset.language===code));globe.focus();}catch(e){error.textContent=e.message;}
  },{role:'menuitemradio','aria-checked':String(DNI18N.language===code),'data-language':code}));
  const globe=button('',()=>{menu.hidden=!menu.hidden;globe.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('[aria-checked=true]').focus();},{class:'language-button',title:'language','aria-label':'language','aria-haspopup':'menu','aria-expanded':'false'});
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  for(const d of ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','M3 12h18','M12 3c5 5 5 13 0 18-5-5-5-13 0-18']){const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);svg.append(p);}globe.append(svg);
  const control=h('div',{class:'language-control'},globe,menu);app.prepend(control);
  control.addEventListener('keydown',e=>{const items=[...menu.children],i=items.indexOf(document.activeElement);if(e.key==='Escape'){menu.hidden=true;globe.setAttribute('aria-expanded','false');globe.focus();}if(!menu.hidden&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowDown'?1:2))%3].focus();}});
}
document.addEventListener('click',e=>{if(!e.target.closest('.language-control')){const menu=document.querySelector('.language-menu');if(menu)menu.hidden=true;document.querySelector('.language-button')?.setAttribute('aria-expanded','false');}});
addEventListener('dn-language',()=>{for(const b of document.querySelectorAll('[data-language]'))b.setAttribute('aria-checked',String(b.dataset.language===DNI18N.language));});
render().catch(e => { app.textContent = e.message; });
