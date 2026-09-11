(() => {
  function cleanPhone(value){
    const raw=String(value||'').trim();
    if(!raw||raw==='—') return null;
    const hasPlus=raw.startsWith('+');
    const digits=raw.replace(/\D/g,'');
    if(digits.length<7) return null;
    return (hasPlus?'+':'')+digits;
  }

  function makeDialable(el){
    if(!el||el.querySelector('a[href^="tel:"]')) return;
    const phone=cleanPhone(el.textContent);
    if(!phone) return;
    const label=el.textContent.trim();
    const a=document.createElement('a');
    a.href=`tel:${phone}`;
    a.textContent=label;
    a.style.color='#0d47a1';
    a.style.fontWeight='700';
    a.style.textDecoration='underline';
    a.style.textUnderlineOffset='2px';
    a.title=`Call ${label}`;
    a.setAttribute('aria-label',`Call ${label}`);
    el.textContent='';
    el.appendChild(a);
  }

  function decorateTables(){
    document.querySelectorAll('table').forEach(table=>{
      const headers=[...table.querySelectorAll('thead th')];
      const indexes=headers.map((th,i)=>/\bphone\b/i.test(th.textContent)?i:-1).filter(i=>i>=0);
      if(!indexes.length) return;
      table.querySelectorAll('tbody tr').forEach(row=>{
        const cells=row.querySelectorAll('td');
        indexes.forEach(i=>makeDialable(cells[i]));
      });
    });
  }

  function decorateProfile(){
    document.querySelectorAll('.profile-list').forEach(list=>{
      const children=[...list.children];
      for(let i=0;i<children.length-1;i++){
        const label=children[i];
        if(label.tagName==='STRONG'&&/^phone$/i.test(label.textContent.trim())) makeDialable(children[i+1]);
      }
    });
  }

  function decorateAll(){decorateTables();decorateProfile();}
  const observer=new MutationObserver(()=>setTimeout(decorateAll,25));
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('a[href^="tel:"]'))e.stopPropagation();},true);
  setTimeout(decorateAll,100);
})();
