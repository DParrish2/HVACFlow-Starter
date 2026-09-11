(() => {
  const TABLES = ['Jobs','Leads','Estimates','Appointments','Payments'];
  let customerCache = [];
  let customerCacheAt = 0;

  function normEmail(v){ return String(v||'').trim().toLowerCase(); }
  function normPhone(v){ return String(v||'').replace(/\D/g,''); }
  function safeText(v){ return esc(v==null?'':v); }

  function ensureContactFields(){
    const add = (table) => {
      if(!modules?.[table]) return;
      const names = new Set(modules[table].fields.map(f=>f[0]));
      const insertAt = Math.min(1, modules[table].fields.length);
      const extra = [];
      if(!names.has('phone')) extra.push(['phone','Phone','tel']);
      if(!names.has('email')) extra.push(['email','Email','email']);
      if(extra.length) modules[table].fields.splice(insertAt,0,...extra);
    };
    ['Jobs','Estimates','Appointments','Payments'].forEach(add);
  }

  async function getCustomers(force=false){
    if(!force && customerCache.length && Date.now()-customerCacheAt < 30000) return customerCache;
    const {data,error}=await sb.from('Customers').select('id,name,phone,email');
    if(error) throw error;
    customerCache=data||[]; customerCacheAt=Date.now();
    return customerCache;
  }

  function findMatch(record, customers){
    const e=normEmail(record.email), p=normPhone(record.phone);
    if(e){ const byEmail=customers.find(c=>normEmail(c.email)===e); if(byEmail) return {customer:byEmail,reason:'email'}; }
    if(p){ const byPhone=customers.find(c=>normPhone(c.phone)===p); if(byPhone) return {customer:byPhone,reason:'phone'}; }
    return null;
  }

  async function openProfile(customerId){
    if(typeof loadModule==='function') await loadModule('Customers');
    const row=[...document.querySelectorAll('#bodyCustomers tr')].find(r=>r.querySelector('.del')?.dataset.id===String(customerId));
    if(row){ row.querySelector('td:first-child')?.click(); return; }
    const btn=document.querySelector('#nav button[data-page="customers"]');
    if(btn) btn.click();
  }

  async function mergeRecord(table, record, customer){
    const updates={customer_id:customer.id,customer_name:customer.name};
    const {error}=await sb.from(table).update(updates).eq('id',record.id);
    if(error){ alert(error.message); return; }
    const customerUpdates={};
    if(!customer.phone && record.phone) customerUpdates.phone=record.phone;
    if(!customer.email && record.email) customerUpdates.email=record.email;
    if(Object.keys(customerUpdates).length){
      await sb.from('Customers').update(customerUpdates).eq('id',customer.id);
    }
    customerCacheAt=0;
    if(typeof loadModule==='function') await loadModule(table);
    if(typeof loadDashboard==='function') await loadDashboard();
  }

  async function decorateTable(table){
    const body=document.getElementById('body'+table);
    if(!body || body.dataset.linkDecorating==='1') return;
    body.dataset.linkDecorating='1';
    try{
      const customers=await getCustomers();
      const records=cache?.[table]||[];
      for(const row of body.querySelectorAll('tr')){
        const del=row.querySelector('.del');
        if(!del) continue;
        const record=records.find(r=>String(r.id)===String(del.dataset.id));
        if(!record) continue;
        const nameCell=row.querySelector('td:first-child');
        if(!nameCell) continue;

        if(record.customer_id){
          nameCell.style.color='#0d47a1';
          nameCell.style.fontWeight='700';
          nameCell.style.cursor='pointer';
          nameCell.style.textDecoration='underline';
          nameCell.title='Open customer profile';
          if(!nameCell.dataset.profileLink){
            nameCell.dataset.profileLink='1';
            nameCell.addEventListener('click',()=>openProfile(record.customer_id));
          }
          continue;
        }

        const match=findMatch(record,customers);
        if(!match || row.querySelector('.merge-customer-btn')) continue;
        const actionCell=del.closest('td') || row.lastElementChild;
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='btn secondary merge-customer-btn';
        btn.style.marginRight='6px';
        btn.textContent=`Merge with ${match.customer.name}`;
        btn.title=`Matching ${match.reason}`;
        btn.onclick=async(e)=>{
          e.stopPropagation();
          const ok=confirm(`Link this ${table.slice(0,-1)} to ${match.customer.name} because the ${match.reason} matches?`);
          if(ok) await mergeRecord(table,record,match.customer);
        };
        actionCell.insertBefore(btn,del);
      }
    } finally {
      body.dataset.linkDecorating='0';
    }
  }

  function decorateAll(){ TABLES.forEach(t=>decorateTable(t).catch(()=>{})); }

  ensureContactFields();
  document.addEventListener('click',e=>{
    const nav=e.target.closest('#nav button[data-page]');
    if(nav) setTimeout(decorateAll,150);
  });
  const observer=new MutationObserver(()=>setTimeout(decorateAll,50));
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(decorateAll,200);
})();
