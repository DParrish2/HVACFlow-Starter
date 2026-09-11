(() => {
  const relatedTables = ['Jobs','Estimates','Appointments','Payments','Leads'];
  let activeCustomer = null;
  let activeRelated = {};

  const profileFields = {
    Jobs:[['service_type','Service type','text',true],['scheduled_for','Scheduled for','datetime-local'],['status','Status','select',false,['scheduled','in_progress','completed','cancelled']],['amount','Amount','number'],['notes','Notes','textarea',true]],
    Estimates:[['amount','Amount','number',true],['status','Status','select',false,['open','sent','approved','declined']]],
    Appointments:[['scheduled_for','Scheduled for','datetime-local',true],['status','Status','select',false,['scheduled','confirmed','completed','cancelled']],['notes','Notes','textarea',true]],
    Payments:[['amount','Amount','number',true],['status','Status','select',false,['recorded','paid','refunded']],['method','Method','select',false,['cash','check','card','other']],['reference','Reference'],['notes','Notes','textarea',true]],
    Leads:[['phone','Phone','tel'],['email','Email','email'],['issue','Service needed','textarea',true],['source','Lead source'],['status','Status','select',false,['new','contacted','won','lost']]]
  };

  function ensureStyles(){
    if(document.getElementById('customerProfileStyles')) return;
    const style=document.createElement('style');
    style.id='customerProfileStyles';
    style.textContent=`
      #bodyCustomers td:first-child{color:#0d47a1;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
      #dashboard .stat{cursor:pointer;transition:transform .12s ease,box-shadow .12s ease;border:1px solid #d7e3f3}
      #dashboard .stat:hover,#dashboard .stat:focus{transform:translateY(-1px);box-shadow:0 5px 15px #0f172a18;outline:2px solid #0d47a1;outline-offset:2px}
      #dashboard .stat::after{content:'Open →';display:block;margin-top:8px;color:#0d47a1;font-size:12px;font-weight:700}
      .profile-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:16px}
      .profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:16px}
      .profile-card{background:#fff;border:1px solid #e3e8ef;border-radius:12px;padding:17px;box-shadow:0 2px 8px #0f172a0d}
      .profile-card h3{margin:0 0 12px}.profile-list{display:grid;grid-template-columns:140px 1fr;gap:8px 12px}.profile-list strong{color:#667085}
      .profile-section{margin-top:18px}.profile-section-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.profile-section-head h2{margin:0}.profile-table{overflow:auto;background:#fff;border:1px solid #e3e8ef;border-radius:12px}
      .payment-pill{display:inline-block;padding:5px 9px;border-radius:999px;background:#eef4fb;font-weight:700;text-transform:capitalize}
      .profile-edit-grid,.record-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.profile-edit-grid label,.record-edit-grid label{display:flex;flex-direction:column;gap:5px}.profile-edit-grid .full,.record-edit-grid .full{grid-column:1/-1}
      .profile-action-row{display:flex;gap:7px;flex-wrap:wrap}.profile-mini-btn{padding:7px 10px;font-size:13px}
      @media(max-width:720px){.profile-grid,.profile-edit-grid,.record-edit-grid{grid-template-columns:1fr}.profile-edit-grid .full,.record-edit-grid .full{grid-column:auto}.profile-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureProfilePage(){
    let page=document.getElementById('customerProfile');
    if(page) return page;
    page=document.createElement('section');
    page.className='page';
    page.id='customerProfile';
    const host=document.getElementById('modulePages') || document.querySelector('main');
    host.appendChild(page);
    return page;
  }

  function money(v){return '$'+Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
  function safe(v){return esc(v==null||v===''?'—':v)}
  function inputValue(v){return esc(v==null?'':v)}
  function localDateTime(v){if(!v)return '';const d=new Date(v);if(isNaN(d))return '';const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}

  function goToModule(key){
    if(typeof subscriptionActive!=='undefined' && !subscriptionActive){showBillingPage('Choose an HVACFlow plan to unlock your contractor tools.');return;}
    const id=key.toLowerCase();
    const btn=document.querySelector(`#nav button[data-page="${id}"]`);
    if(btn){btn.click();return;}
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }

  function wireDashboardButtons(){
    const links={sCustomers:'Customers',sLeads:'Leads',sJobs:'Jobs',sEstimates:'Estimates'};
    Object.entries(links).forEach(([id,key])=>{
      const stat=document.getElementById(id)?.closest('.stat');
      if(!stat||stat.dataset.profileLinked) return;
      stat.dataset.profileLinked='1';stat.tabIndex=0;stat.setAttribute('role','button');stat.setAttribute('aria-label',`Open ${key}`);
      stat.addEventListener('click',()=>goToModule(key));
      stat.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goToModule(key)}});
    });
  }

  async function loadRelated(table, customer){
    let {data,error}=await sb.from(table).select('*').eq('customer_id',customer.id).order('created_at',{ascending:false});
    if(error) throw error;
    if(data?.length) return data;
    const fallback=await sb.from(table).select('*').eq('customer_name',customer.name).order('created_at',{ascending:false});
    if(fallback.error) throw fallback.error;
    return fallback.data||[];
  }

  function actionButtons(table,id){return `<div class="profile-action-row"><button class="btn secondary profile-mini-btn profile-edit-record" data-table="${table}" data-id="${id}">Edit</button></div>`}
  function rowsFor(table, rows){
    if(!rows.length) return '<div class="empty">No records for this customer yet.</div>';
    if(table==='Jobs') return `<div class="profile-table"><table><thead><tr><th>Service</th><th>Scheduled</th><th>Status</th><th>Amount</th><th>Notes</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${safe(r.service_type)}</td><td>${format('scheduled_for',r.scheduled_for)}</td><td>${safe(r.status)}</td><td>${money(r.amount)}</td><td>${safe(r.notes)}</td><td>${actionButtons(table,r.id)}</td></tr>`).join('')}</tbody></table></div>`;
    if(table==='Estimates') return `<div class="profile-table"><table><thead><tr><th>Amount</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${money(r.amount)}</td><td>${safe(r.status)}</td><td>${format('created_at',r.created_at)}</td><td>${actionButtons(table,r.id)}</td></tr>`).join('')}</tbody></table></div>`;
    if(table==='Appointments') return `<div class="profile-table"><table><thead><tr><th>Scheduled</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${format('scheduled_for',r.scheduled_for)}</td><td>${safe(r.status)}</td><td>${safe(r.notes)}</td><td>${actionButtons(table,r.id)}</td></tr>`).join('')}</tbody></table></div>`;
    if(table==='Payments') return `<div class="profile-table"><table><thead><tr><th>Amount</th><th>Status</th><th>Method</th><th>Reference</th><th>Recorded</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${money(r.amount)}</td><td>${safe(r.status)}</td><td>${safe(r.method)}</td><td>${safe(r.reference)}</td><td>${format('created_at',r.created_at)}</td><td>${actionButtons(table,r.id)}</td></tr>`).join('')}</tbody></table></div>`;
    if(table==='Leads') return `<div class="profile-table"><table><thead><tr><th>Service needed</th><th>Source</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${safe(r.issue)}</td><td>${safe(r.source)}</td><td>${safe(r.status)}</td><td>${format('created_at',r.created_at)}</td><td>${actionButtons(table,r.id)}</td></tr>`).join('')}</tbody></table></div>`;
    return '';
  }

  function section(table,label,rows){return `<div class="profile-section"><div class="profile-section-head"><h2>${label}</h2><button class="btn primary profile-add-record" data-table="${table}">+ Add ${label==='Lead History'?'Lead':label.replace(/s$/,'')}</button></div>${rowsFor(table,rows)}</div>`}

  async function openCustomerProfile(customerId){
    if(typeof subscriptionActive!=='undefined' && !subscriptionActive){showBillingPage('Choose an HVACFlow plan to unlock customer profiles.');return;}
    ensureStyles();wireDashboardButtons();
    const page=ensureProfilePage();
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
    page.classList.add('active');
    page.innerHTML='<div class="card">Loading customer profile…</div>';
    try{
      const {data:customer,error}=await sb.from('Customers').select('*').eq('id',customerId).single();
      if(error) throw error;
      activeCustomer=customer;
      const results=await Promise.all(relatedTables.map(t=>loadRelated(t,customer)));
      activeRelated=Object.fromEntries(relatedTables.map((t,i)=>[t,results[i]]));
      const paidTotal=activeRelated.Payments.filter(p=>p.status==='paid'||p.status==='recorded').reduce((s,p)=>s+Number(p.amount||0),0);
      page.innerHTML=`
        <div class="profile-head"><div><button class="btn secondary" id="backCustomers">← Customers</button><h1 style="margin-top:12px">${safe(customer.name)}</h1><p class="sub">Customer-specific hub for contact information, work, estimates, scheduling and payments.</p></div><button class="btn primary" id="editCustomerProfile">Edit Customer</button></div>
        <div id="customerProfileMsg"></div>
        <div class="profile-grid">
          <div class="profile-card"><h3>Customer Information</h3><div class="profile-list"><strong>Phone</strong><span>${safe(customer.phone)}</span><strong>Email</strong><span>${safe(customer.email)}</span><strong>Address</strong><span>${safe([customer.address,customer.city,customer.state,customer.zip_code].filter(Boolean).join(', '))}</span><strong>Notes</strong><span>${safe(customer.notes)}</span></div></div>
          <div class="profile-card"><h3>Payment Status</h3><p><span class="payment-pill">${safe((customer.payment_status||'unknown').replaceAll('_',' '))}</span></p><div class="profile-list"><strong>Total recorded</strong><span>${money(paidTotal)}</span><strong>Payment notes</strong><span>${safe(customer.payment_notes)}</span></div></div>
        </div>
        <div id="customerEditPanel" class="profile-card hidden"></div>
        <div id="customerRecordPanel" class="profile-card hidden" style="margin-top:16px"></div>
        ${section('Jobs','Jobs',activeRelated.Jobs)}
        ${section('Estimates','Estimates',activeRelated.Estimates)}
        ${section('Appointments','Appointments',activeRelated.Appointments)}
        ${section('Payments','Payments',activeRelated.Payments)}
        ${section('Leads','Lead History',activeRelated.Leads)}`;
      document.getElementById('backCustomers').onclick=()=>goToModule('Customers');
      document.getElementById('editCustomerProfile').onclick=()=>showEdit(customer);
      page.querySelectorAll('.profile-add-record').forEach(b=>b.onclick=()=>showRecordEditor(b.dataset.table,null));
      page.querySelectorAll('.profile-edit-record').forEach(b=>b.onclick=()=>{
        const record=(activeRelated[b.dataset.table]||[]).find(r=>String(r.id)===String(b.dataset.id));
        if(record)showRecordEditor(b.dataset.table,record);
      });
    }catch(error){page.innerHTML=`<button class="btn secondary" id="backCustomers">← Customers</button><div class="msg err" style="margin-top:12px">${safe(error.message)}</div>`;document.getElementById('backCustomers').onclick=()=>goToModule('Customers');}
  }

  function fieldHtml(field,record={}){
    const [name,label,type='text',full,opts]=field;let value=record[name]??'';
    if(type==='datetime-local')value=localDateTime(value);
    let input;
    if(type==='textarea')input=`<textarea name="${name}" ${full?'required':''}>${inputValue(value)}</textarea>`;
    else if(type==='select')input=`<select name="${name}">${opts.map(o=>`<option value="${o}" ${String(value)===o?'selected':''}>${o.replaceAll('_',' ')}</option>`).join('')}</select>`;
    else input=`<input name="${name}" type="${type}" value="${inputValue(value)}" ${type==='number'?'step="0.01" min="0"':''} ${full?'required':''}>`;
    return `<label class="${full?'full':''}"><span>${label}</span>${input}</label>`;
  }

  function showRecordEditor(table,record){
    if(!activeCustomer)return;
    const panel=document.getElementById('customerRecordPanel');
    const singular=table==='Leads'?'Lead':table.replace(/s$/,'');
    panel.classList.remove('hidden');
    panel.innerHTML=`<h3>${record?'Edit':'Add'} ${singular} for ${safe(activeCustomer.name)}</h3><p class="sub">This record will stay attached only to this customer profile.</p><form id="customerRecordForm"><div class="record-edit-grid">${profileFields[table].map(f=>fieldHtml(f,record||{})).join('')}</div><div class="actions"><button type="button" class="btn secondary" id="cancelRecordEdit">Cancel</button><button class="btn primary" type="submit">${record?'Save Changes':'Add '+singular}</button></div></form>`;
    panel.scrollIntoView({behavior:'smooth',block:'start'});
    document.getElementById('cancelRecordEdit').onclick=()=>panel.classList.add('hidden');
    document.getElementById('customerRecordForm').onsubmit=async e=>{
      e.preventDefault();
      const values=Object.fromEntries(new FormData(e.target).entries());
      Object.keys(values).forEach(k=>{if(values[k]==='')values[k]=null});
      if(values.amount!==undefined&&values.amount!==null)values.amount=Number(values.amount);
      if(values.scheduled_for)values.scheduled_for=new Date(values.scheduled_for).toISOString();
      values.customer_id=activeCustomer.id;
      values.customer_name=activeCustomer.name;
      if(table==='Leads'){
        if(!values.phone)values.phone=activeCustomer.phone||null;
        if(!values.email)values.email=activeCustomer.email||null;
      }
      let result;
      if(record)result=await sb.from(table).update(values).eq('id',record.id).eq('customer_id',activeCustomer.id);
      else result=await sb.from(table).insert(values);
      if(result.error){message(document.getElementById('customerProfileMsg'),result.error.message,true);return;}
      await openCustomerProfile(activeCustomer.id);
      message(document.getElementById('customerProfileMsg'),`${singular} ${record?'updated':'added'} for ${activeCustomer.name}.`);
      if(typeof loadDashboard==='function')loadDashboard();
    };
  }

  function showEdit(customer){
    const panel=document.getElementById('customerEditPanel');
    panel.classList.remove('hidden');
    panel.innerHTML=`<h3>Edit Customer</h3><form id="customerProfileForm"><div class="profile-edit-grid">
      <label><span>Name</span><input name="name" required value="${inputValue(customer.name)}"></label>
      <label><span>Phone</span><input name="phone" value="${inputValue(customer.phone||'')}"></label>
      <label><span>Email</span><input name="email" type="email" value="${inputValue(customer.email||'')}"></label>
      <label><span>Address</span><input name="address" value="${inputValue(customer.address||'')}"></label>
      <label><span>City</span><input name="city" value="${inputValue(customer.city||'')}"></label>
      <label><span>State</span><input name="state" maxlength="2" value="${inputValue(customer.state||'')}"></label>
      <label><span>ZIP Code</span><input name="zip_code" value="${inputValue(customer.zip_code||'')}"></label>
      <label><span>Payment status</span><select name="payment_status">${['unknown','current','partial','past_due','paid_in_full','payment_plan','collections'].map(v=>`<option value="${v}" ${v===(customer.payment_status||'unknown')?'selected':''}>${v.replaceAll('_',' ')}</option>`).join('')}</select></label>
      <label class="full"><span>Customer notes</span><textarea name="notes">${inputValue(customer.notes||'')}</textarea></label>
      <label class="full"><span>Payment notes</span><textarea name="payment_notes" placeholder="Example: Deposit received, balance due after installation">${inputValue(customer.payment_notes||'')}</textarea></label>
    </div><div class="actions"><button type="button" class="btn secondary" id="cancelCustomerEdit">Cancel</button><button class="btn primary" type="submit">Save Changes</button></div></form>`;
    document.getElementById('cancelCustomerEdit').onclick=()=>panel.classList.add('hidden');
    document.getElementById('customerProfileForm').onsubmit=async e=>{
      e.preventDefault();
      const updates=Object.fromEntries(new FormData(e.target).entries());
      updates.state=(updates.state||'').toUpperCase();
      const {error}=await sb.from('Customers').update(updates).eq('id',customer.id);
      if(error){message(document.getElementById('customerProfileMsg'),error.message,true);return;}
      await openCustomerProfile(customer.id);
      message(document.getElementById('customerProfileMsg'),'Customer information updated.');
      if(typeof loadModule==='function') loadModule('Customers');
    };
  }

  document.addEventListener('click',event=>{
    const cell=event.target.closest('#bodyCustomers tr td:first-child');
    if(!cell) return;
    const row=cell.closest('tr');
    const id=row?.querySelector('.del')?.dataset.id;
    if(id){event.preventDefault();openCustomerProfile(id);}
  });

  ensureStyles();
  wireDashboardButtons();
  const observer=new MutationObserver(()=>wireDashboardButtons());
  observer.observe(document.body,{childList:true,subtree:true});
})();
