(() => {
  const rows = globalThis.DNTranslations, valid = ['zh','en','ko'];
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns = rows.filter(r=>r[0].includes('{0}')).sort((a,b)=>b[0].length-a[0].length).map(r=>({row:r,regex:new RegExp('^'+r[0].split(/\{\d+\}/).map(escape).join('([\\s\\S]*?)')+'$')}));
  const exact = new Map(rows.map(r=>[r[0],r]));
  let language='zh';
  function t(source,lang=language){
    if(typeof source!=='string'||lang==='zh')return source;
    const index=lang==='ko'?2:1, row=exact.get(source);
    if(row)return row[index];
    // Error wrappers contain system messages, not user prose.
    if(source.startsWith('保存失败：'))return (lang==='ko'?'저장 실패: ':'Save failed: ')+t(source.slice(5),lang);
    for(const {row,regex} of patterns){const m=source.match(regex);if(m)return row[index].replace(/\{(\d+)\}/g,(_,n)=>m[+n+1]);}
    return source;
  }
  const roots=new Set(), history=new WeakMap();
  // Only extension-owned UI roots are registered. Explicitly exclude all user
  // content, including a draft consisting solely of a UI word such as "保存".
  const skip='[data-user-content],.md,.rich-text,.editor-quote,.excerpt,pre,textarea,script,style,[contenteditable]';
  function updateValue(node,key,current,write){
    let values=history.get(node);if(!values){values={};history.set(node,values);}
    const old=values[key],source=old&&old.result===current?old.source:current,result=t(source);
    values[key]={source,result};if(result!==current)write(result);
  }
  function apply(root){
    const visit=node=>{
      if(node.nodeType===3){if(!node.parentElement?.closest(skip))updateValue(node,'text',node.nodeValue,v=>node.nodeValue=v);return;}
      if(node.nodeType===1){for(const key of ['title','aria-label','placeholder'])if(node.hasAttribute(key))updateValue(node,key,node.getAttribute(key),v=>node.setAttribute(key,v));if(node.matches(skip))return;}
      for(const child of node.childNodes)visit(child);
    };
    visit(root);
    if(root.host)root.host.lang=language==='zh'?'zh-CN':language;
    else if(location.protocol==='chrome-extension:')document.documentElement.lang=language==='zh'?'zh-CN':language;
  }
  function set(lang){const next=valid.includes(lang)?lang:'zh';if(language!==next){language=next;for(const root of roots)apply(root);dispatchEvent(new CustomEvent('dn-language'));}}
  function observe(root){
    roots.add(root);apply(root);
    const observer=new MutationObserver(()=>{observer.disconnect();apply(root);watch();});
    const watch=()=>observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});watch();
    return ()=>{observer.disconnect();roots.delete(root);};
  }
  async function sync(){try{const r=await chrome.runtime.sendMessage({type:'status'});if(r?.ok)set(r.data.language);}catch{}}
  globalThis.DNI18N={t,set,observe,get language(){return language;}};
  if(typeof document!=='undefined'){
    DNI18N.ready=sync();
    const connect=()=>{try{const port=chrome.runtime.connect({name:'language'});port.onMessage.addListener(sync);port.onDisconnect.addListener(()=>setTimeout(connect,1500));sync();}catch{}};connect();
    if(location.protocol==='chrome-extension:')observe(document.documentElement);
  }
})();
