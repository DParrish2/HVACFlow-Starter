(() => {
  const TABLES=['Jobs','Leads','Estimates','Appointments','Payments'];
  let customerCache=[],customerCacheAt=0;
  const normEmail=v=>String(v||'').trim().toLowerCase();
  const normPhone=v=>String(v||'').replace(/\D/g,'');
  const normName=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');

  function ensureContactFields(){
    const add=table=>{if(typeof modules==='undefined'||!modules?.[table])return;const names=new Set(modules[table].fields.map(f=>f[0]));const extra=[];if(!names.has('phone'))extra.push(['phone','Phone','tel']);if(!names.has('email'))extra.push(['email','Email','email']);if(extra.length)modules[table].fields.splice(Math.min(1,modules[table].fields.length),0,...extra)};
    ['Jobs','Estimates','Appointments','Payments'].forEach(add);
  }
  async function getCustomers(force=false){if(!force&&customerCache.length&&Date.now()-customerCacheAt<30000)return customerCache;const {data,error}=await sb.from('Customers').select('id,name,phone,email');if(error)throw error;customerCache=data||[];customerCacheAt=Date.now();return customerCache}
  function findContactMatch(r,cs){const e=normEmail(r.email),p=normPhone(r.phone);if(e){const c=cs.find(x=>normEmail(x.email)===e);if(c)return{customer:c,reason:'email'}}if(p){const c=cs.find(x=>normPhone(x.phone)===p);if(c)return{customer:c,reason:'phone'}}return null}
  function findUniqueNameMatch(r,cs){const n=normName(r.customer_name);if(!n)return null;const m=cs.filter(c=>normName(c.name)===n);return m.length===1?{customer:m[0],reason:'name'}:null}
  function resolveCustomer(r,cs){if(r.customer_id){const c=cs.find(x=>String(x.id)===String(r.customer_id));if(c)return{customer:c,reason:'linked'}}return findContactMatch(r,cs)||findUniqueNameMatch(r,cs)}
  function goToModule(table){const id=table.toLowerCase(),btn=document.querySelector(`#nav button[data-page="${id}"]`);if(btn){btn.click();return}document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById(id)?.classList.add('active')}

  async function openProfile(customerId){
    if(!customerId)return;
    if(typeof window.openCustomerProfile==='function'){await window.openCustomerProfile(customerId);return}
    if(typeof loadModule==='function')await loadModule('Customers');
    const row=[...document.querySelectorAll('#bodyCustomers tr')].find(r=>r.querySelector('.del')?.dataset.id===String(customerId));
    if(row){row.querySelector('td:first-child')?.click();return}
    goToModule('Customers');
  }

  async function mergeRecord(table,record,customer){const {error}=await sb.from(table).update({customer_id:customer.id,customer_name:customer.name}).eq('id',record.id);if(error){alert(error.message);return}const u={};if(!customer.phone&&record.phone)u.phone=record.phone;if(!customer.email&&record.email)u.email=record.email;if(Object.keys(u).length)await sb.from('Customers').update(u).eq('id',customer.id);customerCacheAt=0;if(typeof loadModule==='function')await loadModule(table);if(typeof loadDashboard==='function')await loadDashboard()}
  function makeProfileLink(cell,customer){if(!cell||!customer)return;cell.style.color='#0d47a1';cell.style.fontWeight='700';cell.style.cursor='pointer';cell.style.textDecoration='underline';cell.style.textUnderlineOffset='2px';cell.title='Open customer profile';cell.dataset.customerProfileId=String(customer.id);cell.tabIndex=0;cell.setAttribute('role','link')}

  async function decorateTable(table){
    const body=document.getElementById('body'+table);if(!body||body.dataset.linkDecorating==='1')return;body.dataset.linkDecorating='1';
    try{const customers=await getCustomers();const records=(typeof cache!=='undefined'&&cache?.[table])||[];for(const row of body.querySelectorAll('tr')){const del=row.querySelector('.del');if(!del)continue;const record=records.find(r=>String(r.id)===String(del.dataset.id));if(!record)continue;const cell=row.querySelector('td:first-child');if(!cell)continue;const resolved=resolveCustomer(record,customers);if(resolved)makeProfileLink(cell,resolved.customer);if(record.customer_id)continue;const match=findContactMatch(record,customers);if(!match||row.querySelector('.merge-customer-btn'))continue;const action=del.closest('td')||row.lastElementChild,btn=document.createElement('button');btn.type='button';btn.className='btn secondary merge-customer-btn';btn.style.marginRight='6px';btn.textContent=`Merge with ${match.customer.name}`;btn.title=`Matching ${match.reason}`;btn.onclick=async e=>{e.stopPropagation();if(confirm(`Link this ${table.slice(0,-1)} to ${match.customer.name} because the ${match.reason} matches?`))await mergeRecord(table,record,match.customer)};action.insertBefore(btn,del)}}finally{body.dataset.linkDecorating='0'}
  }

  // One delegated handler covers every customer link in every module and survives re-renders.
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-customer-profile-id]');
    if(!el)return;
    e.preventDefault();e.stopPropagation();
    openProfile(el.dataset.customerProfileId);
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const el=e.target.closest('[data-customer-profile-id]');
    if(!el)return;
    e.preventDefault();e.stopPropagation();
    openProfile(el.dataset.customerProfileId);
  },true);

  async function wireDashboardAppointments(){
    const upcoming=document.getElementById('upcoming');if(!upcoming)return;
    const card=upcoming.closest('.card');
    if(card&&!card.dataset.appointmentsLinked){card.dataset.appointmentsLinked='1';card.style.cursor='pointer';card.tabIndex=0;card.setAttribute('role','button');card.title='Open Appointments';card.addEventListener('click',e=>{if(e.target.closest('[data-customer-profile-id]'))return;goToModule('Appointments')});card.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('[data-customer-profile-id]')){e.preventDefault();goToModule('Appointments')}})}
    const customers=await getCustomers();
    const apps=((typeof cache!=='undefined'&&cache?.Appointments)||[]).filter(x=>x.scheduled_for&&new Date(x.scheduled_for)>=new Date()).sort((a,b)=>new Date(a.scheduled_for)-new Date(b.scheduled_for)).slice(0,5);
    [...upcoming.querySelectorAll('p')].forEach((p,i)=>{const a=apps[i],strong=p.querySelector('strong');if(!a||!strong)return;const r=resolveCustomer(a,customers);if(!r)return;strong.dataset.customerProfileId=String(r.customer.id);strong.style.color='#0d47a1';strong.style.textDecoration='underline';strong.style.textUnderlineOffset='2px';strong.style.cursor='pointer';strong.title='Open customer profile';strong.tabIndex=0;strong.setAttribute('role','link')});
  }

  function decorateAll(){TABLES.forEach(t=>decorateTable(t).catch(()=>{}));wireDashboardAppointments().catch(()=>{})}
  ensureContactFields();document.addEventListener('click',e=>{if(e.target.closest('#nav button[data-page]'))setTimeout(decorateAll,150)});new MutationObserver(()=>setTimeout(decorateAll,50)).observe(document.body,{childList:true,subtree:true});setTimeout(decorateAll,200);
})();
