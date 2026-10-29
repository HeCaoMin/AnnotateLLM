(() => {
  const U=DNUI,{h,button}=U;
  const paths={
    chevron:['m6 9 6 6 6-6'],pen:['m16 3 5 5-12 12-6 1 1-6Z','m14 5 5 5'],
    pin:['M8 3h8l-1 7 4 4v2H5v-2l4-4Z','M12 16v6'],
    bold:['M7 4h6a4 4 0 0 1 0 8H7V4Z','M7 12h7a4 4 0 0 1 0 8H7v-8Z'],
    italic:['M10 4h9M5 20h9M15 4 9 20'],heading:['M5 4v16M15 4v16M5 12h10','M19 16v4'],
    list:['M9 6h12M9 12h12M9 18h12','M3 6h1M3 12h1M3 18h1'],
    quote:['M4 6h6v7H4V6Zm0 7c0 4 2 5 5 5','M14 6h6v7h-6V6Zm0 7c0 4 2 5 5 5'],
    code:['m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18'],
    link:['m10 13 4-4','m9 15-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0','m15 9 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'],
    close:['m6 6 12 12M18 6 6 18'],check:['m5 12 4 4L19 6']
  };
  function icon(name){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [k,v] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',class:'icon'}))svg.setAttribute(k,v);
    for(const d of paths[name]||paths.pen){const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);svg.append(p);}return svg;
  }
  const iconButton=(name,label,click,attrs={})=>{const b=button('',click,{'aria-label':label,title:label,...attrs});b.append(icon(name));return b;};
  function place(node,x,y){
    node.style.right='auto';node.style.bottom='auto';
    node.style.left=Math.max(8,Math.min(innerWidth-node.offsetWidth-8,x))+'px';
    node.style.top=Math.max(8,Math.min(innerHeight-node.offsetHeight-8,y))+'px';
  }
  function draggable(node,handle,onEnd){
    let start=null,moved=false;handle.classList.add('drag-handle');
    const down=e=>{if(e.button!==0||e.target.closest('button,input,select,a'))return;const r=node.getBoundingClientRect();start={x:e.clientX,y:e.clientY,left:r.left,top:r.top};moved=false;handle.setPointerCapture(e.pointerId);e.preventDefault();};
    const move=e=>{if(!start)return;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>3)moved=true;if(moved)place(node,start.left+e.clientX-start.x,start.top+e.clientY-start.y);};
    const up=()=>{if(start&&moved)onEnd?.(node.getBoundingClientRect());start=null;};
    handle.addEventListener('pointerdown',down);handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);
    return ()=>{handle.removeEventListener('pointerdown',down);handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);};
  }
  function editor(root,options){
    const {title,quote,body='',save,close,color,annotation=false,persistent=false}=options;
    let dirty=!!options.unsaved,currentColor=color,busy=false,epoch=0,timer,dead=false,task=null;
    const modal=h('section',{class:'floating-editor '+(persistent?'sticky-note':''),role:'dialog','aria-label':title});
    const status=h('span',{class:'muted',role:'status'},persistent?'自动保存':'Markdown');
    const head=h('header',{class:'editor-head row spread'},h('h2',{},title));
    const tools=h('div',{class:'format-bar'}),mount=h('div',{class:'rich-editor'});
    const labels={bold:'粗体',italic:'斜体',heading:'标题',list:'列表',quote:'引用',code:'代码',link:'链接'};
    const changed=()=>{dirty=true;epoch++;status.textContent='未保存';clearTimeout(timer);if(persistent)timer=setTimeout(()=>submit(),600);};
    const rich=DNRichEditor.create(mount,{value:body,onChange:changed,onState:()=>{for(const b of tools.querySelectorAll('[data-format]'))b.setAttribute('aria-pressed',String(rich.active(b.dataset.format)));}});
    for(const [name,label] of Object.entries(labels)){
      const b=iconButton(name,label,()=>{
        if(name==='link'){
          if(modal.querySelector('.link-entry'))return;
          const url=h('input',{type:'url',placeholder:'https://','aria-label':'链接地址'});
          const entry=h('div',{class:'link-entry row'},url,button('插入',()=>{if(!/^(https?:|mailto:)/i.test(url.value)){status.textContent='请输入有效链接';return;}rich.command('link',url.value);entry.remove();}),button('取消',()=>{entry.remove();rich.focus();}));tools.after(entry);url.focus();
        }else rich.command(name);
      },{'data-format':name,'aria-pressed':'false'});
      b.addEventListener('mousedown',e=>e.preventDefault());tools.append(b);
    }
    const swatches=h('div',{class:'swatches'});
    function setColor(c){currentColor=c;changed();for(const b of swatches.children)b.setAttribute('aria-pressed',String(b.dataset.color===(c||'none')));}
    if(annotation){for(const c of DN.colors)swatches.append(button('',()=>setColor(c),{class:`swatch ${c}`,'aria-label':DN.colorNames[c],'data-color':c,'aria-pressed':String(color===c)}));swatches.append(button('无高亮',()=>setColor(null),{'data-color':'none','aria-pressed':String(!color)}));}
    async function submit(){
      clearTimeout(timer);if(dead)return;if(busy)return task;if(persistent&&!dirty)return;
      const version=epoch,text=rich.get(),chosen=currentColor;
      if(text.length>100000){status.textContent='内容不能超过 100,000 字符';return;}
      busy=true;status.textContent='保存中…';let succeeded=false;
      task=(async()=>{try{await save(text,chosen);succeeded=true;if(epoch===version)dirty=false;if(!dead){status.textContent=dirty?'未保存':'已保存';status.className='muted';}if(!persistent&&epoch===version&&!dead){dispose();close?.();}}catch(e){if(!dead){status.textContent='保存失败：'+e.message;status.className='error';}}finally{busy=false;if(persistent&&succeeded&&dirty&&!dead)timer=setTimeout(()=>submit(),100);}})();return task;
    }
    function dispose(){dead=true;clearTimeout(timer);unDrag();resize.disconnect();rich.destroy();modal.remove();}
    const cancel=()=>{if(busy||(dirty&&!confirm(DNI18N.t('当前修改尚未保存，确定放弃吗？'))))return;dispose();close?.();};
    if(!persistent)head.append(iconButton('close','关闭编辑器',cancel));
    else head.append(button('−',async()=>{try{await flush();if(dead)return;dispose();options.minimize?.();}catch{/* Keep the draft and visible save error. */}},{class:'minimize-button','aria-label':'最小化',title:'最小化对话笔记'}));
    modal.append(head);
    if(persistent)modal.append(h('p',{class:'sticky-caption'},'这份笔记仅属于当前对话 · Markdown'));
    if(quote)modal.append(h('blockquote',{class:'editor-quote'},quote));
    if(annotation)modal.append(swatches);
    modal.append(tools,mount,h('footer',{class:'editor-footer row spread'},status,button('保存',submit,{class:'primary'})));
    modal.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();submit();}if(e.key==='Escape'){e.stopPropagation();if(!persistent)cancel();}});
    mount.addEventListener('focusout',()=>{if(persistent&&dirty)submit();});
    root.append(modal);place(modal,options.x??(innerWidth-480)/2,options.y??Math.max(36,(innerHeight-440)/2));
    const unDrag=draggable(modal,head);
    const resize=new ResizeObserver(()=>{const r=modal.getBoundingClientRect();place(modal,r.left,r.top);});resize.observe(modal);
    queueMicrotask(()=>rich.focus());
    async function flush(){await submit();if(dirty)throw new Error('笔记尚未保存，请查看便利贴中的保存状态后重试。');}
    return {element:modal,dirty:()=>dirty,busy:()=>busy,snapshot:()=>({body:rich.get(),color:currentColor}),remove:dispose,flush,focus:()=>rich.focus(),setBody:value=>{if(!dirty&&!busy)rich.set(value);}};
  }
  Object.assign(U,{icon,iconButton,place,draggable,editor});
})();
