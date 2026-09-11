(() => {
  let activeCustomerId=null;
  let rendering=false;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labelType=v=>({call:'Phone call',text:'Text message',email:'Email',in_person:'In person',other:'Other'}[v]||v||'Other');
  const localInput=v=>{const d=v?new Date(v):new Date();if(isNaN(d))return '';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};

  function ensureStyles(){
    if(document.getElementById('contactHistoryStyles'))return;
    const s=document.createElement('style');s.id='contactHistoryStyles';s.textContent=`
      .contact-history-card{margin-top:18px}.contact-history-list{display:flex;flex-direction:column;gap:10px}.contact-history-item{border:1px solid #e3e8ef;border-radius:10px;padding:12px;background:#fff}.contact-history-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.contact-history-type{font-weight:700;color:#0d47a1}.contact-history-notes{margin-top:7px;white-space:pre-wrap}.contact-history-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.contact-history-form label{display:flex;flex-direction:column;gap:5px}.contact-history-form .full{grid-column:1/-1}@media(max-width:650px){.contact-history-form{grid-template-columns:1fr}.contact-history-form .full{grid-column:auto}}
    `;document.head.appendChild(s);
  }

  function captureCustomerIdFromRow(target){
    const cell=target.closest('#bodyCustomers tr td:first-child');if(!cell)return;
    const row=cell.closest('tr');const del=row?.querySelector('.del');if(del?.dataset.id)activeCustomerId=del.dataset.id;
  }

  document.addEventListener('click',e=>{
    captureCustomerIdFromRow(e.target);
    const linked=e.target.closest('[data-customer-profile-id]');if(linked?.dataset.customerProfileId)activeCustomerId=linked.dataset.customerProfileId;
  },true);

  async function loadContacts(){
    if(!activeCustomerId)return [];
    const {data,error}=await sb.from('CustomerContacts').select('*').eq('customer_id',activeCustomerId).order('contacted_at',{ascending:false});
    if(error)throw error;return data||[];
  }

  async function renderHistory(){
    const page=document.getElementById('customerProfile');
    if(!page||!page.classList.contains('active')||!activeCustomerId||rendering)return;
    const existing=document.getElementById('customerContactHistory');if(existing&&existing.dataset.customerId===String(activeCustomerId))return;
    rendering=true;
    try{
      ensureStyles();
      existing?.remove();
      const contacts=await loadContacts();
      const wrap=document.createElement('div');
      wrap.id='customerContactHistory';wrap.dataset.customerId=String(activeCustomerId);wrap.className='profile-section contact-history-card';
      wrap.innerHTML=`<div class="profile-section-head"><div><h2>Previous Customer Contact</h2><p class="sub" style="margin:4px 0 0">Keep a record of calls, texts, emails, or in-person conversations with this customer.</p></div><button class="btn primary" id="addCustomerContact">+ Add Contact</button></div>
        <div id="contactHistoryFormHost"></div>
        <div class="contact-history-list">${contacts.length?contacts.map(c=>`<div class="contact-history-item"><div class="contact-history-top"><span class="contact-history-type">${esc(labelType(c.contact_type))}</span><span>${esc(new Date(c.contacted_at).toLocaleString())}</span></div><div class="contact-history-notes">${esc(c.notes||'No notes recorded.')}</div></div>`).join(''):'<div class="empty">No previous customer contact recorded.</div>'}</div>`;
      const firstSection=page.querySelector('.profile-section');
      if(firstSection)page.insertBefore(wrap,firstSection);else page.appendChild(wrap);
      document.getElementById('addCustomerContact').onclick=showForm;
    }catch(error){
      console.error('Contact history load failed',error.message);
    }finally{rendering=false;}
  }

  function showForm(){
    const host=document.getElementById('contactHistoryFormHost');if(!host)return;
    host.innerHTML=`<div class="profile-card" style="box-shadow:none;margin:12px 0"><h3>Record customer contact</h3><form id="customerContactForm" class="contact-history-form"><label>Contact type<select name="contact_type"><option value="call">Phone call</option><option value="text">Text message</option><option value="email">Email</option><option value="in_person">In person</option><option value="other">Other</option></select></label><label>Date & time<input name="contacted_at" type="datetime-local" value="${localInput()}"></label><label class="full">Contact notes<textarea name="notes" placeholder="What was discussed, promised, scheduled, or needs follow-up?"></textarea></label><div class="actions full"><button type="button" class="btn secondary" id="cancelCustomerContact">Cancel</button><button type="submit" class="btn primary">Save Contact</button></div></form><div id="customerContactMsg"></div></div>`;
    document.getElementById('cancelCustomerContact').onclick=()=>host.innerHTML='';
    document.getElementById('customerContactForm').onsubmit=async e=>{
      e.preventDefault();const fd=new FormData(e.target);const notes=String(fd.get('notes')||'').trim();
      const payload={customer_id:Number(activeCustomerId),contact_type:String(fd.get('contact_type')||'call'),contacted_at:new Date(String(fd.get('contacted_at')||new Date().toISOString())).toISOString(),notes:notes||null};
      const {error}=await sb.from('CustomerContacts').insert(payload);
      if(error){document.getElementById('customerContactMsg').innerHTML=`<div class="msg err">${esc(error.message)}</div>`;return;}
      document.getElementById('customerContactHistory')?.remove();await renderHistory();
    };
  }

  // Stable public opener used by customer links in all modules.
  if(typeof window.openCustomerProfile!=='function'){
    window.openCustomerProfile=async customerId=>{
      activeCustomerId=String(customerId);
      if(typeof loadModule==='function')await loadModule('Customers');
      const row=[...document.querySelectorAll('#bodyCustomers tr')].find(r=>r.querySelector('.del')?.dataset.id===String(customerId));
      if(row){row.querySelector('td:first-child')?.click();return;}
      document.querySelector('#nav button[data-page="customers"]')?.click();
    };
  }

  new MutationObserver(()=>setTimeout(renderHistory,60)).observe(document.body,{childList:true,subtree:true});
  setTimeout(renderHistory,250);
})();
