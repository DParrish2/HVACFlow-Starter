(() => {
  let profileJobId = null;

  function configureJobModule(){
    if(typeof modules==='undefined' || !modules?.Jobs) return;
    const fields=modules.Jobs.fields;
    if(!fields.some(f=>f[0]==='additional_contractors')){
      const notesIndex=fields.findIndex(f=>f[0]==='notes');
      const field=['additional_contractors','Additional contractors used (optional)','textarea',1];
      if(notesIndex>=0) fields.splice(notesIndex,0,field); else fields.push(field);
    }
  }

  function makeNotesOptional(root=document){
    root.querySelectorAll('textarea[name="notes"]').forEach(el=>{
      el.required=false;
      el.removeAttribute('required');
      if(!el.placeholder) el.placeholder='Optional notes';
    });
    root.querySelectorAll('textarea[name="additional_contractors"]').forEach(el=>{
      el.required=false;
      el.removeAttribute('required');
      if(!el.placeholder) el.placeholder='Optional — contractor or subcontractor names, company, trade, or contact details';
    });
  }

  async function addProfileContractorField(){
    const form=document.getElementById('customerRecordForm');
    const grid=form?.querySelector('.record-edit-grid');
    if(!form||!grid||grid.querySelector('[name="additional_contractors"]')) return;
    const panel=document.getElementById('customerRecordPanel');
    if(!/\bJob\b/i.test(panel?.querySelector('h3')?.textContent||'')) return;

    const label=document.createElement('label');
    label.className='full';
    label.innerHTML='<span>Additional contractors used (optional)</span><textarea name="additional_contractors" placeholder="Optional — contractor or subcontractor names, company, trade, or contact details"></textarea>';
    const notes=grid.querySelector('textarea[name="notes"]')?.closest('label');
    if(notes) grid.insertBefore(label,notes); else grid.appendChild(label);

    if(profileJobId){
      const {data}=await sb.from('Jobs').select('additional_contractors').eq('id',profileJobId).maybeSingle();
      const input=label.querySelector('textarea');
      if(input && data?.additional_contractors) input.value=data.additional_contractors;
    }
  }

  document.addEventListener('click',e=>{
    const edit=e.target.closest('.profile-edit-record[data-table="Jobs"]');
    if(edit) profileJobId=edit.dataset.id||null;
    const add=e.target.closest('.profile-add-record[data-table="Jobs"]');
    if(add) profileJobId=null;
  },true);

  configureJobModule();
  makeNotesOptional();
  const observer=new MutationObserver(()=>{
    configureJobModule();
    makeNotesOptional();
    addProfileContractorField().then(()=>makeNotesOptional()).catch(()=>{});
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();
